"""Consumption reconciliation: planned (BOM) vs actual issues."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import (
    Bom,
    BomItem,
    ConsumptionPlan,
    Customer,
    GarmentStyle,
    Item,
    ItemCategory,
    ItemUnit,
    Order,
    Quotation,
    StockMovement,
    Tenant,
    User,
    Warehouse,
)
from app.modules.merch.bom_utils import GOVERNED_BOM_STATUSES, get_latest_governed_bom
from app.modules.merch.deps import ensure_tenant as _ensure_tenant, to_float_safe as _to_float_safe
from app.modules.merch.material_helpers import material_group_from_item

router = APIRouter(tags=["merch"])

# ---------- Consumption Reconciliation (BOM-based planned vs StockMovement actuals) ----------


class ConsumptionReconOrderOut(BaseModel):
    id: int
    order_code: str
    style_code: str
    quantity: int | None


class ConsumptionReconItemOut(BaseModel):
    item_id: int
    item_code: str
    item_name: str
    material_type: str
    uom: str | None
    planned_qty: float
    actual_qty: float
    variance: float
    variance_pct: float
    unit_cost: float | None = None
    planned_cost: float | None = None
    actual_cost: float | None = None
    cost_variance: float | None = None
    last_issued_at: str | None = None
    movement_count: int = 0
    # Three-layer (quoted vs BOM vs actual); optional for backward compatibility
    quoted_consumption_per_unit: float | None = None
    bom_net_consumption_per_unit: float | None = None
    bom_gross_consumption_per_unit: float | None = None
    wastage_pct: float | None = None
    process_loss_pct: float | None = None
    quoted_planned_qty: float | None = None
    quoted_planned_cost: float | None = None
    bom_planned_cost: float | None = None
    quoted_vs_bom_variance_pct: float | None = None
    bom_vs_actual_variance_pct: float | None = None
    quoted_vs_actual_variance_pct: float | None = None
    planned_wastage_qty: float | None = None
    planned_process_loss_qty: float | None = None
    planned_loss_vs_actual_loss: float | None = None
    cost_impact_quoted_vs_bom: float | None = None
    cost_impact_bom_vs_actual: float | None = None
    cost_impact_quoted_vs_actual: float | None = None


class ConsumptionReconSummaryOut(BaseModel):
    total_planned: float
    total_actual: float
    variance: float
    overall_variance_pct: float
    items_exceeding_tolerance: int
    total_planned_cost: float = 0.0
    total_actual_cost: float = 0.0
    cost_variance: float = 0.0
    cost_variance_pct: float = 0.0
    total_quoted_planned_qty: float = 0.0
    total_quoted_planned_cost: float = 0.0
    total_bom_planned_cost: float = 0.0
    quoted_vs_bom_cost_variance: float = 0.0
    quoted_vs_actual_cost_variance: float = 0.0


class ConsumptionReconResponse(BaseModel):
    order: ConsumptionReconOrderOut
    items: list[ConsumptionReconItemOut]
    summary: ConsumptionReconSummaryOut
    bom_version: str | None = None
    bom_status: str | None = None
    order_status: str | None = None
    consumption_plan_status: str | None = None


class ConsumptionReconMovementOut(BaseModel):
    movement_id: int
    movement_date: str | None
    quantity: float
    warehouse_name: str | None
    issued_by: str | None
    reference_code: str | None = None
    notes: str | None


class ConsumptionReconMovementsResponse(BaseModel):
    item_id: int
    item_code: str
    item_name: str
    planned_qty: float
    total_issued: float
    movements: list[ConsumptionReconMovementOut]


def _empty_recon_summary() -> ConsumptionReconSummaryOut:
    return ConsumptionReconSummaryOut(
        total_planned=0.0,
        total_actual=0.0,
        variance=0.0,
        overall_variance_pct=0.0,
        items_exceeding_tolerance=0,
        total_planned_cost=0.0,
        total_actual_cost=0.0,
        cost_variance=0.0,
        cost_variance_pct=0.0,
        total_quoted_planned_qty=0.0,
        total_quoted_planned_cost=0.0,
        total_bom_planned_cost=0.0,
        quoted_vs_bom_cost_variance=0.0,
        quoted_vs_actual_cost_variance=0.0,
    )


async def _get_active_order_governed_bom(
    db: AsyncSession,
    *,
    tenant_id: int,
    order_id: int,
) -> Bom | None:
    r = await db.execute(
        select(Bom).where(
            Bom.tenant_id == tenant_id,
            Bom.order_id == order_id,
            Bom.is_active.is_(True),
            Bom.status.in_(GOVERNED_BOM_STATUSES),
        )
    )
    return r.scalars().first()


async def _consumption_plan_status_for_order(
    db: AsyncSession, tenant_id: int, order_id: int
) -> str | None:
    r = await db.execute(
        select(ConsumptionPlan.status)
        .where(
            ConsumptionPlan.tenant_id == tenant_id,
            ConsumptionPlan.order_id == order_id,
        )
        .order_by(ConsumptionPlan.id.desc())
        .limit(1)
    )
    row = r.first()
    return row[0] if row else None


def _recon_aggregate_status(overall_pct: float, items_exceeding: int, tolerance_pct: float) -> str:
    if items_exceeding > 0:
        return "exceeds"
    if abs(overall_pct) <= 2.0:
        return "on_target"
    if abs(overall_pct) <= tolerance_pct:
        return "minor"
    return "exceeds"


def _actual_issue_movements_stmt(*, tenant_id: int, order_id: int, bom_line_ids: list[int]):
    return select(StockMovement).where(
        StockMovement.tenant_id == tenant_id,
        StockMovement.order_id == order_id,
        StockMovement.movement_type == "OUT",
        StockMovement.bom_line_id.in_(bom_line_ids),
    )


async def _get_consumption_recon_data(
    order_id: int,
    tolerance_pct: float,
    tenant: Tenant,
    db: AsyncSession,
) -> ConsumptionReconResponse | None:
    """Compute BOM-based planned vs StockMovement actuals for one order. Returns None if order not found."""
    order = await db.get(Order, order_id)
    if not order or order.tenant_id != tenant.id:
        return None
    plan_status = await _consumption_plan_status_for_order(db, tenant.id, order.id)
    style_code = str(order_id)
    order_qty = _to_float_safe(str(order.quantity)) if order.quantity is not None else 0.0
    if not order.quotation_id or order_qty <= 0:
        return ConsumptionReconResponse(
            order=ConsumptionReconOrderOut(
                id=order.id,
                order_code=order.order_code or "",
                style_code=style_code,
                quantity=order.quantity,
            ),
            items=[],
            summary=_empty_recon_summary(),
            bom_version=None,
            bom_status=None,
            order_status=order.status,
            consumption_plan_status=plan_status,
        )
    quotation = await db.get(Quotation, order.quotation_id)
    if not quotation or quotation.tenant_id != tenant.id or not quotation.style_id:
        return ConsumptionReconResponse(
            order=ConsumptionReconOrderOut(
                id=order.id,
                order_code=order.order_code or "",
                style_code=style_code,
                quantity=order.quantity,
            ),
            items=[],
            summary=_empty_recon_summary(),
            bom_version=None,
            bom_status=None,
            order_status=order.status,
            consumption_plan_status=plan_status,
        )
    sid = quotation.style_id
    style = await db.get(GarmentStyle, sid)
    style_code = style.style_code if style else str(sid)
    order_governed = await _get_active_order_governed_bom(
        db, tenant_id=tenant.id, order_id=order.id
    )
    if order_governed:
        bom = order_governed
        use_order_bom = True
    else:
        bom = await get_latest_governed_bom(
            db,
            tenant_id=tenant.id,
            style_id=sid,
        )
        use_order_bom = False
    if not bom:
        return ConsumptionReconResponse(
            order=ConsumptionReconOrderOut(
                id=order.id,
                order_code=order.order_code or "",
                style_code=style_code,
                quantity=order.quantity,
            ),
            items=[],
            summary=_empty_recon_summary(),
            bom_version=None,
            bom_status=None,
            order_status=order.status,
            consumption_plan_status=plan_status,
        )
    lines_result = await db.execute(
        select(BomItem).where(
            BomItem.tenant_id == tenant.id,
            BomItem.bom_id == bom.id,
            BomItem.item_id.isnot(None),
        )
    )
    lines = list(lines_result.scalars().all())
    ordered_item_ids: list[int] = []
    seen_ids: set[int] = set()
    for ln in lines:
        if ln.item_id is not None and ln.item_id not in seen_ids:
            seen_ids.add(ln.item_id)
            ordered_item_ids.append(ln.item_id)

    items_by_id: dict[int, Item] = {}
    if ordered_item_ids:
        ir = await db.execute(
            select(Item).where(Item.tenant_id == tenant.id, Item.id.in_(ordered_item_ids))
        )
        for it in ir.scalars().all():
            items_by_id[it.id] = it

    cat_ids = {it.category_id for it in items_by_id.values() if it.category_id}
    cats_by_id: dict[int, ItemCategory] = {}
    if cat_ids:
        cr = await db.execute(
            select(ItemCategory).where(
                ItemCategory.tenant_id == tenant.id,
                ItemCategory.id.in_(cat_ids),
            )
        )
        for c in cr.scalars().all():
            cats_by_id[c.id] = c

    unit_ids = {it.unit_id for it in items_by_id.values() if it.unit_id}
    units_by_id: dict[int, ItemUnit] = {}
    if unit_ids:
        ur = await db.execute(
            select(ItemUnit).where(
                ItemUnit.tenant_id == tenant.id,
                ItemUnit.id.in_(unit_ids),
            )
        )
        for u in ur.scalars().all():
            units_by_id[u.id] = u

    line_ids = [ln.id for ln in lines]
    movements_by_bom_line: dict[int, list[StockMovement]] = defaultdict(list)
    if line_ids:
        mr = await db.execute(
            _actual_issue_movements_stmt(
                tenant_id=tenant.id,
                order_id=order.id,
                bom_line_ids=line_ids,
            )
        )
        for m in mr.scalars().all():
            if m.bom_line_id is not None:
                movements_by_bom_line[m.bom_line_id].append(m)

    items_out: list[ConsumptionReconItemOut] = []
    total_planned = 0.0
    total_actual = 0.0
    total_planned_cost = 0.0
    total_actual_cost = 0.0
    total_quoted_qty = 0.0
    total_quoted_cost = 0.0
    total_bom_cost = 0.0
    items_exceeding = 0
    for line in lines:
        item = items_by_id.get(line.item_id) if line.item_id is not None else None
        if not item:
            continue
        cat = cats_by_id.get(item.category_id) if item.category_id else None
        material_type = material_group_from_item(item, cat)
        quoted_cons = None
        quoted_planned_qty = None
        bom_net = None
        bom_gross = None
        w_pct = None
        pl_pct = None
        if use_order_bom and line.bom_gross_consumption_per_unit is not None:
            bom_gross = float(line.bom_gross_consumption_per_unit)
            planned_qty = order_qty * bom_gross
            if line.quoted_consumption_per_unit is not None:
                quoted_cons = float(line.quoted_consumption_per_unit)
                quoted_planned_qty = order_qty * quoted_cons
            if line.bom_net_consumption_per_unit is not None:
                bom_net = float(line.bom_net_consumption_per_unit)
            w_pct = _to_float_safe(line.wastage_pct)
            if line.process_loss_pct is not None:
                pl_pct = float(line.process_loss_pct)
        else:
            base = _to_float_safe(line.base_consumption)
            wastage = _to_float_safe(line.wastage_pct) / 100.0
            planned_qty = order_qty * base * (1.0 + wastage)
        out_movements = movements_by_bom_line.get(line.id, [])
        actual_qty = sum(_to_float_safe(m.quantity) for m in out_movements)
        movement_count = len(out_movements)
        cost_qty_weighted = 0.0
        cost_sum = 0.0
        last_dt: datetime | None = None
        for m in out_movements:
            q = _to_float_safe(m.quantity)
            uc_m = _to_float_safe(m.unit_cost) if m.unit_cost else 0.0
            if uc_m > 0:
                cost_qty_weighted += q
                cost_sum += q * uc_m
            cand = None
            if m.movement_date:
                cand = datetime.combine(m.movement_date, time.min)
            elif m.created_at:
                cand = m.created_at
            if cand and (last_dt is None or cand > last_dt):
                last_dt = cand
        base_uc = _to_float_safe(item.default_cost)
        if cost_qty_weighted > 0:
            unit_cost = cost_sum / cost_qty_weighted
        else:
            unit_cost = base_uc
        bom_price = (
            float(line.bom_expected_unit_price)
            if use_order_bom and line.bom_expected_unit_price is not None
            else unit_cost
        )
        quoted_price = (
            float(line.quoted_unit_price)
            if use_order_bom and line.quoted_unit_price is not None
            else None
        )
        planned_cost = planned_qty * bom_price
        quoted_planned_cost = None
        if quoted_planned_qty is not None and quoted_price is not None:
            quoted_planned_cost = quoted_planned_qty * quoted_price
        actual_cost_computed = 0.0
        for m in out_movements:
            q = _to_float_safe(m.quantity)
            uc_line = _to_float_safe(m.unit_cost) if m.unit_cost else unit_cost
            actual_cost_computed += q * uc_line
        cost_variance = actual_cost_computed - planned_cost
        last_issued_at = last_dt.isoformat() if last_dt else None
        variance = actual_qty - planned_qty
        variance_pct = (variance / planned_qty * 100.0) if planned_qty > 0 else 0.0
        if abs(variance_pct) > tolerance_pct:
            items_exceeding += 1
        uom = None
        if item.unit_id:
            u = units_by_id.get(item.unit_id)
            uom = u.unit_code if u else None
        total_planned += planned_qty
        total_actual += actual_qty
        total_planned_cost += planned_cost
        total_actual_cost += actual_cost_computed
        if quoted_planned_qty is not None:
            total_quoted_qty += quoted_planned_qty
        if quoted_planned_cost is not None:
            total_quoted_cost += quoted_planned_cost
        total_bom_cost += planned_cost

        qvb = None
        qva = None
        bva = None
        if quoted_cons is not None and bom_gross is not None and quoted_cons > 0:
            qvb = (bom_gross - quoted_cons) / quoted_cons * 100.0
        if quoted_planned_qty and quoted_planned_qty > 0:
            qva = (actual_qty - quoted_planned_qty) / quoted_planned_qty * 100.0
        if planned_qty > 0:
            bva = (actual_qty - planned_qty) / planned_qty * 100.0
        pwq = float(line.wastage_qty) if use_order_bom and line.wastage_qty is not None else None
        plq = float(line.process_loss_qty) if use_order_bom and line.process_loss_qty is not None else None
        planned_loss_total = (pwq or 0) + (plq or 0)
        actual_loss_proxy = max(0.0, actual_qty - (order_qty * (bom_net or 0))) if bom_net else None
        pl_vs_al = (
            (planned_loss_total - actual_loss_proxy)
            if actual_loss_proxy is not None and use_order_bom
            else None
        )
        c_q_b = (
            (planned_cost - quoted_planned_cost)
            if quoted_planned_cost is not None and use_order_bom
            else None
        )
        c_b_a = actual_cost_computed - planned_cost
        c_q_a = (
            (actual_cost_computed - quoted_planned_cost)
            if quoted_planned_cost is not None and use_order_bom
            else None
        )

        items_out.append(
            ConsumptionReconItemOut(
                item_id=line.item_id,
                item_code=item.item_code or "",
                item_name=item.name or item.description or "",
                material_type=material_type,
                uom=uom,
                planned_qty=round(planned_qty, 4),
                actual_qty=round(actual_qty, 4),
                variance=round(variance, 4),
                variance_pct=round(variance_pct, 2),
                unit_cost=round(unit_cost, 4),
                planned_cost=round(planned_cost, 4),
                actual_cost=round(actual_cost_computed, 4),
                cost_variance=round(cost_variance, 4),
                last_issued_at=last_issued_at,
                movement_count=movement_count,
                quoted_consumption_per_unit=round(quoted_cons, 6) if quoted_cons is not None else None,
                bom_net_consumption_per_unit=round(bom_net, 6) if bom_net is not None else None,
                bom_gross_consumption_per_unit=round(bom_gross, 6) if bom_gross is not None else None,
                wastage_pct=round(w_pct, 4) if w_pct is not None else None,
                process_loss_pct=round(pl_pct, 4) if pl_pct is not None else None,
                quoted_planned_qty=round(quoted_planned_qty, 4) if quoted_planned_qty is not None else None,
                quoted_planned_cost=round(quoted_planned_cost, 4) if quoted_planned_cost is not None else None,
                bom_planned_cost=round(planned_cost, 4) if use_order_bom else None,
                quoted_vs_bom_variance_pct=round(qvb, 2) if qvb is not None else None,
                bom_vs_actual_variance_pct=round(bva, 2) if bva is not None else None,
                quoted_vs_actual_variance_pct=round(qva, 2) if qva is not None else None,
                planned_wastage_qty=round(pwq, 4) if pwq is not None else None,
                planned_process_loss_qty=round(plq, 4) if plq is not None else None,
                planned_loss_vs_actual_loss=round(pl_vs_al, 4) if pl_vs_al is not None else None,
                cost_impact_quoted_vs_bom=round(c_q_b, 4) if c_q_b is not None else None,
                cost_impact_bom_vs_actual=round(c_b_a, 4),
                cost_impact_quoted_vs_actual=round(c_q_a, 4) if c_q_a is not None else None,
            )
        )
    overall_pct = (total_actual - total_planned) / total_planned * 100.0 if total_planned > 0 else 0.0
    cost_var = total_actual_cost - total_planned_cost
    cost_var_pct = (cost_var / total_planned_cost * 100.0) if total_planned_cost > 0 else 0.0
    qv_b_c = total_bom_cost - total_quoted_cost
    qv_a_c = total_actual_cost - total_quoted_cost
    return ConsumptionReconResponse(
        order=ConsumptionReconOrderOut(
            id=order.id,
            order_code=order.order_code or "",
            style_code=style_code,
            quantity=order.quantity,
        ),
        items=items_out,
        summary=ConsumptionReconSummaryOut(
            total_planned=round(total_planned, 4),
            total_actual=round(total_actual, 4),
            variance=round(total_actual - total_planned, 4),
            overall_variance_pct=round(overall_pct, 2),
            items_exceeding_tolerance=items_exceeding,
            total_planned_cost=round(total_planned_cost, 4),
            total_actual_cost=round(total_actual_cost, 4),
            cost_variance=round(cost_var, 4),
            cost_variance_pct=round(cost_var_pct, 2),
            total_quoted_planned_qty=round(total_quoted_qty, 4),
            total_quoted_planned_cost=round(total_quoted_cost, 4),
            total_bom_planned_cost=round(total_bom_cost, 4),
            quoted_vs_bom_cost_variance=round(qv_b_c, 4),
            quoted_vs_actual_cost_variance=round(qv_a_c, 4),
        ),
        bom_version=str(bom.version_no),
        bom_status=bom.status,
        order_status=order.status,
        consumption_plan_status=plan_status,
    )


CONSUMPTION_RECON_DASHBOARD_MAX_ORDERS = 500


class ConsumptionReconDashboardOrderRow(BaseModel):
    order_id: int
    order_code: str
    style_code: str
    style_id: int | None = None
    buyer_name: str | None
    order_qty: int | None
    total_planned: float
    total_actual: float
    variance: float
    overall_variance_pct: float
    items_exceeding_tolerance: int
    total_items: int
    worst_item_name: str | None
    worst_item_variance_pct: float
    status: str


class ConsumptionReconCategoryBreakdown(BaseModel):
    material_type: str
    total_planned: float
    total_actual: float
    variance_pct: float


class ConsumptionReconDashboardSummary(BaseModel):
    total_orders: int
    orders_on_target: int
    orders_minor: int
    orders_exceeding: int
    avg_variance_pct: float
    total_planned_qty: float
    total_actual_qty: float


class ConsumptionReconDashboardResponse(BaseModel):
    orders: list[ConsumptionReconDashboardOrderRow]
    summary: ConsumptionReconDashboardSummary
    category_breakdown: list[ConsumptionReconCategoryBreakdown]
    total_count: int


class ConsumptionReconTrendPoint(BaseModel):
    period: str
    orders_count: int
    avg_variance_pct: float
    total_planned: float
    total_actual: float
    exceeding_count: int


class ConsumptionReconTrendsResponse(BaseModel):
    points: list[ConsumptionReconTrendPoint]
    tolerance_pct: float


async def _orders_base_query_for_recon(
    tenant_id: int,
    buyer_id: int | None,
    style_id: int | None,
    date_from: date | None,
    date_to: date | None,
):
    q = select(Order).where(Order.tenant_id == tenant_id)
    if buyer_id is not None:
        q = q.where(Order.customer_id == buyer_id)
    if style_id is not None:
        q = q.join(Quotation, Order.quotation_id == Quotation.id).where(Quotation.style_id == style_id)
    if date_from is not None:
        start = datetime.combine(date_from, time.min)
        q = q.where(Order.created_at >= start)
    if date_to is not None:
        end = datetime.combine(date_to, time.max)
        q = q.where(Order.created_at <= end)
    return q.order_by(Order.created_at.desc()).limit(CONSUMPTION_RECON_DASHBOARD_MAX_ORDERS)


def _worst_variance_item(items: list[ConsumptionReconItemOut]) -> tuple[str | None, float]:
    if not items:
        return None, 0.0
    worst = max(items, key=lambda x: abs(x.variance_pct))
    label = f"{worst.item_code} {worst.item_name}".strip()
    return label, worst.variance_pct


@router.get("/consumption-reconciliation/dashboard", response_model=ConsumptionReconDashboardResponse)
async def get_consumption_reconciliation_dashboard(
    buyer_id: int | None = Query(default=None),
    style_id: int | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    material_type: str | None = Query(default=None),
    tolerance_pct: float = Query(default=5.0),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    sort_by: str = Query(default="overall_variance_pct"),
    sort_dir: str = Query(default="desc"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Multi-order consumption reconciliation summary (scans up to 500 most recent matching orders)."""
    _ensure_tenant(user, tenant)
    q = await _orders_base_query_for_recon(tenant.id, buyer_id, style_id, date_from, date_to)
    ores = await db.execute(q)
    orders_list = ores.scalars().unique().all()
    rows_full: list[ConsumptionReconDashboardOrderRow] = []
    cat_acc: dict[str, tuple[float, float]] = defaultdict(lambda: (0.0, 0.0))
    for order in orders_list:
        data = await _get_consumption_recon_data(order.id, tolerance_pct, tenant, db)
        if data is None:
            continue
        worst_name, worst_pct = _worst_variance_item(data.items)
        st = _recon_aggregate_status(
            data.summary.overall_variance_pct,
            data.summary.items_exceeding_tolerance,
            tolerance_pct,
        )
        if status_filter and status_filter.strip().lower() != st:
            continue
        if material_type and material_type.strip():
            mt = material_type.strip().lower()
            if not any(it.material_type.lower() == mt for it in data.items):
                continue
        cust = await db.get(Customer, order.customer_id)
        buyer_name = None
        if cust:
            buyer_name = (cust.trade_name or cust.legal_entity_name or cust.name or "").strip() or None
        sid_row: int | None = None
        if order.quotation_id:
            qo = await db.get(Quotation, order.quotation_id)
            if qo and qo.style_id:
                sid_row = qo.style_id
        rows_full.append(
            ConsumptionReconDashboardOrderRow(
                order_id=order.id,
                order_code=data.order.order_code,
                style_code=data.order.style_code,
                style_id=sid_row,
                buyer_name=buyer_name,
                order_qty=data.order.quantity,
                total_planned=data.summary.total_planned,
                total_actual=data.summary.total_actual,
                variance=data.summary.variance,
                overall_variance_pct=data.summary.overall_variance_pct,
                items_exceeding_tolerance=data.summary.items_exceeding_tolerance,
                total_items=len(data.items),
                worst_item_name=worst_name,
                worst_item_variance_pct=round(worst_pct, 2),
                status=st,
            )
        )
        for it in data.items:
            p0, a0 = cat_acc[it.material_type]
            cat_acc[it.material_type] = (p0 + it.planned_qty, a0 + it.actual_qty)
    sort_key = sort_by if sort_by in (
        "order_code",
        "overall_variance_pct",
        "total_planned",
        "total_actual",
        "variance",
    ) else "overall_variance_pct"
    reverse = sort_dir.lower() != "asc"

    def sort_val(r: ConsumptionReconDashboardOrderRow) -> float | str:
        v = getattr(r, sort_key, r.overall_variance_pct)
        return v if isinstance(v, (int, float)) else str(v)

    rows_full.sort(key=sort_val, reverse=reverse)
    total_count = len(rows_full)
    page_rows = rows_full[offset : offset + limit]
    on_target = sum(1 for r in rows_full if r.status == "on_target")
    minor = sum(1 for r in rows_full if r.status == "minor")
    exceeds = sum(1 for r in rows_full if r.status == "exceeds")
    avg_var = (
        sum(r.overall_variance_pct for r in rows_full) / len(rows_full) if rows_full else 0.0
    )
    tp = sum(r.total_planned for r in rows_full)
    ta = sum(r.total_actual for r in rows_full)
    breakdown: list[ConsumptionReconCategoryBreakdown] = []
    for mtype, (cp, ca) in sorted(cat_acc.items()):
        vp = ((ca - cp) / cp * 100.0) if cp > 0 else 0.0
        breakdown.append(
            ConsumptionReconCategoryBreakdown(
                material_type=mtype,
                total_planned=round(cp, 4),
                total_actual=round(ca, 4),
                variance_pct=round(vp, 2),
            )
        )
    return ConsumptionReconDashboardResponse(
        orders=page_rows,
        summary=ConsumptionReconDashboardSummary(
            total_orders=len(rows_full),
            orders_on_target=on_target,
            orders_minor=minor,
            orders_exceeding=exceeds,
            avg_variance_pct=round(avg_var, 2),
            total_planned_qty=round(tp, 4),
            total_actual_qty=round(ta, 4),
        ),
        category_breakdown=breakdown,
        total_count=total_count,
    )


@router.get("/consumption-reconciliation/trends", response_model=ConsumptionReconTrendsResponse)
async def get_consumption_reconciliation_trends(
    months: int = Query(default=6, ge=1, le=24),
    buyer_id: int | None = Query(default=None),
    style_id: int | None = Query(default=None),
    tolerance_pct: float = Query(default=5.0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Monthly aggregates of consumption reconciliation variance (capped at CONSUMPTION_RECON_DASHBOARD_MAX_ORDERS per month)."""
    _ensure_tenant(user, tenant)
    today = date.today()
    start_month = date(today.year, today.month, 1)
    for _ in range(months - 1):
        if start_month.month == 1:
            start_month = date(start_month.year - 1, 12, 1)
        else:
            start_month = date(start_month.year, start_month.month - 1, 1)
    points: list[ConsumptionReconTrendPoint] = []
    cur = start_month
    while cur <= today.replace(day=1):
        if cur.month == 12:
            next_m = date(cur.year + 1, 1, 1)
        else:
            next_m = date(cur.year, cur.month + 1, 1)
        q = select(Order).where(Order.tenant_id == tenant.id)
        q = q.where(Order.created_at >= datetime.combine(cur, time.min))
        q = q.where(Order.created_at < datetime.combine(next_m, time.min))
        if buyer_id is not None:
            q = q.where(Order.customer_id == buyer_id)
        if style_id is not None:
            q = q.join(Quotation, Order.quotation_id == Quotation.id).where(Quotation.style_id == style_id)
        q = q.order_by(Order.created_at.desc()).limit(CONSUMPTION_RECON_DASHBOARD_MAX_ORDERS)
        ores = await db.execute(q)
        month_orders = ores.scalars().unique().all()
        var_list: list[float] = []
        tp_sum = 0.0
        ta_sum = 0.0
        ex_count = 0
        for order in month_orders:
            data = await _get_consumption_recon_data(order.id, tolerance_pct, tenant, db)
            if data is None or not data.items:
                continue
            var_list.append(data.summary.overall_variance_pct)
            tp_sum += data.summary.total_planned
            ta_sum += data.summary.total_actual
            if data.summary.items_exceeding_tolerance > 0:
                ex_count += 1
        label = f"{cur.year:04d}-{cur.month:02d}"
        n = len(var_list)
        avg_v = sum(var_list) / n if n else 0.0
        points.append(
            ConsumptionReconTrendPoint(
                period=label,
                orders_count=n,
                avg_variance_pct=round(avg_v, 2),
                total_planned=round(tp_sum, 4),
                total_actual=round(ta_sum, 4),
                exceeding_count=ex_count,
            )
        )
        cur = next_m
    return ConsumptionReconTrendsResponse(points=points, tolerance_pct=tolerance_pct)


@router.get("/consumption-reconciliation/dashboard/export")
async def get_consumption_reconciliation_dashboard_export(
    buyer_id: int | None = Query(default=None),
    style_id: int | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    material_type: str | None = Query(default=None),
    tolerance_pct: float = Query(default=5.0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Excel export of dashboard reconciliation rows (same filters as dashboard, all matching rows)."""
    _ensure_tenant(user, tenant)
    body = await get_consumption_reconciliation_dashboard(
        buyer_id=buyer_id,
        style_id=style_id,
        date_from=date_from,
        date_to=date_to,
        status_filter=status_filter,
        material_type=material_type,
        tolerance_pct=tolerance_pct,
        limit=CONSUMPTION_RECON_DASHBOARD_MAX_ORDERS,
        offset=0,
        sort_by="overall_variance_pct",
        sort_dir="desc",
        tenant=tenant,
        user=user,
        db=db,
    )
    try:
        from openpyxl import Workbook
    except ImportError:
        raise HTTPException(status_code=500, detail="Excel export not available (openpyxl missing)")
    wb = Workbook()
    ws = wb.active
    if ws is None:
        raise HTTPException(status_code=500, detail="Workbook error")
    ws.title = "Summary"
    ws.append(["Consumption reconciliation dashboard"])
    ws.append(["Total orders (in scan)", body.summary.total_orders])
    ws.append(["On target", body.summary.orders_on_target])
    ws.append(["Minor", body.summary.orders_minor])
    ws.append(["Exceeding", body.summary.orders_exceeding])
    ws.append([])
    ws.append(
        [
            "Order",
            "Style",
            "Buyer",
            "Qty",
            "Planned",
            "Actual",
            "Var %",
            "Worst item",
            "Status",
        ]
    )
    for r in body.orders:
        ws.append(
            [
                r.order_code,
                r.style_code,
                r.buyer_name or "",
                r.order_qty or "",
                r.total_planned,
                r.total_actual,
                r.overall_variance_pct,
                r.worst_item_name or "",
                r.status,
            ]
        )
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="consumption_recon_dashboard.xlsx"'},
    )


@router.get(
    "/consumption-reconciliation/{order_id}/movements/{item_id}",
    response_model=ConsumptionReconMovementsResponse,
)
async def get_consumption_reconciliation_movements(
    order_id: int,
    item_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """OUT stock movements tied to the governed BOM lines for one order line item."""
    _ensure_tenant(user, tenant)
    order = await db.get(Order, order_id)
    if not order or order.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Order not found")
    item = await db.get(Item, item_id)
    if not item or item.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Item not found")
    planned_qty = 0.0
    bom_line_ids_for_item: list[int] = []
    if order.quotation_id:
        quotation = await db.get(Quotation, order.quotation_id)
        if quotation and quotation.style_id:
            bom = await _get_active_order_governed_bom(
                db, tenant_id=tenant.id, order_id=order.id
            )
            if not bom:
                bom = await get_latest_governed_bom(db, tenant_id=tenant.id, style_id=quotation.style_id)
            if bom:
                bres = await db.execute(
                    select(BomItem).where(
                        BomItem.tenant_id == tenant.id,
                        BomItem.bom_id == bom.id,
                        BomItem.item_id == item_id,
                    )
                )
                blines = bres.scalars().all()
                bom_line_ids_for_item = [ln.id for ln in blines]
                bline = blines[0] if blines else None
                if bline:
                    oq = _to_float_safe(str(order.quantity)) if order.quantity else 0.0
                    if bline.bom_gross_consumption_per_unit is not None:
                        planned_qty = oq * float(bline.bom_gross_consumption_per_unit)
                    else:
                        base = _to_float_safe(bline.base_consumption)
                        wastage = _to_float_safe(bline.wastage_pct) / 100.0
                        pl = (
                            float(bline.process_loss_pct) / 100.0
                            if bline.process_loss_pct is not None
                            else 0.0
                        )
                        planned_qty = oq * base * (1.0 + wastage + pl)
    movements_raw: list[StockMovement] = []
    if bom_line_ids_for_item:
        act_result = await db.execute(
            _actual_issue_movements_stmt(
                tenant_id=tenant.id,
                order_id=order.id,
                bom_line_ids=bom_line_ids_for_item,
            )
            .where(StockMovement.item_id == item_id)
            .order_by(StockMovement.created_at.desc())
        )
        movements_raw = act_result.scalars().all()
    total_issued = sum(_to_float_safe(m.quantity) for m in movements_raw)
    out_list: list[ConsumptionReconMovementOut] = []
    for m in movements_raw:
        wh_name = None
        if m.warehouse_id:
            wh = await db.get(Warehouse, m.warehouse_id)
            wh_name = wh.name if wh else None
        issuer = None
        if m.created_by_user_id:
            u = await db.get(User, m.created_by_user_id)
            if u:
                parts = [u.first_name or "", u.last_name or ""]
                issuer = " ".join(p for p in parts if p).strip() or u.username
        md = None
        if m.movement_date:
            md = m.movement_date.isoformat()
        elif m.created_at:
            md = m.created_at.isoformat()
        out_list.append(
            ConsumptionReconMovementOut(
                movement_id=m.id,
                movement_date=md,
                quantity=round(_to_float_safe(m.quantity), 4),
                warehouse_name=wh_name,
                issued_by=issuer,
                reference_code=m.lot_number,
                notes=m.notes,
            )
        )
    return ConsumptionReconMovementsResponse(
        item_id=item_id,
        item_code=item.item_code or "",
        item_name=item.name or item.description or "",
        planned_qty=round(planned_qty, 4),
        total_issued=round(total_issued, 4),
        movements=out_list,
    )


@router.get("/consumption-reconciliation/{order_id}", response_model=ConsumptionReconResponse)
async def get_consumption_reconciliation(
    order_id: int,
    tolerance_pct: float = Query(default=5.0, description="Tolerance % for exceeding count (e.g. 5)"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """BOM-based planned vs StockMovement actuals for one order. Planned = order_qty × BOM base × (1 + wastage%); actual = CONSUMPTION_ISSUE OUT movements."""
    _ensure_tenant(user, tenant)
    data = await _get_consumption_recon_data(order_id, tolerance_pct, tenant, db)
    if data is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return data


@router.get("/consumption-reconciliation/{order_id}/export")
async def get_consumption_reconciliation_export(
    order_id: int,
    format: str = Query(default="xlsx", description="xlsx"),
    tolerance_pct: float = Query(default=5.0, description="Tolerance % for exceeding count"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Export consumption reconciliation for one order as Excel (order info + items + summary)."""
    _ensure_tenant(user, tenant)
    data = await _get_consumption_recon_data(order_id, tolerance_pct, tenant, db)
    if data is None:
        raise HTTPException(status_code=404, detail="Order not found")
    try:
        from openpyxl import Workbook
    except ImportError:
        raise HTTPException(status_code=500, detail="Excel export not available (openpyxl missing)")
    wb = Workbook()
    ws = wb.active
    if ws is None:
        raise HTTPException(status_code=500, detail="Workbook error")
    ws.title = "Reconciliation"
    ws.append(["Order", data.order.order_code, "Style", data.order.style_code, "Qty", data.order.quantity or ""])
    ws.append([])
    ws.append(
        [
            "Item",
            "Type",
            "Unit",
            "Planned",
            "Actual",
            "Variance",
            "Variance %",
            "Planned cost",
            "Actual cost",
            "Cost var.",
            "Movements",
        ]
    )
    for i in data.items:
        ws.append([
            f"{i.item_code} {i.item_name}".strip(),
            i.material_type,
            i.uom or "",
            i.planned_qty,
            i.actual_qty,
            i.variance,
            i.variance_pct,
            i.planned_cost if i.planned_cost is not None else "",
            i.actual_cost if i.actual_cost is not None else "",
            i.cost_variance if i.cost_variance is not None else "",
            i.movement_count,
        ])
    ws.append([])
    ws.append(["Total planned", data.summary.total_planned])
    ws.append(["Total actual", data.summary.total_actual])
    ws.append(["Variance", data.summary.variance])
    ws.append(["Overall variance %", data.summary.overall_variance_pct])
    ws.append(["Items exceeding tolerance", data.summary.items_exceeding_tolerance])
    ws.append(["Total planned cost", data.summary.total_planned_cost])
    ws.append(["Total actual cost", data.summary.total_actual_cost])
    ws.append(["Cost variance", data.summary.cost_variance])
    ws.append(["Cost variance %", data.summary.cost_variance_pct])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    safe_code = "".join(c if c.isalnum() or c in "-_" else "_" for c in data.order.order_code)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="consumption_recon_order_{safe_code}.xlsx"'},
    )
