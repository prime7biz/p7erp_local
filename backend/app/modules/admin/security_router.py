"""Platform admin: admin users, rate limits, platform audit log."""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import hash_password
from app.database import get_db
from app.models import PlatformAdmin, PlatformAdminAuditLog, TenantRateLimit
from app.modules.admin.auth import AdminContext, super_only

router = APIRouter(prefix="/security", tags=["platform-admin-security"])


@router.get("/admins")
async def list_admins(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    r = await db.execute(select(PlatformAdmin).order_by(PlatformAdmin.id))
    rows = r.scalars().all()
    return {
        "items": [
            {"id": a.id, "username": a.username, "email": a.email, "role": a.role, "is_active": a.is_active}
            for a in rows
        ]
    }


@router.post("/admins")
async def create_admin(
    body: dict,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    pwd = str(body.get("password") or "")
    if len(pwd) < 10:
        raise HTTPException(400, "Password too short")
    a = PlatformAdmin(
        username=str(body.get("username") or "").strip(),
        email=str(body.get("email") or "").strip(),
        password_hash=await hash_password(pwd),
        role=str(body.get("role") or "support_agent"),
    )
    db.add(a)
    await db.commit()
    return {"id": a.id}


@router.get("/rate-limits")
async def list_rate_limits(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    r = await db.execute(select(TenantRateLimit).limit(500))
    rows = r.scalars().all()
    return {
        "items": [
            {
                "tenant_id": x.tenant_id,
                "requests_per_minute": x.requests_per_minute,
                "requests_per_hour": x.requests_per_hour,
                "is_custom": x.is_custom,
            }
            for x in rows
        ]
    }


@router.put("/rate-limits/{tenant_id}")
async def put_rate_limit(
    tenant_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    row = await db.get(TenantRateLimit, tenant_id)
    if not row:
        row = TenantRateLimit(tenant_id=tenant_id)
        db.add(row)
    row.requests_per_minute = int(body.get("requests_per_minute") or 300)
    row.requests_per_hour = int(body.get("requests_per_hour") or 10000)
    row.is_custom = True
    await db.commit()
    return {"ok": True}


@router.get("/audit")
async def platform_audit_log(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
):
    q = select(PlatformAdminAuditLog).order_by(PlatformAdminAuditLog.id.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(q)).scalars().all()
    return {
        "items": [
            {
                "id": r.id,
                "admin_id": r.admin_id,
                "action": r.action,
                "target_tenant_id": r.target_tenant_id,
                "resource": r.resource,
                "details": r.details,
                "created_at": r.created_at,
            }
            for r in rows
        ]
    }
