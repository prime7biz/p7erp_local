"""Greedy material-delay replan: shift sewing line config dates (MVP heuristic)."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Order
from app.models.production import SewingLineStyleConfig
from app.modules.audit.service import log_action


async def shift_order_line_schedule(
    db: AsyncSession,
    *,
    tenant_id: int,
    order_id: int,
    delay_days: int,
    user_id: int,
) -> list[int]:
    """Push all plan-board rows for this order forward by delay_days (working-day naive)."""
    if delay_days <= 0:
        return []
    order = await db.get(Order, order_id)
    if not order or order.tenant_id != tenant_id:
        return []
    r = await db.execute(
        select(SewingLineStyleConfig).where(
            SewingLineStyleConfig.tenant_id == tenant_id,
            SewingLineStyleConfig.order_id == order_id,
        )
    )
    cfgs = list(r.scalars().all())
    shifted: list[int] = []
    delta = timedelta(days=delay_days)
    for c in cfgs:
        c.start_date = c.start_date + delta
        if c.planned_end_date is not None:
            c.planned_end_date = c.planned_end_date + delta
        shifted.append(c.id)
    if shifted:
        await log_action(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="PRODUCTION_REPLAN_MATERIAL_DELAY",
            resource="order",
            details=f"order_id={order_id} delay_days={delay_days} configs={shifted}",
        )
    return shifted
