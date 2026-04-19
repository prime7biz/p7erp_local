"""Simple order follow-ups (/merch/followups)."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.pagination import MAX_PAGE_SIZE
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Followup, Order, Tenant, User
from app.modules.merch.deps import ensure_tenant as _ensure_tenant

router = APIRouter(tags=["merch"])

class FollowupCreate(BaseModel):
    order_id: int
    title: str
    due_date: date | None = None
    status: str = "OPEN"
    severity: str | None = None
    notes: str | None = None


class FollowupUpdate(BaseModel):
    title: str | None = None
    due_date: date | None = None
    status: str | None = None
    severity: str | None = None
    notes: str | None = None

@router.get("/followups")
async def list_followups(
    response: Response,
    order_id: int | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=200, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(Followup).where(Followup.tenant_id == tenant.id)
    if order_id is not None:
        stmt = stmt.where(Followup.order_id == order_id)
    if status_filter:
        stmt = stmt.where(Followup.status == status_filter)
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = int((await db.execute(count_stmt)).scalar() or 0)
    result = await db.execute(stmt.order_by(Followup.created_at.desc()).offset(offset).limit(limit))
    response.headers["X-Total-Count"] = str(total)
    return result.scalars().all()


@router.post("/followups", status_code=201)
async def create_followup(
    body: FollowupCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    ord_row = await db.get(Order, body.order_id)
    if not ord_row or ord_row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Order not found")
    row = Followup(tenant_id=tenant.id, **body.model_dump())
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


@router.patch("/followups/{followup_id}")
async def update_followup(
    followup_id: int,
    body: FollowupUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(Followup, followup_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Followup not found")
    for field in ("title", "due_date", "status", "severity", "notes"):
        value = getattr(body, field)
        if value is not None:
            setattr(row, field, value)
    await db.flush()
    await db.refresh(row)
    return row


@router.delete("/followups/{followup_id}", status_code=204)
async def delete_followup(
    followup_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(Followup, followup_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Followup not found")
    await db.delete(row)
    await db.flush()
