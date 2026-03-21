"""FIFO inventory costing using inventory_cost_layers."""

from __future__ import annotations

from datetime import date

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    GoodsReceiving,
    GoodsReceivingItem,
    InventoryCostLayer,
    Item,
    ProcessOrder,
    PurchaseOrderItem,
    StockMovement,
)


def _q(value: str | None) -> float:
    try:
        return float(value or "0")
    except (TypeError, ValueError):
        return 0.0


def _money(v: float) -> str:
    return f"{round(v, 4):.4f}"


def _uc(v: float) -> str:
    return f"{round(v, 6):.6f}"


async def fifo_process_inbound(
    db: AsyncSession,
    tenant_id: int,
    movement: StockMovement,
    unit_cost: float,
) -> None:
    if (movement.movement_type or "").upper() != "IN":
        return
    qty = _q(movement.quantity)
    if qty <= 0:
        return
    dup = (
        await db.execute(select(InventoryCostLayer).where(InventoryCostLayer.source_movement_id == movement.id))
    ).scalars().first()
    if dup:
        return
    uc = max(unit_cost, 0.0)
    total = round(qty * uc, 4)
    layer = InventoryCostLayer(
        tenant_id=tenant_id,
        item_id=movement.item_id,
        warehouse_id=movement.warehouse_id,
        source_movement_id=movement.id,
        qty_original=str(qty),
        qty_remaining=str(qty),
        unit_cost=_uc(uc),
        layer_date=movement.movement_date or date.today(),
    )
    db.add(layer)
    movement.unit_cost = _uc(uc)
    movement.movement_value = _money(total)


async def fifo_process_outbound(db: AsyncSession, tenant_id: int, movement: StockMovement) -> float:
    if (movement.movement_type or "").upper() != "OUT":
        return 0.0
    qty_need = _q(movement.quantity)
    if qty_need <= 0:
        return 0.0
    if movement.movement_value and _q(movement.movement_value) > 0:
        return _q(movement.movement_value)

    stmt = select(InventoryCostLayer).where(
        InventoryCostLayer.tenant_id == tenant_id,
        InventoryCostLayer.item_id == movement.item_id,
    )
    if movement.warehouse_id is None:
        stmt = stmt.where(InventoryCostLayer.warehouse_id.is_(None))
    else:
        stmt = stmt.where(InventoryCostLayer.warehouse_id == movement.warehouse_id)
    stmt = stmt.order_by(InventoryCostLayer.id)
    layers = list((await db.execute(stmt)).scalars().all())

    remaining = qty_need
    total_val = 0.0
    for layer in layers:
        if remaining <= 1e-12:
            break
        qr = _q(layer.qty_remaining)
        if qr <= 0:
            continue
        take = min(qr, remaining)
        layer.qty_remaining = str(round(qr - take, 6))
        uc = _q(layer.unit_cost)
        total_val += take * uc
        remaining -= take

    if remaining > 1e-9:
        item = await db.get(Item, movement.item_id)
        dc = _q(getattr(item, "default_cost", None) if item and item.tenant_id == tenant_id else "0")
        total_val += remaining * dc
        remaining = 0.0

    movement.unit_cost = _uc(total_val / qty_need if qty_need else 0.0)
    movement.movement_value = _money(total_val)
    return total_val


async def resolve_in_unit_cost(
    db: AsyncSession,
    tenant_id: int,
    movement: StockMovement,
) -> float:
    """Unit cost for an inbound movement (GRN, transfer-in, process output, adjustment IN, etc.)."""
    item = await db.get(Item, movement.item_id)
    dc = _q(getattr(item, "default_cost", None) if item and item.tenant_id == tenant_id else "0")
    rt = (movement.reference_type or "").upper()
    rid = movement.reference_id

    if rt == "GRN" and rid:
        grn = await db.get(GoodsReceiving, rid)
        if grn and grn.tenant_id == tenant_id:
            if grn.purchase_order_id:
                pl = (
                    await db.execute(
                        select(PurchaseOrderItem).where(
                            PurchaseOrderItem.purchase_order_id == grn.purchase_order_id,
                            PurchaseOrderItem.item_id == movement.item_id,
                        )
                    )
                ).scalars().first()
                if pl:
                    return _q(pl.unit_price)
        return dc

    if rt == "WAREHOUSE_TRANSFER" and rid:
        out_mv = (
            await db.execute(
                select(StockMovement)
                .where(
                    StockMovement.tenant_id == tenant_id,
                    StockMovement.reference_type == "WAREHOUSE_TRANSFER",
                    StockMovement.reference_id == rid,
                    StockMovement.item_id == movement.item_id,
                    StockMovement.movement_type == "OUT",
                    StockMovement.id < movement.id,
                )
                .order_by(StockMovement.id.desc())
                .limit(1)
            )
        ).scalars().first()
        if out_mv:
            q = _q(out_mv.quantity)
            if q > 0 and out_mv.movement_value:
                return _q(out_mv.movement_value) / q
        return dc

    if rt == "PROCESS_ORDER" and rid:
        po = await db.get(ProcessOrder, rid)
        if po and po.tenant_id == tenant_id:
            outs = (
                await db.execute(
                    select(StockMovement).where(
                        StockMovement.tenant_id == tenant_id,
                        StockMovement.reference_type == "PROCESS_ORDER",
                        StockMovement.reference_id == rid,
                        StockMovement.movement_type == "OUT",
                        StockMovement.item_id == po.input_item_id,
                    )
                )
            ).scalars().all()
            input_cost = sum(_q(m.movement_value or "0") for m in outs)
            proc = _q(po.processing_charges or "0")
            out_qty = _q(movement.quantity)
            if out_qty > 0:
                return (input_cost + proc) / out_qty
        return dc

    return dc


async def finalize_movement_fifo(
    db: AsyncSession,
    tenant_id: int,
    movement: StockMovement,
    *,
    in_unit_cost: float | None = None,
) -> None:
    """Apply FIFO layer logic after StockMovement row is flushed (has id)."""
    mt = (movement.movement_type or "").upper()
    if mt == "IN":
        uc = in_unit_cost if in_unit_cost is not None else await resolve_in_unit_cost(db, tenant_id, movement)
        await fifo_process_inbound(db, tenant_id, movement, uc)
    elif mt == "OUT":
        await fifo_process_outbound(db, tenant_id, movement)


async def rebuild_fifo_layers_for_tenant(db: AsyncSession, tenant_id: int) -> dict[str, int]:
    """Clear layers and movement costs, replay all movements in chronological order."""
    await db.execute(delete(InventoryCostLayer).where(InventoryCostLayer.tenant_id == tenant_id))
    await db.execute(
        update(StockMovement)
        .where(StockMovement.tenant_id == tenant_id)
        .values(unit_cost=None, movement_value=None)
    )

    mvs = (
        await db.execute(
            select(StockMovement)
            .where(StockMovement.tenant_id == tenant_id)
            .order_by(StockMovement.movement_date.asc().nullsfirst(), StockMovement.id)
        )
    ).scalars().all()

    processed = 0
    for mv in mvs:
        await finalize_movement_fifo(db, tenant_id, mv, in_unit_cost=None)
        processed += 1
    await db.flush()
    return {"movements_replayed": processed}


async def fifo_on_hand_value(
    db: AsyncSession,
    tenant_id: int,
    *,
    as_of_date: date | None = None,
) -> float:
    """Sum of qty_remaining * unit_cost for open layers (optional as-of by layer_date)."""
    stmt = select(InventoryCostLayer).where(InventoryCostLayer.tenant_id == tenant_id)
    if as_of_date is not None:
        stmt = stmt.where(
            InventoryCostLayer.layer_date.is_not(None),
            InventoryCostLayer.layer_date <= as_of_date,
        )
    layers = list((await db.execute(stmt)).scalars().all())
    total = 0.0
    for layer in layers:
        total += _q(layer.qty_remaining) * _q(layer.unit_cost)
    return round(total, 4)
