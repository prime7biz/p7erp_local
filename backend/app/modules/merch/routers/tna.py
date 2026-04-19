"""TNA templates and order follow-up actions."""

from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.pagination import MAX_PAGE_SIZE
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import (
    FollowupActionRejectionLog,
    FollowupActionTemplate,
    GarmentStyle,
    MerchSampleRequest,
    Order,
    OrderFollowupAction,
    FollowupActionComment,
    Quotation,
    Tenant,
    User,
)
from app.modules.merch import constants as merch_c
from app.modules.merch.deps import ensure_tenant as _ensure_tenant
from app.modules.merch.permissions import MERCH_PERMISSION_TNA_MANAGE, require_merch_permission

router = APIRouter(tags=["merch"])


# ---------- TNA / Advanced Order Follow-up: templates and action lines ----------

TNA_PHASES = merch_c.TNA_PHASES
TNA_ACTION_STATUSES = merch_c.TNA_ACTION_STATUSES
TNA_APPROVAL_STATUSES = merch_c.TNA_APPROVAL_STATUSES
TNA_SEVERITIES = merch_c.TNA_SEVERITIES
TNA_DEFAULT_TEMPLATE_SEED = merch_c.TNA_DEFAULT_TEMPLATE_SEED


class FollowupActionTemplateOut(BaseModel):
    id: int
    code: str
    name: str
    phase: str
    action_group: str | None
    sequence_no: int
    default_days_before_delivery: int | None
    is_mandatory: bool
    is_active: bool
    buyer_id: int | None


class FollowupActionTemplateCreate(BaseModel):
    code: str
    name: str
    phase: str
    action_group: str | None = None
    sequence_no: int = 0
    default_days_before_delivery: int | None = None
    is_mandatory: bool = False
    is_active: bool = True
    buyer_id: int | None = None

    @field_validator("phase")
    @classmethod
    def _validate_phase(cls, v: str) -> str:
        s = (v or "").strip().lower()
        if s not in set(merch_c.TNA_PHASES):
            raise ValueError(f"Invalid phase. Allowed: {', '.join(merch_c.TNA_PHASES)}")
        return s


class OrderFollowupActionOut(BaseModel):
    id: int
    order_id: int
    order_code: str | None
    delivery_date: date | None
    style_code: str | None
    merch_sample_request_id: int | None = None
    template_id: int | None
    sequence_no: int
    phase: str
    action_group: str | None
    action_type: str | None
    title: str
    description: str | None
    is_template_generated: bool
    is_mandatory: bool
    is_active: bool
    assigned_to_id: int | None
    planned_date: date | None
    actual_submission_date: date | None
    approval_received_date: date | None
    actual_completion_date: date | None
    resubmission_date: date | None
    status: str
    approval_status: str | None
    is_rejected: bool
    rejection_reason: str | None
    delay_reason: str | None
    severity: str | None
    remarks: str | None
    completed_at: datetime | None
    milestone_type: str | None
    external_id: int | None
    created_at: datetime
    updated_at: datetime


class FollowupActionCommentOut(BaseModel):
    id: int
    user_id: int
    username: str | None
    comment_text: str
    created_at: datetime


class FollowupActionCommentCreate(BaseModel):
    comment_text: str


class OrderFollowupActionCreate(BaseModel):
    order_id: int
    merch_sample_request_id: int | None = None
    template_id: int | None = None
    sequence_no: int = 0
    phase: str
    action_group: str | None = None
    action_type: str | None = None
    title: str
    description: str | None = None
    is_mandatory: bool = False
    planned_date: date | None = None
    actual_submission_date: date | None = None
    approval_received_date: date | None = None
    resubmission_date: date | None = None
    status: str = "pending"
    approval_status: str | None = None
    is_rejected: bool = False
    rejection_reason: str | None = None
    delay_reason: str | None = None
    severity: str | None = None
    remarks: str | None = None
    assigned_to_id: int | None = None


class OrderFollowupActionUpdate(BaseModel):
    merch_sample_request_id: int | None = None
    sequence_no: int | None = None
    phase: str | None = None
    action_group: str | None = None
    action_type: str | None = None
    title: str | None = None
    description: str | None = None
    planned_date: date | None = None
    actual_submission_date: date | None = None
    approval_received_date: date | None = None
    actual_completion_date: date | None = None
    resubmission_date: date | None = None
    status: str | None = None
    approval_status: str | None = None
    is_rejected: bool | None = None
    rejection_reason: str | None = None
    delay_reason: str | None = None
    severity: str | None = None
    remarks: str | None = None
    assigned_to_id: int | None = None
    milestone_type: str | None = None
    external_id: int | None = None


class FollowupSummaryOut(BaseModel):
    open_count: int
    overdue_count: int
    due_this_week_count: int
    rejected_count: int
    completed_count: int


class RejectionLogEntryOut(BaseModel):
    id: int
    rejected_at: datetime
    rejection_reason: str | None
    resubmission_date: date | None
    created_at: datetime


class RejectionLogCreate(BaseModel):
    rejection_reason: str | None = None
    resubmission_date: date | None = None


class TnaGenerateRequest(BaseModel):
    order_id: int
    template_ids: list[int] | None = None  # if None, use all active templates


async def _order_context_for_action(
    db: AsyncSession, tenant_id: int, order_id: int
) -> tuple[str | None, date | None, str | None]:
    """Return (order_code, delivery_date, style_code) for an order."""
    order = await db.get(Order, order_id)
    if not order or order.tenant_id != tenant_id:
        return None, None, None
    order_code = order.order_code
    delivery_date = order.delivery_date
    style_code = None
    if order.quotation_id:
        q = await db.get(Quotation, order.quotation_id)
        if q and q.tenant_id == tenant_id and q.style_id:
            style = await db.get(GarmentStyle, q.style_id)
            if style and style.tenant_id != tenant_id:
                style = None
            style_code = style.style_code if style else None
    return order_code, delivery_date, style_code


async def _batch_order_context_map(
    db: AsyncSession, tenant_id: int, order_ids: list[int]
) -> dict[int, tuple[str | None, date | None, str | None]]:
    """Batch-load (order_code, delivery_date, style_code) for many orders (one query set per entity type)."""
    out: dict[int, tuple[str | None, date | None, str | None]] = {}
    if not order_ids:
        return out
    uids = list({oid for oid in order_ids})
    orows = (
        await db.execute(select(Order).where(Order.tenant_id == tenant_id, Order.id.in_(uids)))
    ).scalars().all()
    qids = [o.quotation_id for o in orows if o.quotation_id]
    quotes: dict[int, Quotation] = {}
    if qids:
        qres = await db.execute(
            select(Quotation).where(Quotation.tenant_id == tenant_id, Quotation.id.in_(list({q for q in qids if q})))
        )
        for q in qres.scalars().all():
            quotes[q.id] = q
    sids = [q.style_id for q in quotes.values() if q.style_id]
    styles: dict[int, GarmentStyle] = {}
    if sids:
        sid_set = {s for s in sids if s}
        sres = await db.execute(
            select(GarmentStyle).where(GarmentStyle.tenant_id == tenant_id, GarmentStyle.id.in_(sid_set))
        )
        for s in sres.scalars().all():
            styles[s.id] = s
    for o in orows:
        sc: str | None = None
        if o.quotation_id and o.quotation_id in quotes:
            q = quotes[o.quotation_id]
            if q.style_id and q.style_id in styles:
                sc = styles[q.style_id].style_code
        out[o.id] = (o.order_code, o.delivery_date, sc)
    return out


def _followup_action_to_out(
    a: OrderFollowupAction,
    *,
    order_code: str | None,
    delivery_date: date | None,
    style_code: str | None,
) -> OrderFollowupActionOut:
    return OrderFollowupActionOut(
        id=a.id,
        order_id=a.order_id,
        order_code=order_code,
        delivery_date=delivery_date,
        style_code=style_code,
        merch_sample_request_id=a.merch_sample_request_id,
        template_id=a.template_id,
        sequence_no=a.sequence_no,
        phase=a.phase,
        action_group=a.action_group,
        action_type=a.action_type,
        title=a.title,
        description=a.description,
        is_template_generated=a.is_template_generated,
        is_mandatory=a.is_mandatory,
        is_active=a.is_active,
        assigned_to_id=a.assigned_to_id,
        planned_date=a.planned_date,
        actual_submission_date=a.actual_submission_date,
        approval_received_date=a.approval_received_date,
        actual_completion_date=a.actual_completion_date,
        resubmission_date=a.resubmission_date,
        status=a.status,
        approval_status=a.approval_status,
        is_rejected=a.is_rejected,
        rejection_reason=a.rejection_reason,
        delay_reason=a.delay_reason,
        severity=a.severity,
        remarks=a.remarks,
        completed_at=a.completed_at,
        milestone_type=a.milestone_type,
        external_id=a.external_id,
        created_at=a.created_at,
        updated_at=a.updated_at,
    )


@router.get("/followup-templates", response_model=list[FollowupActionTemplateOut])
async def list_followup_templates(
    phase: str | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    buyer_id: int | None = Query(default=None, description="Filter: global (buyer_id null) or this buyer"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List TNA action templates for the tenant. Seeds default templates if empty.
    When buyer_id is set, returns templates where buyer_id is null (global) or buyer_id == buyer_id.
    """
    _ensure_tenant(user, tenant)
    stmt = select(FollowupActionTemplate).where(FollowupActionTemplate.tenant_id == tenant.id)
    if phase:
        stmt = stmt.where(FollowupActionTemplate.phase == phase)
    if is_active is not None:
        stmt = stmt.where(FollowupActionTemplate.is_active == is_active)
    if buyer_id is not None:
        stmt = stmt.where(
            or_(FollowupActionTemplate.buyer_id.is_(None), FollowupActionTemplate.buyer_id == buyer_id)
        )
    result = await db.execute(stmt.order_by(FollowupActionTemplate.sequence_no, FollowupActionTemplate.id))
    rows = result.scalars().all()
    if not rows:
        for code, name, ph, default_days, seq in TNA_DEFAULT_TEMPLATE_SEED:
            t = FollowupActionTemplate(
                tenant_id=tenant.id,
                code=code,
                name=name,
                phase=ph,
                sequence_no=seq,
                default_days_before_delivery=default_days,
                is_mandatory=False,
                is_active=True,
            )
            db.add(t)
        await db.commit()
        result = await db.execute(
            select(FollowupActionTemplate).where(FollowupActionTemplate.tenant_id == tenant.id).order_by(
                FollowupActionTemplate.sequence_no, FollowupActionTemplate.id
            )
        )
        rows = result.scalars().all()
    return [
        FollowupActionTemplateOut(
            id=r.id,
            code=r.code,
            name=r.name,
            phase=r.phase,
            action_group=r.action_group,
            sequence_no=r.sequence_no,
            default_days_before_delivery=r.default_days_before_delivery,
            is_mandatory=r.is_mandatory,
            is_active=r.is_active,
            buyer_id=r.buyer_id,
        )
        for r in rows
    ]


@router.get("/followup-templates/{template_id}", response_model=FollowupActionTemplateOut)
async def get_followup_template(
    template_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(FollowupActionTemplate, template_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Template not found")
    return FollowupActionTemplateOut(
        id=row.id, code=row.code, name=row.name, phase=row.phase, action_group=row.action_group,
        sequence_no=row.sequence_no, default_days_before_delivery=row.default_days_before_delivery,
        is_mandatory=row.is_mandatory, is_active=row.is_active, buyer_id=row.buyer_id,
    )


@router.post("/followup-templates", status_code=201, response_model=FollowupActionTemplateOut)
async def create_followup_template(
    body: FollowupActionTemplateCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_merch_permission(MERCH_PERMISSION_TNA_MANAGE)),
):
    _ensure_tenant(user, tenant)
    row = FollowupActionTemplate(tenant_id=tenant.id, **body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return FollowupActionTemplateOut(
        id=row.id, code=row.code, name=row.name, phase=row.phase, action_group=row.action_group,
        sequence_no=row.sequence_no, default_days_before_delivery=row.default_days_before_delivery,
        is_mandatory=row.is_mandatory, is_active=row.is_active, buyer_id=row.buyer_id,
    )


class FollowupActionTemplateUpdate(BaseModel):
    name: str | None = None
    phase: str | None = None
    action_group: str | None = None
    sequence_no: int | None = None
    default_days_before_delivery: int | None = None
    is_mandatory: bool | None = None
    is_active: bool | None = None
    buyer_id: int | None = None

    @field_validator("phase")
    @classmethod
    def _validate_phase_optional(cls, v: str | None) -> str | None:
        if v is None:
            return None
        s = v.strip().lower()
        if s not in set(merch_c.TNA_PHASES):
            raise ValueError(f"Invalid phase. Allowed: {', '.join(merch_c.TNA_PHASES)}")
        return s


@router.patch("/followup-templates/{template_id}", response_model=FollowupActionTemplateOut)
async def update_followup_template(
    template_id: int,
    body: FollowupActionTemplateUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_merch_permission(MERCH_PERMISSION_TNA_MANAGE)),
):
    _ensure_tenant(user, tenant)
    row = await db.get(FollowupActionTemplate, template_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Template not found")
    for f in ("name", "phase", "action_group", "sequence_no", "default_days_before_delivery", "is_mandatory", "is_active", "buyer_id"):
        v = getattr(body, f)
        if v is not None:
            setattr(row, f, v)
    await db.commit()
    await db.refresh(row)
    return FollowupActionTemplateOut(
        id=row.id, code=row.code, name=row.name, phase=row.phase, action_group=row.action_group,
        sequence_no=row.sequence_no, default_days_before_delivery=row.default_days_before_delivery,
        is_mandatory=row.is_mandatory, is_active=row.is_active, buyer_id=row.buyer_id,
    )


@router.delete("/followup-templates/{template_id}", status_code=204)
async def delete_followup_template(
    template_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_merch_permission(MERCH_PERMISSION_TNA_MANAGE)),
):
    _ensure_tenant(user, tenant)
    row = await db.get(FollowupActionTemplate, template_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(row)
    await db.commit()


@router.get("/followup-actions", response_model=list[OrderFollowupActionOut])
async def list_followup_actions(
    order_id: int | None = Query(default=None),
    status: str | None = Query(default=None),
    phase: str | None = Query(default=None),
    assigned_to_id: int | None = Query(default=None),
    due_from: date | None = Query(default=None),
    due_to: date | None = Query(default=None),
    overdue_only: bool = Query(default=False),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    today = date.today()
    stmt = select(OrderFollowupAction).where(OrderFollowupAction.tenant_id == tenant.id)
    if order_id is not None:
        stmt = stmt.where(OrderFollowupAction.order_id == order_id)
    if status:
        stmt = stmt.where(OrderFollowupAction.status == status)
    if phase:
        stmt = stmt.where(OrderFollowupAction.phase == phase)
    if assigned_to_id is not None:
        stmt = stmt.where(OrderFollowupAction.assigned_to_id == assigned_to_id)
    if due_from is not None:
        stmt = stmt.where(OrderFollowupAction.planned_date >= due_from)
    if due_to is not None:
        stmt = stmt.where(OrderFollowupAction.planned_date <= due_to)
    if overdue_only:
        stmt = stmt.where(
            OrderFollowupAction.planned_date.isnot(None),
            OrderFollowupAction.planned_date < today,
            OrderFollowupAction.status.notin_(["completed", "approved", "cancelled"]),
        )
    result = await db.execute(stmt.order_by(OrderFollowupAction.planned_date.asc().nullslast(), OrderFollowupAction.sequence_no, OrderFollowupAction.id))
    actions = result.scalars().all()
    ctx_map = await _batch_order_context_map(db, tenant.id, [a.order_id for a in actions])
    out: list[OrderFollowupActionOut] = []
    for a in actions:
        order_code, delivery_date, style_code = ctx_map.get(
            a.order_id, (None, None, None)
        )
        out.append(
            _followup_action_to_out(
                a,
                order_code=order_code,
                delivery_date=delivery_date,
                style_code=style_code,
            )
        )
    return out


@router.get("/followup-actions/summary", response_model=FollowupSummaryOut)
async def get_followup_actions_summary(
    order_id: int | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    today = date.today()
    week_end = today + timedelta(days=7)
    stmt = select(OrderFollowupAction).where(
        OrderFollowupAction.tenant_id == tenant.id,
        OrderFollowupAction.is_active == True,
    )
    if order_id is not None:
        stmt = stmt.where(OrderFollowupAction.order_id == order_id)
    result = await db.execute(stmt)
    rows = result.scalars().all()
    open_statuses = {"pending", "in_progress", "submitted", "rejected", "resubmitted", "on_hold"}
    open_count = sum(1 for r in rows if r.status in open_statuses)
    overdue_count = sum(
        1 for r in rows
        if r.planned_date and r.planned_date < today and r.status in open_statuses
    )
    due_this_week_count = sum(
        1 for r in rows
        if r.planned_date and r.planned_date <= week_end and r.planned_date >= today and r.status in open_statuses
    )
    rejected_count = sum(1 for r in rows if r.is_rejected or r.status == "rejected")
    completed_count = sum(1 for r in rows if r.status in ("completed", "approved"))
    return FollowupSummaryOut(
        open_count=open_count,
        overdue_count=overdue_count,
        due_this_week_count=due_this_week_count,
        rejected_count=rejected_count,
        completed_count=completed_count,
    )


@router.get("/followup-actions/search", response_model=list[OrderFollowupActionOut])
async def search_followup_actions(
    q: str = Query(..., min_length=2),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    # Search in action title, description, and order code
    order_ids: list[int] = []
    order_stmt = select(Order.id).where(Order.tenant_id == tenant.id)
    if q:
        order_stmt = order_stmt.where(Order.order_code.ilike(f"%{q}%"))
    ord_result = await db.execute(order_stmt.limit(50))
    order_ids = list(ord_result.scalars().all())
    conds = [
        OrderFollowupAction.title.ilike(f"%{q}%"),
    ]
    if order_ids:
        conds.append(OrderFollowupAction.order_id.in_(order_ids))
    # Search in description (nullable)
    conds.append(and_(OrderFollowupAction.description.isnot(None), OrderFollowupAction.description.ilike(f"%{q}%")))
    stmt = (
        select(OrderFollowupAction)
        .where(OrderFollowupAction.tenant_id == tenant.id)
        .where(or_(*conds))
    )
    result = await db.execute(stmt.order_by(OrderFollowupAction.planned_date.asc().nullslast()).limit(100))
    actions = result.scalars().all()
    out: list[OrderFollowupActionOut] = []
    for a in actions:
        order_code, delivery_date, style_code = await _order_context_for_action(db, tenant.id, a.order_id)
        out.append(
            _followup_action_to_out(
                a,
                order_code=order_code,
                delivery_date=delivery_date,
                style_code=style_code,
            )
        )
    return out


@router.get("/followup-actions/order/{order_id}/timeline", response_model=list[OrderFollowupActionOut])
async def get_followup_actions_timeline(
    order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    order = await db.get(Order, order_id)
    if not order or order.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Order not found")
    stmt = (
        select(OrderFollowupAction)
        .where(OrderFollowupAction.tenant_id == tenant.id, OrderFollowupAction.order_id == order_id)
        .order_by(OrderFollowupAction.sequence_no, OrderFollowupAction.planned_date.asc().nullslast(), OrderFollowupAction.id)
    )
    result = await db.execute(stmt)
    actions = result.scalars().all()
    order_code, delivery_date, style_code = await _order_context_for_action(db, tenant.id, order_id)
    return [
        _followup_action_to_out(
            a,
            order_code=order_code,
            delivery_date=delivery_date,
            style_code=style_code,
        )
        for a in actions
    ]


@router.post("/followup-actions/generate", response_model=list[OrderFollowupActionOut])
async def generate_followup_actions(
    body: TnaGenerateRequest,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate TNA action lines for an order from templates. Planned dates = delivery_date - default_days_before_delivery."""
    _ensure_tenant(user, tenant)
    order = await db.get(Order, body.order_id)
    if not order or order.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Order not found")
    delivery = order.delivery_date
    if not delivery:
        raise HTTPException(status_code=400, detail="Order has no delivery date; set delivery date first.")
    if body.template_ids:
        tstmt = select(FollowupActionTemplate).where(
            FollowupActionTemplate.tenant_id == tenant.id,
            FollowupActionTemplate.id.in_(body.template_ids),
            FollowupActionTemplate.is_active == True,
        ).order_by(FollowupActionTemplate.sequence_no)
    else:
        tstmt = select(FollowupActionTemplate).where(
            FollowupActionTemplate.tenant_id == tenant.id,
            FollowupActionTemplate.is_active == True,
        ).order_by(FollowupActionTemplate.sequence_no)
    templates = (await db.execute(tstmt)).scalars().all()
    created: list[OrderFollowupAction] = []
    for seq, t in enumerate(templates, start=1):
        planned = None
        if t.default_days_before_delivery is not None:
            planned = delivery - timedelta(days=t.default_days_before_delivery)
        action = OrderFollowupAction(
            tenant_id=tenant.id,
            order_id=body.order_id,
            template_id=t.id,
            sequence_no=seq,
            phase=t.phase,
            action_group=t.action_group,
            title=t.name,
            is_template_generated=True,
            is_mandatory=t.is_mandatory,
            is_active=True,
            planned_date=planned,
            status="pending",
        )
        db.add(action)
        created.append(action)
    await db.commit()
    for a in created:
        await db.refresh(a)
    order_code, delivery_date, style_code = await _order_context_for_action(db, tenant.id, body.order_id)
    return [
        _followup_action_to_out(
            a,
            order_code=order_code,
            delivery_date=delivery_date,
            style_code=style_code,
        )
        for a in created
    ]


@router.get("/followup-actions/overdue", response_model=list[OrderFollowupActionOut])
async def list_overdue_followup_actions(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    today = date.today()
    stmt = (
        select(OrderFollowupAction)
        .where(
            OrderFollowupAction.tenant_id == tenant.id,
            OrderFollowupAction.is_active == True,
            OrderFollowupAction.planned_date.isnot(None),
            OrderFollowupAction.planned_date < today,
            OrderFollowupAction.status.notin_(["completed", "approved", "cancelled"]),
        )
        .order_by(OrderFollowupAction.planned_date.asc())
    )
    result = await db.execute(stmt)
    actions = result.scalars().all()
    out: list[OrderFollowupActionOut] = []
    for a in actions:
        order_code, delivery_date, style_code = await _order_context_for_action(db, tenant.id, a.order_id)
        out.append(
            _followup_action_to_out(
                a,
                order_code=order_code,
                delivery_date=delivery_date,
                style_code=style_code,
            )
        )
    return out


@router.get("/followup-actions/{action_id}/rejection-history", response_model=list[RejectionLogEntryOut])
async def get_followup_action_rejection_history(
    action_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(OrderFollowupAction, action_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Follow-up action not found")
    stmt = (
        select(FollowupActionRejectionLog)
        .where(
            FollowupActionRejectionLog.tenant_id == tenant.id,
            FollowupActionRejectionLog.action_id == action_id,
        )
        .order_by(FollowupActionRejectionLog.rejected_at.desc())
    )
    result = await db.execute(stmt)
    logs = result.scalars().all()
    return [
        RejectionLogEntryOut(
            id=log.id,
            rejected_at=log.rejected_at,
            rejection_reason=log.rejection_reason,
            resubmission_date=log.resubmission_date,
            created_at=log.created_at,
        )
        for log in logs
    ]


@router.post("/followup-actions/{action_id}/rejection-history", status_code=201, response_model=RejectionLogEntryOut)
async def add_followup_action_rejection_log(
    action_id: int,
    body: RejectionLogCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(OrderFollowupAction, action_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Follow-up action not found")
    log_entry = FollowupActionRejectionLog(
        tenant_id=tenant.id,
        action_id=action_id,
        rejected_at=datetime.now(timezone.utc),
        rejection_reason=body.rejection_reason,
        resubmission_date=body.resubmission_date,
        created_by_id=user.id,
    )
    db.add(log_entry)
    row.status = "rejected"
    row.is_rejected = True
    if body.rejection_reason is not None:
        row.rejection_reason = body.rejection_reason
    if body.resubmission_date is not None:
        row.resubmission_date = body.resubmission_date
    await db.commit()
    await db.refresh(log_entry)
    return RejectionLogEntryOut(
        id=log_entry.id,
        rejected_at=log_entry.rejected_at,
        rejection_reason=log_entry.rejection_reason,
        resubmission_date=log_entry.resubmission_date,
        created_at=log_entry.created_at,
    )


@router.get("/followup-actions/{action_id}", response_model=OrderFollowupActionOut)
async def get_followup_action(
    action_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(OrderFollowupAction, action_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Follow-up action not found")
    order_code, delivery_date, style_code = await _order_context_for_action(db, tenant.id, row.order_id)
    return _followup_action_to_out(
        row,
        order_code=order_code,
        delivery_date=delivery_date,
        style_code=style_code,
    )


@router.get("/followup-actions/{action_id}/comments", response_model=list[FollowupActionCommentOut])
async def get_followup_action_comments(
    action_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(OrderFollowupAction, action_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Follow-up action not found")
    stmt = (
        select(FollowupActionComment, User.username)
        .join(User, FollowupActionComment.user_id == User.id)
        .where(
            FollowupActionComment.tenant_id == tenant.id,
            FollowupActionComment.action_id == action_id,
        )
        .order_by(FollowupActionComment.created_at.desc())
    )
    result = await db.execute(stmt)
    rows = result.all()
    return [
        FollowupActionCommentOut(
            id=c.id,
            user_id=c.user_id,
            username=uname,
            comment_text=c.comment_text,
            created_at=c.created_at,
        )
        for c, uname in rows
    ]


@router.post("/followup-actions/{action_id}/comments", status_code=201, response_model=FollowupActionCommentOut)
async def create_followup_action_comment(
    action_id: int,
    body: FollowupActionCommentCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(OrderFollowupAction, action_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Follow-up action not found")
    comment = FollowupActionComment(
        tenant_id=tenant.id,
        action_id=action_id,
        user_id=user.id,
        comment_text=body.comment_text.strip(),
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return FollowupActionCommentOut(
        id=comment.id,
        user_id=comment.user_id,
        username=user.username,
        comment_text=comment.comment_text,
        created_at=comment.created_at,
    )


@router.post("/followup-actions", status_code=201, response_model=OrderFollowupActionOut)
async def create_followup_action(
    body: OrderFollowupActionCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    order = await db.get(Order, body.order_id)
    if not order or order.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Order not found")
    if body.merch_sample_request_id is not None:
        ms = await db.get(MerchSampleRequest, body.merch_sample_request_id)
        if not ms or ms.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Merch sample not found")
        if ms.order_id is not None and ms.order_id != body.order_id:
            raise HTTPException(
                status_code=400,
                detail="merch_sample_request_id must belong to the same order (or have no order)",
            )
    row = OrderFollowupAction(
        tenant_id=tenant.id,
        order_id=body.order_id,
        merch_sample_request_id=body.merch_sample_request_id,
        template_id=body.template_id,
        sequence_no=body.sequence_no,
        phase=body.phase,
        action_group=body.action_group,
        action_type=body.action_type,
        title=body.title,
        description=body.description,
        is_mandatory=body.is_mandatory,
        planned_date=body.planned_date,
        actual_submission_date=body.actual_submission_date,
        approval_received_date=body.approval_received_date,
        resubmission_date=body.resubmission_date,
        status=body.status,
        approval_status=body.approval_status,
        is_rejected=body.is_rejected,
        rejection_reason=body.rejection_reason,
        delay_reason=body.delay_reason,
        severity=body.severity,
        remarks=body.remarks,
        assigned_to_id=body.assigned_to_id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    order_code, delivery_date, style_code = await _order_context_for_action(db, tenant.id, row.order_id)
    return _followup_action_to_out(
        row,
        order_code=order_code,
        delivery_date=delivery_date,
        style_code=style_code,
    )


@router.patch("/followup-actions/{action_id}", response_model=OrderFollowupActionOut)
async def update_followup_action(
    action_id: int,
    body: OrderFollowupActionUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(OrderFollowupAction, action_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Follow-up action not found")
    upd = body.model_dump(exclude_unset=True)
    if "merch_sample_request_id" in upd and upd["merch_sample_request_id"] is not None:
        ms = await db.get(MerchSampleRequest, upd["merch_sample_request_id"])
        if not ms or ms.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Merch sample not found")
        if ms.order_id is not None and ms.order_id != row.order_id:
            raise HTTPException(
                status_code=400,
                detail="merch_sample_request_id must belong to the same order (or have no order)",
            )
    for field in (
        "sequence_no", "phase", "action_group", "action_type", "title", "description",
        "planned_date", "actual_submission_date", "approval_received_date", "actual_completion_date", "resubmission_date",
        "status", "approval_status", "is_rejected", "rejection_reason", "delay_reason", "severity", "remarks", "assigned_to_id",
        "milestone_type", "external_id", "merch_sample_request_id",
    ):
        val = getattr(body, field)
        if field in upd:
            setattr(row, field, val)
    if row.is_rejected and (body.rejection_reason is not None or row.rejection_reason):
        log_entry = FollowupActionRejectionLog(
            tenant_id=tenant.id,
            action_id=row.id,
            rejected_at=datetime.now(timezone.utc),
            rejection_reason=row.rejection_reason,
            resubmission_date=row.resubmission_date,
            created_by_id=user.id,
        )
        db.add(log_entry)
    await db.commit()
    await db.refresh(row)
    from app.modules.orders.pipeline_service import auto_advance_order_pipeline

    await auto_advance_order_pipeline(db, tenant_id=tenant.id, order_id=row.order_id)
    await db.commit()
    order_code, delivery_date, style_code = await _order_context_for_action(db, tenant.id, row.order_id)
    return _followup_action_to_out(
        row,
        order_code=order_code,
        delivery_date=delivery_date,
        style_code=style_code,
    )


@router.post("/followup-actions/{action_id}/complete", response_model=OrderFollowupActionOut)
async def complete_followup_action(
    action_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(OrderFollowupAction, action_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Follow-up action not found")
    row.status = "completed"
    row.approval_status = "approved"
    row.is_rejected = False
    row.actual_completion_date = date.today()
    row.completed_at = datetime.now(timezone.utc)
    row.completed_by_id = user.id
    await db.commit()
    await db.refresh(row)
    from app.modules.orders.pipeline_service import auto_advance_order_pipeline

    await auto_advance_order_pipeline(db, tenant_id=tenant.id, order_id=row.order_id)
    await db.commit()
    order_code, delivery_date, style_code = await _order_context_for_action(db, tenant.id, row.order_id)
    return _followup_action_to_out(
        row,
        order_code=order_code,
        delivery_date=delivery_date,
        style_code=style_code,
    )


@router.post("/followup-actions/{action_id}/reopen", response_model=OrderFollowupActionOut)
async def reopen_followup_action(
    action_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(OrderFollowupAction, action_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Follow-up action not found")
    row.status = "pending"
    row.approval_status = "pending"
    row.actual_completion_date = None
    row.completed_at = None
    row.completed_by_id = None
    await db.commit()
    await db.refresh(row)
    order_code, delivery_date, style_code = await _order_context_for_action(db, tenant.id, row.order_id)
    return _followup_action_to_out(
        row,
        order_code=order_code,
        delivery_date=delivery_date,
        style_code=style_code,
    )


@router.delete("/followup-actions/{action_id}", status_code=204)
async def delete_followup_action(
    action_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(OrderFollowupAction, action_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Follow-up action not found")
    await db.delete(row)
    await db.commit()
