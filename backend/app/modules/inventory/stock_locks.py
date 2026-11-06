"""Locks and on-hand checks shared by stock-moving posts.

Two users posting documents for the same item at the same moment could both pass
the "enough stock?" check. Taking ``lock_stock_items`` first makes the second
request wait until the first commits, so its on-hand check sees the new balance.
"""

from __future__ import annotations

from collections.abc import Iterable
from decimal import Decimal

from sqlalchemy import Numeric, case, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import StockMovement


async def lock_stock_items(db: AsyncSession, tenant_id: int, item_ids: Iterable[int]) -> None:
    """Transaction-scoped advisory locks per (tenant, item), taken in id order (avoids deadlocks)."""
    for iid in sorted({int(i) for i in item_ids if i}):
        await db.execute(select(func.pg_advisory_xact_lock(int(tenant_id), iid)))


async def on_hand_qty_decimal(
    db: AsyncSession,
    tenant_id: int,
    item_id: int,
    warehouse_id: int | None,
) -> Decimal:
    """IN minus OUT stock movements for one item in one warehouse."""
    qty_col = cast(StockMovement.quantity, Numeric)
    stmt = select(
        func.coalesce(
            func.sum(
                case(
                    (StockMovement.movement_type == "IN", qty_col),
                    (StockMovement.movement_type == "OUT", -qty_col),
                    else_=0,
                )
            ),
            0,
        )
    ).where(StockMovement.tenant_id == tenant_id, StockMovement.item_id == item_id)
    if warehouse_id is None:
        stmt = stmt.where(StockMovement.warehouse_id.is_(None))
    else:
        stmt = stmt.where(StockMovement.warehouse_id == warehouse_id)
    value = (await db.execute(stmt)).scalar()
    return Decimal(str(value or 0))
