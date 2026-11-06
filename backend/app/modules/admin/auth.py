"""Platform admin JWT auth and RBAC dependencies."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Annotated, Callable

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app.common.jwt_compat import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.client_ip import client_ip_from_request
from app.config import get_settings
from app.database import get_db
from app.models import AdminSession, PlatformAdmin, PlatformAdminAuditLog

ADMIN_AUDIENCE = "platform-admin"
ADMIN_TOKEN_TYPE = "platform_admin"

_bearer = HTTPBearer(auto_error=True)


def create_admin_access_token(*, admin_id: int, session_id: int, mfa_enrol_only: bool = False) -> str:
    settings = get_settings()
    expire = datetime.utcnow() + timedelta(minutes=settings.platform_admin_jwt_expire_minutes)
    to_encode = {
        "sub": str(admin_id),
        "sid": session_id,
        "aud": ADMIN_AUDIENCE,
        "typ": ADMIN_TOKEN_TYPE,
        "exp": expire,
    }
    if mfa_enrol_only:
        to_encode["mfa_enrol_only"] = True
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_admin_token(token: str) -> dict:
    settings = get_settings()
    try:
        return jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            audience=ADMIN_AUDIENCE,
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired admin token",
        )


class AdminContext:
    """Authenticated platform admin + optional DB session row."""

    def __init__(self, admin: PlatformAdmin, session: AdminSession | None = None, *, mfa_enrol_only: bool = False):
        self.admin = admin
        self.session = session
        self.mfa_enrol_only = mfa_enrol_only


async def get_current_admin(
    db: Annotated[AsyncSession, Depends(get_db)],
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)],
) -> AdminContext:
    ctx = await get_current_admin_allow_mfa_enrolment(db=db, credentials=credentials)
    if ctx.mfa_enrol_only:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "mfa_enrolment_required", "message": "Set up two-factor authentication to continue"},
        )
    return ctx


async def get_current_admin_allow_mfa_enrolment(
    db: Annotated[AsyncSession, Depends(get_db)],
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)],
) -> AdminContext:
    """Like ``get_current_admin`` but also accepts the limited token issued while MFA enrolment is pending."""
    payload = decode_admin_token(credentials.credentials)
    if payload.get("typ") != ADMIN_TOKEN_TYPE:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
    try:
        admin_id = int(payload.get("sub", ""))
        sid = int(payload.get("sid", ""))
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin token")
    now = datetime.utcnow()
    sess_result = await db.execute(
        select(AdminSession).where(
            AdminSession.id == sid,
            AdminSession.admin_id == admin_id,
            AdminSession.revoked_at.is_(None),
            AdminSession.expires_at > now,
        )
    )
    session = sess_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired or revoked")
    admin_result = await db.execute(
        select(PlatformAdmin).where(PlatformAdmin.id == admin_id, PlatformAdmin.is_active.is_(True))
    )
    admin = admin_result.scalar_one_or_none()
    if not admin:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin not found or inactive")
    enrol_only = bool(payload.get("mfa_enrol_only")) and not admin.totp_enabled
    if not enrol_only and get_settings().platform_admin_mfa_required and not admin.totp_enabled:
        enrol_only = True
    return AdminContext(admin=admin, session=session, mfa_enrol_only=enrol_only)


def require_admin_roles(*allowed: str) -> Callable:
    """Dependency factory: only these platform admin role names may access."""

    async def _dep(ctx: Annotated[AdminContext, Depends(get_current_admin)]) -> AdminContext:
        if ctx.admin.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient platform admin role",
            )
        return ctx

    return _dep


# Common role groups (plan matrix)
# For /auth/me and the MFA enrolment endpoints: also accepts the enrolment-only token.
any_admin_mfa_enrolment = get_current_admin_allow_mfa_enrolment

super_only = require_admin_roles("super_admin")
super_or_support = require_admin_roles("super_admin", "support_agent")
super_or_billing = require_admin_roles("super_admin", "billing_admin")
any_admin = require_admin_roles("super_admin", "support_agent", "billing_admin")


async def log_admin_action(
    db: AsyncSession,
    *,
    admin_id: int,
    action: str,
    target_tenant_id: int | None = None,
    target_user_id: int | None = None,
    resource: str | None = None,
    details: str | None = None,
    ip_address: str | None = None,
) -> None:
    row = PlatformAdminAuditLog(
        admin_id=admin_id,
        action=action,
        target_tenant_id=target_tenant_id,
        target_user_id=target_user_id,
        resource=resource,
        details=details,
        ip_address=ip_address,
    )
    db.add(row)
    await db.flush()


def client_ip(request: Request | None) -> str | None:
    if request is None:
        return None
    ip = client_ip_from_request(request)
    return None if ip == "unknown" else ip[:45]
