"""Phase 18: CEO-style read-only brief from existing aggregates (no mutation)."""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import BankReconciliation, Order, PaymentRun, Quotation, Voucher


async def build_executive_brief(
    db: AsyncSession,
    *,
    tenant_id: int,
) -> dict[str, Any]:
    orders_n = int(
        (
            await db.execute(select(func.count()).select_from(Order).where(Order.tenant_id == tenant_id))
        ).scalar()
        or 0
    )
    quotes_n = int(
        (
            await db.execute(select(func.count()).select_from(Quotation).where(Quotation.tenant_id == tenant_id))
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

    risk_signals: list[dict[str, Any]] = []
    if vouchers_pending > 20:
        risk_signals.append(
            {
                "code": "FINANCE_QUEUE_DEPTH",
                "severity": "medium",
                "message": f"{vouchers_pending} vouchers awaiting workflow.",
                "confidence": 0.7,
                "reason_codes": ["THRESHOLD_GT_20"],
            }
        )
    if recons_open > 5:
        risk_signals.append(
            {
                "code": "BANK_RECON_BACKLOG",
                "severity": "low",
                "message": f"{recons_open} bank reconciliations not finalized.",
                "confidence": 0.65,
                "reason_codes": ["THRESHOLD_GT_5"],
            }
        )

    opportunities: list[dict[str, Any]] = []
    if orders_n > 0 and quotes_n > orders_n * 2:
        opportunities.append(
            {
                "code": "PIPELINE_RATIO",
                "message": "Quotations materially exceed active orders — review conversion.",
                "confidence": 0.55,
                "reason_codes": ["HEURISTIC_QUOTE_TO_ORDER"],
            }
        )

    return {
        "snapshot": {
            "orders_total": orders_n,
            "quotations_total": quotes_n,
            "vouchers_in_workflow": vouchers_pending,
            "payment_runs_draft": runs_draft,
            "bank_reconciliations_open": recons_open,
        },
        "risk_signals": risk_signals,
        "opportunities": opportunities,
        "disclaimer": "Narrative-free counts and heuristics — executive review required.",
    }
