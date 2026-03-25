"""Platform admin: tenant inspector, notes, announcements."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import (
    AuditLog,
    Customer,
    Order,
    PlatformAnnouncement,
    Role,
    Tenant,
    TenantNote,
    User,
)
from app.modules.admin.auth import AdminContext, any_admin, super_only, super_or_support

router = APIRouter(prefix="/support", tags=["platform-admin-support"])


@router.get("/tenants/{tid}/config")
async def tenant_config(
    tid: int,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(any_admin),
):
    t = await db.get(Tenant, tid)
    if not t:
        raise HTTPException(404)
    r = await db.execute(select(Role).where(Role.tenant_id == tid))
    roles = r.scalars().all()
    return {
        "tenant": {
            "id": t.id,
            "name": t.name,
            "company_code": t.company_code,
            "feature_flags": t.feature_flags,
            "tenant_type": str(t.tenant_type),
            "is_active": t.is_active,
            "deleted_at": t.deleted_at,
        },
        "roles": [{"id": x.id, "name": x.name, "permissions": x.permissions} for x in roles],
    }


@router.get("/tenants/{tid}/data-summary")
async def data_summary(
    tid: int,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(any_admin),
):
    oc = await db.execute(select(func.count()).select_from(Order).where(Order.tenant_id == tid))
    cc = await db.execute(select(func.count()).select_from(Customer).where(Customer.tenant_id == tid))
    uc = await db.execute(select(func.count()).select_from(User).where(User.tenant_id == tid))
    return {
        "orders": int(oc.scalar() or 0),
        "customers": int(cc.scalar() or 0),
        "users": int(uc.scalar() or 0),
    }


@router.get("/tenants/{tid}/errors")
async def tenant_errors(
    tid: int,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_or_support),
):
    q = (
        select(AuditLog)
        .where(AuditLog.tenant_id == tid, AuditLog.response_status.isnot(None), AuditLog.response_status >= 500)
        .order_by(AuditLog.id.desc())
        .limit(100)
    )
    rows = (await db.execute(q)).scalars().all()
    return {"items": [{"id": r.id, "path": r.request_path, "status": r.response_status, "created_at": r.created_at} for r in rows]}


@router.get("/tenants/{tid}/notes")
async def list_notes(
    tid: int,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_or_support),
):
    r = await db.execute(select(TenantNote).where(TenantNote.tenant_id == tid).order_by(TenantNote.is_pinned.desc()))
    rows = r.scalars().all()
    return {"items": rows}


@router.post("/tenants/{tid}/notes")
async def add_note(
    tid: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_or_support),
):
    n = TenantNote(
        tenant_id=tid,
        admin_id=ctx.admin.id,
        content=str(body.get("content") or ""),
        is_pinned=bool(body.get("is_pinned")),
    )
    db.add(n)
    await db.commit()
    return {"id": n.id}


@router.patch("/notes/{nid}")
async def patch_note(
    nid: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_or_support),
):
    n = await db.get(TenantNote, nid)
    if not n:
        raise HTTPException(404)
    if "content" in body:
        n.content = str(body["content"])
    if "is_pinned" in body:
        n.is_pinned = bool(body["is_pinned"])
    n.updated_at = datetime.utcnow()
    await db.commit()
    return {"ok": True}


@router.delete("/notes/{nid}")
async def delete_note(
    nid: int,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_or_support),
):
    n = await db.get(TenantNote, nid)
    if n:
        await db.delete(n)
        await db.commit()
    return {"ok": True}


@router.get("/announcements")
async def list_announcements(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    r = await db.execute(select(PlatformAnnouncement).order_by(PlatformAnnouncement.id.desc()))
    return {"items": r.scalars().all()}


@router.post("/announcements")
async def create_announcement(
    body: dict,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    a = PlatformAnnouncement(
        title=str(body.get("title") or "Notice"),
        content=str(body.get("content") or ""),
        type=str(body.get("type") or "info"),
        target=str(body.get("target") or "all"),
        target_tenant_id=body.get("target_tenant_id"),
        is_active=bool(body.get("is_active", True)),
        starts_at=body.get("starts_at"),
        expires_at=body.get("expires_at"),
        created_by=ctx.admin.id,
    )
    db.add(a)
    await db.commit()
    return {"id": a.id}


@router.patch("/announcements/{aid}")
async def patch_announcement(
    aid: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    a = await db.get(PlatformAnnouncement, aid)
    if not a:
        raise HTTPException(404)
    for k in ("title", "content", "type", "is_active", "starts_at", "expires_at"):
        if k in body:
            setattr(a, k, body[k])
    await db.commit()
    return {"ok": True}


@router.delete("/announcements/{aid}")
async def delete_announcement(
    aid: int,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    a = await db.get(PlatformAnnouncement, aid)
    if a:
        await db.delete(a)
        await db.commit()
    return {"ok": True}
