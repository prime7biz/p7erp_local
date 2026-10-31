"""ABC analysis by consumption value (Sprint I3)."""

from __future__ import annotations

import logging
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.costing import Item
from app.models.inventory import StockMovement

logger = logging.getLogger(__name__)

ZERO = Decimal("0")
Q4 = Decimal("0.0001")


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


def classify_by_cumulative_value(
    rows: list[dict[str, Any]],
    *,
    a_pct: Decimal = Decimal("0.70"),
    b_pct: Decimal = Decimal("0.90"),
) -> list[dict[str, Any]]:
    """
    Assign A/B/C by cumulative share of total consumption value.
    A: items filling the top 70% of value, B: next to 90%, C: remainder.
    The item that crosses a threshold stays in the band being filled.
    """
    total = sum((_d(r["consumption_value"]) for r in rows), ZERO)
    if total <= ZERO:
        for r in rows:
            r["abc_class"] = "C"
            r["pct_of_total"] = 0.0
            r["cumulative_pct"] = 0.0
        return rows

    sorted_rows = sorted(rows, key=lambda r: _d(r["consumption_value"]), reverse=True)
    running = ZERO
    prev_cum = ZERO
    for r in sorted_rows:
        val = _d(r["consumption_value"])
        running += val
        cum = running / total
        pct = float((val / total) * 100)
        r["pct_of_total"] = round(pct, 4)
        r["cumulative_pct"] = round(float(cum * 100), 4)
        if prev_cum < a_pct:
            r["abc_class"] = "A"
        elif prev_cum < b_pct:
            r["abc_class"] = "B"
        else:
            r["abc_class"] = "C"
        prev_cum = cum
    return sorted_rows


async def run_abc_analysis(
    db: AsyncSession,
    tenant_id: int,
    *,
    period_months: int = 12,
    update_items: bool = True,
) -> dict[str, Any]:
    """
    Consume OUT movements in period, value at avg_cost, classify A/B/C, optionally update Item.abc_class.
    """
    months = max(1, min(int(period_months or 12), 60))
    cutoff = date.today() - timedelta(days=int(months * 30.4375))

    mov_rows = (
        await db.execute(
            select(
                StockMovement.item_id,
                StockMovement.quantity,
            ).where(
                StockMovement.tenant_id == tenant_id,
                StockMovement.movement_type == "OUT",
                StockMovement.movement_date >= cutoff,
            )
        )
    ).all()

    qty_by_item: dict[int, Decimal] = {}
    for item_id, qty in mov_rows:
        qty_by_item[int(item_id)] = qty_by_item.get(int(item_id), ZERO) + _d(qty)

    if not qty_by_item:
        # Fall back: classify all active items as C with zero consumption
        items = list(
            (
                await db.execute(
                    select(Item).where(Item.tenant_id == tenant_id, Item.is_active.is_(True))
                )
            )
            .scalars()
            .all()
        )
        rows = [
            {
                "item_id": it.id,
                "item_code": it.item_code,
                "item_name": it.name,
                "category_id": it.category_id,
                "consumption_qty": "0",
                "avg_cost": str(_q(_d(it.avg_cost) or _d(it.default_cost))),
                "consumption_value": "0",
                "abc_class": "C",
                "pct_of_total": 0.0,
                "cumulative_pct": 0.0,
            }
            for it in items
        ]
        if update_items:
            for it in items:
                it.abc_class = "C"
            await db.flush()
        return _summary(rows, period_months=months, cutoff=cutoff)

    item_ids = list(qty_by_item.keys())
    items = list(
        (
            await db.execute(
                select(Item).where(Item.tenant_id == tenant_id, Item.id.in_(item_ids))
            )
        )
        .scalars()
        .all()
    )
    item_map = {it.id: it for it in items}

    rows: list[dict[str, Any]] = []
    for iid, qty in qty_by_item.items():
        it = item_map.get(iid)
        if not it:
            continue
        unit = _d(it.avg_cost) or _d(it.default_cost) or ZERO
        value = _q(qty * unit)
        rows.append(
            {
                "item_id": iid,
                "item_code": it.item_code,
                "item_name": it.name,
                "category_id": it.category_id,
                "consumption_qty": str(_q(qty)),
                "avg_cost": str(_q(unit)),
                "consumption_value": str(value),
            }
        )

    classified = classify_by_cumulative_value(rows)
    if update_items:
        for r in classified:
            it = item_map.get(r["item_id"])
            if it:
                it.abc_class = r["abc_class"]
        await db.flush()
        logger.info(
            "abc_analysis tenant=%s items=%s A=%s B=%s C=%s",
            tenant_id,
            len(classified),
            sum(1 for r in classified if r["abc_class"] == "A"),
            sum(1 for r in classified if r["abc_class"] == "B"),
            sum(1 for r in classified if r["abc_class"] == "C"),
        )
    return _summary(classified, period_months=months, cutoff=cutoff)


async def get_abc_report(
    db: AsyncSession,
    tenant_id: int,
    *,
    abc_class: str | None = None,
    category_id: int | None = None,
) -> dict[str, Any]:
    """Report from current Item.abc_class (no recompute)."""
    q = select(Item).where(Item.tenant_id == tenant_id, Item.is_active.is_(True))
    if abc_class:
        q = q.where(Item.abc_class == abc_class.upper())
    if category_id is not None:
        q = q.where(Item.category_id == category_id)
    items = list((await db.execute(q.order_by(Item.abc_class, Item.item_code))).scalars().all())

    # Recompute relative values from current_stock * avg_cost for display when no run yet
    rows: list[dict[str, Any]] = []
    for it in items:
        unit = _d(it.avg_cost) or _d(it.default_cost)
        stock = _d(it.current_stock)
        value = _q(stock * unit)
        rows.append(
            {
                "item_id": it.id,
                "item_code": it.item_code,
                "item_name": it.name,
                "category_id": it.category_id,
                "consumption_qty": str(_q(stock)),
                "avg_cost": str(_q(unit)),
                "consumption_value": str(value),
                "abc_class": (it.abc_class or "C").upper(),
            }
        )
    total = sum((_d(r["consumption_value"]) for r in rows), ZERO) or Decimal("1")
    for r in rows:
        r["pct_of_total"] = round(float((_d(r["consumption_value"]) / total) * 100), 4)
        r["cumulative_pct"] = r["pct_of_total"]
    return _summary(rows, period_months=None, cutoff=None)


def _summary(
    rows: list[dict[str, Any]],
    *,
    period_months: int | None,
    cutoff: date | None,
) -> dict[str, Any]:
    by_class: dict[str, list] = {"A": [], "B": [], "C": []}
    for r in rows:
        cls = (r.get("abc_class") or "C").upper()
        if cls not in by_class:
            cls = "C"
        by_class[cls].append(r)

    def _class_block(key: str) -> dict[str, Any]:
        items = by_class[key]
        val = sum((_d(i["consumption_value"]) for i in items), ZERO)
        return {
            "class": key,
            "item_count": len(items),
            "total_value": str(_q(val)),
            "items": items,
        }

    total_value = sum((_d(r["consumption_value"]) for r in rows), ZERO)
    return {
        "period_months": period_months,
        "cutoff_date": cutoff.isoformat() if cutoff else None,
        "total_items": len(rows),
        "total_value": str(_q(total_value)),
        "classes": {
            "A": _class_block("A"),
            "B": _class_block("B"),
            "C": _class_block("C"),
        },
        "items": rows,
    }
