from __future__ import annotations

from datetime import date

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Customer, Order
from app.modules.ai_tool.query_parser import parse_search_query


def _extract_search_term(prompt: str) -> str | None:
    lowered = prompt.lower().strip()
    markers = ["search", "find", "order", "orders", "delayed"]
    term = lowered
    for marker in markers:
        term = term.replace(marker, " ")
    cleaned = " ".join(term.split()).strip()
    return cleaned or None


async def search_sales_orders(db: AsyncSession, *, tenant_id: int, prompt: str) -> dict:
    query = parse_search_query(prompt)
    search_term = query.reference_text or _extract_search_term(prompt)
    today = date.today()
    stmt = (
        select(Order, Customer)
        .join(Customer, Customer.id == Order.customer_id, isouter=True)
        .where(Order.tenant_id == tenant_id)
    )

    applied_filters: list[str] = []
    if query.statuses:
        stmt = stmt.where(Order.status.in_(query.statuses))
        applied_filters.append(f"status in {', '.join(query.statuses)}")

    if query.delayed_only:
        stmt = stmt.where(
            and_(
                Order.delivery_date.is_not(None),
                Order.delivery_date < today,
                Order.status.not_in(["COMPLETED", "CLOSED", "CANCELLED"]),
            )
        )
        applied_filters.append("delayed only")

    if query.from_date:
        stmt = stmt.where(Order.created_at >= query.from_date)
        applied_filters.append(f"from {query.from_date.isoformat()}")
    if query.to_date:
        stmt = stmt.where(Order.created_at <= query.to_date)
        applied_filters.append(f"to {query.to_date.isoformat()}")

    if search_term:
        pattern = f"%{search_term.lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Order.order_code).like(pattern),
                func.lower(func.coalesce(Order.style_ref, "")).like(pattern),
                func.lower(Order.status).like(pattern),
                func.lower(func.coalesce(Customer.name, "")).like(pattern),
            )
        )
        applied_filters.append(f"search '{search_term}'")

    rows = (await db.execute(stmt.order_by(Order.created_at.desc()).limit(query.top_n))).all()
    if query.buyer_wise:
        bucket: dict[str, dict[str, int]] = {}
        for order, customer in rows:
            buyer = customer.name if customer else f"Customer #{order.customer_id}"
            status = order.status or "UNKNOWN"
            if buyer not in bucket:
                bucket[buyer] = {}
            bucket[buyer][status] = bucket[buyer].get(status, 0) + 1
        buyer_rows = [
            {
                "buyer_name": buyer,
                "status_breakdown": breakdown,
                "total_orders": sum(breakdown.values()),
            }
            for buyer, breakdown in bucket.items()
        ]
        buyer_rows.sort(key=lambda x: x["total_orders"], reverse=True)
        summary = (
            f"Buyer-wise order status generated for {len(buyer_rows)} buyer(s)."
            if buyer_rows
            else "No orders found for buyer-wise status."
        )
        return {
            "title": "Buyer-wise Order Status",
            "summary": summary,
            "data": {
                "applied_filters": applied_filters,
                "items": buyer_rows[: query.top_n],
            },
        }

    items = []
    for order, customer in rows:
        delayed = bool(
            order.delivery_date
            and order.delivery_date < today
            and (order.status or "").upper() not in {"COMPLETED", "CLOSED", "CANCELLED"}
        )
        items.append(
            {
                "id": order.id,
                "order_code": order.order_code,
                "buyer_name": customer.name if customer else None,
                "style_ref": order.style_ref,
                "status": order.status,
                "quantity": order.quantity,
                "delivery_date": order.delivery_date.isoformat() if order.delivery_date else None,
                "is_delayed": delayed,
            }
        )
    summary = f"Found {len(items)} sales order(s)." if items else "No matching sales orders found."
    return {
        "title": "Sales Order Search",
        "summary": summary,
        "data": {
            "applied_filters": applied_filters,
            "items": items,
        },
    }
