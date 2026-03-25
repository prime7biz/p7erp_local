"""Aggregate production pipeline: orders with chain readiness, optional group by style."""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Order
from app.modules.production.readiness_service import get_order_chain_readiness

# Orders included in planning pipeline (exclude terminal states)
_EXCLUDED_STATUSES = frozenset(
    {
        "CANCELLED",
        "cancelled",
        "CLOSED",
        "closed",
        "VOID",
        "void",
    }
)


async def build_pipeline(
    db: AsyncSession,
    tenant_id: int,
    *,
    group_by_style: bool = False,
) -> dict[str, Any]:
    r = await db.execute(
        select(Order)
        .where(Order.tenant_id == tenant_id)
        .where(Order.status.notin_(_EXCLUDED_STATUSES))
        .order_by(Order.delivery_date.asc().nulls_last(), Order.id.asc())
    )
    orders = list(r.scalars().all())

    rows: list[dict[str, Any]] = []
    for o in orders:
        ch = await get_order_chain_readiness(db, tenant_id, o.id)
        if ch.get("error"):
            continue
        rows.append(
            {
                "order_id": o.id,
                "order_code": o.order_code,
                "status": o.status,
                "quantity": o.quantity,
                "delivery_date": o.delivery_date.isoformat() if o.delivery_date else None,
                "style_ref": o.style_ref,
                "readiness": ch,
            }
        )

    if not group_by_style:
        return {"group_by": "order", "items": rows}

    # Group by style_id / style_code
    groups: dict[str, list[dict[str, Any]]] = {}
    meta: dict[str, dict[str, Any]] = {}
    for row in rows:
        rdict = row["readiness"]
        sid = rdict.get("style_id")
        sc = rdict.get("style_code") or row.get("style_ref") or "unknown"
        key = str(sid) if sid is not None else f"ref:{sc}"
        if key not in groups:
            groups[key] = []
            meta[key] = {
                "style_id": sid,
                "style_code": rdict.get("style_code") or sc,
                "style_name": rdict.get("style_name"),
            }
        groups[key].append(row)

    style_groups = []
    for key, order_rows in groups.items():
        style_groups.append(
            {
                **meta[key],
                "orders": order_rows,
            }
        )

    style_groups.sort(key=lambda g: (g.get("style_code") or ""))
    return {"group_by": "style", "styles": style_groups}
