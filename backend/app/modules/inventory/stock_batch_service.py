"""Physical stock batch create / FIFO issue / expiry helpers."""

from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.business_date import tenant_today
from app.common.tenant_feature_keys import is_batch_tracking_enabled
from app.models.costing import Item
from app.models.inventory import GoodsReceivingItem, StockBatch, StockMovement, Warehouse
from app.modules.inventory.stock_valuation_service import _d, _money, refresh_item_stock_caches

logger = logging.getLogger(__name__)

ZERO = Decimal("0")


def batch_out(b: StockBatch) -> dict[str, Any]:
    return {
        "id": b.id,
        "stock_item_id": b.stock_item_id,
        "batch_number": b.batch_number,
        "manufacturing_date": b.manufacturing_date.isoformat() if b.manufacturing_date else None,
        "expiry_date": b.expiry_date.isoformat() if b.expiry_date else None,
        "opening_qty": str(_money(_d(b.opening_qty))),
        "received_qty": str(_money(_d(b.received_qty))),
        "issued_qty": str(_money(_d(b.issued_qty))),
        "current_qty": str(_money(_d(b.current_qty))),
        "cost_per_unit": str(_money(_d(b.cost_per_unit))),
        "godown_id": b.godown_id,
        "status": b.status,
        "source_movement_id": b.source_movement_id,
        "goods_receiving_item_id": b.goods_receiving_item_id,
        "created_at": b.created_at.isoformat() if b.created_at else None,
    }


async def create_batch_on_grn(
    db: AsyncSession,
    tenant_id: int,
    *,
    item: Item,
    grn_item: GoodsReceivingItem,
    movement: StockMovement,
    qty: Decimal,
    unit_cost: Decimal,
    feature_flags: Any = None,
    batch_number: str | None = None,
    manufacturing_date: date | None = None,
    expiry_date: date | None = None,
) -> StockBatch | None:
    """Auto-create a physical batch after GRN receive when batch tracking is on."""
    if not is_batch_tracking_enabled(feature_flags):
        return None
    if not getattr(item, "batch_tracking", False):
        return None

    qty = _money(_d(qty))
    if qty <= ZERO:
        return None

    number = (batch_number or getattr(grn_item, "lot_number", None) or "").strip()
    if not number:
        number = f"B-{movement.id}-{uuid.uuid4().hex[:6].upper()}"

    godown_id = movement.warehouse_id or grn_item.warehouse_id

    filters = [
        StockBatch.tenant_id == tenant_id,
        StockBatch.stock_item_id == item.id,
        StockBatch.batch_number == number,
    ]
    if godown_id is None:
        filters.append(StockBatch.godown_id.is_(None))
    else:
        filters.append(StockBatch.godown_id == godown_id)
    existing = (await db.execute(select(StockBatch).where(*filters))).scalar_one_or_none()
    if existing:
        existing.received_qty = _money(_d(existing.received_qty) + qty)
        existing.current_qty = _money(_d(existing.current_qty) + qty)
        if unit_cost > ZERO:
            # Weighted average cost on top-up
            prev_val = _d(existing.current_qty - qty) * _d(existing.cost_per_unit)
            existing.cost_per_unit = _money((prev_val + qty * unit_cost) / _d(existing.current_qty))
        existing.status = "ACTIVE"
        existing.updated_at = datetime.utcnow()
        movement.batch_id = existing.id
        movement.lot_number = number
        await db.flush()
        await refresh_item_stock_caches(db, tenant_id, item.id)
        return existing

    batch = StockBatch(
        tenant_id=tenant_id,
        stock_item_id=item.id,
        batch_number=number,
        manufacturing_date=manufacturing_date,
        expiry_date=expiry_date,
        opening_qty=ZERO,
        received_qty=qty,
        issued_qty=ZERO,
        current_qty=qty,
        cost_per_unit=_money(unit_cost),
        godown_id=godown_id,
        source_movement_id=movement.id,
        goods_receiving_item_id=grn_item.id,
        status="ACTIVE",
    )
    db.add(batch)
    await db.flush()
    movement.batch_id = batch.id
    movement.lot_number = number
    await db.flush()
    await refresh_item_stock_caches(db, tenant_id, item.id)
    return batch


async def issue_batch_fifo(
    db: AsyncSession,
    tenant_id: int,
    item_id: int,
    godown_id: int | None,
    qty_needed: Decimal,
    *,
    method: str = "FIFO",
    feature_flags: Any = None,
) -> list[dict[str, Any]]:
    """Allocate qty from oldest (FIFO) or newest (LIFO) active batches. Returns allocation rows."""
    if not is_batch_tracking_enabled(feature_flags):
        return []

    need = _money(_d(qty_needed))
    if need <= ZERO:
        return []

    q = select(StockBatch).where(
        StockBatch.tenant_id == tenant_id,
        StockBatch.stock_item_id == item_id,
        StockBatch.status == "ACTIVE",
        StockBatch.current_qty > 0,
    )
    if godown_id is not None:
        q = q.where(StockBatch.godown_id == godown_id)

    if (method or "FIFO").upper() == "LIFO":
        q = q.order_by(StockBatch.created_at.desc(), StockBatch.id.desc())
    else:
        q = q.order_by(StockBatch.created_at.asc(), StockBatch.id.asc())

    # FOR UPDATE: concurrent issues of the same batch wait instead of both taking its qty.
    batches = list((await db.execute(q.with_for_update())).scalars().all())
    available = sum((_d(b.current_qty) for b in batches), ZERO)
    if available + Decimal("0.0001") < need:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient batch stock for item {item_id}: need {need}, available {available}",
        )

    remaining = need
    allocations: list[dict[str, Any]] = []
    for batch in batches:
        if remaining <= ZERO:
            break
        take = min(remaining, _d(batch.current_qty))
        batch.current_qty = _money(_d(batch.current_qty) - take)
        batch.issued_qty = _money(_d(batch.issued_qty) + take)
        if batch.current_qty <= ZERO:
            batch.current_qty = ZERO
            batch.status = "CLOSED"
        batch.updated_at = datetime.utcnow()
        allocations.append(
            {
                "batch_id": batch.id,
                "batch_number": batch.batch_number,
                "qty": str(_money(take)),
                "cost_per_unit": str(_money(_d(batch.cost_per_unit))),
                "godown_id": batch.godown_id,
            }
        )
        remaining = _money(remaining - take)

    await db.flush()
    await refresh_item_stock_caches(db, tenant_id, item_id)
    return allocations


async def transfer_batch_qty(
    db: AsyncSession,
    tenant_id: int,
    *,
    batch_id: int,
    to_godown_id: int,
    qty: Decimal,
) -> StockBatch:
    """Move qty from a batch to another godown (same batch number, new/existing destination row)."""
    src = (
        await db.execute(
            select(StockBatch)
            .where(StockBatch.id == batch_id, StockBatch.tenant_id == tenant_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if not src:
        raise HTTPException(status_code=404, detail="Batch not found")
    take = _money(_d(qty))
    if take <= ZERO or take > _d(src.current_qty):
        raise HTTPException(status_code=400, detail="Invalid transfer qty for batch")

    dest_wh = await db.get(Warehouse, to_godown_id)
    if not dest_wh or dest_wh.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Destination godown not found")

    src.current_qty = _money(_d(src.current_qty) - take)
    src.issued_qty = _money(_d(src.issued_qty) + take)
    if src.current_qty <= ZERO:
        src.current_qty = ZERO
        src.status = "CLOSED"
    src.updated_at = datetime.utcnow()

    dest = (
        await db.execute(
            select(StockBatch).where(
                StockBatch.tenant_id == tenant_id,
                StockBatch.stock_item_id == src.stock_item_id,
                StockBatch.batch_number == src.batch_number,
                StockBatch.godown_id == to_godown_id,
            )
        )
    ).scalar_one_or_none()
    if dest:
        dest.received_qty = _money(_d(dest.received_qty) + take)
        dest.current_qty = _money(_d(dest.current_qty) + take)
        dest.status = "ACTIVE"
        dest.updated_at = datetime.utcnow()
    else:
        dest = StockBatch(
            tenant_id=tenant_id,
            stock_item_id=src.stock_item_id,
            batch_number=src.batch_number,
            manufacturing_date=src.manufacturing_date,
            expiry_date=src.expiry_date,
            opening_qty=ZERO,
            received_qty=take,
            issued_qty=ZERO,
            current_qty=take,
            cost_per_unit=src.cost_per_unit,
            godown_id=to_godown_id,
            status="ACTIVE",
        )
        db.add(dest)
    await db.flush()
    await refresh_item_stock_caches(db, tenant_id, src.stock_item_id)
    return dest


async def get_batch_availability(
    db: AsyncSession,
    tenant_id: int,
    item_id: int,
    godown_id: int | None = None,
) -> list[dict[str, Any]]:
    q = select(StockBatch).where(
        StockBatch.tenant_id == tenant_id,
        StockBatch.stock_item_id == item_id,
        StockBatch.status.in_(("ACTIVE",)),
        StockBatch.current_qty > 0,
    )
    if godown_id is not None:
        q = q.where(StockBatch.godown_id == godown_id)
    q = q.order_by(StockBatch.expiry_date.asc().nullslast(), StockBatch.created_at.asc())
    rows = list((await db.execute(q)).scalars().all())
    return [batch_out(b) for b in rows]


async def get_expiring_batches(
    db: AsyncSession,
    tenant_id: int,
    *,
    days: int = 30,
    as_of: date | None = None,
) -> list[dict[str, Any]]:
    as_of = as_of or await tenant_today(db, tenant_id)
    until = as_of + timedelta(days=max(0, days))
    rows = (
        await db.execute(
            select(StockBatch)
            .where(
                StockBatch.tenant_id == tenant_id,
                StockBatch.status == "ACTIVE",
                StockBatch.current_qty > 0,
                StockBatch.expiry_date.is_not(None),
                StockBatch.expiry_date <= until,
            )
            .order_by(StockBatch.expiry_date.asc())
        )
    ).scalars().all()
    out = []
    for b in rows:
        row = batch_out(b)
        row["days_to_expiry"] = (b.expiry_date - as_of).days if b.expiry_date else None
        out.append(row)
    return out


async def mark_expired_batches(
    db: AsyncSession,
    tenant_id: int,
    as_of: date | None = None,
) -> int:
    as_of = as_of or await tenant_today(db, tenant_id)
    rows = (
        await db.execute(
            select(StockBatch).where(
                StockBatch.tenant_id == tenant_id,
                StockBatch.status == "ACTIVE",
                StockBatch.expiry_date.is_not(None),
                StockBatch.expiry_date < as_of,
            )
        )
    ).scalars().all()
    n = 0
    for b in rows:
        b.status = "EXPIRED"
        b.updated_at = datetime.utcnow()
        n += 1
    await db.flush()
    return n


async def get_low_stock_items(
    db: AsyncSession,
    tenant_id: int,
) -> list[dict[str, Any]]:
    items = (
        await db.execute(
            select(Item).where(
                Item.tenant_id == tenant_id,
                Item.is_active.is_(True),
                Item.reorder_level.is_not(None),
            )
        )
    ).scalars().all()
    out = []
    for it in items:
        stock = _d(it.current_stock)
        reorder = _d(it.reorder_level)
        if stock <= reorder:
            out.append(
                {
                    "item_id": it.id,
                    "item_code": it.item_code,
                    "name": it.name,
                    "current_stock": str(_money(stock)),
                    "reorder_level": str(_money(reorder)),
                }
            )
    return out
