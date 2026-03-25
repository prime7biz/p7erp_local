"""Platform admin authentication routes."""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import hash_password, verify_password
from app.config import get_settings
from app.database import get_db
from app.models import AdminSession, PlatformAdmin
from app.modules.admin.auth import (
    AdminContext,
    any_admin,
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
)

router = APIRouter(prefix="/auth", tags=["platform-admin-auth"])


@router.post("/login", response_model=AdminTokenResponse)
async def admin_login(
    request: Request,
    body: AdminLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()
    result = await db.execute(
        select(PlatformAdmin).where(PlatformAdmin.username == body.username.strip())
    )
    admin = result.scalar_one_or_none()
    if not admin or not admin.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not await verify_password(body.password, admin.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
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
    token = create_admin_access_token(admin_id=admin.id, session_id=sess.id)
    await log_admin_action(
        db,
        admin_id=admin.id,
        action="ADMIN_LOGIN",
        resource="platform_admin",
        details=f"session_id={sess.id}",
        ip_address=client_ip(request),
    )
    await db.commit()
    return AdminTokenResponse(
        access_token=token,
        expires_in_minutes=settings.platform_admin_jwt_expire_minutes,
    )


@router.get("/me", response_model=AdminMeResponse)
async def admin_me(ctx: AdminContext = Depends(any_admin)):
    a = ctx.admin
    return AdminMeResponse(
        id=a.id,
        username=a.username,
        email=a.email,
        role=a.role,
        is_active=a.is_active,
        last_login=a.last_login,
        capabilities=compute_capabilities(a.role),
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
