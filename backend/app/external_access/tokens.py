"""JWT helpers for external principals (separate subject namespace from internal users)."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app.common.jwt_compat import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.rls import bind_session_tenant
from app.config import get_settings
from app.database import get_db, rls_request_scope
from app.models import ExternalPrincipal, Tenant

from app.external_access.constants import (
    JWT_CLAIM_PRINCIPAL_TYPE,
    JWT_CLAIM_TENANT,
    JWT_CLAIM_TYPE,
    JWT_CLAIM_USE,
    JWT_USE_ACCESS,
    JWT_USE_PASSWORD_RESET,
    JWT_USE_REFRESH,
    JWT_VALUE_EXTERNAL,
    external_subject,
    parse_external_subject,
)

_bearer = HTTPBearer()

JWT_CLAIM_SESSION_VERSION = "sv"
PASSWORD_RESET_TOKEN_HOURS = 24


def create_external_access_token(
    *,
    principal_id: int,
    principal_type: str,
    tenant_id: int,
    session_version: int = 0,
    expires_delta: timedelta | None = None,
) -> str:
    settings = get_settings()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.external_jwt_expire_minutes)
    )
    to_encode: dict[str, Any] = {
        "sub": external_subject(principal_id),
        JWT_CLAIM_TYPE: JWT_VALUE_EXTERNAL,
        JWT_CLAIM_PRINCIPAL_TYPE: principal_type,
        JWT_CLAIM_TENANT: tenant_id,
        JWT_CLAIM_USE: JWT_USE_ACCESS,
        JWT_CLAIM_SESSION_VERSION: int(session_version or 0),
        "exp": expire,
    }
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_external_refresh_token(
    *,
    principal_id: int,
    principal_type: str,
    tenant_id: int,
    session_version: int = 0,
) -> str:
    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.external_jwt_refresh_expire_days)
    to_encode: dict[str, Any] = {
        "sub": external_subject(principal_id),
        JWT_CLAIM_TYPE: JWT_VALUE_EXTERNAL,
        JWT_CLAIM_PRINCIPAL_TYPE: principal_type,
        JWT_CLAIM_TENANT: tenant_id,
        JWT_CLAIM_USE: JWT_USE_REFRESH,
        JWT_CLAIM_SESSION_VERSION: int(session_version or 0),
        "exp": expire,
    }
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def assert_session_version_current(payload: dict[str, Any], principal: ExternalPrincipal) -> None:
    """Reject tokens minted before the principal's last logout / reset / deactivation.

    Tokens issued before session_version existed carry no claim and stay valid
    until they expire naturally.
    """
    token_sv = payload.get(JWT_CLAIM_SESSION_VERSION)
    if token_sv is None:
        return
    try:
        token_sv_int = int(token_sv)
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    if token_sv_int != int(getattr(principal, "session_version", 0) or 0):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")


def bump_session_version(principal: ExternalPrincipal) -> None:
    principal.session_version = int(getattr(principal, "session_version", 0) or 0) + 1


def decode_external_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


async def get_current_external_principal(
    db: Annotated[AsyncSession, Depends(get_db)],
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)],
    _rls_scope: Annotated[None, Depends(rls_request_scope)] = None,
) -> ExternalPrincipal:
    payload = decode_external_token(credentials.credentials)
    if payload.get(JWT_CLAIM_TYPE) != JWT_VALUE_EXTERNAL:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    if payload.get(JWT_CLAIM_USE) != JWT_USE_ACCESS:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
    sub = payload.get("sub")
    pid = parse_external_subject(sub if isinstance(sub, str) else None)
    if pid is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    result = await db.execute(
        select(ExternalPrincipal).where(
            ExternalPrincipal.id == pid,
            ExternalPrincipal.is_active.is_(True),
        )
    )
    principal = result.scalar_one_or_none()
    if not principal:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Principal not found or inactive")
    tid = payload.get(JWT_CLAIM_TENANT)
    if tid is not None and int(tid) != principal.tenant_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Tenant mismatch")
    pt = payload.get(JWT_CLAIM_PRINCIPAL_TYPE)
    if pt is not None and pt != principal.principal_type:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Principal type mismatch")
    assert_session_version_current(payload, principal)
    if principal.locked_at is not None:
        from app.common.login_lockout import lockout_minutes, lockout_still_active
        from app.config import get_settings

        minutes = lockout_minutes(getattr(get_settings(), "external_login_lockout_minutes", 30))
        if lockout_still_active(principal.locked_at, minutes=minutes):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account locked")
        principal.locked_at = None
        principal.failed_login_count = 0
    # Ensure tenant still active
    tr = await db.execute(
        select(Tenant).where(
            Tenant.id == principal.tenant_id,
            Tenant.is_active.is_(True),
            Tenant.deleted_at.is_(None),
        )
    )
    if not tr.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Organization inactive")
    await bind_session_tenant(db, principal.tenant_id)
    return principal


def decode_external_refresh_token(token: str) -> dict[str, Any]:
    payload = decode_external_token(token)
    if payload.get(JWT_CLAIM_TYPE) != JWT_VALUE_EXTERNAL:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    if payload.get(JWT_CLAIM_USE) != JWT_USE_REFRESH:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
    return payload


def hash_reset_jti(jti: str) -> str:
    return hashlib.sha256(jti.encode("utf-8")).hexdigest()


def create_external_password_reset_token(
    *,
    principal_id: int,
    principal_type: str,
    tenant_id: int,
) -> tuple[str, str]:
    """Return (token, jti). Persist ``hash_reset_jti(jti)`` so the token is single-use."""
    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(hours=PASSWORD_RESET_TOKEN_HOURS)
    jti = secrets.token_urlsafe(24)
    to_encode: dict[str, Any] = {
        "sub": external_subject(principal_id),
        JWT_CLAIM_TYPE: JWT_VALUE_EXTERNAL,
        JWT_CLAIM_PRINCIPAL_TYPE: principal_type,
        JWT_CLAIM_TENANT: tenant_id,
        JWT_CLAIM_USE: JWT_USE_PASSWORD_RESET,
        "jti": jti,
        "exp": expire,
    }
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm), jti


def decode_external_password_reset_token(token: str) -> dict[str, Any]:
    payload = decode_external_token(token)
    if payload.get(JWT_CLAIM_TYPE) != JWT_VALUE_EXTERNAL:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    if payload.get(JWT_CLAIM_USE) != JWT_USE_PASSWORD_RESET:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
    return payload
