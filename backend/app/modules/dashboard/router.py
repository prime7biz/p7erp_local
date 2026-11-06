import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.gemini_client import generate_text_for_tenant
from app.common.tenant import require_tenant
from app.config import get_settings
from app.database import get_db, safe_async_session_rollback
from app.modules.dashboard.ai_services import (
    generate_ai_brief,
    generate_ai_profitability,
)
from app.modules.dashboard.ai_summary_cache import (
    ai_summary_cache_key,
    get_cached_ai_summary,
    set_cached_ai_summary,
)
from app.modules.dashboard.kpi_service import (
    build_attention_summary,
    build_employee_summary,
    build_kpi_list,
    build_production_trends,
    build_revenue_trend,
    count_active_orders,
)
from app.modules.merch.costing_variance_service import list_pending_price_verifications
from app.models import (
    Customer,
    Followup,
    Order,
    Tenant,
    User,
)


router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _ensure_tenant_match(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


@router.get("/kpi")
async def get_kpis(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return high-level KPI cards for the main dashboard (honest counts)."""
    _ensure_tenant_match(user, tenant)
    return await build_kpi_list(db, tenant.id)


@router.get("/attention-summary")
async def attention_summary(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Needs-attention strip: approvals, TNA, alerts, promise/commercial risks."""
    _ensure_tenant_match(user, tenant)
    try:
        return await build_attention_summary(db, tenant.id)
    except Exception:
        await safe_async_session_rollback(db)
        return {
            "pending_approvals": 0,
            "tna_open": 0,
            "tna_overdue": 0,
            "critical_alerts": 0,
            "total_alerts": 0,
            "promise_blocked": 0,
            "commercial_pending": 0,
            "links": {
                "pending_approvals": "/app/approvals",
                "tna_overdue": "/app/followup",
                "critical_alerts": "/app/merchandising/alerts",
                "promise_blocked": "/app/orders",
                "commercial_pending": "/app/orders",
            },
        }


@router.get("/pending-price-verifications")
async def pending_price_verifications(
    limit: int = Query(20, ge=1, le=100),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Owner cost alerts: orders with >10% tentative-vs-actual variance (dashboard shape)."""
    _ensure_tenant_match(user, tenant)
    try:
        items = await list_pending_price_verifications(db, tenant_id=tenant.id, limit=limit)
    except Exception:
        await safe_async_session_rollback(db)
        items = []
    alerts = []
    for item in items:
        pct = item.get("variance_pct")
        pct_label = f"{pct:+.1f}%" if isinstance(pct, (int, float)) else "n/a"
        order_id = item.get("order_id")
        alerts.append(
            {
                "id": f"margin_drop:{order_id}",
                "type": "margin_drop",
                "severity": "critical",
                "message": (
                    f"Order {item.get('order_code') or order_id} cost variance {pct_label} "
                    "(actuals vs tentative >10%)"
                ),
                "entity_type": "order",
                "entity_id": order_id,
                "order_id": order_id,
                "link": item.get("href") or f"/app/orders/{order_id}",
                "created_at": None,
                # Keep flat fields for clients that still expect the orders-list shape.
                "order_code": item.get("order_code"),
                "order_status": item.get("order_status"),
                "status": item.get("status"),
                "tentative_cost": item.get("tentative_cost"),
                "actual_cost": item.get("actual_cost"),
                "variance_pct": pct,
                "href": item.get("href") or f"/app/orders/{order_id}",
            }
        )
    return {"total_alerts": len(alerts), "alerts": alerts}


@router.get("/order-status-breakdown")
async def order_status_breakdown(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Counts of orders by status for charts and summary cards."""
    _ensure_tenant_match(user, tenant)

    result = await db.execute(
        select(Order.status, func.count())
        .where(Order.tenant_id == tenant.id)
        .group_by(Order.status)
    )
    rows = result.all()
    return [{"status": status or "UNKNOWN", "count": int(count)} for status, count in rows]



@router.get("/customer-map")
async def customer_map(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Simple customer count per country for the global map section."""
    _ensure_tenant_match(user, tenant)

    result = await db.execute(
        select(Customer.country, func.count())
        .where(Customer.tenant_id == tenant.id)
        .group_by(Customer.country)
    )
    rows = result.all()
    return [
        {
            "country": country or "Unknown",
            "count": int(count),
        }
        for country, count in rows
    ]


@router.get("/ai-insights")
async def ai_insights(
    refresh: bool = Query(False, description="Ignore the cached AI summary and ask the LLM again"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Rule-based 'AI' insights for now; can be backed by a real AI service later."""
    _ensure_tenant_match(user, tenant)

    active_orders = await count_active_orders(db, tenant.id)

    result_customers = await db.execute(
        select(func.count()).select_from(Customer).where(Customer.tenant_id == tenant.id)
    )
    total_customers = int(result_customers.scalar() or 0)

    insights = []
    if active_orders == 0:
        insights.append(
            {
                "id": "no-orders",
                "title": "No active orders yet",
                "message": "Create your first inquiry and quotation to start the merchandising pipeline.",
                "type": "info",
            }
        )
    else:
        insights.append(
            {
                "id": "orders-active",
                "title": "Active orders in progress",
                "message": f"You currently have {active_orders} order(s) in the system.",
                "type": "success",
            }
        )

    if total_customers == 0:
        insights.append(
            {
                "id": "no-customers",
                "title": "Add your first customer",
                "message": "Start by adding key buyers in the Customers screen so you can log inquiries against them.",
                "type": "warning",
            }
        )

    snapshot = {
        "active_orders": active_orders,
        "total_customers": total_customers,
        "cards": [f"{x.get('title')}: {x.get('message', '')[:200]}" for x in insights],
    }
    prompt = (
        "You advise a garment factory owner using P7 ERP. Based on this dashboard snapshot, write 3-5 short "
        "bullet points (each line starting with '- ') on what deserves attention today. If data is sparse, "
        "encourage onboarding steps. Max 120 words.\n\n"
        f"{json.dumps(snapshot, default=str)}"
    )
    ttl = int(get_settings().dashboard_ai_summary_ttl_seconds or 0)
    cache_key = ai_summary_cache_key(tenant.id, snapshot)
    cached = None if (refresh or ttl <= 0) else await get_cached_ai_summary(cache_key)
    if cached is not None:
        summary = cached.get("summary") or ""
        cached_at = cached.get("cached_at")
    else:
        summary = ""
        cached_at = datetime.now(timezone.utc).isoformat()
        try:
            summary = await generate_text_for_tenant(db, tenant.id, user.id, "brief", prompt) or ""
        except Exception:
            await safe_async_session_rollback(db)
        if ttl > 0:
            usable = len(summary.strip()) > 20
            # Cache "no summary" only briefly so a newly configured AI key shows up soon.
            await set_cached_ai_summary(
                cache_key,
                {"summary": summary, "cached_at": cached_at},
                ttl if usable else min(ttl, 300),
            )
    if summary and len(summary.strip()) > 20:
        insights.append(
            {
                "id": "gemini-daily-summary",
                "title": "AI summary",
                "message": summary.strip()[:2000],
                "type": "info",
                "cached_at": cached_at,
            }
        )

    return insights


@router.get("/ai-brief")
async def ai_brief(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Executive KPI snapshot + Gemini narrative brief."""
    if user.tenant_id != tenant.id:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    return await generate_ai_brief(db, tenant.id)


@router.get("/ai-profitability")
async def ai_profitability(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Quotation/trade margin signals + Gemini narrative."""
    if user.tenant_id != tenant.id:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    return await generate_ai_profitability(db, tenant.id)


@router.get("/production-trends")
async def production_trends(
    from_date: str | None = Query(default=None, description="ISO date YYYY-MM-DD"),
    to_date: str | None = Query(default=None, description="ISO date YYYY-MM-DD"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Orders created by month (honest label; legacy output/target keys kept)."""
    _ensure_tenant_match(user, tenant)
    return await build_production_trends(db, tenant.id, from_date=from_date, to_date=to_date)


@router.get("/recent-orders")
async def recent_orders(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Latest orders with customer names."""
    _ensure_tenant_match(user, tenant)

    result = await db.execute(
        select(Order, Customer)
        .join(Customer, Customer.id == Order.customer_id, isouter=True)
        .where(Order.tenant_id == tenant.id)
        .order_by(Order.created_at.desc())
        .limit(8)
    )
    rows = result.all()
    return [
        {
            "id": order.id,
            "order_code": order.order_code,
            "style_ref": order.style_ref,
            "status": order.status,
            "quantity": order.quantity,
            "delivery_date": order.delivery_date.isoformat() if order.delivery_date else None,
            "customer_name": customer.name if customer else f"#{order.customer_id}",
        }
        for order, customer in rows
    ]


@router.get("/tasks")
async def dashboard_tasks(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Task list sourced from open order follow-ups."""
    _ensure_tenant_match(user, tenant)

    result = await db.execute(
        select(Followup)
        .where(Followup.tenant_id == tenant.id, Followup.status != "DONE")
        .order_by(Followup.created_at.desc())
        .limit(10)
    )
    rows = result.scalars().all()
    return [
        {
            "id": row.id,
            "title": row.title,
            "status": row.status,
            "due_date": row.due_date.isoformat() if row.due_date else None,
            "severity": row.severity,
            "order_id": row.order_id,
        }
        for row in rows
    ]


@router.get("/employee-summary")
async def employee_summary(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """HR employee counts for dashboard widget."""
    _ensure_tenant_match(user, tenant)
    try:
        return await build_employee_summary(db, tenant.id)
    except Exception:
        await safe_async_session_rollback(db)
        return {"total": 0, "breakdown": [], "departments": []}


@router.get("/payroll-summary")
async def payroll_summary(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
):
    """Placeholder parity endpoint for dashboard widget (Payroll module pending)."""
    _ensure_tenant_match(user, tenant)
    return []


@router.get("/revenue-trend")
async def revenue_trend(
    from_date: str | None = Query(default=None, description="ISO date YYYY-MM-DD"),
    to_date: str | None = Query(default=None, description="ISO date YYYY-MM-DD"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Quoted amounts by month (quotations — not posted GL revenue)."""
    _ensure_tenant_match(user, tenant)
    return await build_revenue_trend(db, tenant.id, from_date=from_date, to_date=to_date)


@router.get("/ai/executive-brief")
async def dashboard_executive_ai_brief(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Phase 18: read-only executive snapshot (risk signals + heuristic opportunities)."""
    if user.tenant_id != tenant.id:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

    from app.modules.ai_tool.audit import log_ai_event
    from app.modules.dashboard.executive_ai_brief_service import build_executive_brief
    from app.modules.erp_ai_phases.feature_flags import require_phase

    require_phase("executive_ai_dashboard", tenant=tenant)
    payload = await build_executive_brief(db, tenant_id=tenant.id)
    await log_ai_event(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="EXECUTIVE_AI_BRIEF",
        resource="dashboard",
        details_json={"risk_count": len(payload.get("risk_signals") or [])},
        reason_code="PHASE18_READ_ONLY",
    )
    await db.commit()
    return payload

