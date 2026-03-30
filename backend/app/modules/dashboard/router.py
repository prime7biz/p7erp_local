import json
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.gemini_client import generate_text_for_tenant
from app.common.tenant import require_tenant
from app.database import get_db
from app.modules.dashboard.ai_services import (
    generate_ai_brief,
    generate_ai_profitability,
)
from app.models import (
    BankReconciliation,
    Customer,
    Followup,
    LeaveRequest,
    Order,
    PayrollApproval,
    PaymentRun,
    Quotation,
    Tenant,
    User,
    Voucher,
)


router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/kpi")
async def get_kpis(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return high-level KPI cards for the main dashboard."""
    if user.tenant_id != tenant.id:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

    # Active orders (all non-draft orders for now)
    result_orders = await db.execute(
        select(func.count()).select_from(Order).where(
            Order.tenant_id == tenant.id,
        )
    )
    active_orders = int(result_orders.scalar() or 0)

    # Customers
    result_customers = await db.execute(
        select(func.count()).select_from(Customer).where(Customer.tenant_id == tenant.id)
    )
    total_customers = int(result_customers.scalar() or 0)

    # Monthly revenue placeholder; pending approvals from real queues.
    monthly_revenue = 0
    vouchers_pending = await db.execute(
        select(func.count()).select_from(Voucher).where(
            Voucher.tenant_id == tenant.id,
            Voucher.status.in_(["SUBMITTED", "CHECKED", "RECOMMENDED"]),
        )
    )
    runs_draft = await db.execute(
        select(func.count()).select_from(PaymentRun).where(
            PaymentRun.tenant_id == tenant.id,
            PaymentRun.status == "DRAFT",
        )
    )
    recons_open = await db.execute(
        select(func.count()).select_from(BankReconciliation).where(
            BankReconciliation.tenant_id == tenant.id,
            BankReconciliation.is_finalized.is_(False),
        )
    )
    leave_pending = await db.execute(
        select(func.count()).select_from(LeaveRequest).where(
            LeaveRequest.tenant_id == tenant.id,
            LeaveRequest.status.in_(["PENDING", "SUBMITTED"]),
        )
    )
    payroll_pending = await db.execute(
        select(func.count()).select_from(PayrollApproval).where(
            PayrollApproval.tenant_id == tenant.id,
            func.lower(PayrollApproval.action) == "pending",
        )
    )
    pending_approvals = (
        int(vouchers_pending.scalar() or 0)
        + int(runs_draft.scalar() or 0)
        + int(recons_open.scalar() or 0)
        + int(leave_pending.scalar() or 0)
        + int(payroll_pending.scalar() or 0)
    )

    return [
        {"id": "active-orders", "label": "Active Orders", "value": active_orders},
        {"id": "monthly-revenue", "label": "Monthly Revenue", "value": monthly_revenue},
        {"id": "pending-approvals", "label": "Pending Approvals", "value": pending_approvals},
        {"id": "total-customers", "label": "Total Customers", "value": total_customers},
    ]


@router.get("/order-status-breakdown")
async def order_status_breakdown(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Counts of orders by status for charts and summary cards."""
    if user.tenant_id != tenant.id:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

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
    if user.tenant_id != tenant.id:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

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
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Rule-based 'AI' insights for now; can be backed by a real AI service later."""
    if user.tenant_id != tenant.id:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

    result_orders = await db.execute(
        select(func.count()).select_from(Order).where(Order.tenant_id == tenant.id)
    )
    active_orders = int(result_orders.scalar() or 0)

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
    try:
        summary = await generate_text_for_tenant(db, tenant.id, user.id, "brief", prompt)
        if summary and len(summary.strip()) > 20:
            insights.append(
                {
                    "id": "gemini-daily-summary",
                    "title": "AI summary",
                    "message": summary.strip()[:2000],
                    "type": "info",
                }
            )
    except Exception:
        pass

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
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Simple monthly trend points (output/target/efficiency) for dashboard charts."""
    if user.tenant_id != tenant.id:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

    # Keep this DB-agnostic (SQLite + Postgres) by bucketing in Python.
    # Cap scope: last 12 months and at most 10k rows to avoid full-table scans.
    cutoff = datetime.utcnow() - timedelta(days=365)
    result = await db.execute(
        select(Order.created_at)
        .where(Order.tenant_id == tenant.id, Order.created_at >= cutoff)
        .order_by(Order.created_at.asc())
        .limit(10000)
    )
    rows = result.all()
    month_counts: dict[str, int] = {}
    for (created_at,) in rows:
        month_key = created_at.strftime("%b %Y")
        month_counts[month_key] = month_counts.get(month_key, 0) + 1
    points = []
    for month_key, order_count in month_counts.items():
        output = int(order_count or 0)
        target = max(output + 2, 5)
        efficiency = round((output / target) * 100, 1) if target > 0 else 0
        points.append(
            {
                "date": month_key,
                "output": output,
                "target": target,
                "efficiency": efficiency,
            }
        )
    return points


@router.get("/recent-orders")
async def recent_orders(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Latest orders with customer names."""
    if user.tenant_id != tenant.id:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

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
    if user.tenant_id != tenant.id:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

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
):
    """Placeholder parity endpoint for dashboard widget (HR module pending)."""
    if user.tenant_id != tenant.id:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    return {"total": 0, "breakdown": [], "departments": []}


@router.get("/payroll-summary")
async def payroll_summary(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
):
    """Placeholder parity endpoint for dashboard widget (Payroll module pending)."""
    if user.tenant_id != tenant.id:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    return []


@router.get("/revenue-trend")
async def revenue_trend(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revenue trend from quotations (quoted_price or total_amount)."""
    if user.tenant_id != tenant.id:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

    # Cap work for large tenants: last ~24 months, max rows (Finding #3).
    since = datetime.utcnow() - timedelta(days=730)
    result = await db.execute(
        select(Quotation.created_at, Quotation.quoted_price, Quotation.total_amount)
        .where(Quotation.tenant_id == tenant.id, Quotation.created_at >= since)
        .order_by(Quotation.created_at.asc())
        .limit(8000)
    )
    bucket: dict[str, float] = {}
    for created_at, quoted_price, total_amount in result.all():
        key = created_at.strftime("%b %Y")
        raw = quoted_price or total_amount or "0"
        try:
            value = float(raw)
        except (TypeError, ValueError):
            value = 0.0
        bucket[key] = bucket.get(key, 0.0) + value
    months = [{"month": k, "revenue": round(v, 2)} for k, v in bucket.items()]
    total = round(sum(v["revenue"] for v in months), 2)
    return {"months": months, "totalRevenue": total}


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

