"""Genealogy — thin wrapper over lot-trace movements for the Material Control hub."""
from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import GoodsReceiving, GoodsReceivingItem, StockMovement
from app.modules.material_control.schemas import GenealogyMovementRow, GenealogyResponse


async def build_genealogy(
    db: AsyncSession,
    *,
    tenant_id: int,
    lot_number: str,
) -> GenealogyResponse:
    raw = lot_number.strip()
    like_pattern = f"%{raw}%"
    grn_count = len(
        list(
            (
                await db.execute(
                    select(GoodsReceivingItem.id)
                    .join(GoodsReceiving, GoodsReceivingItem.goods_receiving_id == GoodsReceiving.id)
                    .where(
                        GoodsReceivingItem.tenant_id == tenant_id,
                        GoodsReceiving.tenant_id == tenant_id,
                        or_(
                            GoodsReceivingItem.lot_number == raw,
                            GoodsReceivingItem.lot_number.ilike(like_pattern),
                        ),
                    )
                    .limit(200)
                )
            ).scalars().all()
        )
    )
    mov_rows = list(
        (
            await db.execute(
                select(StockMovement)
                .where(
                    StockMovement.tenant_id == tenant_id,
                    or_(
                        StockMovement.lot_number == raw,
                        StockMovement.lot_number.ilike(like_pattern),
                    ),
                )
                .order_by(StockMovement.id.desc())
                .limit(200)
            )
        ).scalars().all()
    )
    movements = [
        GenealogyMovementRow(
            id=m.id,
            movement_type=m.movement_type,
            quantity=str(m.quantity) if m.quantity is not None else None,
            item_id=m.item_id,
            warehouse_id=m.warehouse_id,
            reference_type=m.reference_type,
            reference_id=m.reference_id,
            movement_date=m.movement_date,
            lot_number=m.lot_number,
            order_id=m.order_id,
        )
        for m in mov_rows
    ]
    return GenealogyResponse(lot_number=raw, grn_line_count=grn_count, movements=movements)
