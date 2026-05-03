"""Merchandising pipeline summary, full pipeline, and analytics (/merch/pipeline*)."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.money import format_money
from app.common.tenant import require_tenant
from app.common.workflow import (
    INQUIRY_TRANSITIONS,
    ORDER_TRANSITIONS,
    QUOTATION_TRANSITIONS,
    next_status_options,
)
from app.database import get_db
from app.models import Customer, Inquiry, Order, Quotation, Tenant, User
from app.modules.merch.deps import ensure_tenant as _ensure_tenant

router = APIRouter(tags=["merch"])

# ---------- Pipeline: stages config (research-based order lifecycle + win probability) ----------

PIPELINE_STAGES = [
    {"stage_key": "inquiry_draft", "label": "Inquiry · Draft", "document_type": "inquiry", "status_value": "DRAFT", "win_probability": 5, "sort_order": 1},
    {"stage_key": "inquiry_submitted", "label": "Inquiry · Submitted", "document_type": "inquiry", "status_value": "SUBMITTED", "win_probability": 15, "sort_order": 2},
    {"stage_key": "inquiry_converted", "label": "Inquiry · Converted", "document_type": "inquiry", "status_value": "CONVERTED", "win_probability": 100, "sort_order": 3},
    {"stage_key": "quotation_draft", "label": "Quotation · Draft", "document_type": "quotation", "status_value": "DRAFT", "win_probability": 20, "sort_order": 4},
    {"stage_key": "quotation_new", "label": "Quotation · New", "document_type": "quotation", "status_value": "NEW", "win_probability": 25, "sort_order": 5},
    {"stage_key": "quotation_submitted", "label": "Quotation · Submitted", "document_type": "quotation", "status_value": "SUBMITTED", "win_probability": 35, "sort_order": 6},
    {"stage_key": "quotation_approved", "label": "Quotation · Approved", "document_type": "quotation", "status_value": "APPROVED", "win_probability": 50, "sort_order": 7},
    {"stage_key": "quotation_sent", "label": "Quotation · Sent", "document_type": "quotation", "status_value": "SENT", "win_probability": 60, "sort_order": 8},
    {"stage_key": "quotation_converted", "label": "Quotation · Converted", "document_type": "quotation", "status_value": "CONVERTED", "win_probability": 100, "sort_order": 9},
    {"stage_key": "order_draft", "label": "Order · Draft", "document_type": "order", "status_value": "DRAFT", "win_probability": 70, "sort_order": 10},
    {"stage_key": "order_new", "label": "Order · New", "document_type": "order", "status_value": "NEW", "win_probability": 80, "sort_order": 11},
    {"stage_key": "order_in_progress", "label": "Order · In Progress", "document_type": "order", "status_value": "IN_PROGRESS", "win_probability": 90, "sort_order": 12},
    {"stage_key": "order_completed", "label": "Order · Completed", "document_type": "order", "status_value": "COMPLETED", "win_probability": 100, "sort_order": 13},
]


class PipelineStageOut(BaseModel):
    stage_key: str
    label: str
    document_type: str
    status_value: str
    win_probability: int
    sort_order: int


class PipelineItemOut(BaseModel):
    document_type: str
    id: int
    code: str
    stage_key: str
    customer_id: int
    customer_name: str
    style_ref: str | None
    style_name: str | None
    quantity: int | None
    total_amount: str | None
    created_at: str
    detail_path: str
    next_status_options: list[str]


def _inquiry_stage_key(status: str) -> str:
    key = (status or "DRAFT").upper()
    if key == "CONVERTED":
        return "inquiry_converted"
    if key == "SUBMITTED":
        return "inquiry_submitted"
    return "inquiry_draft"


def _quotation_stage_key(status: str) -> str:
    key = (status or "DRAFT").upper()
    for s in PIPELINE_STAGES:
        if s["document_type"] == "quotation" and s["status_value"] == key:
            return s["stage_key"]
    return "quotation_draft"


def _order_stage_key(status: str) -> str:
    key = (status or "DRAFT").upper()
    for s in PIPELINE_STAGES:
        if s["document_type"] == "order" and s["status_value"] == key:
            return s["stage_key"]
    return "order_draft"


@router.get("/pipeline")
async def get_pipeline_summary(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    inq_count = (
        await db.execute(select(func.count()).select_from(Inquiry).where(Inquiry.tenant_id == tenant.id))
    ).scalar() or 0
    qt_count = (
        await db.execute(select(func.count()).select_from(Quotation).where(Quotation.tenant_id == tenant.id))
    ).scalar() or 0
    ord_count = (
        await db.execute(select(func.count()).select_from(Order).where(Order.tenant_id == tenant.id))
    ).scalar() or 0
    return {
        "inquiries": inq_count,
        "quotations": qt_count,
        "orders": ord_count,
    }


@router.get("/pipeline/full", response_model=dict)
async def get_pipeline_full(
    document_type: str | None = Query(default=None, description="Filter: inquiry, quotation, order"),
    customer_id: int | None = Query(default=None),
    search: str | None = Query(default=None, description="Search code, style_ref"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Advanced pipeline: stages with win probability + all items grouped by stage for Kanban/list views."""
    _ensure_tenant(user, tenant)

    stages_out = [PipelineStageOut(**s) for s in PIPELINE_STAGES]
    items_out: list[PipelineItemOut] = []

    inq_stmt = select(Inquiry, Customer.name).join(
        Customer, Inquiry.customer_id == Customer.id
    ).where(Inquiry.tenant_id == tenant.id)
    if document_type == "order" or document_type == "quotation":
        inq_stmt = inq_stmt.where(1 == 0)
    if customer_id is not None:
        inq_stmt = inq_stmt.where(Inquiry.customer_id == customer_id)
    if search:
        pat = f"%{search}%"
        inq_stmt = inq_stmt.where(
            or_(Inquiry.inquiry_code.ilike(pat), (Inquiry.style_ref or "").ilike(pat))
        )
    inq_result = await db.execute(inq_stmt.order_by(Inquiry.created_at.desc()))
    for inq, cust_name in inq_result.all():
        stage_key = _inquiry_stage_key(inq.status)
        next_options = next_status_options(
            INQUIRY_TRANSITIONS,
            inq.status,
            fallback="DRAFT",
        )
        next_options = [opt for opt in next_options if opt != "CONVERTED"]
        items_out.append(
            PipelineItemOut(
                document_type="inquiry",
                id=inq.id,
                code=inq.inquiry_code,
                stage_key=stage_key,
                customer_id=inq.customer_id,
                customer_name=cust_name or "",
                style_ref=inq.style_ref,
                style_name=None,
                quantity=inq.quantity,
                total_amount=None,
                created_at=inq.created_at.isoformat(),
                detail_path=f"/app/inquiries/{inq.id}",
                next_status_options=next_options,
            )
        )

    qt_stmt = select(Quotation, Customer.name).join(
        Customer, Quotation.customer_id == Customer.id
    ).where(Quotation.tenant_id == tenant.id)
    if document_type == "inquiry" or document_type == "order":
        qt_stmt = qt_stmt.where(1 == 0)
    if customer_id is not None:
        qt_stmt = qt_stmt.where(Quotation.customer_id == customer_id)
    if search:
        pat = f"%{search}%"
        qt_stmt = qt_stmt.where(
            or_(Quotation.quotation_code.ilike(pat), (Quotation.style_ref or "").ilike(pat))
        )
    qt_result = await db.execute(qt_stmt.order_by(Quotation.created_at.desc()))
    for qt, cust_name in qt_result.all():
        stage_key = _quotation_stage_key(qt.status)
        next_options = next_status_options(
            QUOTATION_TRANSITIONS,
            qt.status,
            fallback="DRAFT",
        )
        next_options = [opt for opt in next_options if opt != "CONVERTED"]
        items_out.append(
            PipelineItemOut(
                document_type="quotation",
                id=qt.id,
                code=qt.quotation_code,
                stage_key=stage_key,
                customer_id=qt.customer_id,
                customer_name=cust_name or "",
                style_ref=qt.style_ref,
                style_name=None,
                quantity=qt.projected_quantity,
                total_amount=format_money(qt.total_amount),
                created_at=qt.created_at.isoformat(),
                detail_path=f"/app/quotations/{qt.id}",
                next_status_options=next_options,
            )
        )

    ord_stmt = select(Order, Customer.name).join(
        Customer, Order.customer_id == Customer.id
    ).where(Order.tenant_id == tenant.id)
    if document_type == "inquiry" or document_type == "quotation":
        ord_stmt = ord_stmt.where(1 == 0)
    if customer_id is not None:
        ord_stmt = ord_stmt.where(Order.customer_id == customer_id)
    if search:
        pat = f"%{search}%"
        ord_stmt = ord_stmt.where(
            or_(Order.order_code.ilike(pat), (Order.style_ref or "").ilike(pat))
        )
    ord_result = await db.execute(ord_stmt.order_by(Order.created_at.desc()))
    for ord_row, cust_name in ord_result.all():
        stage_key = _order_stage_key(ord_row.status)
        next_options = next_status_options(
            ORDER_TRANSITIONS,
            ord_row.status,
            fallback="DRAFT",
        )
        items_out.append(
            PipelineItemOut(
                document_type="order",
                id=ord_row.id,
                code=ord_row.order_code,
                stage_key=stage_key,
                customer_id=ord_row.customer_id,
                customer_name=cust_name or "",
                style_ref=ord_row.style_ref,
                style_name=None,
                quantity=ord_row.quantity,
                total_amount=None,
                created_at=ord_row.created_at.isoformat(),
                detail_path=f"/app/orders/{ord_row.id}",
                next_status_options=next_options,
            )
        )

    summary = {
        "inquiries": len([i for i in items_out if i.document_type == "inquiry"]),
        "quotations": len([i for i in items_out if i.document_type == "quotation"]),
        "orders": len([i for i in items_out if i.document_type == "order"]),
    }
    return {
        "stages": [s.model_dump() for s in stages_out],
        "items": [i.model_dump() for i in items_out],
        "summary": summary,
    }


class PipelineAnalyticsBucket(BaseModel):
    period_key: str
    period_label: str
    year: int
    month: int | None
    quarter: int | None
    inquiries_received: int
    confirmed_orders_count: int
    confirmed_orders_quantity: int
    inquiry_under_processing: int
    potential_orders_count: int


class PipelineAnalyticsResponse(BaseModel):
    by_month: list[PipelineAnalyticsBucket]
    by_quarter: list[PipelineAnalyticsBucket]
    summary: dict


def _month_key(d: date | datetime) -> tuple[int, int]:
    if isinstance(d, datetime):
        return (d.year, d.month)
    return (d.year, d.month)


def _quarter_key(d: date | datetime) -> tuple[int, int]:
    if isinstance(d, datetime):
        y, m = d.year, d.month
    else:
        y, m = d.year, d.month
    q = (m - 1) // 3 + 1
    return (y, q)


@router.get("/pipeline/analytics", response_model=PipelineAnalyticsResponse)
async def get_pipeline_analytics(
    years_back: int = Query(default=2, ge=0, le=5, description="Years to look back from current"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)

    today = date.today()
    inq_result = await db.execute(
        select(Inquiry.id, Inquiry.created_at).where(Inquiry.tenant_id == tenant.id)
    )
    inquiries = [(r[0], r[1]) for r in inq_result.all() if r[1]]

    qt_result = await db.execute(
        select(Quotation.id, Quotation.inquiry_id, Quotation.status, Quotation.created_at).where(
            Quotation.tenant_id == tenant.id
        )
    )
    quotations = qt_result.all()

    ord_result = await db.execute(
        select(Order.id, Order.quotation_id, Order.status, Order.delivery_date, Order.order_date, Order.quantity).where(
            Order.tenant_id == tenant.id
        )
    )
    orders = list(ord_result.all())

    quotation_ids_with_order = {o[1] for o in orders if o[1] is not None}
    inquiry_ids_converted: set[int] = set()
    for q in quotations:
        if q[0] in quotation_ids_with_order and q[1] is not None:
            inquiry_ids_converted.add(q[1])

    converted_quotation_ids = {o[1] for o in orders if o[1] is not None}

    month_inq = defaultdict(int)
    month_ord_count = defaultdict(int)
    month_ord_qty = defaultdict(int)
    month_inq_under = defaultdict(int)
    month_potential = defaultdict(int)

    for inq_id, created in inquiries:
        if not created:
            continue
        y, m = created.year, created.month
        month_inq[(y, m)] += 1
        if inq_id not in inquiry_ids_converted:
            month_inq_under[(y, m)] += 1

    for o in orders:
        status_val = (o[2] or "").upper()
        if status_val == "DRAFT":
            continue
        deliv = o[3] or o[4]
        if not deliv:
            continue
        y, m = _month_key(deliv)
        month_ord_count[(y, m)] += 1
        month_ord_qty[(y, m)] += (o[5] or 0)

    for q in quotations:
        if q[2] in ("SENT", "APPROVED") and q[0] not in converted_quotation_ids:
            if q[3]:
                y, m = q[3].year, q[3].month
                month_potential[(y, m)] += 1

    quarter_inq = defaultdict(int)
    quarter_ord_count = defaultdict(int)
    quarter_ord_qty = defaultdict(int)
    quarter_inq_under = defaultdict(int)
    quarter_potential = defaultdict(int)

    for inq_id, created in inquiries:
        if not created:
            continue
        y, q = _quarter_key(created)
        quarter_inq[(y, q)] += 1
        if inq_id not in inquiry_ids_converted:
            quarter_inq_under[(y, q)] += 1

    for o in orders:
        status_val = (o[2] or "").upper()
        if status_val == "DRAFT":
            continue
        deliv = o[3] or o[4]
        if not deliv:
            continue
        y, q = _quarter_key(deliv)
        quarter_ord_count[(y, q)] += 1
        quarter_ord_qty[(y, q)] += (o[5] or 0)

    for q in quotations:
        if q[2] in ("SENT", "APPROVED") and q[0] not in converted_quotation_ids:
            if q[3]:
                y, qq = _quarter_key(q[3])
                quarter_potential[(y, qq)] += 1

    month_names = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()

    all_month_keys = set(month_inq.keys()) | set(month_ord_count.keys()) | set(month_inq_under.keys()) | set(month_potential.keys())
    start_year = today.year - years_back
    end_month_linear = today.year * 12 + today.month + 6
    by_month_out: list[PipelineAnalyticsBucket] = []
    for y in range(start_year, today.year + 2):
        for m in range(1, 13):
            if y * 12 + m < (today.year - years_back) * 12 + 1:
                continue
            if y * 12 + m > end_month_linear:
                continue
            if (y, m) > (today.year, today.month) and (y, m) not in all_month_keys:
                continue
            period_key = f"{y}-{m:02d}"
            period_label = f"{month_names[m - 1]} {y}"
            by_month_out.append(
                PipelineAnalyticsBucket(
                    period_key=period_key,
                    period_label=period_label,
                    year=y,
                    month=m,
                    quarter=None,
                    inquiries_received=month_inq.get((y, m), 0),
                    confirmed_orders_count=month_ord_count.get((y, m), 0),
                    confirmed_orders_quantity=month_ord_qty.get((y, m), 0),
                    inquiry_under_processing=month_inq_under.get((y, m), 0),
                    potential_orders_count=month_potential.get((y, m), 0),
                )
            )
    by_month_out.sort(key=lambda x: (x.year, x.month or 0))
    cutoff = today - timedelta(days=365 * years_back)
    by_month_out = [b for b in by_month_out if (b.year, b.month or 0) >= (cutoff.year, cutoff.month) or any([
        month_inq.get((b.year, b.month or 0), 0) > 0,
        month_ord_count.get((b.year, b.month or 0), 0) > 0,
        month_inq_under.get((b.year, b.month or 0), 0) > 0,
        month_potential.get((b.year, b.month or 0), 0) > 0,
    ])]

    all_quarter_keys = set(quarter_inq.keys()) | set(quarter_ord_count.keys()) | set(quarter_inq_under.keys()) | set(quarter_potential.keys())
    by_quarter_out: list[PipelineAnalyticsBucket] = []
    for y in range(start_year, today.year + 2):
        for q in range(1, 5):
            if (y, q) not in all_quarter_keys and (y, q) > (today.year, (today.month - 1) // 3 + 1):
                continue
            period_key = f"{y}-Q{q}"
            period_label = f"Q{q} {y}"
            by_quarter_out.append(
                PipelineAnalyticsBucket(
                    period_key=period_key,
                    period_label=period_label,
                    year=y,
                    month=None,
                    quarter=q,
                    inquiries_received=quarter_inq.get((y, q), 0),
                    confirmed_orders_count=quarter_ord_count.get((y, q), 0),
                    confirmed_orders_quantity=quarter_ord_qty.get((y, q), 0),
                    inquiry_under_processing=quarter_inq_under.get((y, q), 0),
                    potential_orders_count=quarter_potential.get((y, q), 0),
                )
            )
    by_quarter_out.sort(key=lambda x: (x.year, x.quarter or 0))

    total_inq = sum(month_inq.values())
    total_ord_count = sum(month_ord_count.values())
    total_ord_qty = sum(month_ord_qty.values())
    total_under = len([i for i in inquiries if i[0] not in inquiry_ids_converted])
    total_potential = len([q for q in quotations if q[2] in ("SENT", "APPROVED") and q[0] not in converted_quotation_ids])

    return PipelineAnalyticsResponse(
        by_month=by_month_out,
        by_quarter=by_quarter_out,
        summary={
            "inquiries_received_total": total_inq,
            "confirmed_orders_total": total_ord_count,
            "confirmed_orders_quantity_total": total_ord_qty,
            "inquiry_under_processing_total": total_under,
            "potential_orders_total": total_potential,
        },
    )
