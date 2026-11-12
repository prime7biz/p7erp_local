from __future__ import annotations

from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Item, StockMovement
from app.modules.ai_tool.query_parser import parse_search_query

SNAPSHOT_LIMIT = 20
SHORTAGE_MAX_ROWS = 100


def _to_float(value: str | float | int | None) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _on_hand_by_item(tenant_id: int):
    """Per-item on-hand totals computed in SQL (IN adds, every other movement type subtracts)."""
    on_hand = func.sum(
        case(
            (StockMovement.movement_type == "IN", StockMovement.quantity),
            else_=-StockMovement.quantity,
        )
    ).label("on_hand")
    return (
        select(Item.id.label("item_id"), Item.item_code, Item.name.label("item_name"), on_hand)
        .join(
            StockMovement,
            and_(StockMovement.item_id == Item.id, StockMovement.tenant_id == tenant_id),
        )
        .where(Item.tenant_id == tenant_id)
        .group_by(Item.id, Item.item_code, Item.name)
    )


def _row_to_item(row, threshold: int | None = None) -> dict:
    out = {
        "item_id": row.item_id,
        "item_code": row.item_code,
        "item_name": row.item_name,
        "on_hand_qty": round(_to_float(row.on_hand), 3),
    }
    if threshold is not None:
        out["threshold"] = threshold
    return out


async def get_inventory_snapshot(db: AsyncSession, *, tenant_id: int) -> dict:
    sub = _on_hand_by_item(tenant_id).subquery()
    rows = (
        await db.execute(select(sub).order_by(sub.c.on_hand.desc()).limit(SNAPSHOT_LIMIT))
    ).all()
    top_rows = [_row_to_item(r) for r in rows]
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

    sub = _on_hand_by_item(tenant_id).subquery()
    total = int(
        (await db.execute(select(func.count()).select_from(sub).where(sub.c.on_hand <= threshold))).scalar()
        or 0
    )
    limit = max(1, min(int(query.top_n or 10), SHORTAGE_MAX_ROWS))
    rows = (
        await db.execute(
            select(sub).where(sub.c.on_hand <= threshold).order_by(sub.c.on_hand.asc()).limit(limit)
        )
    ).all()
    shortage_rows = [_row_to_item(r, threshold) for r in rows]
    return {
        "title": "Inventory Shortages",
        "summary": f"Found {total} item(s) at or below threshold {threshold}.",
        "data": {
            "applied_filters": [f"on_hand <= {threshold}"],
            "items": shortage_rows,
        },
    }
