"""Platform admin: admin users, rate limits, platform audit log, sessions."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import hash_password
from app.database import get_db
from app.models import (
    AdminSession,
    ImpersonationSession,
    PlatformAdmin,
    PlatformAdminAuditLog,
    TenantRateLimit,
)
from app.modules.admin.auth import AdminContext, log_admin_action, super_only

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
    await db.flush()
    await log_admin_action(db, admin_id=ctx.admin.id, action="ADMIN_USER_CREATE", resource="platform_admin", details=str(a.id))
    await db.commit()
    return {"id": a.id}


@router.patch("/admins/{aid}")
async def patch_admin(
    aid: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    a = await db.get(PlatformAdmin, aid)
    if not a:
        raise HTTPException(404)
    if aid == ctx.admin.id and body.get("is_active") is False:
        raise HTTPException(400, detail="Cannot deactivate yourself")
    if "email" in body and body["email"]:
        a.email = str(body["email"]).strip()
    if "role" in body:
        a.role = str(body["role"])
    if "is_active" in body:
        a.is_active = bool(body["is_active"])
    a.updated_at = datetime.utcnow()
    await log_admin_action(db, admin_id=ctx.admin.id, action="ADMIN_USER_UPDATE", resource="platform_admin", details=str(aid))
    await db.commit()
    return {"ok": True}


@router.delete("/admins/{aid}")
async def deactivate_admin_user(
    aid: int,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    a = await db.get(PlatformAdmin, aid)
    if not a:
        raise HTTPException(404)
    if aid == ctx.admin.id:
        raise HTTPException(400, detail="Cannot deactivate yourself")
    a.is_active = False
    a.updated_at = datetime.utcnow()
    await log_admin_action(db, admin_id=ctx.admin.id, action="ADMIN_USER_DEACTIVATE", resource="platform_admin", details=str(aid))
    await db.commit()
    return {"ok": True}


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
    total = (await db.execute(select(func.count()).select_from(PlatformAdminAuditLog))).scalar_one()
    q = (
        select(PlatformAdminAuditLog)
        .order_by(PlatformAdminAuditLog.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
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
        ],
        "total": int(total or 0),
        "page": page,
        "page_size": page_size,
    }


@router.get("/impersonation-sessions")
async def list_impersonation_sessions(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
):
    total = (await db.execute(select(func.count()).select_from(ImpersonationSession))).scalar_one()
    q = (
        select(ImpersonationSession)
        .order_by(ImpersonationSession.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await db.execute(q)).scalars().all()
    return {
        "items": [
            {
                "id": r.id,
                "admin_id": r.admin_id,
                "tenant_id": r.tenant_id,
                "user_id": r.user_id,
                "expires_at": r.expires_at.isoformat() if r.expires_at else None,
                "revoked_at": r.revoked_at.isoformat() if r.revoked_at else None,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
        "total": int(total or 0),
    }


@router.get("/sessions")
async def list_admin_sessions(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
):
    total = (await db.execute(select(func.count()).select_from(AdminSession))).scalar_one()
    q = select(AdminSession).order_by(AdminSession.id.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(q)).scalars().all()
    return {
        "items": [
            {
                "id": r.id,
                "admin_id": r.admin_id,
                "ip_address": r.ip_address,
                "user_agent": r.user_agent,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "expires_at": r.expires_at.isoformat() if r.expires_at else None,
                "revoked_at": r.revoked_at.isoformat() if r.revoked_at else None,
            }
            for r in rows
        ],
        "total": int(total or 0),
    }


@router.post("/sessions/{sid}/revoke")
async def revoke_admin_session(
    sid: int,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    s = await db.get(AdminSession, sid)
    if not s:
        raise HTTPException(404)
    s.revoked_at = datetime.utcnow()
    await log_admin_action(db, admin_id=ctx.admin.id, action="ADMIN_SESSION_REVOKE", resource="admin_session", details=str(sid))
    await db.commit()
    return {"ok": True}
