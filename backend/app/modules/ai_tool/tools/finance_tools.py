from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import BankReconciliation, PaymentRun, Voucher


async def get_financial_summary(db: AsyncSession, *, tenant_id: int) -> dict:
    voucher_rows = (
        await db.execute(
            select(Voucher.status, func.count())
            .where(Voucher.tenant_id == tenant_id)
            .group_by(Voucher.status)
        )
    ).all()
    payment_run_rows = (
        await db.execute(
            select(PaymentRun.status, func.count())
            .where(PaymentRun.tenant_id == tenant_id)
            .group_by(PaymentRun.status)
        )
    ).all()
    recon_open = int(
        (
            await db.execute(
                select(func.count())
                .select_from(BankReconciliation)
                .where(BankReconciliation.tenant_id == tenant_id, BankReconciliation.is_finalized.is_(False))
            )
        ).scalar()
        or 0
    )

    vouchers = {str(status or "unknown"): int(count) for status, count in voucher_rows}
    payment_runs = {str(status or "unknown"): int(count) for status, count in payment_run_rows}
    return {
        "title": "Finance Summary",
        "summary": f"{sum(vouchers.values())} voucher(s), {sum(payment_runs.values())} payment run(s), {recon_open} open reconciliation(s).",
        "data": {
            "vouchers_by_status": vouchers,
            "payment_runs_by_status": payment_runs,
            "open_bank_reconciliations": recon_open,
        },
    }
