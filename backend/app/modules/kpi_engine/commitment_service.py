"""Append-only order commitment revisions (Phase C2)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.kpi_engine import OrderCommitmentRevision
from app.models.merch import Order
from app.modules.kpi_engine.compute_base import utcnow


async def next_revision_no(db: AsyncSession, tenant_id: int, order_id: int) -> int:
    current = (
        await db.execute(
            select(func.coalesce(func.max(OrderCommitmentRevision.revision_no), 0)).where(
                OrderCommitmentRevision.tenant_id == tenant_id,
                OrderCommitmentRevision.order_id == order_id,
            )
        )
    ).scalar_one()
    return int(current or 0) + 1


async def append_commitment_revision(
    db: AsyncSession,
    *,
    tenant_id: int,
    order_id: int,
    committed_date: date | None,
    committed_qty: Decimal | None,
    user_id: int | None,
    reason: str | None = None,
    source: str = "INTERNAL",
    backfilled: bool = False,
) -> OrderCommitmentRevision:
    rev = OrderCommitmentRevision(
        tenant_id=tenant_id,
        order_id=order_id,
        revision_no=await next_revision_no(db, tenant_id, order_id),
        committed_date=committed_date,
        committed_qty=committed_qty,
        reason=reason,
        source=source if source in {"BUYER", "INTERNAL", "BACKFILL"} else "INTERNAL",
        changed_by=user_id,
        changed_at=utcnow(),
        backfilled=backfilled,
    )
    db.add(rev)
    await db.flush()
    return rev


async def record_order_commitment_if_changed(
    db: AsyncSession,
    *,
    tenant_id: int,
    order: Order,
    old_date: date | None,
    old_qty: Decimal | None,
    user_id: int | None,
    reason: str | None = None,
) -> OrderCommitmentRevision | None:
    """Write-through when delivery date or quantity changes. Safe to call inside update txn."""
    new_date = order.delivery_date
    new_qty = getattr(order, "quantity", None)
    qty_dec = Decimal(str(new_qty)) if new_qty is not None else None
    old_qty_dec = Decimal(str(old_qty)) if old_qty is not None else None
    if new_date == old_date and qty_dec == old_qty_dec:
        return None
    # Ensure first revision exists as prior baseline when history empty.
    count = (
        await db.execute(
            select(func.count(OrderCommitmentRevision.id)).where(
                OrderCommitmentRevision.tenant_id == tenant_id,
                OrderCommitmentRevision.order_id == order.id,
            )
        )
    ).scalar_one()
    if int(count or 0) == 0 and (old_date is not None or old_qty_dec is not None):
        await append_commitment_revision(
            db,
            tenant_id=tenant_id,
            order_id=order.id,
            committed_date=old_date,
            committed_qty=old_qty_dec,
            user_id=user_id,
            reason="baseline_before_change",
            source="BACKFILL",
            backfilled=True,
        )
    return await append_commitment_revision(
        db,
        tenant_id=tenant_id,
        order_id=order.id,
        committed_date=new_date,
        committed_qty=qty_dec,
        user_id=user_id,
        reason=reason or "order_update",
        source="INTERNAL",
    )


async def list_revisions(db: AsyncSession, tenant_id: int, order_id: int) -> list[OrderCommitmentRevision]:
    return list(
        (
            await db.execute(
                select(OrderCommitmentRevision)
                .where(
                    OrderCommitmentRevision.tenant_id == tenant_id,
                    OrderCommitmentRevision.order_id == order_id,
                )
                .order_by(OrderCommitmentRevision.revision_no.asc())
            )
        ).scalars().all()
    )


async def backfill_open_orders(db: AsyncSession, tenant_id: int, user_id: int | None = None) -> int:
    """Idempotent: one BACKFILL revision per open order that has none."""
    from app.modules.kpi_engine.compute.service import OPEN_ORDER_EXCLUDED
    from sqlalchemy import func as sa_func

    orders = (
        await db.execute(
            select(Order).where(
                Order.tenant_id == tenant_id,
                sa_func.upper(Order.status).notin_(OPEN_ORDER_EXCLUDED),
            )
        )
    ).scalars().all()
    created = 0
    for order in orders:
        count = (
            await db.execute(
                select(func.count(OrderCommitmentRevision.id)).where(
                    OrderCommitmentRevision.tenant_id == tenant_id,
                    OrderCommitmentRevision.order_id == order.id,
                )
            )
        ).scalar_one()
        if int(count or 0) > 0:
            continue
        qty = getattr(order, "quantity", None)
        await append_commitment_revision(
            db,
            tenant_id=tenant_id,
            order_id=order.id,
            committed_date=order.delivery_date,
            committed_qty=Decimal(str(qty)) if qty is not None else None,
            user_id=user_id,
            reason="initial_backfill",
            source="BACKFILL",
            backfilled=True,
        )
        created += 1
    await db.flush()
    return created
