from __future__ import annotations

from datetime import date

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PurchaseOrder
from app.modules.ai_tool.query_parser import parse_search_query


async def search_repeated_late_vendors(db: AsyncSession, *, tenant_id: int, prompt: str) -> dict:
    query = parse_search_query(prompt)
    today = date.today()
    threshold = query.min_count if query.min_count is not None else 2

    rows = (
        await db.execute(
            select(PurchaseOrder.supplier_name, func.count())
            .where(
                PurchaseOrder.tenant_id == tenant_id,
                PurchaseOrder.expected_date.is_not(None),
                PurchaseOrder.expected_date < today,
                PurchaseOrder.status.not_in(["RECEIVED", "CLOSED", "CANCELLED"]),
            )
            .group_by(PurchaseOrder.supplier_name)
            .having(func.count() >= threshold)
            .order_by(func.count().desc())
            .limit(query.top_n)
        )
    ).all()
    items = [{"supplier_name": supplier, "late_order_count": int(count)} for supplier, count in rows]
    return {
        "title": "Repeated Late Vendors",
        "summary": f"Found {len(items)} vendor(s) with at least {threshold} delayed purchase order(s).",
        "data": {
            "applied_filters": [
                "expected_date < today",
                "status not in RECEIVED/CLOSED/CANCELLED",
                f"late_order_count >= {threshold}",
            ],
            "items": items,
        },
    }
