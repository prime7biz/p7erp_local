from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import BankReconciliation, Customer, LeaveRequest, Order, PaymentRun, PayrollApproval, Voucher


async def get_dashboard_summary(db: AsyncSession, *, tenant_id: int) -> dict:
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
    leaves_pending = int(
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

    pending_approvals = vouchers_pending + runs_draft + recons_open + leaves_pending + payroll_pending
    return {
        "title": "Dashboard Summary",
        "summary": f"{orders_count} orders, {customers_count} customers, {pending_approvals} pending approvals.",
        "data": {
            "active_orders": orders_count,
            "total_customers": customers_count,
            "pending_approvals": pending_approvals,
        },
    }
