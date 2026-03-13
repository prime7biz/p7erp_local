from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Customer,
    Department,
    Employee,
    LeaveRequest,
    ManufacturingDowntimeEvent,
    ManufacturingNcr,
    ManufacturingWorkOrder,
    Order,
    PayrollApproval,
    Quotation,
    StockMovement,
)
from app.modules.ai_tool.authz import has_tool_permission
from app.modules.ai_tool.query_parser import parse_search_query
from app.modules.ai_tool.schemas import AiToolInvocationResult


@dataclass(slots=True)
class ReportTemplate:
    report_code: str
    report_name: str
    source_modules: list[str]
    required_permission_keys: list[str]


REPORT_TEMPLATES: dict[str, ReportTemplate] = {
    "monthly_production_summary": ReportTemplate(
        report_code="monthly_production_summary",
        report_name="Monthly Production Summary",
        source_modules=["manufacturing"],
        required_permission_keys=["ai.tools.production.read"],
    ),
    "buyer_wise_profitability_summary": ReportTemplate(
        report_code="buyer_wise_profitability_summary",
        report_name="Buyer-wise Profitability Summary (Proxy)",
        source_modules=["orders", "finance"],
        required_permission_keys=["ai.tools.orders.read", "ai.tools.finance.read"],
    ),
    "pending_approvals_by_department": ReportTemplate(
        report_code="pending_approvals_by_department",
        report_name="Pending Approvals by Department",
        source_modules=["hr", "workflow"],
        required_permission_keys=["ai.tools.approvals.read"],
    ),
    "inventory_movement_comparison": ReportTemplate(
        report_code="inventory_movement_comparison",
        report_name="Inventory Movement Comparison",
        source_modules=["inventory"],
        required_permission_keys=["ai.tools.inventory.read"],
    ),
    "dashboard_executive_summary": ReportTemplate(
        report_code="dashboard_executive_summary",
        report_name="Executive Dashboard KPI Summary",
        source_modules=["dashboard", "workflow"],
        required_permission_keys=["ai.tools.dashboard.read"],
    ),
}


def detect_report_template(prompt: str) -> ReportTemplate:
    text = prompt.lower()
    if "monthly" in text and "production" in text:
        return REPORT_TEMPLATES["monthly_production_summary"]
    if "buyer" in text and ("profit" in text or "profitability" in text):
        return REPORT_TEMPLATES["buyer_wise_profitability_summary"]
    if "pending approvals" in text and "department" in text:
        return REPORT_TEMPLATES["pending_approvals_by_department"]
    if "inventory" in text and ("movement" in text or "compare" in text):
        return REPORT_TEMPLATES["inventory_movement_comparison"]
    if "executive summary" in text or ("dashboard" in text and "kpi" in text):
        return REPORT_TEMPLATES["dashboard_executive_summary"]
    return REPORT_TEMPLATES["dashboard_executive_summary"]


def _to_float(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


async def _monthly_production_summary(db: AsyncSession, tenant_id: int) -> tuple[dict, str]:
    today = date.today()
    month_start = today.replace(day=1)
    wo_rows = (
        await db.execute(
            select(ManufacturingWorkOrder.status, func.count())
            .where(ManufacturingWorkOrder.tenant_id == tenant_id, ManufacturingWorkOrder.created_at >= month_start)
            .group_by(ManufacturingWorkOrder.status)
        )
    ).all()
    ncr_count = int(
        (
            await db.execute(
                select(func.count()).select_from(ManufacturingNcr).where(
                    ManufacturingNcr.tenant_id == tenant_id,
                    ManufacturingNcr.created_at >= month_start,
                )
            )
        ).scalar()
        or 0
    )
    open_downtime = int(
        (
            await db.execute(
                select(func.count()).select_from(ManufacturingDowntimeEvent).where(
                    ManufacturingDowntimeEvent.tenant_id == tenant_id,
                    ManufacturingDowntimeEvent.ended_at.is_(None),
                )
            )
        ).scalar()
        or 0
    )
    status_breakdown = {str(status or "unknown"): int(count) for status, count in wo_rows}
    total_wo = sum(status_breakdown.values())
    narrative = (
        f"Monthly production generated {total_wo} work order(s). "
        f"NCR events: {ncr_count}. Ongoing downtime events: {open_downtime}. "
        "Focus on reducing open downtime and recurring defects."
    )
    return {
        "period_start": month_start.isoformat(),
        "work_orders_by_status": status_breakdown,
        "ncr_count": ncr_count,
        "open_downtime_events": open_downtime,
    }, narrative


async def _buyer_wise_profitability_proxy(db: AsyncSession, tenant_id: int) -> tuple[dict, str]:
    rows = (
        await db.execute(
            select(Customer.name, Quotation.total_amount, Order.commission_value)
            .join(Order, Order.customer_id == Customer.id)
            .join(Quotation, Quotation.id == Order.quotation_id, isouter=True)
            .where(Customer.tenant_id == tenant_id, Order.tenant_id == tenant_id)
        )
    ).all()
    bucket: dict[str, dict[str, float]] = {}
    for buyer_name, total_amount, commission_value in rows:
        buyer = buyer_name or "Unknown Buyer"
        if buyer not in bucket:
            bucket[buyer] = {"order_count": 0.0, "gross_value": 0.0, "commission_proxy": 0.0, "contribution_proxy": 0.0}
        gross = _to_float(total_amount)
        comm = _to_float(commission_value)
        bucket[buyer]["order_count"] += 1
        bucket[buyer]["gross_value"] += gross
        bucket[buyer]["commission_proxy"] += comm
        bucket[buyer]["contribution_proxy"] += gross - comm
    items = [
        {
            "buyer_name": buyer,
            "order_count": int(vals["order_count"]),
            "gross_value": round(vals["gross_value"], 2),
            "commission_proxy": round(vals["commission_proxy"], 2),
            "contribution_proxy": round(vals["contribution_proxy"], 2),
        }
        for buyer, vals in bucket.items()
    ]
    items.sort(key=lambda x: x["contribution_proxy"], reverse=True)
    narrative = (
        "Buyer-wise profitability proxy uses quotation amount minus commission proxy. "
        "This is an estimate, not full profitability (COGS/overhead not included)."
    )
    return {"items": items[:30], "note": "Proxy-based profitability"}, narrative


async def _pending_approvals_by_department(db: AsyncSession, tenant_id: int) -> tuple[dict, str]:
    leave_rows = (
        await db.execute(
            select(Department.name, func.count())
            .select_from(LeaveRequest)
            .join(Employee, and_(Employee.id == LeaveRequest.employee_id, Employee.tenant_id == tenant_id), isouter=True)
            .join(Department, and_(Department.id == Employee.department_id, Department.tenant_id == tenant_id), isouter=True)
            .where(
                LeaveRequest.tenant_id == tenant_id,
                LeaveRequest.status.in_(["PENDING", "SUBMITTED"]),
            )
            .group_by(Department.name)
        )
    ).all()
    payroll_pending = int(
        (
            await db.execute(
                select(func.count()).select_from(PayrollApproval).where(
                    PayrollApproval.tenant_id == tenant_id,
                    func.upper(PayrollApproval.action) == "PENDING",
                )
            )
        ).scalar()
        or 0
    )
    dept_items = [
        {"department": name or "Unassigned", "pending_leave_requests": int(count)}
        for name, count in leave_rows
    ]
    dept_items.append({"department": "Payroll", "pending_leave_requests": payroll_pending})
    dept_items.sort(key=lambda x: x["pending_leave_requests"], reverse=True)
    total = sum(x["pending_leave_requests"] for x in dept_items)
    narrative = f"Pending approvals total {total}. Highest queues appear in top departments shown."
    return {"items": dept_items, "total_pending": total}, narrative


async def _inventory_movement_comparison(db: AsyncSession, tenant_id: int, prompt: str) -> tuple[dict, str]:
    q = parse_search_query(prompt)
    from_date = q.from_date or (date.today().replace(day=1))
    to_date = q.to_date or date.today()
    rows = (
        await db.execute(
            select(StockMovement.movement_type, StockMovement.quantity)
            .where(
                StockMovement.tenant_id == tenant_id,
                StockMovement.movement_date.is_not(None),
                StockMovement.movement_date >= from_date,
                StockMovement.movement_date <= to_date,
            )
        )
    ).all()
    bucket: dict[str, dict[str, float]] = {}
    for movement_type, quantity in rows:
        key = str(movement_type or "UNKNOWN")
        if key not in bucket:
            bucket[key] = {"entry_count": 0.0, "quantity_sum": 0.0}
        bucket[key]["entry_count"] += 1
        bucket[key]["quantity_sum"] += _to_float(quantity)
    breakdown = [
        {
            "movement_type": movement_type,
            "entry_count": int(vals["entry_count"]),
            "quantity_sum": round(vals["quantity_sum"], 3),
        }
        for movement_type, vals in bucket.items()
    ]
    narrative = (
        f"Inventory movement comparison from {from_date.isoformat()} to {to_date.isoformat()} "
        f"covers {sum(x['entry_count'] for x in breakdown)} movement entries."
    )
    return {"from_date": from_date.isoformat(), "to_date": to_date.isoformat(), "items": breakdown}, narrative


async def _dashboard_executive_summary(db: AsyncSession, tenant_id: int) -> tuple[dict, str]:
    order_count = int((await db.execute(select(func.count()).select_from(Order).where(Order.tenant_id == tenant_id))).scalar() or 0)
    open_vouchers = int(
        (
            await db.execute(
                select(func.count()).select_from(PayrollApproval).where(
                    PayrollApproval.tenant_id == tenant_id,
                    func.upper(PayrollApproval.action) == "PENDING",
                )
            )
        ).scalar()
        or 0
    )
    customer_count = int((await db.execute(select(func.count()).select_from(Customer).where(Customer.tenant_id == tenant_id))).scalar() or 0)
    narrative = (
        f"Executive summary: {order_count} order(s), {customer_count} customer(s), and {open_vouchers} payroll approvals pending. "
        "Primary attention should go to open approval queues and delayed operational follow-ups."
    )
    return {
        "kpis": {
            "orders": order_count,
            "customers": customer_count,
            "pending_payroll_approvals": open_vouchers,
        }
    }, narrative


async def build_report_payload(
    db: AsyncSession,
    *,
    tenant_id: int,
    prompt: str,
    report_code: str,
) -> tuple[dict[str, Any], str]:
    if report_code == "monthly_production_summary":
        return await _monthly_production_summary(db, tenant_id)
    if report_code == "buyer_wise_profitability_summary":
        return await _buyer_wise_profitability_proxy(db, tenant_id)
    if report_code == "pending_approvals_by_department":
        return await _pending_approvals_by_department(db, tenant_id)
    if report_code == "inventory_movement_comparison":
        return await _inventory_movement_comparison(db, tenant_id, prompt)
    return await _dashboard_executive_summary(db, tenant_id)


async def execute_report_request(
    db: AsyncSession,
    *,
    tenant_id: int,
    user: Any,
    prompt: str,
) -> tuple[ReportTemplate | None, dict[str, Any] | None, str | None, str | None]:
    template = detect_report_template(prompt)
    for permission_key in template.required_permission_keys:
        allowed = await has_tool_permission(db, user, permission_key)
        if not allowed:
            return None, None, None, f"Permission denied for report template {template.report_code}"
    payload, narrative = await build_report_payload(
        db,
        tenant_id=tenant_id,
        prompt=prompt,
        report_code=template.report_code,
    )
    return template, payload, narrative, None


def build_report_tool_result(template: ReportTemplate, payload: dict[str, Any], narrative: str) -> AiToolInvocationResult:
    return AiToolInvocationResult(
        tool_name="generate_report",
        status="SUCCESS",
        summary=narrative,
        source_area="reports",
        data={
            "report_metadata": {
                "report_code": template.report_code,
                "report_name": template.report_name,
                "source_modules": template.source_modules,
            },
            "applied_filters": payload.get("applied_filters", []),
            "items": payload.get("items", []),
            **{k: v for k, v in payload.items() if k not in {"items", "applied_filters"}},
        },
    )
