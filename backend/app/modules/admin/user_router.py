"""Platform admin: cross-tenant user management and impersonation."""

from __future__ import annotations

import hashlib
import secrets
import string
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import create_access_token, hash_password
from app.database import get_db
from app.models import ImpersonationSession, Role, Tenant, User
from app.modules.admin.auth import AdminContext, client_ip, log_admin_action, super_or_support
from app.modules.admin.schemas import AdminUserResetPasswordResponse, ImpersonateResponse, TenantUserListItem
from app.modules.audit.service import log_action

router = APIRouter(prefix="/tenants/{tenant_id}/users", tags=["platform-admin-users"])


def _random_password(length: int = 14) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


@router.get("")
async def list_users(
    tenant_id: int,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_or_support),
):
    t = await db.get(Tenant, tenant_id)
    if not t or t.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    result = await db.execute(select(User).where(User.tenant_id == tenant_id).order_by(User.id))
    users = result.scalars().all()
    items: list[TenantUserListItem] = []
    for u in users:
        role_name = None
        if u.role_id:
            r = await db.get(Role, u.role_id)
            role_name = r.name if r else None
        items.append(
            TenantUserListItem(
                id=u.id,
                username=u.username,
                email=u.email,
                first_name=u.first_name,
                last_name=u.last_name,
                is_active=u.is_active,
                last_login=u.last_login,
                role_name=role_name,
            )
        )
    return {"items": items}


@router.get("/{user_id}")
async def get_user(
    tenant_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_or_support),
):
    u = await db.execute(select(User).where(User.id == user_id, User.tenant_id == tenant_id))
    user = u.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    role_name = None
    if user.role_id:
        r = await db.get(Role, user.role_id)
        role_name = r.name if r else None
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "is_active": user.is_active,
        "last_login": user.last_login,
        "role_name": role_name,
        "created_at": user.created_at,
    }


@router.post("/{user_id}/reset-password", response_model=AdminUserResetPasswordResponse)
async def reset_password(
    tenant_id: int,
    user_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_or_support),
):
    u = await db.execute(select(User).where(User.id == user_id, User.tenant_id == tenant_id))
    user = u.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    temp = _random_password(16)
    user.password_hash = await hash_password(temp)
    await log_action(
        db,
        tenant_id=tenant_id,
        action="PASSWORD_RESET_BY_ADMIN",
        user_id=user.id,
        resource="user",
        details=f"by_platform_admin={ctx.admin.id}",
    )
    await log_admin_action(
        db,
        admin_id=ctx.admin.id,
        action="ADMIN_USER_RESET_PASSWORD",
        target_tenant_id=tenant_id,
        target_user_id=user_id,
        resource="user",
        ip_address=client_ip(request),
    )
    await db.commit()
    return AdminUserResetPasswordResponse(temporary_password=temp)


@router.post("/{user_id}/deactivate")
async def deactivate_user(
    tenant_id: int,
    user_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_or_support),
):
    u = await db.execute(select(User).where(User.id == user_id, User.tenant_id == tenant_id))
    user = u.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = False
    await log_admin_action(
        db,
        admin_id=ctx.admin.id,
        action="ADMIN_USER_DEACTIVATE",
        target_tenant_id=tenant_id,
        target_user_id=user_id,
        resource="user",
        ip_address=client_ip(request),
    )
    await db.commit()
    return {"ok": True}


@router.post("/{user_id}/activate")
async def activate_user(
    tenant_id: int,
    user_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_or_support),
):
    u = await db.execute(select(User).where(User.id == user_id, User.tenant_id == tenant_id))
    user = u.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = True
    await log_admin_action(
        db,
        admin_id=ctx.admin.id,
        action="ADMIN_USER_ACTIVATE",
        target_tenant_id=tenant_id,
        target_user_id=user_id,
        resource="user",
        ip_address=client_ip(request),
    )
    await db.commit()
    return {"ok": True}


@router.post("/{user_id}/impersonate", response_model=ImpersonateResponse)
async def impersonate(
    tenant_id: int,
    user_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_or_support),
):
    """Issue a short-lived tenant JWT for support. Logged in impersonation_sessions."""
    if ctx.admin.role not in ("super_admin", "support_agent"):
        raise HTTPException(status_code=403, detail="Impersonation not allowed for this role")
    t = await db.get(Tenant, tenant_id)
    if not t or t.deleted_at is not None or not t.is_active:
        raise HTTPException(status_code=404, detail="Tenant not found or inactive")
    u = await db.execute(select(User).where(User.id == user_id, User.tenant_id == tenant_id))
    user = u.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=404, detail="User not found or inactive")
    token = create_access_token(subject=user.id, expires_delta=timedelta(minutes=15))
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    exp = datetime.utcnow() + timedelta(minutes=15)
    sess = ImpersonationSession(
        admin_id=ctx.admin.id,
        tenant_id=tenant_id,
        user_id=user_id,
        token_hash=token_hash,
        expires_at=exp,
    )
    db.add(sess)
    await log_action(
        db,
        tenant_id=tenant_id,
        action="IMPERSONATE_START",
        user_id=user.id,
        resource="auth",
        details=f"platform_admin_id={ctx.admin.id}",
    )
    await log_admin_action(
        db,
        admin_id=ctx.admin.id,
        action="ADMIN_IMPERSONATE",
        target_tenant_id=tenant_id,
        target_user_id=user_id,
        resource="auth",
        ip_address=client_ip(request),
    )
    await db.commit()
    return ImpersonateResponse(access_token=token, tenant_id=tenant_id, expires_in_minutes=15)
