"""Warehouse-aware stock availability for ATP (on-hand, in-transit PO, reservations)."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    GoodsReceiving,
    GoodsReceivingItem,
    PurchaseOrder,
    PurchaseOrderItem,
    StockMovement,
    StockReservation,
)

_OPEN_PO_STATUSES = frozenset({"APPROVED", "PARTIALLY_RECEIVED"})


def _parse_qty(value: str | int | float | None) -> float:
    if value is None:
        return 0.0
    try:
        return float(str(value).strip() or 0)
    except (TypeError, ValueError):
        return 0.0


@dataclass(frozen=True)
class ItemAvailability:
    item_id: int
    on_hand: float
    in_transit: float
    reserved: float
    available: float


async def compute_items_availability(
    db: AsyncSession,
    tenant_id: int,
    item_ids: list[int],
    *,
    warehouse_id: int | None = None,
    include_in_transit_po: bool = True,
    exclude_reserved: bool = True,
) -> dict[int, ItemAvailability]:
    """Batch availability for many items (single round-trip per sub-query where possible)."""
    if not item_ids:
        return {}

    unique_ids = list({int(i) for i in item_ids})
    on_hand: dict[int, float] = defaultdict(float)

    mov_stmt = select(
        StockMovement.item_id,
        StockMovement.movement_type,
        StockMovement.quantity,
    ).where(StockMovement.tenant_id == tenant_id, StockMovement.item_id.in_(unique_ids))
    if warehouse_id is not None:
        mov_stmt = mov_stmt.where(StockMovement.warehouse_id == warehouse_id)

    mov_rows = (await db.execute(mov_stmt)).all()
    for item_id, movement_type, quantity in mov_rows:
        q = _parse_qty(quantity)
        mt = (movement_type or "").upper()
        if mt == "IN":
            on_hand[item_id] += q
        elif mt == "OUT":
            on_hand[item_id] -= q
        elif mt == "ADJUST":
            on_hand[item_id] += q

    reserved_by_item: dict[int, float] = defaultdict(float)
    if exclude_reserved:
        res_stmt = select(
            StockReservation.item_id,
            func.coalesce(func.sum(StockReservation.reserved_qty), 0),
        ).where(
            StockReservation.tenant_id == tenant_id,
            StockReservation.item_id.in_(unique_ids),
            StockReservation.status.in_(("SOFT", "HARD")),
        )
        if warehouse_id is not None:
            res_stmt = res_stmt.where(
                or_(
                    StockReservation.warehouse_id.is_(None),
                    StockReservation.warehouse_id == warehouse_id,
                )
            )
        res_stmt = res_stmt.group_by(StockReservation.item_id)
        for iid, total in (await db.execute(res_stmt)).all():
            reserved_by_item[int(iid)] = float(total or 0)

    in_transit_by_item: dict[int, float] = defaultdict(float)
    if include_in_transit_po:
        poi_stmt = (
            select(
                PurchaseOrderItem.id,
                PurchaseOrderItem.item_id,
                PurchaseOrderItem.quantity,
            )
            .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderItem.purchase_order_id)
            .where(
                PurchaseOrderItem.tenant_id == tenant_id,
                PurchaseOrderItem.item_id.in_(unique_ids),
                PurchaseOrder.status.in_(tuple(_OPEN_PO_STATUSES)),
            )
        )
        if warehouse_id is not None:
            poi_stmt = poi_stmt.where(
                or_(
                    PurchaseOrderItem.warehouse_id.is_(None),
                    PurchaseOrderItem.warehouse_id == warehouse_id,
                )
            )
        po_lines = list((await db.execute(poi_stmt)).all())
        line_ids = [int(r[0]) for r in po_lines]
        recv_by_line: dict[int, float] = defaultdict(float)
        if line_ids:
            gri_stmt = (
                select(
                    GoodsReceivingItem.purchase_order_line_id,
                    GoodsReceivingItem.accepted_qty,
                    GoodsReceivingItem.received_qty,
                )
                .join(GoodsReceiving, GoodsReceiving.id == GoodsReceivingItem.goods_receiving_id)
                .where(
                    GoodsReceiving.tenant_id == tenant_id,
                    GoodsReceivingItem.purchase_order_line_id.in_(line_ids),
                    GoodsReceiving.status == "RECEIVED",
                )
            )
            for plid, accepted_qty, received_qty in (await db.execute(gri_stmt)).all():
                if plid is None:
                    continue
                qty = _parse_qty(accepted_qty)
                if qty <= 0:
                    qty = _parse_qty(received_qty)
                recv_by_line[int(plid)] += qty

        for _lid, item_id, qty_s in po_lines:
            ordered = _parse_qty(qty_s)
            got = recv_by_line.get(int(_lid), 0.0)
            in_transit_by_item[int(item_id)] += max(0.0, ordered - got)

    out: dict[int, ItemAvailability] = {}
    for iid in unique_ids:
        oh = round(on_hand.get(iid, 0.0), 4)
        it = round(in_transit_by_item.get(iid, 0.0), 4)
        res = round(reserved_by_item.get(iid, 0.0), 4)
        avail = round(oh + it - res, 4)
        out[iid] = ItemAvailability(
            item_id=iid,
            on_hand=oh,
            in_transit=it,
            reserved=res,
            available=avail,
        )
    return out


async def compute_item_availability(
    db: AsyncSession,
    tenant_id: int,
    item_id: int,
    *,
    warehouse_id: int | None = None,
    include_in_transit_po: bool = True,
    exclude_reserved: bool = True,
) -> ItemAvailability:
    m = await compute_items_availability(
        db,
        tenant_id,
        [item_id],
        warehouse_id=warehouse_id,
        include_in_transit_po=include_in_transit_po,
        exclude_reserved=exclude_reserved,
    )
    return m.get(
        item_id,
        ItemAvailability(
            item_id=item_id,
            on_hand=0.0,
            in_transit=0.0,
            reserved=0.0,
            available=0.0,
        ),
    )
