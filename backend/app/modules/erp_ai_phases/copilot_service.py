"""Phase 19: read-only safe query templates (no arbitrary SQL)."""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import BankReconciliation, Order, PaymentRun, Quotation, Voucher


ALLOWED_INTENTS = frozenset(
    {
        "orders_open_count",
        "quotations_draft_count",
        "orders_cancelled_count",
        "quotations_sent_count",
        "vouchers_posted_count",
        "vouchers_in_workflow_count",
        "payment_runs_draft_count",
        "bank_reconciliations_open_count",
        "orders_with_delivery_date_set_count",
        "quotations_approved_count",
    }
)


async def _count(db: AsyncSession, model: type, *filters: Any) -> int:
    return int((await db.execute(select(func.count()).select_from(model).where(*filters))).scalar() or 0)


async def run_safe_copilot_intent(
    db: AsyncSession,
    *,
    tenant_id: int,
    intent: str,
) -> dict[str, Any]:
    key = (intent or "").strip().lower()
    if key not in ALLOWED_INTENTS:
        return {
            "ok": False,
            "error": "UNKNOWN_INTENT",
            "allowed_intents": sorted(ALLOWED_INTENTS),
        }

    if key == "orders_open_count":
        n = await _count(db, Order, Order.tenant_id == tenant_id, Order.status != "CANCELLED")
        return _ok(key, {"open_orders_ex_cancelled": n}, ["COUNT_STATUS_NE_CANCELLED"])

    if key == "quotations_draft_count":
        n = await _count(db, Quotation, Quotation.tenant_id == tenant_id, Quotation.status == "DRAFT")
        return _ok(key, {"quotations_draft": n}, ["COUNT_STATUS_DRAFT"])

    if key == "orders_cancelled_count":
        n = await _count(db, Order, Order.tenant_id == tenant_id, Order.status == "CANCELLED")
        return _ok(key, {"orders_cancelled": n}, ["COUNT_STATUS_CANCELLED"])

    if key == "quotations_sent_count":
        n = await _count(db, Quotation, Quotation.tenant_id == tenant_id, Quotation.status == "SENT")
        return _ok(key, {"quotations_sent": n}, ["COUNT_STATUS_SENT"])

    if key == "quotations_approved_count":
        n = await _count(db, Quotation, Quotation.tenant_id == tenant_id, Quotation.status == "APPROVED")
        return _ok(key, {"quotations_approved": n}, ["COUNT_STATUS_APPROVED"])

    if key == "vouchers_posted_count":
        n = await _count(db, Voucher, Voucher.tenant_id == tenant_id, Voucher.status == "POSTED")
        return _ok(key, {"vouchers_posted": n}, ["COUNT_STATUS_POSTED"])

    if key == "vouchers_in_workflow_count":
        n = await _count(
            db,
            Voucher,
            Voucher.tenant_id == tenant_id,
            Voucher.status.in_(["SUBMITTED", "CHECKED", "RECOMMENDED"]),
        )
        return _ok(key, {"vouchers_in_workflow": n}, ["COUNT_WORKFLOW_STATUSES"])

    if key == "payment_runs_draft_count":
        n = await _count(db, PaymentRun, PaymentRun.tenant_id == tenant_id, PaymentRun.status == "DRAFT")
        return _ok(key, {"payment_runs_draft": n}, ["COUNT_PAYMENT_RUN_DRAFT"])

    if key == "bank_reconciliations_open_count":
        n = await _count(
            db,
            BankReconciliation,
            BankReconciliation.tenant_id == tenant_id,
            BankReconciliation.is_finalized.is_(False),
        )
        return _ok(key, {"bank_reconciliations_open": n}, ["COUNT_RECON_NOT_FINALIZED"])

    if key == "orders_with_delivery_date_set_count":
        n = await _count(db, Order, Order.tenant_id == tenant_id, Order.delivery_date.isnot(None))
        return _ok(key, {"orders_with_delivery_date": n}, ["COUNT_DELIVERY_DATE_NOT_NULL"])

    return {"ok": False, "error": "UNREACHABLE"}


def _ok(intent_key: str, result: dict[str, Any], reason_codes: list[str]) -> dict[str, Any]:
    return {
        "ok": True,
        "intent": intent_key,
        "result": result,
        "confidence": 1.0,
        "reason_codes": reason_codes,
    }
