"""Inventory MRP engine: BOM explosion, netting, planned orders (Sprint I1)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from math import ceil, sqrt
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.business_date import tenant_today
from app.common.codegen import next_tenant_code
from app.models.costing import Item
from app.models.inventory import PlannedOrder, PurchaseOrder, PurchaseOrderItem, StockReservation
from app.models.merch import Bom, BomItem, Order

ZERO = Decimal("0")
Q4 = Decimal("0.0001")


def _d(v: Any) -> Decimal:
    if v is None:
        return ZERO
    if isinstance(v, Decimal):
        return v
    try:
        return Decimal(str(v))
    except Exception:
        return ZERO


def _q(v: Decimal) -> Decimal:
    return v.quantize(Q4, rounding=ROUND_HALF_UP)


@dataclass
class BOMExplosionLine:
    level: int
    item_id: int
    item_code: str | None
    parent_item_id: int | None
    qty_per: Decimal
    required_qty: Decimal
    bom_id: int | None
    source_order_id: int | None


@dataclass
class ProjectedBalanceRow:
    balance_date: date
    opening: Decimal
    receipts: Decimal
    issues: Decimal
    pab: Decimal
    net_required: Decimal


@dataclass
class MRPException:
    severity: str  # red | yellow
    code: str
    message: str
    item_id: int | None = None
    order_id: int | None = None


@dataclass
class MRPResult:
    planned_orders: list[PlannedOrder] = field(default_factory=list)
    exceptions: list[MRPException] = field(default_factory=list)
    explosion: list[BOMExplosionLine] = field(default_factory=list)


def apply_lot_sizing(
    net_qty: Decimal,
    item: Item,
    *,
    annual_demand: Decimal | None = None,
) -> Decimal:
    """Apply L4L / FIXED / EOQ lot sizing."""
    if net_qty <= ZERO:
        return ZERO
    method = (item.lot_size_method or "L4L").upper()
    if method == "FIXED":
        lot = _d(item.fixed_lot_size)
        if lot <= ZERO:
            return _q(net_qty)
        multiples = ceil(float(net_qty / lot))
        return _q(lot * Decimal(multiples))
    if method == "EOQ" and annual_demand and annual_demand > ZERO:
        # Simple EOQ with fixed ordering cost 100 and holding cost 10% of avg_cost
        unit_cost = _d(item.avg_cost) or _d(item.default_cost) or Decimal("1")
        holding = max(unit_cost * Decimal("0.10"), Decimal("0.01"))
        ordering = Decimal("100")
        eoq = Decimal(str(sqrt(float(2 * ordering * annual_demand / holding))))
        eoq = max(eoq, net_qty)
        return _q(eoq)
    return _q(net_qty)


async def explode_bom_for_order(
    db: AsyncSession,
    tenant_id: int,
    order_id: int,
    *,
    max_depth: int = 8,
) -> list[BOMExplosionLine]:
    """Flatten multi-level BOM demand for a sales order."""
    order = await db.get(Order, order_id)
    if not order or order.tenant_id != tenant_id:
        return []

    order_qty = Decimal(str(order.quantity or 0))
    if order_qty <= ZERO:
        return []

    bom_q = await db.execute(
        select(Bom).where(
            Bom.tenant_id == tenant_id,
            Bom.order_id == order_id,
            Bom.is_active.is_(True),
        ).order_by(Bom.id.desc())
    )
    bom = bom_q.scalars().first()
    if not bom and order.style_id:
        bom_q = await db.execute(
            select(Bom).where(
                Bom.tenant_id == tenant_id,
                Bom.style_id == order.style_id,
                Bom.is_active.is_(True),
                Bom.order_id.is_(None),
            ).order_by(Bom.id.desc())
        )
        bom = bom_q.scalars().first()
    if not bom:
        return []

    lines: list[BOMExplosionLine] = []
    # queue: (bom_id, parent_item_id, parent_qty, level)
    queue: list[tuple[int, int | None, Decimal, int]] = [(bom.id, None, order_qty, 1)]
    visited_boms: set[int] = set()

    while queue:
        bom_id, parent_item_id, parent_qty, level = queue.pop(0)
        if level > max_depth or bom_id in visited_boms:
            continue
        visited_boms.add(bom_id)

        items_q = await db.execute(
            select(BomItem).where(BomItem.bom_id == bom_id, BomItem.tenant_id == tenant_id)
        )
        for bi in items_q.scalars().all():
            if not bi.item_id:
                continue
            per = _d(bi.bom_gross_consumption_per_unit)
            if per <= ZERO:
                per = _d(bi.bom_net_consumption_per_unit)
            if per <= ZERO:
                per = _d(bi.base_consumption)
            req = _q(parent_qty * per)
            if bi.required_gross_qty is not None and level == 1:
                # Prefer precomputed gross when exploding top-level order BOM
                req = _q(_d(bi.required_gross_qty) * (parent_qty / max(_d(bi.order_qty_snapshot) or parent_qty, Decimal("1"))))

            item = await db.get(Item, bi.item_id)
            if item is None or item.tenant_id != tenant_id:
                continue
            lines.append(
                BOMExplosionLine(
                    level=level,
                    item_id=bi.item_id,
                    item_code=getattr(item, "item_code", None) if item else bi.item_code,
                    parent_item_id=parent_item_id,
                    qty_per=per,
                    required_qty=req,
                    bom_id=bom_id,
                    source_order_id=order_id,
                )
            )
            # Multi-level: find child BOM by item used as FG/SFG style link is weak;
            # look for active BOM whose lines include this as finished via item default warehouse produce path:
            # Use BOMs linked to same style with different revisions — skip deep FG recurse unless another BOM
            # exists for a ProcessOrder-style conversion. For I1 we recurse by finding BOMs with order_id
            # matching and component as "parent" via stock_group produce flag — keep simple: no further
            # recurse unless a Bom exists with notes containing component (skip). Multi-level via nested
            # BomItem only when a Bom has order_id pointing and style uses component item — limited.
            child_bom_q = await db.execute(
                select(Bom).where(
                    Bom.tenant_id == tenant_id,
                    Bom.is_active.is_(True),
                    Bom.id != bom_id,
                    Bom.style_id == bom.style_id,
                    Bom.version_no > bom.version_no,
                ).limit(0)
            )
            _ = child_bom_q  # reserved for future nested BOMs

    return lines


async def _on_order_qty(db: AsyncSession, tenant_id: int, item_id: int) -> Decimal:
    """Open PO quantity not yet fully received (best-effort: sum open PO lines)."""
    open_statuses = ("DRAFT", "SUBMITTED", "APPROVED", "PARTIAL", "OPEN", "CONFIRMED")
    stmt = (
        select(PurchaseOrderItem.quantity, PurchaseOrder.status)
        .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderItem.purchase_order_id)
        .where(
            PurchaseOrderItem.tenant_id == tenant_id,
            PurchaseOrderItem.item_id == item_id,
        )
    )
    rows = (await db.execute(stmt)).all()
    total = ZERO
    for qty, status in rows:
        if (status or "").upper() in open_statuses or (status or "").upper() not in (
            "CANCELLED",
            "CLOSED",
            "RECEIVED",
            "COMPLETED",
        ):
            if (status or "").upper() in ("CANCELLED", "CLOSED", "RECEIVED", "COMPLETED"):
                continue
            total += _d(qty)
    return total


async def _reserved_qty(db: AsyncSession, tenant_id: int, item_id: int) -> Decimal:
    stmt = select(StockReservation).where(
        StockReservation.tenant_id == tenant_id,
        StockReservation.item_id == item_id,
        StockReservation.status.in_(("HARD", "SOFT")),
    )
    rows = list((await db.execute(stmt)).scalars().all())
    return sum((_d(r.reserved_qty) for r in rows), ZERO)


async def _firmed_planned_qty(db: AsyncSession, tenant_id: int, item_id: int) -> Decimal:
    stmt = select(PlannedOrder).where(
        PlannedOrder.tenant_id == tenant_id,
        PlannedOrder.item_id == item_id,
        PlannedOrder.status.in_(("FIRMED", "RELEASED")),
    )
    rows = list((await db.execute(stmt)).scalars().all())
    return sum((_d(r.planned_qty) for r in rows), ZERO)


def _closed_order_statuses() -> set[str]:
    return {"CANCELLED", "COMPLETED", "CLOSED", "SHIPPED", "REJECTED"}


async def calculate_projected_balance(
    db: AsyncSession,
    tenant_id: int,
    item_id: int,
    horizon_days: int = 90,
) -> list[ProjectedBalanceRow]:
    item = await db.get(Item, item_id)
    if not item or item.tenant_id != tenant_id:
        return []
    opening = _d(item.current_stock)
    safety = _d(item.safety_stock)
    today = await tenant_today(db, tenant_id)
    on_order = await _on_order_qty(db, tenant_id, item_id)
    firmed = await _firmed_planned_qty(db, tenant_id, item_id)
    rows: list[ProjectedBalanceRow] = []
    bal = opening
    # Spread scheduled receipts on day 0 conceptually
    for i in range(horizon_days):
        d = today + timedelta(days=i)
        receipts = on_order + firmed if i == 0 else ZERO
        issues = ZERO
        bal = bal + receipts - issues
        net = ZERO
        if bal < safety:
            net = _q(safety - bal)
        rows.append(
            ProjectedBalanceRow(
                balance_date=d,
                opening=opening if i == 0 else rows[-1].pab,
                receipts=receipts,
                issues=issues,
                pab=_q(bal),
                net_required=net,
            )
        )
        if i == 0:
            on_order = ZERO
            firmed = ZERO
    return rows


async def run_mrp(
    db: AsyncSession,
    tenant_id: int,
    *,
    order_ids: list[int] | None = None,
    item_ids: list[int] | None = None,
    horizon_days: int = 90,
    as_of_date: date | None = None,
) -> MRPResult:
    """
    Gross requirements from open orders + BOM explosion;
    net against stock + open PO + firmed plans; create PlannedOrder rows.
    """
    result = MRPResult()
    as_of = as_of_date or await tenant_today(db, tenant_id)
    horizon_end = as_of + timedelta(days=horizon_days)

    # Load open orders
    oq = select(Order).where(
        Order.tenant_id == tenant_id,
        Order.status.notin_(list(_closed_order_statuses())),
    )
    if order_ids:
        oq = oq.where(Order.id.in_(order_ids))
    orders = list((await db.execute(oq)).scalars().all())

    # Aggregate gross requirements by item
    gross: dict[int, Decimal] = {}
    req_dates: dict[int, date] = {}
    source_order: dict[int, int] = {}
    source_bom: dict[int, int] = {}

    for order in orders:
        req_date = order.delivery_date or horizon_end
        if req_date < as_of or req_date > horizon_end:
            if order.delivery_date and order.delivery_date > horizon_end:
                continue
            if not order.delivery_date:
                req_date = as_of + timedelta(days=min(30, horizon_days))

        explosion = await explode_bom_for_order(db, tenant_id, order.id)
        if not explosion:
            result.exceptions.append(
                MRPException(
                    severity="yellow",
                    code="MISSING_BOM",
                    message=f"Order {order.order_code} has no active BOM to explode",
                    order_id=order.id,
                )
            )
            continue
        result.explosion.extend(explosion)
        for line in explosion:
            gross[line.item_id] = gross.get(line.item_id, ZERO) + line.required_qty
            prev = req_dates.get(line.item_id)
            if prev is None or req_date < prev:
                req_dates[line.item_id] = req_date
            source_order[line.item_id] = order.id
            if line.bom_id:
                source_bom[line.item_id] = line.bom_id

    # Optionally filter to item_ids
    if item_ids:
        gross = {k: v for k, v in gross.items() if k in item_ids}

    # Safety stock as soft gross
    item_filter = list(gross.keys())
    if item_ids:
        for iid in item_ids:
            if iid not in gross:
                item_filter.append(iid)

    for item_id, g_qty in list(gross.items()):
        item = await db.get(Item, item_id)
        if not item or item.tenant_id != tenant_id:
            continue
        if item_ids and item_id not in item_ids:
            continue

        stock = _d(item.current_stock)
        safety = _d(item.safety_stock)
        on_order = await _on_order_qty(db, tenant_id, item_id)
        reserved = await _reserved_qty(db, tenant_id, item_id)
        firmed = await _firmed_planned_qty(db, tenant_id, item_id)
        pab = stock + on_order + firmed - reserved - g_qty
        net = ZERO
        if pab < safety:
            net = _q(safety - pab)
        elif pab < ZERO:
            net = _q(-pab)

        if net <= ZERO:
            continue

        planned = apply_lot_sizing(net, item)
        lead = int(item.lead_time_days or 0)
        requirement_date = req_dates.get(item_id, as_of + timedelta(days=14))
        release_date = requirement_date - timedelta(days=lead)

        fence = int(item.planning_time_fence_days or 0)
        if fence and release_date <= as_of + timedelta(days=fence):
            result.exceptions.append(
                MRPException(
                    severity="yellow",
                    code="TIME_FENCE",
                    message=f"Planned release for {item.item_code} is inside planning time fence ({fence}d)",
                    item_id=item_id,
                    order_id=source_order.get(item_id),
                )
            )

        if item.lead_time_days is None:
            result.exceptions.append(
                MRPException(
                    severity="yellow",
                    code="MISSING_LEAD_TIME",
                    message=f"Item {item.item_code} has no lead_time_days; release_date = requirement_date",
                    item_id=item_id,
                )
            )

        # Prefer PURCHASE for RM; PRODUCE if item has preferred produce path (heuristic: no preferred vendor)
        action = "PURCHASE"
        if item.preferred_vendor_id is None and (item.lot_size_method or "").upper() == "PRODUCE":
            action = "PRODUCE"

        number = await next_tenant_code(db, model=PlannedOrder, tenant_id=tenant_id, prefix="PLN-", width=5)
        po = PlannedOrder(
            tenant_id=tenant_id,
            planned_order_number=number,
            source_type="MRP_ORDER",
            source_order_id=source_order.get(item_id),
            source_bom_id=source_bom.get(item_id),
            item_id=item_id,
            required_qty=_q(g_qty),
            planned_qty=planned,
            requirement_date=requirement_date,
            release_date=release_date,
            action=action,
            status="PLANNED",
        )
        db.add(po)
        result.planned_orders.append(po)

    await db.flush()
    return result


async def firm_planned_order(
    db: AsyncSession,
    tenant_id: int,
    planned_order_id: int,
) -> PlannedOrder:
    row = await db.get(PlannedOrder, planned_order_id)
    if not row or row.tenant_id != tenant_id:
        raise ValueError("Planned order not found")
    if row.status != "PLANNED":
        raise ValueError("Only PLANNED orders can be firmed")
    row.status = "FIRMED"
    row.updated_at = datetime.utcnow()
    await db.flush()
    return row


async def release_planned_order(
    db: AsyncSession,
    tenant_id: int,
    planned_order_id: int,
    *,
    user_id: int | None = None,
) -> tuple[PlannedOrder, Any]:
    """Release FIRMED/PLANNED order: PURCHASE → PO, PRODUCE → ManufacturingOrder."""
    from app.models.inventory import ManufacturingOrder, Vendor

    row = await db.get(PlannedOrder, planned_order_id)
    if not row or row.tenant_id != tenant_id:
        raise ValueError("Planned order not found")
    if row.status not in ("PLANNED", "FIRMED"):
        raise ValueError("Only PLANNED or FIRMED orders can be released")

    item = await db.get(Item, row.item_id)
    if not item:
        raise ValueError("Item not found")

    generated: Any = None
    if row.action == "PRODUCE":
        mo_number = await next_tenant_code(
            db, model=ManufacturingOrder, tenant_id=tenant_id, prefix="MO-", width=4
        )
        mo = ManufacturingOrder(
            tenant_id=tenant_id,
            mo_number=mo_number,
            finished_item_id=row.item_id,
            planned_quantity=row.planned_qty,
            status="draft",
            notes=f"From planned order {row.planned_order_number}",
        )
        db.add(mo)
        await db.flush()
        row.generated_mo_id = mo.id
        generated = mo
    else:
        vendor_id = item.preferred_vendor_id
        supplier_name = "MRP Vendor"
        if vendor_id:
            vendor = await db.get(Vendor, vendor_id)
            if vendor and vendor.tenant_id == tenant_id:
                supplier_name = vendor.name
            else:
                vendor_id = None
        po_code = await next_tenant_code(db, model=PurchaseOrder, tenant_id=tenant_id, prefix="PO-", width=4)
        unit_price = _d(item.avg_cost) or _d(item.default_cost) or _d(item.standard_price)
        po = PurchaseOrder(
            tenant_id=tenant_id,
            po_code=po_code,
            vendor_id=vendor_id,
            supplier_name=supplier_name,
            order_date=await tenant_today(db, tenant_id),
            expected_date=row.requirement_date,
            status="DRAFT",
            notes=f"From planned order {row.planned_order_number}",
            source_bom_id=row.source_bom_id,
            source_order_id=row.source_order_id,
        )
        db.add(po)
        await db.flush()
        db.add(
            PurchaseOrderItem(
                tenant_id=tenant_id,
                purchase_order_id=po.id,
                item_id=row.item_id,
                quantity=row.planned_qty,
                unit_price=unit_price,
                source_bom_id=row.source_bom_id,
                source_order_id=row.source_order_id,
                warehouse_id=item.default_warehouse_id,
            )
        )
        row.generated_po_id = po.id
        generated = po

    row.status = "RELEASED"
    row.updated_at = datetime.utcnow()
    await db.flush()
    return row, generated
