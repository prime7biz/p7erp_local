"""Finished-goods contribution for a period (estimate - not posted). Rules: docs/management-performance/01, 02.

Finished-goods receipt = IN stock movement of an item whose stock group has stock_nature FINISHED_GOODS, into a
warehouse that is not quarantine / rejected / production floor, that is not a move between stores
(reference WAREHOUSE_TRANSFER / GRN_QC / STOCK_ADJUSTMENT / PHYSICAL_COUNT, kind WAREHOUSE_TRANSFER_IN / IDT_RECEIVE).
Date = movement date (else the day it was recorded). Nothing is netted (there is no reversal document).

Per order (all Decimal, base currency):
    counted qty       min(received in period, max(0, order qty - received before the period))   (never twice)
    unit price        contract value / order qty (`revenue_resolver` chain: snapshot price, single-order PI,
                      scaled quotation total)
    material          material at completion (`cost_at_completion_service`: procured PO value + not-yet-procured
                      budget; Order BOM, else quotation)
    processing        larger of actual process-order charges (ISSUED / RECEIVED / APPROVED, charges + cost lines)
                      and the quotation other-cost budget - never both
    selling           buying commission from the order terms
    contribution      counted qty x (unit price - (material + processing + selling) / order qty)
Company level: posted DIRECT_LANDED + DIRECT_SELLING ledger cost of the period is deducted once ("unallocated").
Pipeline (for the marketing gap): confirmed orders due in the period, not-yet-received qty x contribution per piece.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import Date, and_, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Order
from app.models.costing import Item
from app.models.inventory import ProcessOrder, ProcessOrderCostLine, StockGroup, StockMovement, Warehouse
from app.modules.finance.budget_analytics.common import q4
from app.modules.finance.mgmt_performance.constants import HUNDRED, ZERO
from app.modules.finance.mgmt_performance.periods import Period
from app.modules.mfg_intelligence.confirmed_demand import confirmed_status_clause
from app.modules.mfg_intelligence.cost_at_completion_service import build_order_cost, load_batch
from app.modules.mfg_intelligence.money import base_currency, norm_ccy

FG_NATURE = "FINISHED_GOODS"
EXCLUDED_REFERENCES = ("WAREHOUSE_TRANSFER", "GRN_QC", "STOCK_ADJUSTMENT", "PHYSICAL_COUNT")
EXCLUDED_KINDS = ("WAREHOUSE_TRANSFER_IN", "IDT_RECEIVE")
PROCESS_COUNTED_STATUSES = ("ISSUED", "RECEIVED", "APPROVED")
BATCH = 200
MAX_ORDERS = 1000

COST_COMPLETE = "COMPLETE"
COST_ESTIMATED = "ESTIMATED"
COST_UNKNOWN = "UNKNOWN"


@dataclass
class OrderContribution:
    order_id: int
    order_code: str | None
    order_qty: Decimal | None
    received_before: Decimal
    received_in_period: Decimal
    counted_qty: Decimal
    unit_price: Decimal | None
    material: Decimal | None
    processing: Decimal | None
    processing_source: str | None
    selling: Decimal | None
    cost_per_piece: Decimal | None
    value: Decimal | None
    direct_cost: Decimal | None
    contribution: Decimal | None
    cost_status: str
    confidence: str
    revenue_source: str | None
    reason_codes: list[str] = field(default_factory=list)


@dataclass
class ContributionResult:
    orders: list[OrderContribution]
    value: Decimal
    direct_cost: Decimal
    contribution: Decimal
    counted_qty: Decimal
    unknown_orders: int
    receipts_without_order_qty: Decimal
    receipts_without_order_rows: int
    pipeline_contribution: Decimal
    pipeline_value: Decimal
    pipeline_orders: int
    pipeline_unknown_orders: int
    order_book_contribution_pct: Decimal | None
    fg_groups: int
    truncated: bool
    reason_codes: list[str]

    @property
    def contribution_pct(self) -> Decimal | None:
        if self.value <= ZERO:
            return None
        return q4(self.contribution / self.value * HUNDRED)

    @property
    def contribution_per_piece(self) -> Decimal | None:
        if self.counted_qty <= ZERO:
            return None
        return q4(self.contribution / self.counted_qty)


def receipt_filter(tenant_id: int) -> list:
    return [
        StockMovement.tenant_id == tenant_id,
        StockMovement.movement_type == "IN",
        func.upper(func.coalesce(StockGroup.stock_nature, "")) == FG_NATURE,
        func.upper(func.coalesce(StockMovement.reference_type, "")).not_in(EXCLUDED_REFERENCES),
        func.upper(func.coalesce(StockMovement.movement_kind, "")).not_in(EXCLUDED_KINDS),
        or_(StockMovement.warehouse_id.is_(None), and_(
            Warehouse.is_quarantine.is_(False), Warehouse.is_rejected.is_(False), Warehouse.is_production_floor.is_(False),
        )),
    ]


def _receipts_stmt(tenant_id: int, *columns):
    return (
        select(*columns)
        .select_from(StockMovement)
        .join(Item, and_(Item.id == StockMovement.item_id, Item.tenant_id == tenant_id))
        .join(StockGroup, and_(StockGroup.id == Item.stock_group_id, StockGroup.tenant_id == tenant_id))
        .outerjoin(Warehouse, and_(Warehouse.id == StockMovement.warehouse_id, Warehouse.tenant_id == tenant_id))
        .where(*receipt_filter(tenant_id))
    )


def _mv_date():
    return func.coalesce(StockMovement.movement_date, cast(StockMovement.created_at, Date))


def counted_quantity(received_in_period: Decimal, received_before: Decimal, order_qty: Decimal | None) -> Decimal:
    if order_qty is None or order_qty <= ZERO:
        return ZERO
    return max(ZERO, min(received_in_period, order_qty - received_before))


def _dec(text: Any) -> Decimal | None:
    if text is None:
        return None
    return Decimal(str(text))


async def _processing_actual(db: AsyncSession, tenant_id: int, base: str, order_ids: list[int]) -> tuple[dict[int, Decimal], set[int]]:
    eff = func.coalesce(ProcessOrder.source_order_id, ProcessOrder.linked_order_id)
    totals: dict[int, Decimal] = defaultdict(lambda: ZERO)
    fx_unknown: set[int] = set()
    if not order_ids:
        return totals, fx_unknown
    rows = (
        await db.execute(
            select(ProcessOrder.id, eff, ProcessOrder.processing_charges).where(
                ProcessOrder.tenant_id == tenant_id, eff.in_(order_ids),
                func.upper(ProcessOrder.status).in_(PROCESS_COUNTED_STATUSES),
            )
        )
    ).all()
    po_order = {int(pid): int(oid) for pid, oid, _c in rows}
    for _pid, oid, charges in rows:
        totals[int(oid)] += Decimal(str(charges or 0))
    if po_order:
        for pid, amount, ccy in (
            await db.execute(
                select(ProcessOrderCostLine.process_order_id, ProcessOrderCostLine.amount, ProcessOrderCostLine.currency).where(
                    ProcessOrderCostLine.tenant_id == tenant_id, ProcessOrderCostLine.process_order_id.in_(list(po_order)),
                )
            )
        ).all():
            oid = po_order[int(pid)]
            currency = norm_ccy(ccy)
            if currency is not None and currency != base:
                fx_unknown.add(oid)
                continue
            totals[oid] += Decimal(str(amount or 0))
    return totals, fx_unknown


def price_order(order: Order, cost: dict[str, Any], processing_actual: Decimal | None, processing_fx_unknown: bool,
                received_before: Decimal, received_in_period: Decimal) -> OrderContribution:
    reasons: list[str] = []
    qty = _dec(cost.get("order_qty"))
    gross = _dec(cost["revenue"]["gross"]["amount"])
    commission = _dec(cost["revenue"]["commission"]["amount"]) if gross is not None else None
    material = _dec(cost["material"]["eac"]["amount"])
    remaining_material = _dec(cost["material"]["remaining"]["amount"])
    other_budget = _dec(cost["other"]["amount"])
    unit_price = q4(gross / qty) if gross is not None and qty and qty > ZERO else None
    if unit_price is None:
        reasons.append("SELLING_PRICE_UNKNOWN")
    if material is None or (material == ZERO and remaining_material is None):
        reasons.append("MATERIAL_COST_UNKNOWN")
        material = None
    if processing_actual is not None and processing_actual > ZERO:
        if other_budget is not None and other_budget > processing_actual:
            processing, p_src = other_budget, "QUOTATION_OTHER_COST"
        else:
            processing, p_src = processing_actual, "PROCESS_ORDERS"
    elif other_budget is not None:
        processing, p_src = other_budget, "QUOTATION_OTHER_COST"
        reasons.append("IN_HOUSE_PROCESSING_FROM_BUDGET")
    else:
        processing, p_src = None, None
        reasons.append("PROCESSING_COST_UNKNOWN")
    if processing_fx_unknown:
        reasons.append("PROCESS_COST_FX_UNKNOWN")
    selling = commission if commission is not None else (ZERO if gross is not None else None)
    counted = counted_quantity(received_in_period, received_before, qty)
    if received_in_period > counted:
        reasons.append("RECEIPTS_ABOVE_ORDER_QTY")
    cost_per_piece = None
    value = direct = contribution = None
    if unit_price is not None and material is not None and processing is not None and selling is not None and qty:
        cost_per_piece = q4((material + processing + selling) / qty)
        value = q4(counted * unit_price)
        direct = q4(counted * cost_per_piece)
        contribution = value - direct
    if contribution is None:
        status, confidence = COST_UNKNOWN, "NONE"
    elif (remaining_material or ZERO) == ZERO and p_src == "PROCESS_ORDERS" and not processing_fx_unknown:
        status, confidence = COST_COMPLETE, "HIGH"
    else:
        status = COST_ESTIMATED
        confidence = "MEDIUM" if cost["material"].get("bom_id") else "LOW"
    return OrderContribution(
        order_id=order.id, order_code=order.order_code, order_qty=qty, received_before=received_before,
        received_in_period=received_in_period, counted_qty=counted, unit_price=unit_price, material=material,
        processing=processing, processing_source=p_src, selling=selling, cost_per_piece=cost_per_piece, value=value,
        direct_cost=direct, contribution=contribution, cost_status=status, confidence=confidence,
        revenue_source=cost["revenue"]["gross"].get("source"), reason_codes=reasons,
    )


async def _price_orders(db: AsyncSession, tenant: Any, orders: list[Order], today: date) -> dict[int, tuple[dict[str, Any], Decimal | None, bool]]:
    base = base_currency(tenant)
    out: dict[int, tuple[dict[str, Any], Decimal | None, bool]] = {}
    for i in range(0, len(orders), BATCH):
        chunk = orders[i:i + BATCH]
        data = await load_batch(db, tenant, chunk, today=today, use_style_standard=False)
        processing, fx_unknown = await _processing_actual(db, tenant.id, base, [o.id for o in chunk])
        for o in chunk:
            out[o.id] = (build_order_cost(o, data, tenant), processing.get(o.id), o.id in fx_unknown)
    return out


async def compute_contribution(db: AsyncSession, tenant: Any, period: Period) -> ContributionResult:
    tid = tenant.id
    reasons: list[str] = []
    fg_groups = int((await db.execute(
        select(func.count(StockGroup.id)).where(StockGroup.tenant_id == tid, func.upper(func.coalesce(StockGroup.stock_nature, "")) == FG_NATURE)
    )).scalar() or 0)
    if not fg_groups:
        reasons.append("FG_STOCK_GROUP_NOT_MARKED")
    mv_date = _mv_date()
    in_period: dict[int, Decimal] = {}
    no_order_qty, no_order_rows = ZERO, 0
    for oid, qty, n in (
        await db.execute(
            _receipts_stmt(tid, StockMovement.order_id, func.coalesce(func.sum(StockMovement.quantity), 0), func.count(StockMovement.id))
            .where(mv_date >= period.start, mv_date <= period.end)
            .group_by(StockMovement.order_id)
        )
    ).all():
        if oid is None:
            no_order_qty, no_order_rows = Decimal(str(qty or 0)), int(n or 0)
        else:
            in_period[int(oid)] = Decimal(str(qty or 0))
    if no_order_rows:
        reasons.append("FG_RECEIPT_WITHOUT_ORDER")

    # Pipeline: confirmed orders due in the period (marketing gap needs their not-yet-received quantity).
    pipeline_orders = list(
        (
            await db.execute(
                select(Order).where(
                    Order.tenant_id == tid, confirmed_status_clause(),
                    Order.delivery_date >= period.start, Order.delivery_date <= period.end,
                ).order_by(Order.delivery_date, Order.id).limit(MAX_ORDERS + 1)
            )
        ).scalars().all()
    )
    truncated = len(pipeline_orders) > MAX_ORDERS or len(in_period) > MAX_ORDERS
    pipeline_orders = pipeline_orders[:MAX_ORDERS]
    received_ids = sorted(in_period)[:MAX_ORDERS]
    if truncated:
        reasons.append("ORDERS_TRUNCATED")
    all_ids = set(received_ids) | {o.id for o in pipeline_orders}
    before: dict[int, Decimal] = {}
    if all_ids:
        before = {
            int(oid): Decimal(str(qty or 0))
            for oid, qty in (
                await db.execute(
                    _receipts_stmt(tid, StockMovement.order_id, func.coalesce(func.sum(StockMovement.quantity), 0))
                    .where(StockMovement.order_id.in_(all_ids), mv_date < period.start)
                    .group_by(StockMovement.order_id)
                )
            ).all()
        }
    orders_by_id = {o.id: o for o in pipeline_orders}
    missing = [i for i in received_ids if i not in orders_by_id]
    if missing:
        for o in (await db.execute(select(Order).where(Order.tenant_id == tid, Order.id.in_(missing)))).scalars():
            orders_by_id[o.id] = o
    priced = await _price_orders(db, tenant, list(orders_by_id.values()), period.today)

    rows: list[OrderContribution] = []
    value = direct = contribution = counted_total = ZERO
    unknown = 0
    for oid in received_ids:
        order = orders_by_id.get(oid)
        if order is None:
            continue
        cost, proc, proc_fx = priced[oid]
        oc = price_order(order, cost, proc, proc_fx, before.get(oid, ZERO), in_period.get(oid, ZERO))
        rows.append(oc)
        if oc.contribution is None:
            unknown += 1
            continue
        value += oc.value
        direct += oc.direct_cost
        contribution += oc.contribution
        counted_total += oc.counted_qty

    p_contrib = p_value = ZERO
    p_unknown = 0
    book_value = book_contrib = ZERO
    for order in pipeline_orders:
        cost, proc, proc_fx = priced[order.id]
        received_total = before.get(order.id, ZERO) + in_period.get(order.id, ZERO)
        oc = price_order(order, cost, proc, proc_fx, ZERO, ZERO)
        if oc.cost_per_piece is None or oc.unit_price is None or oc.order_qty is None:
            p_unknown += 1
            continue
        book_value += oc.order_qty * oc.unit_price
        book_contrib += oc.order_qty * (oc.unit_price - oc.cost_per_piece)
        left = max(ZERO, oc.order_qty - received_total)
        p_value += q4(left * oc.unit_price)
        p_contrib += q4(left * (oc.unit_price - oc.cost_per_piece))
    book_pct = q4(book_contrib / book_value * HUNDRED) if book_value > ZERO else None
    if unknown:
        reasons.append("ORDER_COST_UNKNOWN")
    return ContributionResult(
        orders=rows, value=q4(value), direct_cost=q4(direct), contribution=q4(contribution), counted_qty=counted_total,
        unknown_orders=unknown, receipts_without_order_qty=no_order_qty, receipts_without_order_rows=no_order_rows,
        pipeline_contribution=q4(p_contrib), pipeline_value=q4(p_value), pipeline_orders=len(pipeline_orders),
        pipeline_unknown_orders=p_unknown, order_book_contribution_pct=book_pct, fg_groups=fg_groups,
        truncated=truncated, reason_codes=reasons,
    )


def _m(v: Decimal | None) -> str | None:
    return format(q4(v), "f") if v is not None else None


def order_out(o: OrderContribution) -> dict[str, Any]:
    return {
        "order_id": o.order_id, "order_code": o.order_code, "order_qty": _m(o.order_qty),
        "received_before": _m(o.received_before), "received_in_period": _m(o.received_in_period),
        "counted_qty": _m(o.counted_qty), "unit_price": _m(o.unit_price), "material": _m(o.material),
        "processing": _m(o.processing), "processing_source": o.processing_source, "selling": _m(o.selling),
        "cost_per_piece": _m(o.cost_per_piece), "value": _m(o.value), "direct_cost": _m(o.direct_cost),
        "contribution": _m(o.contribution),
        "contribution_pct": _m(o.contribution / o.value * HUNDRED) if o.contribution is not None and o.value else None,
        "cost_status": o.cost_status, "confidence": o.confidence, "revenue_source": o.revenue_source,
        "reason_codes": o.reason_codes, "value_class": "ESTIMATED",
    }
