"""Voucher post/cancel hooks and daily maintenance for party ledger."""

from __future__ import annotations

import logging
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.tenant_feature_keys import (
    is_party_ledger_auto_allocate,
    is_party_ledger_enabled,
    is_party_ledger_interest_calc,
)
from app.models.finance import Voucher, VoucherLine
from app.models.party_ledger import PartyLedgerBill
from app.models.tenant import Tenant
from app.modules.finance.party_ledger_bill_service import (
    auto_allocate_payment,
    calculate_all_interest,
    cancel_bills_for_voucher,
    create_bill_from_voucher_line,
    mark_overdue_bills,
)
from app.modules.finance.party_ledger_service import (
    _d,
    get_party_ledger_by_account,
    update_party_ledger_balance,
)

logger = logging.getLogger(__name__)


def _resolve_source_links(voucher: Voucher) -> tuple[int | None, int | None]:
    """Return (commercial_invoice_id, vendor_bill_id) from voucher source refs."""
    src = (voucher.source_module or "").upper()
    ref = (voucher.source_module_ref or "").strip()
    ci_id: int | None = None
    vb_id: int | None = None
    if not ref:
        return None, None
    try:
        rid = int(ref)
    except ValueError:
        return None, None
    if src in {"COMMERCIAL_INVOICE", "CI", "EXPORT_INVOICE"}:
        ci_id = rid
    elif src in {"VENDOR_BILL", "VENDOR_BILLS"}:
        vb_id = rid
    return ci_id, vb_id


async def on_voucher_posted(
    db: AsyncSession,
    tenant_id: int,
    voucher: Voucher,
    *,
    feature_flags: Any = None,
    created_by: int | None = None,
) -> None:
    """Create party bills for lines on party ledger accounts; FIFO-allocate receipts/payments."""
    if feature_flags is None:
        tenant = await db.get(Tenant, tenant_id)
        feature_flags = tenant.feature_flags if tenant else None
    if not is_party_ledger_enabled(feature_flags):
        return

    try:
        # Savepoint: hook failure must not poison the voucher post transaction.
        async with db.begin_nested():
            lines = list(
                (
                    await db.execute(
                        select(VoucherLine).where(
                            VoucherLine.voucher_id == voucher.id,
                            VoucherLine.tenant_id == tenant_id,
                        )
                    )
                ).scalars().all()
            )
            ci_id, vb_id = _resolve_source_links(voucher)
            vtype = (voucher.voucher_type or "").upper()
            touched_pl: set[int] = set()
            settlement_lines: list[tuple[Any, Any, Any]] = []

            # Source-module path: CI / VendorBill may post to a *general* AR/AP CoA.
            # Resolve the party master and create the bill on their PartyLedger.
            source_handled = False
            if ci_id is not None:
                from app.models.commercial import CommercialInvoice
                from app.modules.finance.party_ledger_service import get_or_create_party_ledger
                from app.modules.finance.party_ledger_bill_service import create_bill_from_voucher_line

                invoice = await db.get(CommercialInvoice, ci_id)
                if invoice and invoice.tenant_id == tenant_id and invoice.customer_id:
                    pl = await get_or_create_party_ledger(
                        db, tenant_id, "CUSTOMER", int(invoice.customer_id), created_by=created_by
                    )
                    # Prefer the DEBIT (AR) line
                    ar_line = next(
                        (ln for ln in lines if (ln.entry_type or "").upper() == "DEBIT"),
                        lines[0] if lines else None,
                    )
                    if ar_line and pl.bill_wise_tracking:
                        await create_bill_from_voucher_line(
                            db,
                            tenant_id,
                            voucher,
                            ar_line,
                            party_ledger_id=pl.id,
                            commercial_invoice_id=ci_id,
                        )
                        touched_pl.add(pl.id)
                        source_handled = True
            elif vb_id is not None:
                from app.models.finance import VendorBill
                from app.modules.finance.party_ledger_service import get_or_create_party_ledger
                from app.modules.finance.party_ledger_bill_service import create_bill_from_voucher_line

                vb = await db.get(VendorBill, vb_id)
                if vb and vb.tenant_id == tenant_id and vb.vendor_id:
                    pl = await get_or_create_party_ledger(
                        db, tenant_id, "VENDOR", int(vb.vendor_id), created_by=created_by
                    )
                    ap_line = next(
                        (ln for ln in lines if (ln.entry_type or "").upper() == "CREDIT"),
                        lines[0] if lines else None,
                    )
                    if ap_line and pl.bill_wise_tracking:
                        await create_bill_from_voucher_line(
                            db,
                            tenant_id,
                            voucher,
                            ap_line,
                            party_ledger_id=pl.id,
                            vendor_bill_id=vb_id,
                        )
                        touched_pl.add(pl.id)
                        source_handled = True

            if not source_handled:
                for line in lines:
                    pl = await get_party_ledger_by_account(db, tenant_id, line.account_id)
                    if not pl or not pl.bill_wise_tracking:
                        continue
                    # RECEIPT/PAYMENT settle existing bills — do not open a new pending bill.
                    if vtype in {"RECEIPT", "PAYMENT"}:
                        settlement_lines.append((pl, line, None))
                        continue
                    bill = await create_bill_from_voucher_line(
                        db,
                        tenant_id,
                        voucher,
                        line,
                        party_ledger_id=pl.id,
                        commercial_invoice_id=ci_id,
                        vendor_bill_id=vb_id,
                    )
                    touched_pl.add(pl.id)
                    _ = bill

            # RECEIPT/PAYMENT: also try party match via account even if source path ran
            if vtype in {"RECEIPT", "PAYMENT"} and not settlement_lines:
                for line in lines:
                    pl = await get_party_ledger_by_account(db, tenant_id, line.account_id)
                    if pl and pl.bill_wise_tracking:
                        settlement_lines.append((pl, line, None))

            if is_party_ledger_auto_allocate(feature_flags):
                for pl, line, _bill in settlement_lines:
                    if vtype == "RECEIPT":
                        target = "DR"
                    elif vtype == "PAYMENT":
                        target = "CR"
                    else:
                        entry = (line.entry_type or "").upper()
                        target = "DR" if entry == "CREDIT" else "CR"
                    await auto_allocate_payment(
                        db,
                        tenant_id,
                        pl.id,
                        voucher,
                        _d(line.amount),
                        allocation_method="FIFO",
                        target_amount_type=target,
                        voucher_line_id=line.id,
                        created_by=created_by,
                    )
                    touched_pl.add(pl.id)

            for pl_id in touched_pl:
                await update_party_ledger_balance(db, pl_id)
    except Exception:
        logger.exception(
            "party_ledger on_voucher_posted failed tenant=%s voucher=%s",
            tenant_id,
            getattr(voucher, "id", None),
        )


async def on_voucher_cancelled(
    db: AsyncSession,
    tenant_id: int,
    voucher: Voucher,
    *,
    feature_flags: Any = None,
) -> None:
    if feature_flags is None:
        tenant = await db.get(Tenant, tenant_id)
        feature_flags = tenant.feature_flags if tenant else None
    if not is_party_ledger_enabled(feature_flags):
        return
    try:
        async with db.begin_nested():
            await cancel_bills_for_voucher(db, tenant_id, voucher.id)
    except Exception:
        logger.exception(
            "party_ledger on_voucher_cancelled failed tenant=%s voucher=%s",
            tenant_id,
            getattr(voucher, "id", None),
        )


async def daily_party_ledger_maintenance(
    db: AsyncSession,
    tenant_id: int,
    *,
    feature_flags: Any = None,
    as_of_date: date | None = None,
) -> dict[str, Any]:
    if feature_flags is None:
        tenant = await db.get(Tenant, tenant_id)
        feature_flags = tenant.feature_flags if tenant else None
    if not is_party_ledger_enabled(feature_flags):
        return {"skipped": True, "reason": "party_ledger_enabled is false"}

    as_of = as_of_date or date.today()
    overdue_count = await mark_overdue_bills(db, tenant_id, as_of)
    interest_n = 0
    interest_total = "0.00"
    if is_party_ledger_interest_calc(feature_flags):
        interest_n, total = await calculate_all_interest(db, tenant_id, as_of)
        interest_total = str(total)

    severe = (
        await db.execute(
            select(PartyLedgerBill).where(
                PartyLedgerBill.tenant_id == tenant_id,
                PartyLedgerBill.status == "OVERDUE",
                PartyLedgerBill.due_date.is_not(None),
                PartyLedgerBill.due_date < as_of,
                PartyLedgerBill.pending_amount > 0,
            )
        )
    ).scalars().all()
    severe_count = 0
    for bill in severe:
        days = (as_of - bill.due_date).days if bill.due_date else 0
        if days > 90:
            severe_count += 1
            logger.warning(
                "SEVERE_OVERDUE tenant=%s bill=%s days=%s pending=%s party_ledger_id=%s",
                tenant_id,
                bill.bill_number,
                days,
                bill.pending_amount,
                bill.party_ledger_id,
            )

    return {
        "skipped": False,
        "overdue_marked": overdue_count,
        "interest_bills": interest_n,
        "interest_total": interest_total,
        "severe_overdue": severe_count,
    }
