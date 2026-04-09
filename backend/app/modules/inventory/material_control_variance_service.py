"""Quoted vs approved BOM vs actual consumption variance (order-scoped)."""

from __future__ import annotations

from sqlalchemy import Numeric, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Bom, BomItem, Order, StockMovement


async def actual_issued_qty_for_bom_line(
    db: AsyncSession,
    tenant_id: int,
    order_id: int,
    bom_line_id: int,
) -> float:
    """Sum OUT movements tied to this order + BOM line."""
    r = await db.execute(
        select(func.coalesce(func.sum(cast(StockMovement.quantity, Numeric(18, 4))), 0)).where(
            StockMovement.tenant_id == tenant_id,
            StockMovement.movement_type == "OUT",
            StockMovement.order_id == order_id,
            StockMovement.bom_line_id == bom_line_id,
        )
    )
    return float(r.scalar() or 0)


async def build_order_material_variance(
    db: AsyncSession,
    *,
    tenant_id: int,
    order_id: int,
) -> dict:
    """Aggregate BOM lines with quoted vs BOM vs actual issue variances."""
    order = await db.get(Order, order_id)
    if not order or order.tenant_id != tenant_id:
        return {"ok": False, "detail": "Order not found"}

    bom = (
        await db.execute(
            select(Bom).where(
                Bom.tenant_id == tenant_id,
                Bom.order_id == order_id,
                Bom.is_active.is_(True),
            )
        )
    ).scalars().first()
    if not bom:
        return {"ok": False, "detail": "No active BOM for order"}

    lines = (
        await db.execute(
            select(BomItem)
            .where(BomItem.tenant_id == tenant_id, BomItem.bom_id == bom.id)
            .order_by(BomItem.sort_order, BomItem.id)
        )
    ).scalars().all()

    items: list[dict] = []
    for line in lines:
        q_net = float(line.quoted_consumption_per_unit or 0)
        b_net = float(line.bom_net_consumption_per_unit or 0)
        b_gross = float(line.required_gross_qty or 0)
        actual = await actual_issued_qty_for_bom_line(db, tenant_id, order_id, line.id)
        cons_var_pct = None
        if q_net > 1e-9:
            cons_var_pct = round((b_net - q_net) / q_net * 100.0, 4)
        bom_vs_actual = None
        if b_gross > 1e-9:
            bom_vs_actual = round((actual - b_gross) / b_gross * 100.0, 4)
        quoted_vs_actual = None
        q_total = q_net * float(order.quantity or 0)
        if q_total > 1e-9:
            quoted_vs_actual = round((actual - q_total) / q_total * 100.0, 4)

        items.append(
            {
                "bom_line_id": line.id,
                "item_id": line.item_id,
                "description": line.description or line.description_snapshot,
                "quoted_consumption_per_unit": q_net,
                "quoted_total_need": round(q_total, 4),
                "bom_net_per_unit": b_net,
                "bom_gross_required": b_gross,
                "wastage_qty": float(line.wastage_qty or 0),
                "process_loss_qty": float(line.process_loss_qty or 0),
                "actual_issued_qty": round(actual, 4),
                "quoted_vs_bom_consumption_pct": cons_var_pct,
                "bom_vs_actual_pct": bom_vs_actual,
                "quoted_vs_actual_pct": quoted_vs_actual,
            }
        )

    return {
        "ok": True,
        "order_id": order_id,
        "bom_id": bom.id,
        "order_qty": order.quantity,
        "lines": items,
    }
