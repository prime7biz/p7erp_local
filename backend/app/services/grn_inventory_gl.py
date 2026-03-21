"""Backward-compatible entrypoint; posts GRN inventory journals via inventory_gl_service."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import GoodsReceiving, GoodsReceivingItem
from app.services.inventory_gl_service import post_grn_receipt_gl


async def post_grn_receipt_gl_journal(
    db: AsyncSession,
    tenant_id: int,
    user_id: int | None,
    grn: GoodsReceiving,
    items: list[GoodsReceivingItem],
) -> None:
    await post_grn_receipt_gl(db, tenant_id, user_id, grn, items)
