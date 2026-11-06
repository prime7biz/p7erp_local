"""Platform admin authentication routes."""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import hash_password, verify_password, verify_password_constant_time
from app.common.login_lockout import (
    clear_platform_admin_failed_login,
    enforce_login_rate_limit,
    platform_admin_login_locked,
    record_platform_admin_failed_login,
)
from app.common.totp import generate_totp_secret, totp_provisioning_uri, verify_totp
from app.config import get_settings
from app.database import get_db
from app.models import AdminSession, PlatformAdmin
from app.modules.admin.auth import (
    AdminContext,
    any_admin,
    any_admin_mfa_enrolment,
    client_ip,
    create_admin_access_token,
    log_admin_action,
)
from app.modules.admin.permissions import compute_capabilities
from app.modules.admin.schemas import (
    AdminChangePasswordRequest,
    AdminLoginRequest,
    AdminMeResponse,
    AdminTokenResponse,
    AdminTotpCodeRequest,
    AdminTotpDisableRequest,
    AdminTotpSetupResponse,
)

router = APIRouter(prefix="/auth", tags=["platform-admin-auth"])


@router.post("/login", response_model=AdminTokenResponse)
async def admin_login(
    request: Request,
    body: AdminLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()
    username = body.username.strip()
    await enforce_login_rate_limit(request, company_key="platform_admin", scope="platform_admin")
    if await platform_admin_login_locked(username):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts. Try again later.",
        )
    result = await db.execute(select(PlatformAdmin).where(PlatformAdmin.username == username))
    admin = result.scalar_one_or_none()
    password_ok = await verify_password_constant_time(body.password, admin.password_hash if admin else None)
    if not admin or not admin.is_active or not password_ok:
        await record_platform_admin_failed_login(username)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if admin.totp_enabled:
        if not (body.totp_code or "").strip():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "mfa_required", "message": "Enter the 6-digit code from your authenticator app"},
            )
        step = verify_totp(admin.totp_secret or "", body.totp_code, last_used_step=admin.totp_last_used_step)
        if step is None:
            await record_platform_admin_failed_login(username)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "mfa_invalid", "message": "Invalid or expired authenticator code"},
            )
        admin.totp_last_used_step = step
    await clear_platform_admin_failed_login(username)
    enrol_only = bool(settings.platform_admin_mfa_required and not admin.totp_enabled)
    now = datetime.utcnow()
    expires = now + timedelta(minutes=settings.platform_admin_jwt_expire_minutes)
    sess = AdminSession(
        admin_id=admin.id,
        token_hash="-",
        ip_address=client_ip(request),
        user_agent=request.headers.get("user-agent"),
        expires_at=expires,
    )
    db.add(sess)
    await db.flush()
    admin.last_login = now
    token = create_admin_access_token(admin_id=admin.id, session_id=sess.id, mfa_enrol_only=enrol_only)
    await log_admin_action(
        db,
        admin_id=admin.id,
        action="ADMIN_LOGIN",
        resource="platform_admin",
        details=f"session_id={sess.id} mfa={'totp' if admin.totp_enabled else 'none'}",
        ip_address=client_ip(request),
    )
    await db.commit()
    return AdminTokenResponse(
        access_token=token,
        expires_in_minutes=settings.platform_admin_jwt_expire_minutes,
        mfa_enrolment_required=enrol_only,
    )


@router.get("/me", response_model=AdminMeResponse)
async def admin_me(ctx: AdminContext = Depends(any_admin_mfa_enrolment)):
    a = ctx.admin
    return AdminMeResponse(
        id=a.id,
        username=a.username,
        email=a.email,
        role=a.role,
        is_active=a.is_active,
        last_login=a.last_login,
        capabilities=compute_capabilities(a.role),
        totp_enabled=bool(a.totp_enabled),
        mfa_enrolment_required=ctx.mfa_enrol_only,
    )


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def admin_change_password(
    body: AdminChangePasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(any_admin),
):
    if not await verify_password(body.current_password, ctx.admin.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    ctx.admin.password_hash = await hash_password(body.new_password)
    await log_admin_action(
        db,
        admin_id=ctx.admin.id,
        action="ADMIN_CHANGE_PASSWORD",
        resource="platform_admin",
        ip_address=client_ip(request),
    )
    await db.commit()
    return None


@router.post("/mfa/totp/setup", response_model=AdminTotpSetupResponse)
async def admin_totp_setup(
    request: Request,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(any_admin_mfa_enrolment),
):
    """Start (or restart) enrolment: returns a new secret to add to an authenticator app."""
    admin = ctx.admin
    if admin.totp_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Two-factor authentication is already enabled")
    secret = generate_totp_secret()
    admin.totp_secret = secret
    admin.totp_last_used_step = None
    await log_admin_action(
        db,
        admin_id=admin.id,
        action="ADMIN_MFA_SETUP_STARTED",
        resource="platform_admin",
        ip_address=client_ip(request),
    )
    await db.commit()
    issuer = get_settings().platform_admin_mfa_issuer or "Prime7 ERP"
    return AdminTotpSetupResponse(
        secret=secret,
        otpauth_uri=totp_provisioning_uri(secret, account_name=admin.username, issuer=issuer),
    )


@router.post("/mfa/totp/enable")
async def admin_totp_enable(
    body: AdminTotpCodeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(any_admin_mfa_enrolment),
):
    """Confirm enrolment with a code from the app. After this, login needs the code."""
    admin = ctx.admin
    if admin.totp_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Two-factor authentication is already enabled")
    if not admin.totp_secret:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Start setup first")
    step = verify_totp(admin.totp_secret, body.code, last_used_step=admin.totp_last_used_step)
    if step is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired authenticator code")
    admin.totp_enabled = True
    admin.totp_last_used_step = step
    await log_admin_action(
        db,
        admin_id=admin.id,
        action="ADMIN_MFA_ENABLED",
        resource="platform_admin",
        ip_address=client_ip(request),
    )
    await db.commit()
    return {"ok": True, "totp_enabled": True, "relogin_required": ctx.mfa_enrol_only}


@router.post("/mfa/totp/disable")
async def admin_totp_disable(
    body: AdminTotpDisableRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(any_admin),
):
    """Turn off two-factor authentication (needs password and a current code)."""
    admin = ctx.admin
    if get_settings().platform_admin_mfa_required:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Two-factor authentication is required for platform admins and cannot be turned off",
        )
    if not admin.totp_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Two-factor authentication is not enabled")
    if not await verify_password(body.current_password, admin.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    step = verify_totp(admin.totp_secret or "", body.code, last_used_step=admin.totp_last_used_step)
    if step is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired authenticator code")
    admin.totp_enabled = False
    admin.totp_secret = None
    admin.totp_last_used_step = None
    await log_admin_action(
        db,
        admin_id=admin.id,
        action="ADMIN_MFA_DISABLED",
        resource="platform_admin",
        ip_address=client_ip(request),
    )
    await db.commit()
    return {"ok": True, "totp_enabled": False}
