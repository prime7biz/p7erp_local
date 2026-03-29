"""Shared deterministic promise checks for orders (ATP/CTP-style)."""

from __future__ import annotations

from collections import defaultdict
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Bom, BomItem, Item, Order, Quotation, StockMovement
from app.modules.orders.schemas import PromiseCheckLine, PromiseCheckOut


def _safe_float(value: str | int | float | None) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


async def run_order_promise_check(
    db: AsyncSession,
    *,
    tenant_id: int,
    order: Order,
    delivery_date_override: date | None = None,
    quantity_override: float | None = None,
) -> PromiseCheckOut:
    """Read-only ATP/CTP check used by workflow gates and planning intelligence.

    Optional overrides support what-if / sensitivity scans without mutating the order row.
    """
    resolved_order_id = order.id or 0
    reasons: list[str] = []
    lines: list[PromiseCheckLine] = []
    atp_ok = True
    ctp_ok = True

    effective_delivery = delivery_date_override if delivery_date_override is not None else order.delivery_date

    if not effective_delivery:
        ctp_ok = False
        reasons.append("Delivery date is missing")
    elif effective_delivery < date.today():
        ctp_ok = False
        reasons.append("Delivery date is in the past")

    if not order.quotation_id:
        atp_ok = False
        reasons.append("Order has no quotation linked for style/BOM resolution")
        return PromiseCheckOut(order_id=resolved_order_id, atp_ok=atp_ok, ctp_ok=ctp_ok, reasons=reasons, lines=lines)

    quotation = await db.get(Quotation, order.quotation_id)
    if not quotation or quotation.tenant_id != tenant_id or not quotation.style_id:
        atp_ok = False
        reasons.append("Order quotation/style is missing")
        return PromiseCheckOut(order_id=resolved_order_id, atp_ok=atp_ok, ctp_ok=ctp_ok, reasons=reasons, lines=lines)

    order_qty = _safe_float(quantity_override) if quantity_override is not None else _safe_float(order.quantity)
    if order_qty <= 0:
        atp_ok = False
        reasons.append("Order quantity must be positive")
        return PromiseCheckOut(order_id=resolved_order_id, atp_ok=atp_ok, ctp_ok=ctp_ok, reasons=reasons, lines=lines)

    bom_result = await db.execute(
        select(Bom)
        .where(
            Bom.tenant_id == tenant_id,
            Bom.style_id == quotation.style_id,
            Bom.status.in_(("APPROVED", "FROZEN")),
        )
        .order_by(Bom.version_no.desc())
        .limit(1)
    )
    bom = bom_result.scalar_one_or_none()
    if not bom:
        atp_ok = False
        reasons.append("No APPROVED/FROZEN BOM found for order style")
        return PromiseCheckOut(order_id=resolved_order_id, atp_ok=atp_ok, ctp_ok=ctp_ok, reasons=reasons, lines=lines)

    bom_lines = (
        await db.execute(
            select(BomItem).where(
                BomItem.tenant_id == tenant_id,
                BomItem.bom_id == bom.id,
                BomItem.item_id.is_not(None),
            )
        )
    ).scalars().all()
    if not bom_lines:
        atp_ok = False
        reasons.append("BOM has no inventory-linked items")
        return PromiseCheckOut(order_id=resolved_order_id, atp_ok=atp_ok, ctp_ok=ctp_ok, reasons=reasons, lines=lines)

    item_ids = [line.item_id for line in bom_lines if line.item_id is not None]
    items_result = (await db.execute(select(Item).where(Item.tenant_id == tenant_id, Item.id.in_(item_ids)))).scalars().all()
    items_by_id = {i.id: i for i in items_result}

    mov_result = (
        await db.execute(
            select(StockMovement).where(
                StockMovement.tenant_id == tenant_id,
                StockMovement.item_id.in_(item_ids),
            )
        )
    ).scalars().all()
    in_qty_by_item: dict[int, float] = defaultdict(float)
    out_qty_by_item: dict[int, float] = defaultdict(float)
    for m in mov_result:
        q = _safe_float(m.quantity)
        mt = (m.movement_type or "").upper()
        if mt == "IN":
            in_qty_by_item[m.item_id] += q
        elif mt == "OUT":
            out_qty_by_item[m.item_id] += q

    for line in bom_lines:
        if line.item_id is None:
            continue
        item = items_by_id.get(line.item_id)
        if not item:
            continue
        base = _safe_float(line.base_consumption)
        wastage = _safe_float(line.wastage_pct) / 100.0
        required_qty = order_qty * base * (1.0 + wastage)
        in_qty = in_qty_by_item.get(line.item_id, 0.0)
        out_qty = out_qty_by_item.get(line.item_id, 0.0)
        available_qty = round(in_qty - out_qty, 4)
        shortage_qty = round(max(0.0, required_qty - available_qty), 4)
        if shortage_qty > 0:
            atp_ok = False
        lines.append(
            PromiseCheckLine(
                item_id=line.item_id,
                item_code=item.item_code or str(line.item_id),
                required_qty=round(required_qty, 4),
                available_qty=available_qty,
                shortage_qty=shortage_qty,
            )
        )

    if not atp_ok:
        reasons.append("Insufficient stock for one or more BOM items")
    return PromiseCheckOut(order_id=resolved_order_id, atp_ok=atp_ok, ctp_ok=ctp_ok, reasons=reasons, lines=lines)
