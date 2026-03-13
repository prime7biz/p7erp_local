from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Item, StockMovement
from app.modules.ai_tool.query_parser import parse_search_query


def _to_float(value: str | float | int | None) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


async def get_inventory_snapshot(db: AsyncSession, *, tenant_id: int) -> dict:
    movements = (
        await db.execute(
            select(StockMovement).where(StockMovement.tenant_id == tenant_id)
        )
    ).scalars().all()
    items = (
        await db.execute(
            select(Item).where(Item.tenant_id == tenant_id)
        )
    ).scalars().all()
    item_map = {x.id: x for x in items}

    bucket: dict[int, dict[str, float]] = {}
    for movement in movements:
        entry = bucket.setdefault(movement.item_id, {"in_qty": 0.0, "out_qty": 0.0})
        qty = _to_float(movement.quantity)
        if movement.movement_type == "IN":
            entry["in_qty"] += qty
        else:
            entry["out_qty"] += qty

    rows: list[dict] = []
    for item_id, qty in bucket.items():
        item = item_map.get(item_id)
        if not item:
            continue
        on_hand = round(qty["in_qty"] - qty["out_qty"], 3)
        rows.append(
            {
                "item_id": item_id,
                "item_code": item.item_code,
                "item_name": item.name,
                "on_hand_qty": on_hand,
            }
        )
    rows.sort(key=lambda x: x["on_hand_qty"], reverse=True)
    top_rows = rows[:20]
    return {
        "title": "Inventory Snapshot",
        "summary": f"Showing {len(top_rows)} item(s) by on-hand quantity.",
        "data": {
            "items": top_rows,
        },
    }


async def search_inventory_shortages(db: AsyncSession, *, tenant_id: int, prompt: str) -> dict:
    query = parse_search_query(prompt)
    threshold = query.min_count if query.min_count is not None else 0

    movements = (
        await db.execute(
            select(StockMovement).where(StockMovement.tenant_id == tenant_id)
        )
    ).scalars().all()
    items = (
        await db.execute(
            select(Item).where(Item.tenant_id == tenant_id)
        )
    ).scalars().all()
    item_map = {x.id: x for x in items}

    bucket: dict[int, dict[str, float]] = {}
    for movement in movements:
        entry = bucket.setdefault(movement.item_id, {"in_qty": 0.0, "out_qty": 0.0})
        qty = _to_float(movement.quantity)
        if movement.movement_type == "IN":
            entry["in_qty"] += qty
        else:
            entry["out_qty"] += qty

    shortage_rows: list[dict] = []
    for item_id, qty in bucket.items():
        item = item_map.get(item_id)
        if not item:
            continue
        on_hand = round(qty["in_qty"] - qty["out_qty"], 3)
        if on_hand <= threshold:
            shortage_rows.append(
                {
                    "item_id": item_id,
                    "item_code": item.item_code,
                    "item_name": item.name,
                    "on_hand_qty": on_hand,
                    "threshold": threshold,
                }
            )
    shortage_rows.sort(key=lambda x: x["on_hand_qty"])
    return {
        "title": "Inventory Shortages",
        "summary": f"Found {len(shortage_rows)} item(s) at or below threshold {threshold}.",
        "data": {
            "applied_filters": [f"on_hand <= {threshold}"],
            "items": shortage_rows[: query.top_n],
        },
    }
