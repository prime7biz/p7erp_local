"""Tenant JWT: platform support tickets (thread with platform team)."""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import SupportTicket, SupportTicketMessage, Tenant, User

router = APIRouter(prefix="/support", tags=["tenant-support"])

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
        "sla_first_response_due_at": t.sla_first_response_due_at.isoformat() if t.sla_first_response_due_at else None,
        "sla_resolution_due_at": t.sla_resolution_due_at.isoformat() if t.sla_resolution_due_at else None,
        "first_response_at": t.first_response_at.isoformat() if t.first_response_at else None,
        "resolved_at": t.resolved_at.isoformat() if t.resolved_at else None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }


def _message_dict(m: SupportTicketMessage) -> dict:
    return {
        "id": m.id,
        "ticket_id": m.ticket_id,
        "author_type": m.author_type,
        "author_id": m.author_id,
        "content": m.content,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


@router.get("/tickets")
async def list_tenant_tickets(
    tenant: Tenant = Depends(require_tenant),
    db: AsyncSession = Depends(get_db),
    status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    base = SupportTicket.tenant_id == tenant.id
    count_q = select(func.count()).select_from(SupportTicket).where(base)
    q = select(SupportTicket).where(base)
    if status:
        count_q = count_q.where(SupportTicket.status == status)
        q = q.where(SupportTicket.status == status)
    total = (await db.execute(count_q)).scalar_one()
    q = q.order_by(SupportTicket.id.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(q)).scalars().all()
    return {
        "items": [_ticket_public_dict(t) for t in rows],
        "total": int(total or 0),
        "page": page,
        "page_size": page_size,
    }


@router.get("/tickets/{tid}")
async def get_tenant_ticket(
    tid: int,
    tenant: Tenant = Depends(require_tenant),
    db: AsyncSession = Depends(get_db),
):
    t = await db.get(SupportTicket, tid)
    if not t or t.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Ticket not found")
    msgs = (
        await db.execute(
            select(SupportTicketMessage)
            .where(SupportTicketMessage.ticket_id == tid, SupportTicketMessage.is_internal_note.is_(False))
            .order_by(SupportTicketMessage.id)
        )
    ).scalars().all()
    out = _ticket_public_dict(t)
    out["messages"] = [_message_dict(m) for m in msgs]
    return out


@router.post("/tickets")
async def create_tenant_ticket(
    body: dict,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    title = str(body.get("title") or "").strip()
    description = str(body.get("description") or "").strip()
    if not title or not description:
        raise HTTPException(status_code=400, detail="title and description are required")
    p = str(body.get("priority") or "medium")
    fr_h, res_h = _sla_hours(p)
    now = datetime.utcnow()
    t = SupportTicket(
        tenant_id=tenant.id,
        submitted_by_user_id=user.id,
        title=title[:255],
        description=description,
        category=str(body.get("category") or "general")[:64],
        priority=p[:16],
        status="open",
        source="tenant_portal",
        sla_first_response_due_at=now + timedelta(hours=fr_h),
        sla_resolution_due_at=now + timedelta(hours=res_h),
    )
    db.add(t)
    await db.flush()
    await db.refresh(t)
    return {"id": t.id}


@router.post("/tickets/{tid}/messages")
async def add_tenant_message(
    tid: int,
    body: dict,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    t = await db.get(SupportTicket, tid)
    if not t or t.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Ticket not found")
    st = (t.status or "").lower()
    if st in ("closed", "resolved", "cancelled", "done"):
        raise HTTPException(status_code=400, detail="Ticket is closed; open a new ticket if you need more help.")
    content = str(body.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="content is required")
    m = SupportTicketMessage(
        ticket_id=tid,
        author_type="tenant",
        author_id=user.id,
        content=content,
        is_internal_note=False,
    )
    db.add(m)
    t.updated_at = datetime.utcnow()
    await db.flush()
    await db.refresh(m)
    return {"id": m.id}
