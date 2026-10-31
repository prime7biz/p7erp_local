"""Dashboard KPI and attention helpers (honest counts, fail-soft aggregation)."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from time import monotonic
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import safe_async_session_rollback
from app.models.manufacturing import ManufacturingTnaPlan, ManufacturingTnaPlanTask
from app.models.merch import OrderFollowupAction
from app.models import (
    AlertInstance,
    BankReconciliation,
    Customer,
    Employee,
    GarmentStyle,
    Item,
    LeaveRequest,
    Order,
    PayrollApproval,
    PaymentRun,
    Quotation,
    Voucher,
)
from app.modules.orders.change_request_service import (
    count_pending_approvals as count_change_request_pending_approvals,
)

ACTIVE_ORDER_EXCLUDED = ("DRAFT", "CANCELLED")
ATTENTION_SUMMARY_CACHE_TTL_SECONDS = 45
_attention_summary_cache: dict[int, tuple[float, dict[str, Any]]] = {}


async def count_active_orders(db: AsyncSession, tenant_id: int) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(Order)
        .where(
            Order.tenant_id == tenant_id,
            ~Order.status.in_(list(ACTIVE_ORDER_EXCLUDED)),
        )
    )
    return int(result.scalar() or 0)


async def count_pending_approvals_queues(db: AsyncSession, tenant_id: int) -> int:
    vouchers_pending = await db.execute(
        select(func.count())
        .select_from(Voucher)
        .where(
            Voucher.tenant_id == tenant_id,
            Voucher.status.in_(["SUBMITTED", "CHECKED", "RECOMMENDED"]),
        )
    )
    runs_draft = await db.execute(
        select(func.count())
        .select_from(PaymentRun)
        .where(PaymentRun.tenant_id == tenant_id, PaymentRun.status == "DRAFT")
    )
    recons_open = await db.execute(
        select(func.count())
        .select_from(BankReconciliation)
        .where(
            BankReconciliation.tenant_id == tenant_id,
            BankReconciliation.is_finalized.is_(False),
        )
    )
    leave_pending = await db.execute(
        select(func.count())
        .select_from(LeaveRequest)
        .where(
            LeaveRequest.tenant_id == tenant_id,
            LeaveRequest.status.in_(["PENDING", "SUBMITTED"]),
        )
    )
    payroll_pending = await db.execute(
        select(func.count())
        .select_from(PayrollApproval)
        .where(
            PayrollApproval.tenant_id == tenant_id,
            func.lower(PayrollApproval.action) == "pending",
        )
    )
    return (
        int(vouchers_pending.scalar() or 0)
        + int(runs_draft.scalar() or 0)
        + int(recons_open.scalar() or 0)
        + int(leave_pending.scalar() or 0)
        + int(payroll_pending.scalar() or 0)
    )


async def sum_quoted_this_month(db: AsyncSession, tenant_id: int, *, now: datetime | None = None) -> float:
    """Sum quotation amounts for the current calendar month (honest 'Quoted this month')."""
    now = now or datetime.utcnow()
    month_start = datetime(now.year, now.month, 1)
    if now.month == 12:
        month_end = datetime(now.year + 1, 1, 1)
    else:
        month_end = datetime(now.year, now.month + 1, 1)
    result = await db.execute(
        select(Quotation.quoted_price, Quotation.total_amount).where(
            Quotation.tenant_id == tenant_id,
            Quotation.created_at >= month_start,
            Quotation.created_at < month_end,
        ).limit(8000)
    )
    total = 0.0
    for quoted_price, total_amount in result.all():
        raw = quoted_price or total_amount or "0"
        try:
            total += float(raw)
        except (TypeError, ValueError):
            continue
    return round(total, 2)


async def count_inventory_items(db: AsyncSession, tenant_id: int) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(Item)
        .where(Item.tenant_id == tenant_id, Item.is_active.is_(True))
    )
    return int(result.scalar() or 0)


async def count_styles(db: AsyncSession, tenant_id: int) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(GarmentStyle)
        .where(GarmentStyle.tenant_id == tenant_id)
    )
    return int(result.scalar() or 0)


async def build_kpi_list(db: AsyncSession, tenant_id: int) -> list[dict[str, Any]]:
    active_orders = await count_active_orders(db, tenant_id)
    total_customers = int(
        (
            await db.execute(
                select(func.count()).select_from(Customer).where(Customer.tenant_id == tenant_id)
            )
        ).scalar()
        or 0
    )
    monthly_quoted = await sum_quoted_this_month(db, tenant_id)
    pending_approvals = await count_pending_approvals_queues(db, tenant_id)
    inventory_items = await count_inventory_items(db, tenant_id)
    styles_count = await count_styles(db, tenant_id)
    return [
        {
            "id": "active-orders",
            "label": "Active Orders",
            "value": active_orders,
            "subtitle": "Excludes draft & cancelled",
        },
        {
            "id": "monthly-revenue",
            "label": "Quoted this month",
            "value": monthly_quoted,
            "subtitle": "From quotations (not GL)",
        },
        {
            "id": "pending-approvals",
            "label": "Pending Approvals",
            "value": pending_approvals,
        },
        {
            "id": "total-customers",
            "label": "Total Customers",
            "value": total_customers,
        },
        {
            "id": "inventory-items",
            "label": "Inventory Items",
            "value": inventory_items,
        },
        {
            "id": "styles-count",
            "label": "Total Styles",
            "value": styles_count,
        },
    ]


async def build_employee_summary(db: AsyncSession, tenant_id: int) -> dict[str, Any]:
    total = int(
        (
            await db.execute(
                select(func.count()).select_from(Employee).where(Employee.tenant_id == tenant_id)
            )
        ).scalar()
        or 0
    )
    active = int(
        (
            await db.execute(
                select(func.count())
                .select_from(Employee)
                .where(Employee.tenant_id == tenant_id, Employee.is_active.is_(True))
            )
        ).scalar()
        or 0
    )
    inactive = max(total - active, 0)
    breakdown = []
    if active:
        breakdown.append({"status": "Active", "count": active})
    if inactive:
        breakdown.append({"status": "Inactive", "count": inactive})
    # Department breakdown (label field reused as status for existing UI type)
    dept_rows = (
        await db.execute(
            select(func.coalesce(Employee.department_id, 0), func.count())
            .where(Employee.tenant_id == tenant_id)
            .group_by(Employee.department_id)
            .limit(20)
        )
    ).all()
    departments = [
        {"status": f"Dept #{int(dept_id)}" if int(dept_id) else "Unassigned", "count": int(cnt)}
        for dept_id, cnt in dept_rows
    ]
    return {"total": total, "breakdown": breakdown, "departments": departments}


def parse_date_range(
    from_date: str | None,
    to_date: str | None,
    *,
    default_days: int = 365,
) -> tuple[datetime, datetime]:
    """Parse optional ISO dates; defaults to last `default_days` through now."""
    now = datetime.utcnow()
    start = now - timedelta(days=default_days)
    end = now + timedelta(days=1)
    if from_date:
        try:
            start = datetime.fromisoformat(from_date[:10])
        except ValueError:
            pass
    if to_date:
        try:
            end = datetime.fromisoformat(to_date[:10]) + timedelta(days=1)
        except ValueError:
            pass
    return start, end


async def build_production_trends(
    db: AsyncSession,
    tenant_id: int,
    *,
    from_date: str | None = None,
    to_date: str | None = None,
) -> list[dict[str, Any]]:
    """Orders created by month. Keeps legacy keys; stops inventing fake targets."""
    start, end = parse_date_range(from_date, to_date, default_days=365)
    result = await db.execute(
        select(Order.created_at)
        .where(
            Order.tenant_id == tenant_id,
            Order.created_at >= start,
            Order.created_at < end,
        )
        .order_by(Order.created_at.asc())
        .limit(10000)
    )
    month_counts: dict[str, int] = {}
    for (created_at,) in result.all():
        if not created_at:
            continue
        month_key = created_at.strftime("%b %Y")
        month_counts[month_key] = month_counts.get(month_key, 0) + 1
    points = []
    for month_key, order_count in month_counts.items():
        output = int(order_count or 0)
        points.append(
            {
                "date": month_key,
                "orders_created": output,
                "output": output,
                "target": output,
                "efficiency": 100.0 if output > 0 else 0.0,
                "label": "Orders created",
            }
        )
    return points


async def build_revenue_trend(
    db: AsyncSession,
    tenant_id: int,
    *,
    from_date: str | None = None,
    to_date: str | None = None,
) -> dict[str, Any]:
    start, end = parse_date_range(from_date, to_date, default_days=730)
    result = await db.execute(
        select(Quotation.created_at, Quotation.quoted_price, Quotation.total_amount)
        .where(
            Quotation.tenant_id == tenant_id,
            Quotation.created_at >= start,
            Quotation.created_at < end,
        )
        .order_by(Quotation.created_at.asc())
        .limit(8000)
    )
    bucket: dict[str, float] = {}
    for created_at, quoted_price, total_amount in result.all():
        if not created_at:
            continue
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


async def _safe_int(coro) -> int:
    try:
        return int(await coro)
    except Exception:
        return 0


async def build_attention_summary(db: AsyncSession, tenant_id: int) -> dict[str, Any]:
    """Fail-soft attention strip payload for the home dashboard."""
    cached = _attention_summary_cache.get(tenant_id)
    now_mono = monotonic()
    if cached and (now_mono - cached[0]) <= ATTENTION_SUMMARY_CACHE_TTL_SECONDS:
        return cached[1]

    pending_approvals = 0
    tna_open = 0
    tna_overdue = 0
    critical_alerts = 0
    total_alerts = 0
    promise_blocked = 0
    commercial_pending = 0
    post_dated_due_today = 0

    try:
        pending_approvals = await count_pending_approvals_queues(db, tenant_id)
    except Exception:
        await safe_async_session_rollback(db)

    try:
        today = date.today()
        merch_open_statuses = (
            "pending",
            "in_progress",
            "submitted",
            "rejected",
            "resubmitted",
            "on_hold",
        )
        merch_lv = func.lower(func.coalesce(OrderFollowupAction.status, ""))
        merch_base = OrderFollowupAction.tenant_id == tenant_id
        tna_open = int(
            await db.scalar(
                select(func.count()).select_from(OrderFollowupAction).where(
                    merch_base,
                    merch_lv.in_(merch_open_statuses),
                )
            )
            or 0
        )
        tna_overdue = int(
            await db.scalar(
                select(func.count()).select_from(OrderFollowupAction).where(
                    merch_base,
                    merch_lv.in_(merch_open_statuses),
                    OrderFollowupAction.planned_date.isnot(None),
                    OrderFollowupAction.planned_date < today,
                )
            )
            or 0
        )
        plan_ids = list(
            (
                await db.execute(
                    select(ManufacturingTnaPlan.id).where(ManufacturingTnaPlan.tenant_id == tenant_id)
                )
            ).scalars().all()
        )
        if plan_ids:
            mfg_where = and_(
                ManufacturingTnaPlanTask.tenant_id == tenant_id,
                ManufacturingTnaPlanTask.plan_id.in_(plan_ids),
            )
            mv = func.lower(func.coalesce(ManufacturingTnaPlanTask.status, ""))
            tna_open += int(
                await db.scalar(
                    select(func.count()).select_from(ManufacturingTnaPlanTask).where(
                        mfg_where,
                        ~mv.in_(("done", "cancelled")),
                    )
                )
                or 0
            )
            tna_overdue += int(
                await db.scalar(
                    select(func.count()).select_from(ManufacturingTnaPlanTask).where(
                        mfg_where,
                        ~mv.in_(("done", "cancelled")),
                        ManufacturingTnaPlanTask.planned_date.isnot(None),
                        ManufacturingTnaPlanTask.planned_date < today,
                    )
                )
                or 0
            )
    except Exception:
        await safe_async_session_rollback(db)

    try:
        now = datetime.now(timezone.utc)
        stmt = (
            select(AlertInstance.severity, func.count())
            .where(
                AlertInstance.tenant_id == tenant_id,
                or_(
                    AlertInstance.snoozed_until.is_(None),
                    AlertInstance.snoozed_until <= now,
                ),
            )
            .group_by(AlertInstance.severity)
        )
        rows = (await db.execute(stmt)).all()
        counts = {(sev or "").lower(): int(cnt) for sev, cnt in rows}
        critical_alerts = counts.get("critical", 0)
        total_alerts = sum(counts.values())
    except Exception:
        await safe_async_session_rollback(db)

    try:
        commercial_pending = int(await count_change_request_pending_approvals(db, tenant_id=tenant_id))
    except Exception:
        await safe_async_session_rollback(db)

    try:
        # Lightweight proxy: open critical follow-ups tagged as promise-related are rare;
        # use order count in NEW/IN_PROGRESS with overdue delivery as a soft signal when
        # full ATP/CTP scan is too heavy for the home strip.
        today = date.today()
        promise_blocked = int(
            await db.scalar(
                select(func.count())
                .select_from(Order)
                .where(
                    Order.tenant_id == tenant_id,
                    Order.status.in_(["NEW", "IN_PROGRESS", "CONFIRMED"]),
                    Order.delivery_date.isnot(None),
                    Order.delivery_date < today,
                )
            )
            or 0
        )
    except Exception:
        await safe_async_session_rollback(db)

    try:
        today = date.today()
        post_dated_due_today = int(
            await db.scalar(
                select(func.count())
                .select_from(Voucher)
                .where(
                    Voucher.tenant_id == tenant_id,
                    Voucher.is_post_dated.is_(True),
                    Voucher.voucher_date <= today,
                    Voucher.status.notin_(("CANCELLED", "REVERSED")),
                )
            )
            or 0
        )
    except Exception:
        await safe_async_session_rollback(db)

    payload = {
        "pending_approvals": pending_approvals,
        "tna_open": tna_open,
        "tna_overdue": tna_overdue,
        "critical_alerts": critical_alerts,
        "total_alerts": total_alerts,
        "promise_blocked": promise_blocked,
        "commercial_pending": commercial_pending,
        "post_dated_due_today": post_dated_due_today,
        "links": {
            "pending_approvals": "/app/approvals",
            "tna_overdue": "/app/followup",
            "critical_alerts": "/app/merchandising/alerts",
            "promise_blocked": "/app/orders",
            "commercial_pending": "/app/orders",
            "post_dated_due_today": "/app/finance/registers/post-dated",
        },
    }
    _attention_summary_cache[tenant_id] = (now_mono, payload)
    return payload
