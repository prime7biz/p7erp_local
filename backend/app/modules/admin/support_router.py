"""Platform admin: tenant inspector, notes, announcements."""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import (
    AuditLog,
    Customer,
    Order,
    PlatformAnnouncement,
    Role,
    SupportTicket,
    SupportTicketMessage,
    Tenant,
    TenantNote,
    User,
)
from app.modules.admin.auth import AdminContext, any_admin, log_admin_action, super_only, super_or_support

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


# --- Support tickets (platform helpdesk) ---

_SLA_FIRST_HOURS = {"low": 72, "medium": 24, "high": 8, "urgent": 4}
_SLA_RESOLUTION_HOURS = {"low": 240, "medium": 120, "high": 48, "urgent": 24}


def _sla_hours(priority: str) -> tuple[int, int]:
    pr = (priority or "medium").lower()
    return _SLA_FIRST_HOURS.get(pr, 24), _SLA_RESOLUTION_HOURS.get(pr, 120)


def _ticket_public_dict(t: SupportTicket) -> dict:
    return {
        "id": t.id,
        "tenant_id": t.tenant_id,
        "title": t.title,
        "description": t.description,
        "category": t.category,
        "priority": t.priority,
        "status": t.status,
        "source": t.source,
        "assigned_admin_id": t.assigned_admin_id,
        "sla_first_response_due_at": t.sla_first_response_due_at.isoformat() if t.sla_first_response_due_at else None,
        "sla_resolution_due_at": t.sla_resolution_due_at.isoformat() if t.sla_resolution_due_at else None,
        "first_response_at": t.first_response_at.isoformat() if t.first_response_at else None,
        "resolved_at": t.resolved_at.isoformat() if t.resolved_at else None,
        "escalated_at": t.escalated_at.isoformat() if t.escalated_at else None,
        "escalation_level": t.escalation_level,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }


@router.get("/tickets")
async def list_support_tickets(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_or_support),
    status: str | None = None,
    tenant_id: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    q = select(SupportTicket)
    if status:
        q = q.where(SupportTicket.status == status)
    if tenant_id is not None:
        q = q.where(SupportTicket.tenant_id == tenant_id)
    rows = (await db.execute(q.order_by(SupportTicket.id.desc()).offset((page - 1) * page_size).limit(page_size))).scalars().all()
    return {"items": [_ticket_public_dict(t) for t in rows]}


@router.get("/tickets/{tid}")
async def get_support_ticket(
    tid: int,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_or_support),
):
    t = await db.get(SupportTicket, tid)
    if not t:
        raise HTTPException(404)
    msgs = (
        await db.execute(select(SupportTicketMessage).where(SupportTicketMessage.ticket_id == tid).order_by(SupportTicketMessage.id))
    ).scalars().all()
    out = _ticket_public_dict(t)
    out["messages"] = [
            {
                "id": m.id,
                "ticket_id": m.ticket_id,
                "author_type": m.author_type,
                "author_id": m.author_id,
                "content": m.content,
                "is_internal_note": m.is_internal_note,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in msgs
        ]
    return out


@router.post("/tickets")
async def create_support_ticket(
    body: dict,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_or_support),
):
    p = str(body.get("priority") or "medium")
    fr_h, res_h = _sla_hours(p)
    now = datetime.utcnow()
    t = SupportTicket(
        tenant_id=body.get("tenant_id"),
        title=str(body.get("title") or "Ticket"),
        description=str(body.get("description") or ""),
        category=str(body.get("category") or "general"),
        priority=p,
        status="open",
        source=str(body.get("source") or "admin_created"),
        assigned_admin_id=body.get("assigned_admin_id"),
        sla_first_response_due_at=now + timedelta(hours=fr_h),
        sla_resolution_due_at=now + timedelta(hours=res_h),
    )
    db.add(t)
    await db.flush()
    await log_admin_action(
        db,
        admin_id=ctx.admin.id,
        action="SUPPORT_TICKET_CREATE",
        resource="support_ticket",
        details=str(t.id),
    )
    await db.commit()
    await db.refresh(t)
    return {"id": t.id}


@router.patch("/tickets/{tid}")
async def patch_support_ticket(
    tid: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_or_support),
):
    t = await db.get(SupportTicket, tid)
    if not t:
        raise HTTPException(404)
    if "status" in body:
        t.status = str(body["status"])
        st = t.status.lower()
        if st in ("resolved", "closed", "done") and t.resolved_at is None:
            t.resolved_at = datetime.utcnow()
    if "priority" in body:
        t.priority = str(body["priority"])
    if "assigned_admin_id" in body:
        t.assigned_admin_id = body["assigned_admin_id"]
    if body.get("escalate"):
        t.escalation_level = int(t.escalation_level or 0) + 1
        t.escalated_at = datetime.utcnow()
    t.updated_at = datetime.utcnow()
    await db.commit()
    return {"ok": True}


@router.post("/tickets/{tid}/messages")
async def add_ticket_message(
    tid: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_or_support),
):
    t = await db.get(SupportTicket, tid)
    if not t:
        raise HTTPException(404)
    m = SupportTicketMessage(
        ticket_id=tid,
        author_type="admin",
        author_id=ctx.admin.id,
        content=str(body.get("content") or ""),
        is_internal_note=bool(body.get("is_internal_note")),
    )
    db.add(m)
    t.updated_at = datetime.utcnow()
    if not m.is_internal_note and t.first_response_at is None:
        t.first_response_at = datetime.utcnow()
    await db.commit()
    return {"id": m.id}
