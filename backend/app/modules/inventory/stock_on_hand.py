"""On-hand quantity from stock movements, summed in the database.

Sign rule (same as the original Python loop): movement_type "IN" adds, "OUT" subtracts, any
other type (e.g. "ADJUST") is ignored. Results are rounded to 3 decimals.
"""

from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import StockMovement

_signed_qty = case(
    (StockMovement.movement_type == "IN", StockMovement.quantity),
    (StockMovement.movement_type == "OUT", -StockMovement.quantity),
    else_=0,
)


async def on_hand_qty(
    db: AsyncSession,
    tenant_id: int,
    item_id: int,
    warehouse_id: int | None,
) -> float:
    """On-hand qty for one item in one warehouse (``None`` = movements without a warehouse)."""
    stmt = select(func.coalesce(func.sum(_signed_qty), 0)).where(
        StockMovement.tenant_id == tenant_id,
        StockMovement.item_id == item_id,
    )
    if warehouse_id is None:
        stmt = stmt.where(StockMovement.warehouse_id.is_(None))
    else:
        stmt = stmt.where(StockMovement.warehouse_id == warehouse_id)
    total = (await db.execute(stmt)).scalar_one()
    return round(float(total or 0), 3)


async def on_hand_qty_by_item_warehouse(
    db: AsyncSession,
    tenant_id: int,
    *,
    warehouse_ids: Iterable[int],
    item_ids: Iterable[int] | None = None,
) -> dict[tuple[int, int], float]:
    """On-hand qty for many (item, warehouse) pairs in one query.

    Returns ``{(item_id, warehouse_id): qty}``; pairs with no movements are absent (treat as 0).
    ``item_ids=None`` means every item that has movements in those warehouses.
    """
    wh_ids = list(dict.fromkeys(warehouse_ids))
    if not wh_ids:
        return {}
    stmt = (
        select(StockMovement.item_id, StockMovement.warehouse_id, func.sum(_signed_qty))
        .where(StockMovement.tenant_id == tenant_id, StockMovement.warehouse_id.in_(wh_ids))
        .group_by(StockMovement.item_id, StockMovement.warehouse_id)
    )
    if item_ids is not None:
        it_ids = list(dict.fromkeys(item_ids))
        if not it_ids:
            return {}
        stmt = stmt.where(StockMovement.item_id.in_(it_ids))
    rows = (await db.execute(stmt)).all()
    return {(int(item_id), int(wh_id)): round(float(total or 0), 3) for item_id, wh_id, total in rows}
