"""KPI aggregation and Gemini narratives for dashboard AI endpoints."""

from __future__ import annotations

import json
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.gemini_client import generate_text_for_tenant
from app.models import (
    BankReconciliation,
    Bom,
    BomItem,
    Customer,
    Employee,
    LeaveRequest,
    ManufacturingDowntimeEvent,
    Order,
    PayrollApproval,
    PaymentRun,
    Quotation,
    StockMovement,
    TradeCase,
    Voucher,
)


async def build_executive_kpi_snapshot(db: AsyncSession, tenant_id: int) -> dict[str, Any]:
    today = date.today()
    active_orders = int(
        (await db.execute(select(func.count()).select_from(Order).where(Order.tenant_id == tenant_id))).scalar() or 0
    )
    total_customers = int(
        (await db.execute(select(func.count()).select_from(Customer).where(Customer.tenant_id == tenant_id))).scalar() or 0
    )
    vouchers_pending = await db.execute(
        select(func.count()).select_from(Voucher).where(
            Voucher.tenant_id == tenant_id,
            Voucher.status.in_(["SUBMITTED", "CHECKED", "RECOMMENDED"]),
        )
    )
    runs_draft = await db.execute(
        select(func.count()).select_from(PaymentRun).where(
            PaymentRun.tenant_id == tenant_id,
            PaymentRun.status == "DRAFT",
        )
    )
    recons_open = await db.execute(
        select(func.count()).select_from(BankReconciliation).where(
            BankReconciliation.tenant_id == tenant_id,
            BankReconciliation.is_finalized.is_(False),
        )
    )
    leave_pending = await db.execute(
        select(func.count()).select_from(LeaveRequest).where(
            LeaveRequest.tenant_id == tenant_id,
            LeaveRequest.status.in_(["PENDING", "SUBMITTED"]),
        )
    )
    payroll_pending = await db.execute(
        select(func.count()).select_from(PayrollApproval).where(
            PayrollApproval.tenant_id == tenant_id,
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

    past_due = 0
    r = await db.execute(
        select(Order.delivery_date, Order.status).where(Order.tenant_id == tenant_id)
    )
    for d, st in r.all():
        if not d or d >= today:
            continue
        if str(st or "").upper() not in {"COMPLETED", "CLOSED", "CANCELLED"}:
            past_due += 1

    open_dt = int(
        (
            await db.execute(
                select(func.count()).select_from(ManufacturingDowntimeEvent).where(
                    ManufacturingDowntimeEvent.tenant_id == tenant_id,
                    func.lower(ManufacturingDowntimeEvent.status).in_(["open", "investigating"]),
                )
            )
        ).scalar()
        or 0
    )

    trade_cases_open = int(
        (
            await db.execute(
                select(func.count()).select_from(TradeCase).where(
                    TradeCase.tenant_id == tenant_id,
                    TradeCase.closed_at.is_(None),
                )
            )
        ).scalar()
        or 0
    )

    return {
        "as_of": today.isoformat(),
        "active_orders": active_orders,
        "total_customers": total_customers,
        "pending_approvals_total": pending_approvals,
        "orders_past_delivery_open": past_due,
        "open_downtime_events": open_dt,
        "open_trade_cases": trade_cases_open,
    }


async def generate_ai_brief(db: AsyncSession, tenant_id: int) -> dict[str, Any]:
    snapshot = await build_executive_kpi_snapshot(db, tenant_id)
    prompt = (
        "You advise a garment factory owner using P7 ERP. Using this JSON snapshot, write a 5-bullet "
        "executive brief (each line starting with '- ') on priorities and risks. Max 180 words.\n\n"
        f"{json.dumps(snapshot, default=str)}"
    )
    brief = await generate_text_for_tenant(db, tenant_id, None, "brief", prompt)
    return {
        "brief": brief or "AI brief is unavailable (check GEMINI_API_KEY in Docker environment).",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "kpi_snapshot": snapshot,
    }


async def generate_ai_profitability(db: AsyncSession, tenant_id: int) -> dict[str, Any]:
    rows = (
        await db.execute(
            select(Quotation.quoted_price, Quotation.total_cost, Quotation.status).where(Quotation.tenant_id == tenant_id)
        )
    ).all()
    neg = 0
    checked = 0
    for qp, tc, st in rows:
        if str(st or "").upper() in {"DRAFT", "REJECTED"}:
            continue
        q = float(qp or 0)
        c = float(tc or 0)
        if q <= 0 or c <= 0:
            continue
        checked += 1
        if q < c:
            neg += 1

    tc_rows = (
        await db.execute(
            select(TradeCase.margin_pct, TradeCase.margin_amount, TradeCase.reference).where(TradeCase.tenant_id == tenant_id).limit(50)
        )
    ).all()
    trade_summary = [
        {"reference": ref, "margin_pct": float(mp) if mp is not None else None, "margin_amount": float(ma) if ma is not None else None}
        for mp, ma, ref in tc_rows
    ]

    snapshot = {
        "quotations_checked": checked,
        "quotations_negative_margin_count": neg,
        "trade_cases_sample": trade_summary[:15],
    }
    prompt = (
        "Analyze profitability signals for a garment export/manufacturing company. JSON data follows. "
        "Give a short narrative (under 200 words) on risks and 3 concrete recommendations. No markdown code blocks.\n\n"
        f"{json.dumps(snapshot, default=str)[:8000]}"
    )
    narrative = await generate_text_for_tenant(db, tenant_id, None, "brief", prompt)
    return {
        "narrative": narrative or "Profitability analysis unavailable without Gemini.",
        "metrics": snapshot,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


async def run_data_quality_issues(db: AsyncSession, tenant_id: int) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []

    orphan_orders = int(
        (
            await db.execute(
                select(func.count()).select_from(Order).where(
                    Order.tenant_id == tenant_id,
                    Order.quotation_id.is_(None),
                )
            )
        ).scalar()
        or 0
    )
    if orphan_orders:
        issues.append(
            {
                "severity": "MEDIUM",
                "code": "ORDER_WITHOUT_QUOTATION",
                "title": f"{orphan_orders} order(s) have no linked quotation",
                "suggestion": "Link orders to quotations or document why quotation is missing.",
            }
        )

    bom_ids = (await db.execute(select(Bom.id).where(Bom.tenant_id == tenant_id))).scalars().all()
    empty_boms = 0
    for bid in bom_ids[:500]:
        cnt = int(
            (await db.execute(select(func.count()).select_from(BomItem).where(BomItem.bom_id == bid))).scalar() or 0
        )
        if cnt == 0:
            empty_boms += 1
    if empty_boms:
        issues.append(
            {
                "severity": "HIGH",
                "code": "BOM_EMPTY_LINES",
                "title": f"{empty_boms} BOM(s) have zero line items",
                "suggestion": "Review BOM versions and add materials or archive unused BOMs.",
            }
        )

    dup_emails = (
        await db.execute(
            select(Customer.contact_email, func.count())
            .where(Customer.tenant_id == tenant_id, Customer.contact_email.isnot(None))
            .group_by(Customer.contact_email)
            .having(func.count() > 1)
        )
    ).all()
    if dup_emails:
        issues.append(
            {
                "severity": "MEDIUM",
                "code": "DUPLICATE_CUSTOMER_EMAIL",
                "title": f"{len(dup_emails)} duplicate customer email group(s)",
                "suggestion": "Merge or clarify duplicate customer master records.",
            }
        )

    emp_no_dept = int(
        (
            await db.execute(
                select(func.count()).select_from(Employee).where(
                    Employee.tenant_id == tenant_id,
                    Employee.department_id.is_(None),
                )
            )
        ).scalar()
        or 0
    )
    if emp_no_dept:
        issues.append(
            {
                "severity": "LOW",
                "code": "EMPLOYEE_NO_DEPARTMENT",
                "title": f"{emp_no_dept} employee(s) without department",
                "suggestion": "Assign departments for reporting and approvals.",
            }
        )

    orphan_sm = int(
        (
            await db.execute(
                select(func.count()).select_from(StockMovement).where(
                    StockMovement.tenant_id == tenant_id,
                    or_(StockMovement.item_id.is_(None), StockMovement.item_id == 0),
                )
            )
        ).scalar()
        or 0
    )
    if orphan_sm:
        issues.append(
            {
                "severity": "HIGH",
                "code": "STOCK_MOVEMENT_NO_ITEM",
                "title": f"{orphan_sm} stock movement(s) missing item reference",
                "suggestion": "Review and correct inventory transactions.",
            }
        )

    return issues


async def generate_data_quality_scan(db: AsyncSession, tenant_id: int) -> dict[str, Any]:
    issues = await run_data_quality_issues(db, tenant_id)
    prompt = (
        "Summarize data quality findings for an ERP admin. Issues (JSON):\n"
        f"{json.dumps(issues, default=str)[:6000]}\n"
        "Write 2-4 sentences on overall health and top fix order. Plain text."
    )
    narrative = await generate_text_for_tenant(db, tenant_id, None, "brief", prompt)
    return {
        "issues": issues,
        "narrative": narrative or "Run with GEMINI_API_KEY for an AI narrative.",
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
