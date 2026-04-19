"""Garment styles: CRUD, components, colorways, size scales, summary, timeline, reports."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from starlette.responses import Response
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, field_validator
from sqlalchemy import false, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.money import format_money, parse_money
from app.common.codegen import next_tenant_code
from app.common.pagination import MAX_PAGE_SIZE
from app.common.storage import FileStorageService
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import (
    FxReceipt,
    GarmentStyle,
    Inquiry,
    Order,
    OrderFollowupAction,
    ProformaInvoice,
    ProformaInvoiceOrder,
    Quotation,
    Shipment,
    StyleColorway,
    StyleComponent,
    StyleSizeScale,
    Tenant,
    TradeCase,
    User,
)
from app.modules.audit.service import log_action
from app.modules.merch import constants as merch_c
from app.modules.merch.deps import (
    ensure_tenant,
    normalize_optional_choice,
    normalize_style_stage,
    to_decimal,
    to_float_safe,
)
from app.modules.merch.permissions import MERCH_PERMISSION_STYLE_MANAGE, require_merch_permission

router = APIRouter(tags=["merch"])

STYLE_LIFECYCLE_STAGES = merch_c.STYLE_LIFECYCLE_STAGES
STYLE_PRIORITY_VALUES = merch_c.STYLE_PRIORITY_VALUES
STYLE_RISK_VALUES = merch_c.STYLE_RISK_VALUES

_ensure_tenant = ensure_tenant
_to_decimal = to_decimal
_normalize_style_stage = normalize_style_stage
_normalize_optional_choice = normalize_optional_choice
_to_float_safe = to_float_safe


class StyleCreate(BaseModel):
    style_code: str | None = None
    name: str
    buyer_customer_id: int | None = None
    season: str | None = None
    department: str | None = None
    product_type: str | None = None
    fabric_type: str | None = None
    gsm: str | None = None
    fit_type: str | None = None
    wash_type: str | None = None
    brand: str | None = None
    buyer_style_ref: str | None = None
    hs_code: str | None = None
    uom: str | None = None
    target_fob: str | None = None
    currency: str | None = None
    sample_lead_days: int | None = None
    production_lead_days: int | None = None
    is_active_for_new_orders: bool = True
    lifecycle_stage: str = "INQUIRY"
    priority: str | None = None
    risk_level: str | None = None
    style_image_url: str | None = None
    status: str = "ACTIVE"
    notes: str | None = None


class StyleUpdate(BaseModel):
    style_code: str | None = None
    name: str | None = None
    buyer_customer_id: int | None = None
    season: str | None = None
    department: str | None = None
    product_type: str | None = None
    fabric_type: str | None = None
    gsm: str | None = None
    fit_type: str | None = None
    wash_type: str | None = None
    brand: str | None = None
    buyer_style_ref: str | None = None
    hs_code: str | None = None
    uom: str | None = None
    target_fob: str | None = None
    currency: str | None = None
    sample_lead_days: int | None = None
    production_lead_days: int | None = None
    is_active_for_new_orders: bool | None = None
    lifecycle_stage: str | None = None
    priority: str | None = None
    risk_level: str | None = None
    style_image_url: str | None = None
    status: str | None = None
    notes: str | None = None


def _style_target_fob_api_str(v: Any) -> str | None:
    if v is None:
        return None
    if isinstance(v, Decimal):
        return format_money(v)
    s = str(v).strip()
    return s if s else None


class GarmentStyleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    style_code: str
    name: str
    buyer_customer_id: int | None = None
    season: str | None = None
    department: str | None = None
    product_type: str | None = None
    fabric_type: str | None = None
    gsm: str | None = None
    fit_type: str | None = None
    wash_type: str | None = None
    brand: str | None = None
    buyer_style_ref: str | None = None
    hs_code: str | None = None
    uom: str | None = None
    target_fob: Annotated[str | None, BeforeValidator(_style_target_fob_api_str)] = None
    currency: str | None = None
    sample_lead_days: int | None = None
    production_lead_days: int | None = None
    is_active_for_new_orders: bool
    lifecycle_stage: str
    priority: str | None = None
    risk_level: str | None = None
    style_image_url: str | None = None
    status: str
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class StyleImageUploadResponse(BaseModel):
    style_image_url: str
    filename: str
    size_bytes: int


class StyleComponentBody(BaseModel):
    component_name: str
    sequence_no: int = 1
    notes: str | None = None


class StyleColorwayBody(BaseModel):
    color_name: str
    color_code: str | None = None
    notes: str | None = None


class StyleSizeScaleBody(BaseModel):
    scale_name: str
    sizes_csv: str | None = None
    notes: str | None = None


class BomCreate(BaseModel):
    style_id: int
    version_no: int = 1
    status: str = "DRAFT"
    notes: str | None = None


class BomUpdate(BaseModel):
    version_no: int | None = None
    status: str | None = None
    notes: str | None = None


class BomItemBody(BaseModel):
    item_id: int | None = None
    category: str
    item_code: str | None = None
    description: str | None = None
    uom: str | None = None
    base_consumption: str
    wastage_pct: str | None = None


class ConsumptionPlanCreate(BaseModel):
    order_id: int
    status: str = "PLANNED"


class ConsumptionPlanUpdate(BaseModel):
    status: str | None = None


class ConsumptionPlanItemBody(BaseModel):
    item_code: str | None = None
    required_qty: str
    uom: str | None = None


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


class StyleSummaryResponse(BaseModel):
    style_id: int
    inquiry_count: int
    quotation_count: int
    order_count: int
    open_followup_actions: int
    overdue_followup_actions: int
    shipment_count: int
    shipped_order_qty: int
    pending_order_qty: int
    invoice_amount: str
    received_amount: str
    due_amount: str
    last_event_at: datetime | None = None
    next_due_at: date | None = None


class StyleTimelineEvent(BaseModel):
    event_type: str
    reference: str
    status: str | None = None
    event_at: datetime
    notes: str | None = None


class StyleReportRow(BaseModel):
    style_id: int
    style_code: str
    style_name: str
    lifecycle_stage: str
    priority: str | None = None
    risk_level: str | None = None
    open_followup_actions: int
    overdue_followup_actions: int
    invoice_amount: str
    received_amount: str
    due_amount: str
    last_event_at: datetime | None = None
    next_due_at: date | None = None


async def _resolve_style_order_ids(db: AsyncSession, tenant_id: int, style: GarmentStyle) -> list[int]:
    quotation_ids = (
        await db.execute(
            select(Quotation.id).where(
                Quotation.tenant_id == tenant_id,
                Quotation.style_id == style.id,
            )
        )
    ).scalars().all()
    style_code_lower = style.style_code.lower()
    style_name_lower = style.name.lower()
    order_ids = (
        await db.execute(
            select(Order.id)
            .where(Order.tenant_id == tenant_id)
            .where(
                or_(
                    Order.quotation_id.in_(quotation_ids) if quotation_ids else false(),
                    func.lower(func.coalesce(Order.style_ref, "")) == style_code_lower,
                    func.lower(func.coalesce(Order.style_ref, "")) == style_name_lower,
                )
            )
        )
    ).scalars().all()
    return list({oid for oid in order_ids})


async def _resolve_style_order_ids_batch(
    db: AsyncSession, tenant_id: int, styles: list[GarmentStyle]
) -> dict[int, list[int]]:
    """Resolve order ids for many styles with one quotations query and one orders query (avoids N+1)."""
    if not styles:
        return {}
    style_ids = [s.id for s in styles]
    qres = await db.execute(
        select(Quotation.id, Quotation.style_id).where(
            Quotation.tenant_id == tenant_id,
            Quotation.style_id.in_(style_ids),
        )
    )
    quot_by_style: dict[int, list[int]] = defaultdict(list)
    all_qids: list[int] = []
    for qid, sid in qres.all():
        quot_by_style[sid].append(qid)
        all_qids.append(qid)
    ref_set: set[str] = set()
    for s in styles:
        ref_set.add((s.style_code or "").lower())
        ref_set.add((s.name or "").lower())
    conditions = []
    if all_qids:
        conditions.append(Order.quotation_id.in_(all_qids))
    conditions.append(func.lower(func.coalesce(Order.style_ref, "")).in_(list(ref_set)))
    ores = await db.execute(select(Order).where(Order.tenant_id == tenant_id, or_(*conditions)))
    orders = list(ores.scalars().all())
    out: dict[int, list[int]] = {}
    for s in styles:
        qids = set(quot_by_style.get(s.id, []))
        cl = (s.style_code or "").lower()
        nl = (s.name or "").lower()
        seen: set[int] = set()
        oid_list: list[int] = []
        for o in orders:
            if o.quotation_id in qids or (o.style_ref or "").lower() == cl or (o.style_ref or "").lower() == nl:
                if o.id not in seen:
                    seen.add(o.id)
                    oid_list.append(o.id)
        out[s.id] = oid_list
    return out


async def _build_style_summary(
    db: AsyncSession,
    tenant_id: int,
    style: GarmentStyle,
    *,
    inquiry_count: int | None = None,
    quotation_count: int | None = None,
    order_ids: list[int] | None = None,
) -> StyleSummaryResponse:
    if inquiry_count is None:
        inquiry_count = int(
            (
                await db.execute(
                    select(func.count(Inquiry.id)).where(Inquiry.tenant_id == tenant_id, Inquiry.style_id == style.id)
                )
            ).scalar_one()
        )
    if quotation_count is None:
        quotation_count = int(
            (
                await db.execute(
                    select(func.count(Quotation.id)).where(Quotation.tenant_id == tenant_id, Quotation.style_id == style.id)
                )
            ).scalar_one()
        )
    if order_ids is None:
        order_ids = await _resolve_style_order_ids(db, tenant_id, style)
    order_count = len(order_ids)
    open_followup_actions = 0
    overdue_followup_actions = 0
    shipment_count = 0
    shipped_order_qty = 0
    pending_order_qty = 0
    invoice_amount = Decimal("0")
    received_amount = Decimal("0")
    last_event_at: datetime | None = style.updated_at
    next_due_at: date | None = None

    if order_ids:
        actions = (
            await db.execute(
                select(OrderFollowupAction).where(
                    OrderFollowupAction.tenant_id == tenant_id,
                    OrderFollowupAction.order_id.in_(order_ids),
                    OrderFollowupAction.is_active.is_(True),
                )
            )
        ).scalars().all()
        today = date.today()
        for action in actions:
            status_text = (action.status or "").strip().lower()
            if status_text not in {"done", "completed", "closed"}:
                open_followup_actions += 1
            if action.planned_date and action.planned_date < today and status_text not in {"done", "completed", "closed"}:
                overdue_followup_actions += 1
            if action.planned_date and (next_due_at is None or action.planned_date < next_due_at):
                next_due_at = action.planned_date
            if action.updated_at and (last_event_at is None or action.updated_at > last_event_at):
                last_event_at = action.updated_at

        orders = (await db.execute(select(Order).where(Order.id.in_(order_ids)))).scalars().all()
        trade_cases = (
            await db.execute(select(TradeCase).where(TradeCase.tenant_id == tenant_id, TradeCase.order_id.in_(order_ids)))
        ).scalars().all()
        trade_case_by_order = {tc.order_id: tc for tc in trade_cases if tc.order_id is not None}
        trade_case_ids = [tc.id for tc in trade_cases]
        shipments: list[Shipment] = []
        if trade_case_ids:
            shipments = (
                await db.execute(
                    select(Shipment).where(Shipment.tenant_id == tenant_id, Shipment.trade_case_id.in_(trade_case_ids))
                )
            ).scalars().all()
        shipped_trade_case_ids = {s.trade_case_id for s in shipments if (s.status or "").upper() in {"SHIPPED", "DELIVERED", "CLOSED"}}
        shipment_count = len(shipments)
        for order in orders:
            qty = order.quantity or 0
            trade_case = trade_case_by_order.get(order.id)
            if trade_case and trade_case.id in shipped_trade_case_ids:
                shipped_order_qty += qty
            else:
                pending_order_qty += qty
            if order.updated_at and (last_event_at is None or order.updated_at > last_event_at):
                last_event_at = order.updated_at

        invoice_rows = (
            await db.execute(
                select(ProformaInvoice)
                .join(ProformaInvoiceOrder, ProformaInvoiceOrder.proforma_invoice_id == ProformaInvoice.id)
                .where(
                    ProformaInvoice.tenant_id == tenant_id,
                    ProformaInvoiceOrder.order_id.in_(order_ids),
                )
            )
        ).scalars().all()
        invoice_refs = {inv.reference for inv in invoice_rows if inv.reference}
        for invoice in invoice_rows:
            invoice_amount += _to_decimal(invoice.amount)
            if invoice.updated_at and (last_event_at is None or invoice.updated_at > last_event_at):
                last_event_at = invoice.updated_at

        if invoice_refs:
            receipts = (
                await db.execute(
                    select(FxReceipt).where(
                        FxReceipt.tenant_id == tenant_id,
                        FxReceipt.source_ref.in_(list(invoice_refs)),
                    )
                )
            ).scalars().all()
            for receipt in receipts:
                received_amount += _to_decimal(receipt.base_amount)
                if receipt.created_at and (last_event_at is None or receipt.created_at > last_event_at):
                    last_event_at = receipt.created_at

    due_amount = invoice_amount - received_amount
    if due_amount < Decimal("0"):
        due_amount = Decimal("0")
    return StyleSummaryResponse(
        style_id=style.id,
        inquiry_count=inquiry_count,
        quotation_count=quotation_count,
        order_count=order_count,
        open_followup_actions=open_followup_actions,
        overdue_followup_actions=overdue_followup_actions,
        shipment_count=shipment_count,
        shipped_order_qty=shipped_order_qty,
        pending_order_qty=pending_order_qty,
        invoice_amount=str(invoice_amount.quantize(Decimal("0.01"))),
        received_amount=str(received_amount.quantize(Decimal("0.01"))),
        due_amount=str(due_amount.quantize(Decimal("0.01"))),
        last_event_at=last_event_at,
        next_due_at=next_due_at,
    )


def _garment_style_list_base_stmt(
    tenant_id: int,
    *,
    search: str | None = None,
    status_filter: str | None = None,
    buyer_customer_id: int | None = None,
    season: str | None = None,
    department: str | None = None,
    lifecycle_stage: str | None = None,
    active_for_orders: bool | None = None,
    priority: str | None = None,
    risk_level: str | None = None,
    style_ids: list[int] | None = None,
):
    """Shared SQL filters for garment style list and summary-report (parity with GET /styles)."""
    stmt = select(GarmentStyle).where(GarmentStyle.tenant_id == tenant_id)
    if style_ids:
        stmt = stmt.where(GarmentStyle.id.in_(style_ids))
    if search:
        pattern = f"%{search.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(GarmentStyle.style_code).like(pattern),
                func.lower(GarmentStyle.name).like(pattern),
                func.lower(func.coalesce(GarmentStyle.buyer_style_ref, "")).like(pattern),
                func.lower(func.coalesce(GarmentStyle.product_type, "")).like(pattern),
            )
        )
    if status_filter:
        stmt = stmt.where(GarmentStyle.status == status_filter)
    if buyer_customer_id is not None:
        stmt = stmt.where(GarmentStyle.buyer_customer_id == buyer_customer_id)
    if season:
        stmt = stmt.where(func.lower(func.coalesce(GarmentStyle.season, "")) == season.strip().lower())
    if department:
        stmt = stmt.where(func.lower(func.coalesce(GarmentStyle.department, "")) == department.strip().lower())
    if lifecycle_stage:
        stmt = stmt.where(GarmentStyle.lifecycle_stage == _normalize_style_stage(lifecycle_stage))
    if active_for_orders is not None:
        stmt = stmt.where(GarmentStyle.is_active_for_new_orders == active_for_orders)
    normalized_priority = _normalize_optional_choice(priority, STYLE_PRIORITY_VALUES, "priority")
    if normalized_priority:
        stmt = stmt.where(GarmentStyle.priority == normalized_priority)
    normalized_risk = _normalize_optional_choice(risk_level, STYLE_RISK_VALUES, "risk_level")
    if normalized_risk:
        stmt = stmt.where(GarmentStyle.risk_level == normalized_risk)
    return stmt


async def _style_report_rows_for_styles(
    db: AsyncSession,
    tenant_id: int,
    styles: list[GarmentStyle],
    *,
    critical_only: bool,
    normalized_saved_view: str,
) -> list[StyleReportRow]:
    rows: list[StyleReportRow] = []
    if not styles:
        return rows
    sid_list = [s.id for s in styles]
    inquiry_counts: dict[int, int] = {}
    quotation_counts: dict[int, int] = {}
    for sid, cnt in (
        await db.execute(
            select(Inquiry.style_id, func.count(Inquiry.id))
            .where(Inquiry.tenant_id == tenant_id, Inquiry.style_id.in_(sid_list))
            .group_by(Inquiry.style_id)
        )
    ).all():
        inquiry_counts[int(sid)] = int(cnt)
    for sid, cnt in (
        await db.execute(
            select(Quotation.style_id, func.count(Quotation.id))
            .where(Quotation.tenant_id == tenant_id, Quotation.style_id.in_(sid_list))
            .group_by(Quotation.style_id)
        )
    ).all():
        quotation_counts[int(sid)] = int(cnt)
    order_ids_by_style = await _resolve_style_order_ids_batch(db, tenant_id, styles)
    for style in styles:
        summary = await _build_style_summary(
            db,
            tenant_id,
            style,
            inquiry_count=inquiry_counts.get(style.id, 0),
            quotation_count=quotation_counts.get(style.id, 0),
            order_ids=order_ids_by_style.get(style.id, []),
        )
        is_payment_overdue = _to_decimal(summary.due_amount) > Decimal("0")
        has_overdue_milestone = summary.overdue_followup_actions > 0
        if critical_only and not (has_overdue_milestone or is_payment_overdue):
            continue
        if normalized_saved_view == "critical_styles" and not (has_overdue_milestone or is_payment_overdue):
            continue
        if normalized_saved_view == "shipment_due_week":
            if summary.next_due_at is None:
                continue
            days_to_due = (summary.next_due_at - date.today()).days
            if days_to_due < 0 or days_to_due > 7:
                continue
        if normalized_saved_view == "payment_overdue" and not is_payment_overdue:
            continue
        rows.append(
            StyleReportRow(
                style_id=style.id,
                style_code=style.style_code,
                style_name=style.name,
                lifecycle_stage=style.lifecycle_stage,
                priority=style.priority,
                risk_level=style.risk_level,
                open_followup_actions=summary.open_followup_actions,
                overdue_followup_actions=summary.overdue_followup_actions,
                invoice_amount=summary.invoice_amount,
                received_amount=summary.received_amount,
                due_amount=summary.due_amount,
                last_event_at=summary.last_event_at,
                next_due_at=summary.next_due_at,
            )
        )
    return rows


@router.get("/styles", response_model=list[GarmentStyleOut])
async def list_styles(
    response: Response,
    search: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    buyer_customer_id: int | None = Query(default=None),
    season: str | None = Query(default=None),
    department: str | None = Query(default=None),
    lifecycle_stage: str | None = Query(default=None),
    active_for_orders: bool | None = Query(default=None),
    priority: str | None = Query(default=None),
    risk_level: str | None = Query(default=None),
    style_ids: list[int] | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = _garment_style_list_base_stmt(
        tenant.id,
        search=search,
        status_filter=status_filter,
        buyer_customer_id=buyer_customer_id,
        season=season,
        department=department,
        lifecycle_stage=lifecycle_stage,
        active_for_orders=active_for_orders,
        priority=priority,
        risk_level=risk_level,
        style_ids=style_ids,
    )
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = int((await db.execute(count_stmt)).scalar() or 0)
    if style_ids:
        order_expr = case(
            *[(GarmentStyle.id == sid, pos) for pos, sid in enumerate(style_ids)],
            else_=len(style_ids),
        )
        stmt_ordered = stmt.order_by(order_expr.asc())
    else:
        stmt_ordered = stmt.order_by(GarmentStyle.updated_at.desc(), GarmentStyle.id.desc())
    result = await db.execute(stmt_ordered.offset(offset).limit(limit))
    rows = result.scalars().all()
    response.headers["X-Total-Count"] = str(total)
    return [GarmentStyleOut.model_validate(r) for r in rows]


@router.post("/styles", status_code=201, response_model=GarmentStyleOut)
async def create_style(
    body: StyleCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_merch_permission(MERCH_PERMISSION_STYLE_MANAGE)),
):
    _ensure_tenant(user, tenant)
    if body.buyer_customer_id is not None:
        bc = await db.get(Customer, body.buyer_customer_id)
        if not bc or bc.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Buyer customer not found")
    style_code = (body.style_code or "").strip().upper()
    if not style_code:
        style_code = await next_tenant_code(
            db,
            model=GarmentStyle,
            tenant_id=tenant.id,
            prefix="STY-",
            width=4,
        )
    existing = await db.execute(
        select(GarmentStyle.id).where(
            GarmentStyle.tenant_id == tenant.id,
            GarmentStyle.style_code == style_code,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Style code already exists for this tenant")

    lifecycle_stage = _normalize_style_stage(body.lifecycle_stage)
    normalized_priority = _normalize_optional_choice(body.priority, STYLE_PRIORITY_VALUES, "priority")
    normalized_risk = _normalize_optional_choice(body.risk_level, STYLE_RISK_VALUES, "risk_level")
    row = GarmentStyle(
        tenant_id=tenant.id,
        style_code=style_code,
        name=body.name,
        buyer_customer_id=body.buyer_customer_id,
        season=body.season,
        department=body.department,
        product_type=body.product_type,
        fabric_type=body.fabric_type,
        gsm=body.gsm,
        fit_type=body.fit_type,
        wash_type=body.wash_type,
        brand=body.brand,
        buyer_style_ref=body.buyer_style_ref,
        hs_code=body.hs_code,
        uom=body.uom,
        target_fob=parse_money(body.target_fob),
        currency=body.currency,
        sample_lead_days=body.sample_lead_days,
        production_lead_days=body.production_lead_days,
        is_active_for_new_orders=body.is_active_for_new_orders,
        lifecycle_stage=lifecycle_stage,
        priority=normalized_priority,
        risk_level=normalized_risk,
        style_image_url=body.style_image_url,
        status=body.status,
        notes=body.notes,
    )
    db.add(row)
    await db.flush()
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="STYLE_CREATED",
        resource="garment_style",
        details=f"style_id={row.id}, style_code={row.style_code}",
    )
    await db.refresh(row)
    return GarmentStyleOut.model_validate(row)


@router.get("/styles/summary-report", response_model=list[StyleReportRow])
async def list_style_summary_report(
    response: Response,
    search: str | None = Query(default=None),
    lifecycle_stage: str | None = Query(default=None),
    critical_only: bool = Query(default=False),
    saved_view: str | None = Query(default=None),
    style_ids: list[int] | None = Query(default=None),
    report_limit: int | None = Query(default=None, ge=1, le=MAX_PAGE_SIZE),
    report_offset: int = Query(default=0, ge=0),
    status_filter: str | None = Query(default=None, alias="status"),
    buyer_customer_id: int | None = Query(default=None),
    season: str | None = Query(default=None),
    department: str | None = Query(default=None),
    active_for_orders: bool | None = Query(default=None),
    priority: str | None = Query(default=None),
    risk_level: str | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = _garment_style_list_base_stmt(
        tenant.id,
        search=search,
        status_filter=status_filter,
        buyer_customer_id=buyer_customer_id,
        season=season,
        department=department,
        lifecycle_stage=lifecycle_stage,
        active_for_orders=active_for_orders,
        priority=priority,
        risk_level=risk_level,
        style_ids=style_ids,
    )
    normalized_saved_view = (saved_view or "").strip().lower()
    needs_post_summary_filter = (
        critical_only
        or normalized_saved_view == "critical_styles"
        or normalized_saved_view == "shipment_due_week"
        or normalized_saved_view == "payment_overdue"
    )

    def _ordered_stmt(base):
        if style_ids:
            order_expr = case(
                *[(GarmentStyle.id == sid, pos) for pos, sid in enumerate(style_ids)],
                else_=len(style_ids),
            )
            return base.order_by(order_expr.asc())
        return base.order_by(GarmentStyle.updated_at.desc(), GarmentStyle.id.desc())

    # Fast path: SQL-level paging; summaries only for the current page (no critical/saved-view filters).
    if not needs_post_summary_filter and report_limit is not None:
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = int((await db.execute(count_stmt)).scalar() or 0)
        result = await db.execute(_ordered_stmt(stmt).offset(report_offset).limit(report_limit))
        page_styles = list(result.scalars().all())
        rows = await _style_report_rows_for_styles(
            db,
            tenant.id,
            page_styles,
            critical_only=False,
            normalized_saved_view="",
        )
        response.headers["X-Total-Count"] = str(total)
        return rows

    # Complex path: filter after building summaries; optional slice at end.
    styles = list((await db.execute(_ordered_stmt(stmt))).scalars().all())
    rows = await _style_report_rows_for_styles(
        db,
        tenant.id,
        styles,
        critical_only=critical_only,
        normalized_saved_view=normalized_saved_view,
    )
    total_count = len(rows)
    if report_limit is not None:
        rows = rows[report_offset : report_offset + report_limit]
    response.headers["X-Total-Count"] = str(total_count)
    return rows


@router.get("/styles/{style_id}", response_model=GarmentStyleOut)
async def get_style(
    style_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(GarmentStyle, style_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Style not found")
    return GarmentStyleOut.model_validate(row)


@router.patch("/styles/{style_id}", response_model=GarmentStyleOut)
async def update_style(
    style_id: int,
    body: StyleUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(GarmentStyle, style_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Style not found")
    changes: list[str] = []
    if body.style_code is not None:
        new_code = body.style_code.strip().upper()
        if not new_code:
            raise HTTPException(status_code=422, detail="style_code cannot be empty")
        existing = await db.execute(
            select(GarmentStyle.id).where(
                GarmentStyle.tenant_id == tenant.id,
                GarmentStyle.style_code == new_code,
                GarmentStyle.id != style_id,
            )
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(status_code=409, detail="Style code already exists for this tenant")
        if row.style_code != new_code:
            row.style_code = new_code
            changes.append("style_code")

    if body.lifecycle_stage is not None:
        new_stage = _normalize_style_stage(body.lifecycle_stage)
        if row.lifecycle_stage != new_stage:
            row.lifecycle_stage = new_stage
            changes.append("lifecycle_stage")

    if body.priority is not None:
        normalized_priority = _normalize_optional_choice(body.priority, STYLE_PRIORITY_VALUES, "priority")
        if row.priority != normalized_priority:
            row.priority = normalized_priority
            changes.append("priority")

    if body.risk_level is not None:
        normalized_risk = _normalize_optional_choice(body.risk_level, STYLE_RISK_VALUES, "risk_level")
        if row.risk_level != normalized_risk:
            row.risk_level = normalized_risk
            changes.append("risk_level")

    if body.target_fob is not None:
        new_fob = parse_money(body.target_fob)
        if row.target_fob != new_fob:
            changes.append("target_fob")
        row.target_fob = new_fob

    for field in (
        "name",
        "buyer_customer_id",
        "season",
        "department",
        "product_type",
        "fabric_type",
        "gsm",
        "fit_type",
        "wash_type",
        "brand",
        "buyer_style_ref",
        "hs_code",
        "uom",
        "currency",
        "sample_lead_days",
        "production_lead_days",
        "is_active_for_new_orders",
        "style_image_url",
        "status",
        "notes",
    ):
        value = getattr(body, field)
        if value is not None:
            if getattr(row, field) != value:
                changes.append(field)
            setattr(row, field, value)
    await db.flush()
    if changes:
        sensitive_fields = {"status", "lifecycle_stage", "target_fob", "currency", "risk_level", "priority"}
        touched_sensitive = sorted(set(changes).intersection(sensitive_fields))
        await log_action(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            action="STYLE_UPDATED",
            resource="garment_style",
            details=f"style_id={row.id}, changed={','.join(sorted(set(changes)))}, sensitive={','.join(touched_sensitive) if touched_sensitive else 'none'}",
        )
    await db.refresh(row)
    return GarmentStyleOut.model_validate(row)


@router.post(
    "/styles/{style_id}/upload-picture",
    response_model=StyleImageUploadResponse,
)
async def upload_style_picture(
    style_id: int,
    *,
    file: UploadFile = File(...),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    style = await db.get(GarmentStyle, style_id)
    if not style or style.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Style not found")

    safe_filename, api_url, disk_path = await FileStorageService.save_file(file, tenant.id, "style_pictures")
    style.style_image_url = api_url
    await db.flush()

    size_bytes = Path(disk_path).stat().st_size if Path(disk_path).exists() else 0

    return StyleImageUploadResponse(
        style_image_url=style.style_image_url,
        filename=safe_filename,
        size_bytes=size_bytes,
    )


@router.delete("/styles/{style_id}", status_code=204)
async def delete_style(
    style_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(GarmentStyle, style_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Style not found")
    inquiry_link_count = (
        await db.execute(select(func.count(Inquiry.id)).where(Inquiry.tenant_id == tenant.id, Inquiry.style_id == style_id))
    ).scalar_one()
    quotation_link_count = (
        await db.execute(select(func.count(Quotation.id)).where(Quotation.tenant_id == tenant.id, Quotation.style_id == style_id))
    ).scalar_one()
    order_link_count = (
        await db.execute(
            select(func.count(Order.id))
            .select_from(Order)
            .join(Quotation, Quotation.id == Order.quotation_id, isouter=True)
            .where(
                Order.tenant_id == tenant.id,
                or_(
                    Quotation.style_id == style_id,
                    func.lower(func.coalesce(Order.style_ref, "")) == func.lower(row.style_code),
                ),
            )
        )
    ).scalar_one()
    if inquiry_link_count or quotation_link_count or order_link_count:
        raise HTTPException(
            status_code=409,
            detail="Style is linked with inquiry/quotation/order records. Archive the style instead of deleting.",
        )
    await db.delete(row)
    await db.flush()
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="STYLE_DELETED",
        resource="garment_style",
        details=f"style_id={style_id}, style_code={row.style_code}",
    )


@router.get("/styles/{style_id}/summary", response_model=StyleSummaryResponse)
async def get_style_summary(
    style_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(GarmentStyle, style_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Style not found")
    return await _build_style_summary(db, tenant.id, row)


@router.get("/styles/{style_id}/timeline", response_model=list[StyleTimelineEvent])
async def list_style_timeline(
    style_id: int,
    limit: int = Query(default=100, ge=1, le=500),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    style = await db.get(GarmentStyle, style_id)
    if not style or style.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Style not found")

    events: list[StyleTimelineEvent] = []
    inquiries = (
        await db.execute(select(Inquiry).where(Inquiry.tenant_id == tenant.id, Inquiry.style_id == style_id))
    ).scalars().all()
    for inq in inquiries:
        events.append(
            StyleTimelineEvent(
                event_type="INQUIRY",
                reference=inq.inquiry_code,
                status=inq.status,
                event_at=inq.updated_at,
                notes=inq.notes,
            )
        )
    quotations = (
        await db.execute(select(Quotation).where(Quotation.tenant_id == tenant.id, Quotation.style_id == style_id))
    ).scalars().all()
    quotation_ids = [q.id for q in quotations]
    for q in quotations:
        events.append(
            StyleTimelineEvent(
                event_type="QUOTATION",
                reference=q.quotation_code,
                status=q.status,
                event_at=q.updated_at,
                notes=q.notes,
            )
        )

    order_stmt = select(Order).where(Order.tenant_id == tenant.id)
    if quotation_ids:
        order_stmt = order_stmt.where(
            or_(
                Order.quotation_id.in_(quotation_ids),
                func.lower(func.coalesce(Order.style_ref, "")) == style.style_code.lower(),
            )
        )
    else:
        order_stmt = order_stmt.where(
            func.lower(func.coalesce(Order.style_ref, "")) == style.style_code.lower(),
        )
    orders = (await db.execute(order_stmt)).scalars().all()
    order_ids = [o.id for o in orders]
    for order in orders:
        events.append(
            StyleTimelineEvent(
                event_type="ORDER",
                reference=order.order_code,
                status=order.status,
                event_at=order.updated_at,
                notes=order.remarks,
            )
        )

    if order_ids:
        actions = (
            await db.execute(
                select(OrderFollowupAction).where(
                    OrderFollowupAction.tenant_id == tenant.id,
                    OrderFollowupAction.order_id.in_(order_ids),
                )
            )
        ).scalars().all()
        for action in actions:
            events.append(
                StyleTimelineEvent(
                    event_type="FOLLOWUP",
                    reference=action.title,
                    status=action.status,
                    event_at=action.updated_at,
                    notes=action.remarks,
                )
            )

        shipments = (
            await db.execute(
                select(Shipment)
                .join(TradeCase, TradeCase.id == Shipment.trade_case_id)
                .where(Shipment.tenant_id == tenant.id, TradeCase.order_id.in_(order_ids))
            )
        ).scalars().all()
        for shipment in shipments:
            events.append(
                StyleTimelineEvent(
                    event_type="SHIPMENT",
                    reference=shipment.reference,
                    status=shipment.status,
                    event_at=shipment.updated_at,
                    notes=shipment.notes,
                )
            )

        invoices = (
            await db.execute(
                select(ProformaInvoice)
                .join(ProformaInvoiceOrder, ProformaInvoiceOrder.proforma_invoice_id == ProformaInvoice.id)
                .where(ProformaInvoice.tenant_id == tenant.id, ProformaInvoiceOrder.order_id.in_(order_ids))
            )
        ).scalars().all()
        invoice_refs = []
        for invoice in invoices:
            if invoice.reference:
                invoice_refs.append(invoice.reference)
            events.append(
                StyleTimelineEvent(
                    event_type="INVOICE",
                    reference=invoice.reference,
                    status=invoice.status,
                    event_at=invoice.updated_at,
                    notes=invoice.terms_of_payment,
                )
            )
        if invoice_refs:
            receipts = (
                await db.execute(
                    select(FxReceipt).where(
                        FxReceipt.tenant_id == tenant.id,
                        FxReceipt.source_ref.in_(invoice_refs),
                    )
                )
            ).scalars().all()
            for receipt in receipts:
                events.append(
                    StyleTimelineEvent(
                        event_type="PAYMENT_RECEIPT",
                        reference=receipt.receipt_no,
                        status=receipt.status,
                        event_at=receipt.created_at,
                        notes=receipt.source_ref,
                    )
                )

    events.sort(key=lambda item: item.event_at, reverse=True)
    return events[:limit]


@router.get("/styles/{style_id}/components")
async def list_style_components(
    style_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    result = await db.execute(
        select(StyleComponent)
        .where(StyleComponent.style_id == style_id, StyleComponent.tenant_id == tenant.id)
        .order_by(StyleComponent.sequence_no, StyleComponent.id)
    )
    return result.scalars().all()


@router.post("/styles/{style_id}/components", status_code=201)
async def create_style_component(
    style_id: int,
    body: StyleComponentBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = StyleComponent(tenant_id=tenant.id, style_id=style_id, **body.model_dump())
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


@router.patch("/styles/{style_id}/components/{component_id}")
async def update_style_component(
    style_id: int,
    component_id: int,
    body: StyleComponentBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(StyleComponent, component_id)
    if not row or row.tenant_id != tenant.id or row.style_id != style_id:
        raise HTTPException(status_code=404, detail="Component not found")
    row.component_name = body.component_name
    row.sequence_no = body.sequence_no
    row.notes = body.notes
    await db.flush()
    await db.refresh(row)
    return row


@router.delete("/styles/{style_id}/components/{component_id}", status_code=204)
async def delete_style_component(
    style_id: int,
    component_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(StyleComponent, component_id)
    if not row or row.tenant_id != tenant.id or row.style_id != style_id:
        raise HTTPException(status_code=404, detail="Component not found")
    await db.delete(row)
    await db.flush()


@router.get("/styles/{style_id}/colorways")
async def list_style_colorways(
    style_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    result = await db.execute(
        select(StyleColorway)
        .where(StyleColorway.style_id == style_id, StyleColorway.tenant_id == tenant.id)
        .order_by(StyleColorway.id)
    )
    return result.scalars().all()


@router.post("/styles/{style_id}/colorways", status_code=201)
async def create_style_colorway(
    style_id: int,
    body: StyleColorwayBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = StyleColorway(tenant_id=tenant.id, style_id=style_id, **body.model_dump())
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


@router.patch("/styles/{style_id}/colorways/{colorway_id}")
async def update_style_colorway(
    style_id: int,
    colorway_id: int,
    body: StyleColorwayBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(StyleColorway, colorway_id)
    if not row or row.tenant_id != tenant.id or row.style_id != style_id:
        raise HTTPException(status_code=404, detail="Colorway not found")
    row.color_name = body.color_name
    row.color_code = body.color_code
    row.notes = body.notes
    await db.flush()
    await db.refresh(row)
    return row


@router.delete("/styles/{style_id}/colorways/{colorway_id}", status_code=204)
async def delete_style_colorway(
    style_id: int,
    colorway_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(StyleColorway, colorway_id)
    if not row or row.tenant_id != tenant.id or row.style_id != style_id:
        raise HTTPException(status_code=404, detail="Colorway not found")
    await db.delete(row)
    await db.flush()


@router.get("/styles/{style_id}/size-scales")
async def list_style_size_scales(
    style_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    result = await db.execute(
        select(StyleSizeScale)
        .where(StyleSizeScale.style_id == style_id, StyleSizeScale.tenant_id == tenant.id)
        .order_by(StyleSizeScale.id)
    )
    return result.scalars().all()


@router.post("/styles/{style_id}/size-scales", status_code=201)
async def create_style_size_scale(
    style_id: int,
    body: StyleSizeScaleBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = StyleSizeScale(tenant_id=tenant.id, style_id=style_id, **body.model_dump())
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


@router.patch("/styles/{style_id}/size-scales/{scale_id}")
async def update_style_size_scale(
    style_id: int,
    scale_id: int,
    body: StyleSizeScaleBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(StyleSizeScale, scale_id)
    if not row or row.tenant_id != tenant.id or row.style_id != style_id:
        raise HTTPException(status_code=404, detail="Size scale not found")
    row.scale_name = body.scale_name
    row.sizes_csv = body.sizes_csv
    row.notes = body.notes
    await db.flush()
    await db.refresh(row)
    return row


@router.delete("/styles/{style_id}/size-scales/{scale_id}", status_code=204)
async def delete_style_size_scale(
    style_id: int,
    scale_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(StyleSizeScale, scale_id)
    if not row or row.tenant_id != tenant.id or row.style_id != style_id:
        raise HTTPException(status_code=404, detail="Size scale not found")
    await db.delete(row)
    await db.flush()

