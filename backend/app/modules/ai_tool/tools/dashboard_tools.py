from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Customer, Order
from app.modules.ai_tool.tools.approvals_tools import pending_approval_counts


async def get_dashboard_summary(
    db: AsyncSession,
    *,
    tenant_id: int,
    include_finance: bool = True,
    include_hr: bool = True,
) -> dict:
    orders_count = int(
        (
            await db.execute(
                select(func.count()).select_from(Order).where(Order.tenant_id == tenant_id)
            )
        ).scalar()
        or 0
    )
    customers_count = int(
        (
            await db.execute(
                select(func.count()).select_from(Customer).where(Customer.tenant_id == tenant_id)
            )
        ).scalar()
        or 0
    )
    counts = await pending_approval_counts(
        db, tenant_id=tenant_id, include_finance=include_finance, include_hr=include_hr
    )
    pending_approvals = sum(counts.values())
    return {
        "title": "Dashboard Summary",
        "summary": f"{orders_count} orders, {customers_count} customers, {pending_approvals} pending approvals.",
        "data": {
            "active_orders": orders_count,
            "total_customers": customers_count,
            "pending_approvals": pending_approvals,
        },
    }
