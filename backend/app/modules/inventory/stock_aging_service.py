"""Stock aging by batch receipt date (Sprint I3)."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.costing import Item
from app.models.inventory import GoodsReceiving, GoodsReceivingItem, StockBatch, Warehouse

ZERO = Decimal("0")
Q4 = Decimal("0.0001")

AGING_BUCKETS = (
    ("0-30", 0, 30),
    ("31-60", 31, 60),
    ("61-90", 61, 90),
    ("91-180", 91, 180),
    ("181-365", 181, 365),
    ("365+", 366, 10_000_000),
)


def _d(v: Any) -> Decimal:
    if v is None:
        return ZERO
    if isinstance(v, Decimal):
        return v
    try:
        return Decimal(str(v))
    except Exception:
        return ZERO


def _q(v: Decimal) -> Decimal:
    return v.quantize(Q4, rounding=ROUND_HALF_UP)


def bucket_for_days(days: int) -> str:
    for name, lo, hi in AGING_BUCKETS:
        if lo <= days <= hi:
            return name
    return "365+"


async def get_stock_aging(
    db: AsyncSession,
    tenant_id: int,
    *,
    item_id: int | None = None,
    warehouse_id: int | None = None,
    bucket: str | None = None,
) -> dict[str, Any]:
    """Age open batches by receipt / manufacturing / created date."""
    today = date.today()
    q = select(StockBatch).where(
        StockBatch.tenant_id == tenant_id,
        StockBatch.current_qty > 0,
        StockBatch.status.in_(("ACTIVE", "PARTIAL")),
    )
    if item_id is not None:
        q = q.where(StockBatch.stock_item_id == item_id)
    if warehouse_id is not None:
        q = q.where(StockBatch.godown_id == warehouse_id)

    batches = list((await db.execute(q)).scalars().all())
    item_ids = {b.stock_item_id for b in batches}
    wh_ids = {b.godown_id for b in batches if b.godown_id}
    gri_ids = {b.goods_receiving_item_id for b in batches if b.goods_receiving_item_id}

    item_map: dict[int, Item] = {}
    if item_ids:
        item_map = {
            r.id: r
            for r in (
                await db.execute(select(Item).where(Item.tenant_id == tenant_id, Item.id.in_(item_ids)))
            )
            .scalars()
            .all()
        }
    wh_map: dict[int, Warehouse] = {}
    if wh_ids:
        wh_map = {
            r.id: r
            for r in (
                await db.execute(
                    select(Warehouse).where(Warehouse.tenant_id == tenant_id, Warehouse.id.in_(wh_ids))
                )
            )
            .scalars()
            .all()
        }

    receipt_by_gri: dict[int, date] = {}
    if gri_ids:
        gri_rows = (
            await db.execute(
                select(GoodsReceivingItem.id, GoodsReceiving.received_date)
                .join(GoodsReceiving, GoodsReceiving.id == GoodsReceivingItem.goods_receiving_id)
                .where(GoodsReceivingItem.id.in_(gri_ids))
            )
        ).all()
        for gid, rd in gri_rows:
            if rd:
                receipt_by_gri[int(gid)] = rd

    lines: list[dict[str, Any]] = []
    bucket_totals: dict[str, dict[str, Decimal]] = {
        name: {"qty": ZERO, "value": ZERO, "count": ZERO} for name, _, _ in AGING_BUCKETS
    }

    for b in batches:
        receipt = None
        if b.goods_receiving_item_id and b.goods_receiving_item_id in receipt_by_gri:
            receipt = receipt_by_gri[b.goods_receiving_item_id]
        elif b.manufacturing_date:
            receipt = b.manufacturing_date
        elif isinstance(b.created_at, datetime):
            receipt = b.created_at.date()
        elif isinstance(b.created_at, date):
            receipt = b.created_at
        else:
            receipt = today

        days = max(0, (today - receipt).days)
        bkt = bucket_for_days(days)
        if bucket and bkt != bucket:
            continue

        qty = _d(b.current_qty)
        cost = _d(b.cost_per_unit)
        if cost <= ZERO:
            it = item_map.get(b.stock_item_id)
            cost = _d(it.avg_cost) if it else ZERO
        value = _q(qty * cost)
        it = item_map.get(b.stock_item_id)
        wh = wh_map.get(b.godown_id) if b.godown_id else None
        lines.append(
            {
                "batch_id": b.id,
                "item_id": b.stock_item_id,
                "item_code": it.item_code if it else None,
                "item_name": it.name if it else None,
                "warehouse_id": b.godown_id,
                "warehouse_name": wh.name if wh else None,
                "batch_number": b.batch_number,
                "receipt_date": receipt.isoformat(),
                "days_in_stock": days,
                "qty": str(_q(qty)),
                "unit_cost": str(_q(cost)),
                "value": str(value),
                "bucket": bkt,
            }
        )
        bucket_totals[bkt]["qty"] += qty
        bucket_totals[bkt]["value"] += value
        bucket_totals[bkt]["count"] += Decimal("1")

    lines.sort(key=lambda r: r["days_in_stock"], reverse=True)
    slow_value = sum(
        (bucket_totals[n]["value"] for n in ("181-365", "365+")),
        ZERO,
    )
    over_365 = bucket_totals["365+"]["value"]

    return {
        "as_of": today.isoformat(),
        "line_count": len(lines),
        "total_value": str(_q(sum((_d(l["value"]) for l in lines), ZERO))),
        "slow_moving_value_180_plus": str(_q(slow_value)),
        "over_365_value": str(_q(over_365)),
        "alert": (
            f"Items in stock > 365 days: value {_q(over_365)} at risk"
            if over_365 > ZERO
            else None
        ),
        "buckets": [
            {
                "bucket": name,
                "batch_count": int(bucket_totals[name]["count"]),
                "qty": str(_q(bucket_totals[name]["qty"])),
                "value": str(_q(bucket_totals[name]["value"])),
            }
            for name, _, _ in AGING_BUCKETS
        ],
        "lines": lines,
    }
