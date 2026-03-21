"""Pending inventory documents that should block accounting period close."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    GoodsReceiving,
    PhysicalInventorySession,
    StockAdjustment,
    WarehouseTransfer,
)


async def inventory_period_close_blockers(db: AsyncSession, tenant_id: int) -> list[str]:
    msgs: list[str] = []
    n_grn = int(
        (
            await db.execute(
                select(func.count())
                .select_from(GoodsReceiving)
                .where(GoodsReceiving.tenant_id == tenant_id, GoodsReceiving.status != "RECEIVED")
            )
        ).scalar()
        or 0
    )
    if n_grn:
        msgs.append(f"{n_grn} goods receipt(s) not fully received")
    n_adj = int(
        (
            await db.execute(
                select(func.count())
                .select_from(StockAdjustment)
                .where(StockAdjustment.tenant_id == tenant_id, StockAdjustment.status == "DRAFT")
            )
        ).scalar()
        or 0
    )
    if n_adj:
        msgs.append(f"{n_adj} stock adjustment(s) in DRAFT")
    n_tr = int(
        (
            await db.execute(
                select(func.count())
                .select_from(WarehouseTransfer)
                .where(WarehouseTransfer.tenant_id == tenant_id, WarehouseTransfer.status == "DRAFT")
            )
        ).scalar()
        or 0
    )
    if n_tr:
        msgs.append(f"{n_tr} warehouse transfer(s) in DRAFT")
    n_pic = int(
        (
            await db.execute(
                select(func.count())
                .select_from(PhysicalInventorySession)
                .where(PhysicalInventorySession.tenant_id == tenant_id, PhysicalInventorySession.status == "DRAFT")
            )
        ).scalar()
        or 0
    )
    if n_pic:
        msgs.append(f"{n_pic} physical inventory session(s) in DRAFT")
    return msgs
