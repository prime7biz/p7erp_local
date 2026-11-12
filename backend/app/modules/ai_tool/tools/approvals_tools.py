from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import BankReconciliation, LeaveRequest, PaymentRun, PayrollApproval, Voucher
from app.modules.ai_tool.query_parser import parse_search_query


async def _count(db: AsyncSession, stmt) -> int:
    return int((await db.execute(stmt)).scalar() or 0)


async def pending_approval_counts(
    db: AsyncSession,
    *,
    tenant_id: int,
    include_finance: bool = True,
    include_hr: bool = True,
) -> dict[str, int]:
    """Pending approval counts per queue. Queues the caller may not see are left out (not zeroed)."""
    counts: dict[str, int] = {}
    if include_finance:
        counts["vouchers"] = await _count(
            db,
            select(func.count()).select_from(Voucher).where(
                Voucher.tenant_id == tenant_id,
                Voucher.status.in_(["SUBMITTED", "CHECKED", "RECOMMENDED"]),
            ),
        )
        counts["payment_runs"] = await _count(
            db,
            select(func.count()).select_from(PaymentRun).where(
                PaymentRun.tenant_id == tenant_id,
                PaymentRun.status == "DRAFT",
            ),
        )
        counts["bank_reconciliations"] = await _count(
            db,
            select(func.count()).select_from(BankReconciliation).where(
                BankReconciliation.tenant_id == tenant_id,
                BankReconciliation.is_finalized.is_(False),
            ),
        )
    if include_hr:
        counts["leave_requests"] = await _count(
            db,
            select(func.count()).select_from(LeaveRequest).where(
                LeaveRequest.tenant_id == tenant_id,
                LeaveRequest.status.in_(["PENDING", "SUBMITTED"]),
            ),
        )
        counts["payroll_approvals"] = await _count(
            db,
            select(func.count()).select_from(PayrollApproval).where(
                PayrollApproval.tenant_id == tenant_id,
                func.upper(PayrollApproval.action) == "PENDING",
            ),
        )
    return counts


_QUEUE_LABELS = {
    "vouchers": "Vouchers",
    "payment_runs": "Payment Runs",
    "bank_reconciliations": "Bank Reconciliations",
    "leave_requests": "Leave Requests",
    "payroll_approvals": "Payroll Approvals",
}


async def get_pending_approvals(
    db: AsyncSession,
    *,
    tenant_id: int,
    include_finance: bool = True,
    include_hr: bool = True,
) -> dict:
    counts = await pending_approval_counts(
        db, tenant_id=tenant_id, include_finance=include_finance, include_hr=include_hr
    )
    total = sum(counts.values())
    return {
        "title": "Pending Approvals",
        "summary": f"Total pending approval items: {total}.",
        "data": {"total_pending": total, **counts},
    }


async def search_pending_approvals(
    db: AsyncSession,
    *,
    tenant_id: int,
    prompt: str,
    include_finance: bool = True,
    include_hr: bool = True,
) -> dict:
    query = parse_search_query(prompt)
    counts = await pending_approval_counts(
        db, tenant_id=tenant_id, include_finance=include_finance, include_hr=include_hr
    )
    total = sum(counts.values())
    threshold = query.min_count
    items = [{"queue": _QUEUE_LABELS[key], "count": value} for key, value in counts.items()]
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
