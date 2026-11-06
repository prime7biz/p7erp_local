import asyncio
from datetime import datetime, timedelta
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app.common.jwt_compat import JWTError, jwt
from passlib.context import CryptContext
from passlib.exc import UnknownHashError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.common.tenant_feature_keys import is_single_session_enforced
from app.database import get_db
from app.models import Tenant, User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def hash_password(password: str) -> str:
    """CPU-bound bcrypt work runs in a thread pool so it does not block the async event loop."""
    return await asyncio.to_thread(pwd_context.hash, password)


def _verify_password_sync(plain: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(plain, hashed)
    except (ValueError, TypeError, UnknownHashError):
        # If stored hash is malformed/legacy, treat as invalid credentials
        # instead of raising a 500 error from the login endpoint.
        return False


async def verify_password(plain: str, hashed: str) -> bool:
    """CPU-bound bcrypt work runs in a thread pool so it does not block the async event loop."""
    return await asyncio.to_thread(_verify_password_sync, plain, hashed)


_dummy_hash: str | None = None


async def verify_password_constant_time(plain: str, hashed: str | None) -> bool:
    """Verify against the real hash, or a dummy one when the account is missing.

    Keeps login latency the same for unknown accounts so timing cannot reveal
    which usernames/emails exist.
    """
    global _dummy_hash
    if hashed:
        return await verify_password(plain, hashed)
    if _dummy_hash is None:
        _dummy_hash = await hash_password("p7-dummy-password-for-timing")
    await verify_password(plain, _dummy_hash)
    return False


def create_access_token(
    subject: str | int,
    expires_delta: timedelta | None = None,
    *,
    session_version: int | None = None,
) -> str:
    settings = get_settings()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.jwt_expire_minutes))
    to_encode = {"sub": str(subject), "exp": expire}
    if session_version is not None:
        to_encode["sv"] = int(session_version)
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    settings = get_settings()
    try:
        # verify_aud=False so we can inspect aud/typ and reject platform-admin explicitly
        # (defense-in-depth; python-jose would otherwise fail on aud alone).
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"verify_aud": False},
        )
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


def is_internal_access_payload(payload: dict) -> bool:
    """Allow-list: staff access tokens carry only sub/exp (+ optional sv).

    Any typ/aud/use claim marks a different token family (platform admin,
    external portal, password reset) that must never authenticate staff routes.
    """
    for claim in ("typ", "aud", "use"):
        if payload.get(claim) is not None:
            return False
    sub = str(payload.get("sub") or "")
    return bool(sub) and not sub.startswith("ext:")


def _reject_non_internal_token(payload: dict) -> None:
    """Reject platform-admin, external, and password-reset JWTs on internal /api/v1 routes."""
    if not is_internal_access_payload(payload):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )


_bearer = HTTPBearer()

async def get_current_user(
    db: Annotated[AsyncSession, Depends(get_db)],
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)],
) -> User:
    payload = decode_access_token(credentials.credentials)
    _reject_non_internal_token(payload)
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    try:
        user_id = int(sub)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    result = await db.execute(select(User).where(User.id == user_id, User.is_active.is_(True)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    # Reused later in the same request (require_tenant, request audit log) to avoid repeat queries.
    request.state.auth_user_id = user.id
    request.state.auth_user_tenant_id = user.tenant_id
    token_sv = payload.get("sv")
    # Backward compatibility: pre-rollout JWTs have no `sv` claim.
    # When absent, skip tenant feature-flag lookup entirely.
    if token_sv is None:
        return user

    tenant_result = await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))
    tenant = tenant_result.scalar_one_or_none()
    request.state.auth_user_tenant = tenant
    request.state.tenant_feature_flags = tenant.feature_flags if tenant else None
    request.state.tenant_feature_flags_cached = True
    if tenant and is_single_session_enforced(tenant.feature_flags):
        try:
            token_session_version = int(token_sv)
        except (TypeError, ValueError):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        if token_session_version != int(user.auth_session_version or 0):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "code": "session_superseded",
                    "message": "Session has been replaced by a newer login",
                },
            )
    return user


_bearer_optional = HTTPBearer(auto_error=False)


async def get_current_user_optional(
    db: Annotated[AsyncSession, Depends(get_db)],
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_optional)],
) -> User | None:
    if not credentials:
        return None
    try:
        payload = decode_access_token(credentials.credentials)
        _reject_non_internal_token(payload)
        sub = payload.get("sub")
        if not sub:
            return None
        user_id = int(sub)
    except HTTPException:
        return None
    except (JWTError, ValueError):
        return None
    result = await db.execute(select(User).where(User.id == user_id, User.is_active.is_(True)))
    user = result.scalar_one_or_none()
    if not user:
        return None
    tenant_result = await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))
    tenant = tenant_result.scalar_one_or_none()
    if tenant and is_single_session_enforced(tenant.feature_flags):
        token_sv = payload.get("sv")
        # Keep grace-window behavior for pre-change tokens.
        if token_sv is not None:
            try:
                token_session_version = int(token_sv)
            except (TypeError, ValueError):
                return None
            if token_session_version != int(user.auth_session_version or 0):
                return None
    return user
