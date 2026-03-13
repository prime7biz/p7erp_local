from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Item, ManufacturingSampleRequest, Order, Role, Tenant, User
from app.modules.manufacturing.schemas import (
    SampleRequestCreate,
    SampleRequestResponse,
    SampleRequestStatusUpdate,
    SampleRequestUpdate,
)

router = APIRouter(prefix="/manufacturing/samples", tags=["manufacturing-samples"])


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


def _next_code(last_id: int | None) -> str:
    return f"SMP-{(last_id or 0) + 1:04d}"


async def _role_name(db: AsyncSession, user: User) -> str:
    role = await db.get(Role, user.role_id)
    return (role.name if role else "").strip().lower()


async def _require_manage_role(db: AsyncSession, user: User) -> None:
    role_name = await _role_name(db, user)
    allowed = {"supervisor", "manager", "admin", "owner", "super_admin", "superadmin"}
    if role_name not in allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only supervisor/manager/admin can manage samples")


def _to_response(row: ManufacturingSampleRequest) -> SampleRequestResponse:
    return SampleRequestResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        sample_no=row.sample_no,
        order_id=row.order_id,
        item_id=row.item_id,
        sample_type=row.sample_type,
        priority=row.priority,
        requested_date=row.requested_date,
        target_date=row.target_date,
        status=row.status,
        assigned_user_id=row.assigned_user_id,
        notes=row.notes,
        created_by_user_id=row.created_by_user_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/requests", response_model=list[SampleRequestResponse])
async def list_sample_requests(
    status_filter: str | None = Query(default=None),
    priority: str | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(ManufacturingSampleRequest).where(ManufacturingSampleRequest.tenant_id == tenant.id)
    if status_filter and status_filter.strip():
        stmt = stmt.where(ManufacturingSampleRequest.status == status_filter.strip().lower())
    if priority and priority.strip():
        stmt = stmt.where(ManufacturingSampleRequest.priority == priority.strip().lower())
    rows = (await db.execute(stmt.order_by(ManufacturingSampleRequest.id.desc()))).scalars().all()
    return [_to_response(row) for row in rows]


@router.post("/requests", response_model=SampleRequestResponse, status_code=status.HTTP_201_CREATED)
async def create_sample_request(
    body: SampleRequestCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manage_role(db, user)
    if body.order_id is not None:
        order = await db.get(Order, body.order_id)
        if not order or order.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Order not found")
    if body.item_id is not None:
        item = await db.get(Item, body.item_id)
        if not item or item.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Item not found")
    if body.assigned_user_id is not None:
        assigned = await db.get(User, body.assigned_user_id)
        if not assigned or assigned.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Assigned user not found")

    if body.sample_no and body.sample_no.strip():
        sample_no = body.sample_no.strip()
    else:
        last_id = (
            await db.execute(
                select(func.max(ManufacturingSampleRequest.id)).where(ManufacturingSampleRequest.tenant_id == tenant.id)
            )
        ).scalar()
        sample_no = _next_code(last_id)

    row = ManufacturingSampleRequest(
        tenant_id=tenant.id,
        sample_no=sample_no,
        order_id=body.order_id,
        item_id=body.item_id,
        sample_type=body.sample_type.strip().lower(),
        priority=body.priority.strip().lower(),
        requested_date=body.requested_date,
        target_date=body.target_date,
        status="draft",
        assigned_user_id=body.assigned_user_id,
        notes=body.notes.strip() if body.notes else None,
        created_by_user_id=user.id,
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Sample number already exists")
    await db.refresh(row)
    return _to_response(row)


@router.patch("/requests/{sample_id}", response_model=SampleRequestResponse)
async def update_sample_request(
    sample_id: int,
    body: SampleRequestUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manage_role(db, user)
    row = await db.get(ManufacturingSampleRequest, sample_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Sample request not found")
    if body.assigned_user_id is not None:
        assigned = await db.get(User, body.assigned_user_id)
        if not assigned or assigned.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Assigned user not found")
    payload = body.model_dump(exclude_unset=True)
    for key, value in payload.items():
        if isinstance(value, str):
            value = value.strip().lower()
        setattr(row, key, value)
    await db.commit()
    await db.refresh(row)
    return _to_response(row)


@router.post("/requests/{sample_id}/status", response_model=SampleRequestResponse)
async def update_sample_status(
    sample_id: int,
    body: SampleRequestStatusUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manage_role(db, user)
    row = await db.get(ManufacturingSampleRequest, sample_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Sample request not found")
    next_status = body.status.strip().lower()
    allowed = {
        "draft",
        "submitted",
        "approved",
        "in_progress",
        "sent_to_buyer",
        "revision_required",
        "approved_by_buyer",
        "closed",
        "cancelled",
    }
    if next_status not in allowed:
        raise HTTPException(status_code=400, detail="Invalid status")
    row.status = next_status
    if body.note and body.note.strip():
        note = body.note.strip()
        row.notes = f"{(row.notes + chr(10)) if row.notes else ''}[status={next_status}] {note}"
    await db.commit()
    await db.refresh(row)
    return _to_response(row)
