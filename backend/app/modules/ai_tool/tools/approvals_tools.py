from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import BankReconciliation, LeaveRequest, PaymentRun, PayrollApproval, Voucher
from app.modules.ai_tool.query_parser import parse_search_query


async def get_pending_approvals(db: AsyncSession, *, tenant_id: int) -> dict:
    vouchers_pending = int(
        (
            await db.execute(
                select(func.count()).select_from(Voucher).where(
                    Voucher.tenant_id == tenant_id,
                    Voucher.status.in_(["SUBMITTED", "CHECKED", "RECOMMENDED"]),
                )
            )
        ).scalar()
        or 0
    )
    runs_draft = int(
        (
            await db.execute(
                select(func.count()).select_from(PaymentRun).where(
                    PaymentRun.tenant_id == tenant_id,
                    PaymentRun.status == "DRAFT",
                )
            )
        ).scalar()
        or 0
    )
    recons_open = int(
        (
            await db.execute(
                select(func.count()).select_from(BankReconciliation).where(
                    BankReconciliation.tenant_id == tenant_id,
                    BankReconciliation.is_finalized.is_(False),
                )
            )
        ).scalar()
        or 0
    )
    leave_pending = int(
        (
            await db.execute(
                select(func.count()).select_from(LeaveRequest).where(
                    LeaveRequest.tenant_id == tenant_id,
                    LeaveRequest.status.in_(["PENDING", "SUBMITTED"]),
                )
            )
        ).scalar()
        or 0
    )
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

    total = vouchers_pending + runs_draft + recons_open + leave_pending + payroll_pending
    return {
        "title": "Pending Approvals",
        "summary": f"Total pending approval items: {total}.",
        "data": {
            "total_pending": total,
            "vouchers": vouchers_pending,
            "payment_runs": runs_draft,
            "bank_reconciliations": recons_open,
            "leave_requests": leave_pending,
            "payroll_approvals": payroll_pending,
        },
    }


async def search_pending_approvals(db: AsyncSession, *, tenant_id: int, prompt: str) -> dict:
    query = parse_search_query(prompt)
    vouchers_pending = int(
        (
            await db.execute(
                select(func.count()).select_from(Voucher).where(
                    Voucher.tenant_id == tenant_id,
                    Voucher.status.in_(["SUBMITTED", "CHECKED", "RECOMMENDED"]),
                )
            )
        ).scalar()
        or 0
    )
    runs_draft = int(
        (
            await db.execute(
                select(func.count()).select_from(PaymentRun).where(
                    PaymentRun.tenant_id == tenant_id,
                    PaymentRun.status == "DRAFT",
                )
            )
        ).scalar()
        or 0
    )
    recons_open = int(
        (
            await db.execute(
                select(func.count()).select_from(BankReconciliation).where(
                    BankReconciliation.tenant_id == tenant_id,
                    BankReconciliation.is_finalized.is_(False),
                )
            )
        ).scalar()
        or 0
    )
    leave_pending = int(
        (
            await db.execute(
                select(func.count()).select_from(LeaveRequest).where(
                    LeaveRequest.tenant_id == tenant_id,
                    LeaveRequest.status.in_(["PENDING", "SUBMITTED"]),
                )
            )
        ).scalar()
        or 0
    )
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

    total = vouchers_pending + runs_draft + recons_open + leave_pending + payroll_pending
    threshold = query.min_count
    items = [
        {"queue": "Vouchers", "count": vouchers_pending},
        {"queue": "Payment Runs", "count": runs_draft},
        {"queue": "Bank Reconciliations", "count": recons_open},
        {"queue": "Leave Requests", "count": leave_pending},
        {"queue": "Payroll Approvals", "count": payroll_pending},
    ]
    items.sort(key=lambda x: x["count"], reverse=True)
    summary = (
        f"Found {total} pending approvals."
        if threshold is None
        else f"Found {total} pending approvals against threshold {threshold}."
    )
    return {
        "title": "Pending Approvals Search",
        "summary": summary,
        "data": {
            "applied_filters": [f"threshold >= {threshold}"] if threshold is not None else [],
            "threshold_met": True if threshold is None else total >= threshold,
            "total_pending": total,
            "items": items,
        },
    }
