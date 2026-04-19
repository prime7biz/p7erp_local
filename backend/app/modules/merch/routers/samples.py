"""Merchandising sample / tech-pack workspace (tasks, costing, AI proposals)."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.codegen import next_tenant_code
from app.common.pagination import MAX_PAGE_SIZE
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import GarmentStyle, Inquiry, Item, Order, Tenant, User
from app.models.merch import (
    MerchSampleAiProposal,
    MerchSampleComment,
    MerchSampleCostLine,
    MerchSampleMaterialLine,
    MerchSampleRequest,
    MerchSampleTask,
)
from app.modules.merch.deps import ensure_tenant
from app.modules.merch.permissions import MERCH_PERMISSION_SAMPLE_MANAGE, require_merch_permission
from app.modules.merch.sample_ai_service import (
    SamplePlanLlmOut,
    apply_plan_proposal,
    create_plan_proposal,
)
from app.modules.merch.sample_workspace_service import compute_sample_metrics, load_style_labels

router = APIRouter(tags=["merch-samples"])

SAMPLE_TYPES = frozenset(
    {
        "proto",
        "fit",
        "size_set",
        "pp",
        "production",
        "sms",
        "shipping",
        "styling",
        "top",
        "wash",
        "development",
        "fit_styling",
        "task",
    }
)
SAMPLE_STATUSES = frozenset({"requested", "in_progress", "submitted", "approved", "rejected", "cancelled"})
_ALLOWED_TRANSITIONS: dict[str, frozenset[str]] = {
    "requested": frozenset({"in_progress", "cancelled"}),
    "in_progress": frozenset({"submitted", "cancelled"}),
    "submitted": frozenset({"approved", "rejected"}),
    "approved": frozenset(),
    "rejected": frozenset(),
    "cancelled": frozenset(),
}

_COST_LINE_TYPES = frozenset({"labor", "material", "overhead", "other"})


class MerchSampleCommentOut(BaseModel):
    id: int
    sample_request_id: int
    comment: str
    attachment_url: str | None
    created_by_id: int | None
    created_at: str

    model_config = {"from_attributes": False}


class MerchSampleOut(BaseModel):
    id: int
    tenant_id: int
    style_id: int
    inquiry_id: int | None
    order_id: int | None
    sample_code: str
    sample_type: str
    sample_subtype: str | None = None
    status: str
    revision_no: int
    target_date: str | None
    actual_date: str | None
    assigned_to_id: int | None
    remarks: str | None
    created_at: str
    updated_at: str
    style_code: str | None = None
    style_name: str | None = None
    inquiry_code: str | None = None
    order_code: str | None = None


class MerchSampleCreate(BaseModel):
    style_id: int = Field(..., gt=0)
    inquiry_id: int | None = None
    order_id: int | None = None
    sample_type: str = Field(..., min_length=1, max_length=32)
    sample_subtype: str | None = Field(None, max_length=64)
    target_date: date | None = None
    assigned_to_id: int | None = None
    remarks: str | None = Field(None, max_length=8000)


class MerchSampleUpdate(BaseModel):
    status: str | None = Field(None, max_length=32)
    sample_type: str | None = Field(None, max_length=32)
    sample_subtype: str | None = Field(None, max_length=64)
    revision_no: int | None = Field(None, ge=1)
    target_date: date | None = None
    actual_date: date | None = None
    assigned_to_id: int | None = None
    remarks: str | None = Field(None, max_length=8000)


class MerchSampleCommentCreate(BaseModel):
    comment: str = Field(..., min_length=1, max_length=8000)
    attachment_url: str | None = Field(None, max_length=512)


class MerchSampleTaskOut(BaseModel):
    id: int
    sample_request_id: int
    sort_order: int
    step_name: str
    planned_start: str | None
    planned_end: str | None
    actual_start: str | None
    actual_end: str | None
    assigned_to_id: int | None
    pct_complete: str
    notes: str | None


class MerchSampleTaskCreate(BaseModel):
    step_name: str = Field(..., min_length=1, max_length=255)
    sort_order: int = 0
    planned_start: date | None = None
    planned_end: date | None = None
    actual_start: date | None = None
    actual_end: date | None = None
    assigned_to_id: int | None = None
    pct_complete: Decimal | None = Field(default=None)
    notes: str | None = None


class MerchSampleTaskUpdate(BaseModel):
    sort_order: int | None = None
    step_name: str | None = Field(None, max_length=255)
    planned_start: date | None = None
    planned_end: date | None = None
    actual_start: date | None = None
    actual_end: date | None = None
    assigned_to_id: int | None = None
    pct_complete: Decimal | None = None
    notes: str | None = None


class MerchSampleCostLineOut(BaseModel):
    id: int
    sample_request_id: int
    line_type: str
    label: str
    qty: str | None
    unit: str | None
    rate: str | None
    amount: str | None
    currency_code: str | None


class MerchSampleCostLineCreate(BaseModel):
    line_type: str = Field(..., min_length=1, max_length=32)
    label: str = Field(..., min_length=1, max_length=255)
    qty: Decimal | None = None
    unit: str | None = Field(None, max_length=32)
    rate: Decimal | None = None
    amount: Decimal | None = None
    currency_code: str | None = Field(None, max_length=8)


class MerchSampleCostLineUpdate(BaseModel):
    line_type: str | None = Field(None, max_length=32)
    label: str | None = Field(None, max_length=255)
    qty: Decimal | None = None
    unit: str | None = Field(None, max_length=32)
    rate: Decimal | None = None
    amount: Decimal | None = None
    currency_code: str | None = Field(None, max_length=8)


class MerchSampleMaterialLineOut(BaseModel):
    id: int
    sample_request_id: int
    item_id: int
    item_code: str | None = None
    item_name: str | None = None
    qty: str
    uom: str | None
    notes: str | None


class MerchSampleMaterialLineCreate(BaseModel):
    item_id: int = Field(..., gt=0)
    qty: Decimal = Field(..., gt=0)
    uom: str | None = Field(None, max_length=32)
    notes: str | None = None


class MerchSampleMaterialLineUpdate(BaseModel):
    qty: Decimal | None = Field(None, gt=0)
    uom: str | None = Field(None, max_length=32)
    notes: str | None = None


class MerchSampleMetricsOut(BaseModel):
    lead_time_days: int | None
    planned_vs_actual_days: int | None
    task_count: int
    avg_task_pct_complete: float | None
    planned_span_days_sum: int
    bottleneck_step: str | None
    total_cost_amount: str


class MerchSampleAiProposalOut(BaseModel):
    id: int
    sample_request_id: int
    status: str
    proposal_json: dict
    created_at: str
    applied_at: str | None


class MerchSampleAiPlanApplyBody(BaseModel):
    proposal_id: int = Field(..., gt=0)
    schedule_start: date | None = None


def _d(d: date | None) -> str | None:
    return d.isoformat() if d else None


def _dec(v: Decimal | None) -> str | None:
    if v is None:
        return None
    return str(v)


def _sample_to_out(
    row: MerchSampleRequest,
    *,
    style_code: str | None = None,
    style_name: str | None = None,
    inquiry_code: str | None = None,
    order_code: str | None = None,
) -> MerchSampleOut:
    return MerchSampleOut(
        id=row.id,
        tenant_id=row.tenant_id,
        style_id=row.style_id,
        inquiry_id=row.inquiry_id,
        order_id=row.order_id,
        sample_code=row.sample_code,
        sample_type=row.sample_type,
        sample_subtype=getattr(row, "sample_subtype", None),
        status=row.status,
        revision_no=row.revision_no,
        target_date=_d(row.target_date),
        actual_date=_d(row.actual_date),
        assigned_to_id=row.assigned_to_id,
        remarks=row.remarks,
        created_at=row.created_at.isoformat() if row.created_at else "",
        updated_at=row.updated_at.isoformat() if row.updated_at else "",
        style_code=style_code,
        style_name=style_name,
        inquiry_code=inquiry_code,
        order_code=order_code,
    )


def _task_to_out(t: MerchSampleTask) -> MerchSampleTaskOut:
    return MerchSampleTaskOut(
        id=t.id,
        sample_request_id=t.sample_request_id,
        sort_order=t.sort_order,
        step_name=t.step_name,
        planned_start=_d(t.planned_start),
        planned_end=_d(t.planned_end),
        actual_start=_d(t.actual_start),
        actual_end=_d(t.actual_end),
        assigned_to_id=t.assigned_to_id,
        pct_complete=str(t.pct_complete) if t.pct_complete is not None else "0",
        notes=t.notes,
    )


def _cost_to_out(c: MerchSampleCostLine) -> MerchSampleCostLineOut:
    return MerchSampleCostLineOut(
        id=c.id,
        sample_request_id=c.sample_request_id,
        line_type=c.line_type,
        label=c.label,
        qty=_dec(c.qty),
        unit=c.unit,
        rate=_dec(c.rate),
        amount=_dec(c.amount),
        currency_code=c.currency_code,
    )


def _mat_to_out(m: MerchSampleMaterialLine, item: Item | None) -> MerchSampleMaterialLineOut:
    return MerchSampleMaterialLineOut(
        id=m.id,
        sample_request_id=m.sample_request_id,
        item_id=m.item_id,
        item_code=item.item_code if item else None,
        item_name=item.name if item else None,
        qty=str(m.qty),
        uom=m.uom,
        notes=m.notes,
    )


def _comment_to_out(c: MerchSampleComment) -> MerchSampleCommentOut:
    return MerchSampleCommentOut(
        id=c.id,
        sample_request_id=c.sample_request_id,
        comment=c.comment,
        attachment_url=c.attachment_url,
        created_by_id=c.created_by_id,
        created_at=c.created_at.isoformat() if c.created_at else "",
    )


async def _get_sample_or_404(
    db: AsyncSession, *, tenant_id: int, sample_id: int
) -> MerchSampleRequest:
    row = await db.get(MerchSampleRequest, sample_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sample request not found")
    return row


async def _enrich_sample_out(db: AsyncSession, tenant_id: int, row: MerchSampleRequest) -> MerchSampleOut:
    labels = await load_style_labels(db, tenant_id=tenant_id, style_ids={row.style_id})
    sc, sn = labels.get(row.style_id, (None, None))
    inq_code = None
    if row.inquiry_id:
        iq = await db.get(Inquiry, row.inquiry_id)
        if iq and iq.tenant_id == tenant_id:
            inq_code = iq.inquiry_code
    ord_code = None
    if row.order_id:
        o = await db.get(Order, row.order_id)
        if o and o.tenant_id == tenant_id:
            ord_code = getattr(o, "order_code", None) or str(o.id)
    return _sample_to_out(row, style_code=sc, style_name=sn, inquiry_code=inq_code, order_code=ord_code)


@router.get("/samples", response_model=list[MerchSampleOut])
async def list_samples(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    status_filter: str | None = Query(None, alias="status"),
    sample_type: str | None = None,
    style_id: int | None = None,
    order_id: int | None = None,
    target_from: date | None = None,
    target_to: date | None = None,
    limit: int = Query(50, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(0, ge=0),
):
    ensure_tenant(user, tenant)
    stmt = select(MerchSampleRequest).where(MerchSampleRequest.tenant_id == tenant.id)
    if status_filter:
        stmt = stmt.where(MerchSampleRequest.status == status_filter.strip().lower())
    if sample_type:
        stmt = stmt.where(MerchSampleRequest.sample_type == sample_type.strip().lower())
    if style_id is not None:
        stmt = stmt.where(MerchSampleRequest.style_id == style_id)
    if order_id is not None:
        stmt = stmt.where(MerchSampleRequest.order_id == order_id)
    if target_from is not None:
        stmt = stmt.where(
            MerchSampleRequest.target_date.isnot(None),
            MerchSampleRequest.target_date >= target_from,
        )
    if target_to is not None:
        stmt = stmt.where(
            MerchSampleRequest.target_date.isnot(None),
            MerchSampleRequest.target_date <= target_to,
        )
    stmt = stmt.order_by(MerchSampleRequest.created_at.desc()).limit(limit).offset(offset)
    rows = (await db.scalars(stmt)).all()
    style_ids = {r.style_id for r in rows}
    label_map = await load_style_labels(db, tenant_id=tenant.id, style_ids=style_ids)
    out: list[MerchSampleOut] = []
    for r in rows:
        sc, sn = label_map.get(r.style_id, (None, None))
        out.append(_sample_to_out(r, style_code=sc, style_name=sn))
    return out


@router.get("/samples/by-style/{style_id}", response_model=list[MerchSampleOut])
async def list_samples_by_style(
    style_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=MAX_PAGE_SIZE),
):
    ensure_tenant(user, tenant)
    st = await db.get(GarmentStyle, style_id)
    if not st or st.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Style not found")
    rows = (
        await db.scalars(
            select(MerchSampleRequest)
            .where(
                MerchSampleRequest.tenant_id == tenant.id,
                MerchSampleRequest.style_id == style_id,
            )
            .order_by(MerchSampleRequest.created_at.desc())
            .limit(limit)
        )
    ).all()
    sc, sn = st.style_code, st.name
    return [_sample_to_out(r, style_code=sc, style_name=sn) for r in rows]


@router.get("/samples/by-order/{order_id}", response_model=list[MerchSampleOut])
async def list_samples_by_order(
    order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=MAX_PAGE_SIZE),
):
    ensure_tenant(user, tenant)
    o = await db.get(Order, order_id)
    if not o or o.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    rows = (
        await db.scalars(
            select(MerchSampleRequest)
            .where(
                MerchSampleRequest.tenant_id == tenant.id,
                MerchSampleRequest.order_id == order_id,
            )
            .order_by(MerchSampleRequest.created_at.desc())
            .limit(limit)
        )
    ).all()
    style_ids = {r.style_id for r in rows}
    label_map = await load_style_labels(db, tenant_id=tenant.id, style_ids=style_ids)
    ord_code = getattr(o, "order_code", None) or str(o.id)
    out: list[MerchSampleOut] = []
    for r in rows:
        sc, sn = label_map.get(r.style_id, (None, None))
        out.append(_sample_to_out(r, style_code=sc, style_name=sn, order_code=ord_code))
    return out


@router.get("/samples/{sample_id}", response_model=MerchSampleOut)
async def get_sample(
    sample_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ensure_tenant(user, tenant)
    row = await _get_sample_or_404(db, tenant_id=tenant.id, sample_id=sample_id)
    return await _enrich_sample_out(db, tenant.id, row)


@router.get("/samples/{sample_id}/metrics", response_model=MerchSampleMetricsOut)
async def get_sample_metrics(
    sample_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ensure_tenant(user, tenant)
    sample = await _get_sample_or_404(db, tenant_id=tenant.id, sample_id=sample_id)
    tasks = (
        await db.scalars(
            select(MerchSampleTask)
            .where(
                MerchSampleTask.tenant_id == tenant.id,
                MerchSampleTask.sample_request_id == sample_id,
            )
            .order_by(MerchSampleTask.sort_order, MerchSampleTask.id)
        )
    ).all()
    costs = (
        await db.scalars(
            select(MerchSampleCostLine).where(
                MerchSampleCostLine.tenant_id == tenant.id,
                MerchSampleCostLine.sample_request_id == sample_id,
            )
        )
    ).all()
    m = compute_sample_metrics(sample=sample, tasks=list(tasks), cost_lines=list(costs))
    return MerchSampleMetricsOut(
        lead_time_days=m.get("lead_time_days"),
        planned_vs_actual_days=m.get("planned_vs_actual_days"),
        task_count=int(m.get("task_count") or 0),
        avg_task_pct_complete=m.get("avg_task_pct_complete"),
        planned_span_days_sum=int(m.get("planned_span_days_sum") or 0),
        bottleneck_step=m.get("bottleneck_step"),
        total_cost_amount=str(m.get("total_cost_amount") or "0"),
    )


@router.post("/samples", response_model=MerchSampleOut, status_code=status.HTTP_201_CREATED)
async def create_sample(
    body: MerchSampleCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _perm: None = Depends(require_merch_permission(MERCH_PERMISSION_SAMPLE_MANAGE)),
):
    ensure_tenant(user, tenant)
    st = body.sample_type.strip().lower()
    if st not in SAMPLE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid sample_type. Allowed: {', '.join(sorted(SAMPLE_TYPES))}",
        )
    style = await db.get(GarmentStyle, body.style_id)
    if not style or style.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Style not found")
    if body.inquiry_id is not None:
        iq = await db.get(Inquiry, body.inquiry_id)
        if not iq or iq.tenant_id != tenant.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inquiry not found")
    if body.order_id is not None:
        o = await db.get(Order, body.order_id)
        if not o or o.tenant_id != tenant.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    code = await next_tenant_code(
        db, model=MerchSampleRequest, tenant_id=tenant.id, prefix="SMP-", width=4
    )
    sub = (body.sample_subtype or "").strip() or None
    row = MerchSampleRequest(
        tenant_id=tenant.id,
        style_id=body.style_id,
        inquiry_id=body.inquiry_id,
        order_id=body.order_id,
        sample_code=code,
        sample_type=st,
        sample_subtype=sub,
        status="requested",
        revision_no=1,
        target_date=body.target_date,
        assigned_to_id=body.assigned_to_id,
        remarks=body.remarks,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return await _enrich_sample_out(db, tenant.id, row)


@router.patch("/samples/{sample_id}", response_model=MerchSampleOut)
async def update_sample(
    sample_id: int,
    body: MerchSampleUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _perm: None = Depends(require_merch_permission(MERCH_PERMISSION_SAMPLE_MANAGE)),
):
    ensure_tenant(user, tenant)
    row = await _get_sample_or_404(db, tenant_id=tenant.id, sample_id=sample_id)
    data = body.model_dump(exclude_unset=True)
    if "sample_type" in data and data["sample_type"] is not None:
        st = data["sample_type"].strip().lower()
        if st not in SAMPLE_TYPES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid sample_type. Allowed: {', '.join(sorted(SAMPLE_TYPES))}",
            )
        data["sample_type"] = st
    if "sample_subtype" in data and data["sample_subtype"] is not None:
        data["sample_subtype"] = (data["sample_subtype"] or "").strip() or None
    if "status" in data and data["status"] is not None:
        new_s = data["status"].strip().lower()
        if new_s not in SAMPLE_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid status. Allowed: {', '.join(sorted(SAMPLE_STATUSES))}",
            )
        if new_s != row.status:
            allowed = _ALLOWED_TRANSITIONS.get(row.status, frozenset())
            if new_s not in allowed:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot transition status from {row.status} to {new_s}",
                )
        data["status"] = new_s
    for k, v in data.items():
        setattr(row, k, v)
    row.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(row)
    return await _enrich_sample_out(db, tenant.id, row)


@router.get("/samples/{sample_id}/tasks", response_model=list[MerchSampleTaskOut])
async def list_sample_tasks(
    sample_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ensure_tenant(user, tenant)
    await _get_sample_or_404(db, tenant_id=tenant.id, sample_id=sample_id)
    rows = (
        await db.scalars(
            select(MerchSampleTask)
            .where(
                MerchSampleTask.tenant_id == tenant.id,
                MerchSampleTask.sample_request_id == sample_id,
            )
            .order_by(MerchSampleTask.sort_order, MerchSampleTask.id)
        )
    ).all()
    return [_task_to_out(t) for t in rows]


@router.post(
    "/samples/{sample_id}/tasks",
    response_model=MerchSampleTaskOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_sample_task(
    sample_id: int,
    body: MerchSampleTaskCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _perm: None = Depends(require_merch_permission(MERCH_PERMISSION_SAMPLE_MANAGE)),
):
    ensure_tenant(user, tenant)
    await _get_sample_or_404(db, tenant_id=tenant.id, sample_id=sample_id)
    pct = body.pct_complete if body.pct_complete is not None else Decimal("0")
    row = MerchSampleTask(
        tenant_id=tenant.id,
        sample_request_id=sample_id,
        sort_order=body.sort_order,
        step_name=body.step_name.strip(),
        planned_start=body.planned_start,
        planned_end=body.planned_end,
        actual_start=body.actual_start,
        actual_end=body.actual_end,
        assigned_to_id=body.assigned_to_id,
        pct_complete=pct,
        notes=body.notes,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _task_to_out(row)


@router.patch("/samples/{sample_id}/tasks/{task_id}", response_model=MerchSampleTaskOut)
async def update_sample_task(
    sample_id: int,
    task_id: int,
    body: MerchSampleTaskUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _perm: None = Depends(require_merch_permission(MERCH_PERMISSION_SAMPLE_MANAGE)),
):
    ensure_tenant(user, tenant)
    await _get_sample_or_404(db, tenant_id=tenant.id, sample_id=sample_id)
    row = await db.get(MerchSampleTask, task_id)
    if not row or row.tenant_id != tenant.id or row.sample_request_id != sample_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(row, k, v)
    row.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(row)
    return _task_to_out(row)


@router.delete("/samples/{sample_id}/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sample_task(
    sample_id: int,
    task_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _perm: None = Depends(require_merch_permission(MERCH_PERMISSION_SAMPLE_MANAGE)),
):
    ensure_tenant(user, tenant)
    await _get_sample_or_404(db, tenant_id=tenant.id, sample_id=sample_id)
    row = await db.get(MerchSampleTask, task_id)
    if not row or row.tenant_id != tenant.id or row.sample_request_id != sample_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    await db.delete(row)
    await db.commit()
    return None


@router.get("/samples/{sample_id}/cost-lines", response_model=list[MerchSampleCostLineOut])
async def list_sample_cost_lines(
    sample_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ensure_tenant(user, tenant)
    await _get_sample_or_404(db, tenant_id=tenant.id, sample_id=sample_id)
    rows = (
        await db.scalars(
            select(MerchSampleCostLine).where(
                MerchSampleCostLine.tenant_id == tenant.id,
                MerchSampleCostLine.sample_request_id == sample_id,
            )
        )
    ).all()
    return [_cost_to_out(c) for c in rows]


@router.post(
    "/samples/{sample_id}/cost-lines",
    response_model=MerchSampleCostLineOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_sample_cost_line(
    sample_id: int,
    body: MerchSampleCostLineCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _perm: None = Depends(require_merch_permission(MERCH_PERMISSION_SAMPLE_MANAGE)),
):
    ensure_tenant(user, tenant)
    await _get_sample_or_404(db, tenant_id=tenant.id, sample_id=sample_id)
    lt = body.line_type.strip().lower()
    if lt not in _COST_LINE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid line_type. Allowed: {', '.join(sorted(_COST_LINE_TYPES))}",
        )
    row = MerchSampleCostLine(
        tenant_id=tenant.id,
        sample_request_id=sample_id,
        line_type=lt,
        label=body.label.strip(),
        qty=body.qty,
        unit=body.unit,
        rate=body.rate,
        amount=body.amount,
        currency_code=(body.currency_code or "").strip().upper() or None,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _cost_to_out(row)


@router.patch("/samples/{sample_id}/cost-lines/{line_id}", response_model=MerchSampleCostLineOut)
async def update_sample_cost_line(
    sample_id: int,
    line_id: int,
    body: MerchSampleCostLineUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _perm: None = Depends(require_merch_permission(MERCH_PERMISSION_SAMPLE_MANAGE)),
):
    ensure_tenant(user, tenant)
    await _get_sample_or_404(db, tenant_id=tenant.id, sample_id=sample_id)
    row = await db.get(MerchSampleCostLine, line_id)
    if not row or row.tenant_id != tenant.id or row.sample_request_id != sample_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cost line not found")
    data = body.model_dump(exclude_unset=True)
    if "line_type" in data and data["line_type"] is not None:
        lt = data["line_type"].strip().lower()
        if lt not in _COST_LINE_TYPES:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid line_type")
        data["line_type"] = lt
    if "currency_code" in data and data["currency_code"] is not None:
        data["currency_code"] = (data["currency_code"] or "").strip().upper() or None
    for k, v in data.items():
        setattr(row, k, v)
    row.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(row)
    return _cost_to_out(row)


@router.delete("/samples/{sample_id}/cost-lines/{line_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sample_cost_line(
    sample_id: int,
    line_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _perm: None = Depends(require_merch_permission(MERCH_PERMISSION_SAMPLE_MANAGE)),
):
    ensure_tenant(user, tenant)
    await _get_sample_or_404(db, tenant_id=tenant.id, sample_id=sample_id)
    row = await db.get(MerchSampleCostLine, line_id)
    if not row or row.tenant_id != tenant.id or row.sample_request_id != sample_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cost line not found")
    await db.delete(row)
    await db.commit()
    return None


@router.get("/samples/{sample_id}/material-lines", response_model=list[MerchSampleMaterialLineOut])
async def list_sample_material_lines(
    sample_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ensure_tenant(user, tenant)
    await _get_sample_or_404(db, tenant_id=tenant.id, sample_id=sample_id)
    rows = (
        await db.scalars(
            select(MerchSampleMaterialLine).where(
                MerchSampleMaterialLine.tenant_id == tenant.id,
                MerchSampleMaterialLine.sample_request_id == sample_id,
            )
        )
    ).all()
    if not rows:
        return []
    item_ids = {m.item_id for m in rows}
    items = (
        await db.scalars(select(Item).where(Item.tenant_id == tenant.id, Item.id.in_(item_ids)))
    ).all()
    imap = {i.id: i for i in items}
    return [_mat_to_out(m, imap.get(m.item_id)) for m in rows]


@router.post(
    "/samples/{sample_id}/material-lines",
    response_model=MerchSampleMaterialLineOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_sample_material_line(
    sample_id: int,
    body: MerchSampleMaterialLineCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _perm: None = Depends(require_merch_permission(MERCH_PERMISSION_SAMPLE_MANAGE)),
):
    ensure_tenant(user, tenant)
    await _get_sample_or_404(db, tenant_id=tenant.id, sample_id=sample_id)
    it = await db.get(Item, body.item_id)
    if not it or it.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    row = MerchSampleMaterialLine(
        tenant_id=tenant.id,
        sample_request_id=sample_id,
        item_id=body.item_id,
        qty=body.qty,
        uom=body.uom,
        notes=body.notes,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _mat_to_out(row, it)


@router.patch("/samples/{sample_id}/material-lines/{line_id}", response_model=MerchSampleMaterialLineOut)
async def update_sample_material_line(
    sample_id: int,
    line_id: int,
    body: MerchSampleMaterialLineUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _perm: None = Depends(require_merch_permission(MERCH_PERMISSION_SAMPLE_MANAGE)),
):
    ensure_tenant(user, tenant)
    await _get_sample_or_404(db, tenant_id=tenant.id, sample_id=sample_id)
    row = await db.get(MerchSampleMaterialLine, line_id)
    if not row or row.tenant_id != tenant.id or row.sample_request_id != sample_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Material line not found")
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(row, k, v)
    row.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(row)
    it = await db.get(Item, row.item_id)
    return _mat_to_out(row, it)


@router.delete("/samples/{sample_id}/material-lines/{line_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sample_material_line(
    sample_id: int,
    line_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _perm: None = Depends(require_merch_permission(MERCH_PERMISSION_SAMPLE_MANAGE)),
):
    ensure_tenant(user, tenant)
    await _get_sample_or_404(db, tenant_id=tenant.id, sample_id=sample_id)
    row = await db.get(MerchSampleMaterialLine, line_id)
    if not row or row.tenant_id != tenant.id or row.sample_request_id != sample_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Material line not found")
    await db.delete(row)
    await db.commit()
    return None


class MerchSampleAiPlanProposalResponse(BaseModel):
    proposal: MerchSampleAiProposalOut
    preview: SamplePlanLlmOut


@router.post("/samples/{sample_id}/ai/plan-proposal", response_model=MerchSampleAiPlanProposalResponse)
async def sample_ai_plan_proposal(
    sample_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _perm: None = Depends(require_merch_permission(MERCH_PERMISSION_SAMPLE_MANAGE)),
):
    ensure_tenant(user, tenant)
    sample = await _get_sample_or_404(db, tenant_id=tenant.id, sample_id=sample_id)
    prop, preview = await create_plan_proposal(db, tenant_id=tenant.id, user=user, sample=sample)
    out_prop = MerchSampleAiProposalOut(
        id=prop.id,
        sample_request_id=prop.sample_request_id,
        status=prop.status,
        proposal_json=prop.proposal_json if isinstance(prop.proposal_json, dict) else {},
        created_at=prop.created_at.isoformat() if prop.created_at else "",
        applied_at=prop.applied_at.isoformat() if prop.applied_at else None,
    )
    return MerchSampleAiPlanProposalResponse(proposal=out_prop, preview=preview)


@router.post("/samples/{sample_id}/ai/plan-apply", response_model=list[MerchSampleTaskOut])
async def sample_ai_plan_apply(
    sample_id: int,
    body: MerchSampleAiPlanApplyBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _perm: None = Depends(require_merch_permission(MERCH_PERMISSION_SAMPLE_MANAGE)),
):
    ensure_tenant(user, tenant)
    sample = await _get_sample_or_404(db, tenant_id=tenant.id, sample_id=sample_id)
    tasks, _prop = await apply_plan_proposal(
        db,
        tenant_id=tenant.id,
        user=user,
        sample=sample,
        proposal_id=body.proposal_id,
        schedule_start=body.schedule_start,
    )
    return [_task_to_out(t) for t in tasks]


@router.get("/samples/{sample_id}/comments", response_model=list[MerchSampleCommentOut])
async def list_sample_comments(
    sample_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ensure_tenant(user, tenant)
    await _get_sample_or_404(db, tenant_id=tenant.id, sample_id=sample_id)
    rows = (
        await db.scalars(
            select(MerchSampleComment)
            .where(
                MerchSampleComment.tenant_id == tenant.id,
                MerchSampleComment.sample_request_id == sample_id,
            )
            .order_by(MerchSampleComment.created_at.asc())
        )
    ).all()
    return [_comment_to_out(c) for c in rows]


@router.post(
    "/samples/{sample_id}/comments",
    response_model=MerchSampleCommentOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_sample_comment(
    sample_id: int,
    body: MerchSampleCommentCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _perm: None = Depends(require_merch_permission(MERCH_PERMISSION_SAMPLE_MANAGE)),
):
    ensure_tenant(user, tenant)
    await _get_sample_or_404(db, tenant_id=tenant.id, sample_id=sample_id)
    c = MerchSampleComment(
        tenant_id=tenant.id,
        sample_request_id=sample_id,
        comment=body.comment.strip(),
        attachment_url=body.attachment_url,
        created_by_id=user.id,
    )
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return _comment_to_out(c)
