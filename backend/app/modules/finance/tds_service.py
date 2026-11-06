"""Sprint 5: TDS calculation, liability vouchers, Form 26Q/24Q export data."""

from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.ownership import ensure_owned
from app.models.finance import ChartOfAccount, Voucher, VoucherLine
from app.models.party_ledger import PartyLedger
from app.models.tds import TdsDeduction, TdsSection
from app.modules.finance.voucher_controls import allocate_series_voucher_number

logger = logging.getLogger(__name__)

ZERO = Decimal("0")


def _d(v: Any) -> Decimal:
    try:
        return Decimal(str(v or 0))
    except Exception:
        return ZERO


def _money(v: Decimal) -> Decimal:
    return v.quantize(Decimal("0.01"))


def _rate_pct(rate: Decimal) -> Decimal:
    """Accept 2 or 2.0 as 2%, or 0.02 as already fraction — treat values > 1 as percent."""
    r = _d(rate)
    if r > 1:
        return r / Decimal("100")
    return r


async def get_tds_section(
    db: AsyncSession,
    tenant_id: int,
    *,
    section_id: int | None = None,
    section_code: str | None = None,
) -> TdsSection | None:
    if section_id:
        row = await db.get(TdsSection, section_id)
        if row and row.tenant_id == tenant_id and row.is_active:
            return row
        return None
    if section_code:
        return (
            await db.execute(
                select(TdsSection).where(
                    TdsSection.tenant_id == tenant_id,
                    TdsSection.section_code == section_code.strip().upper(),
                    TdsSection.is_active.is_(True),
                )
            )
        ).scalars().first()
    return None


def calculate_tds_amount(
    payment_amount: Decimal,
    section: TdsSection,
    *,
    is_company: bool = False,
) -> dict[str, Decimal]:
    """If payment > threshold → TDS; else zero."""
    payment = _money(_d(payment_amount))
    threshold = _money(_d(section.threshold_amount))
    if payment <= threshold:
        return {
            "taxable_amount": payment,
            "tds_amount": ZERO,
            "net_payment": payment,
            "applicable": Decimal("0"),
        }
    rate = section.tds_rate
    if is_company and section.rate_company is not None:
        rate = section.rate_company
    elif (not is_company) and section.rate_non_company is not None:
        rate = section.rate_non_company
    tds = _money(payment * _rate_pct(_d(rate)))
    return {
        "taxable_amount": payment,
        "tds_amount": tds,
        "net_payment": _money(payment - tds),
        "applicable": Decimal("1"),
    }


async def calculate_tds_on_payment(
    db: AsyncSession,
    tenant_id: int,
    *,
    party_ledger_id: int,
    payment_amount: Decimal,
    section_code: str | None = None,
    is_company: bool = False,
) -> dict[str, Any]:
    ledger = await db.get(PartyLedger, party_ledger_id)
    if not ledger or ledger.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Party ledger not found")
    section = None
    if section_code:
        section = await get_tds_section(db, tenant_id, section_code=section_code)
    elif ledger.tds_section_id:
        section = await get_tds_section(db, tenant_id, section_id=ledger.tds_section_id)
    if not section:
        return {
            "party_ledger_id": party_ledger_id,
            "section_code": None,
            "taxable_amount": str(_money(_d(payment_amount))),
            "tds_amount": "0.00",
            "net_payment": str(_money(_d(payment_amount))),
            "applicable": False,
            "message": "No TDS section assigned",
        }
    calc = calculate_tds_amount(payment_amount, section, is_company=is_company)
    return {
        "party_ledger_id": party_ledger_id,
        "tds_section_id": section.id,
        "section_code": section.section_code,
        "threshold_amount": str(_money(_d(section.threshold_amount))),
        "tds_rate": str(section.tds_rate),
        "taxable_amount": str(calc["taxable_amount"]),
        "tds_amount": str(calc["tds_amount"]),
        "net_payment": str(calc["net_payment"]),
        "applicable": bool(calc["applicable"]),
    }


async def create_tds_liability_voucher(
    db: AsyncSession,
    tenant_id: int,
    *,
    deduction: TdsDeduction,
    vendor_ap_account_id: int,
    tds_payable_account_id: int,
    bank_account_id: int | None = None,
    voucher_date: date | None = None,
    created_by: int | None = None,
    include_bank_net: bool = False,
) -> Voucher:
    """JOURNAL: Dr Vendor AP (gross), Cr TDS Payable (tds); optionally Cr Bank (net)."""
    vdate = voucher_date or deduction.deduction_date or date.today()
    gross = _money(_d(deduction.taxable_amount))
    tds = _money(_d(deduction.tds_amount))
    if tds <= ZERO:
        raise HTTPException(status_code=400, detail="TDS amount must be positive")

    for aid in (vendor_ap_account_id, tds_payable_account_id):
        acct = await db.get(ChartOfAccount, aid)
        if not acct or acct.tenant_id != tenant_id:
            raise HTTPException(status_code=400, detail=f"Invalid account {aid}")
    if include_bank_net and bank_account_id:
        bank = await db.get(ChartOfAccount, bank_account_id)
        if not bank or bank.tenant_id != tenant_id:
            raise HTTPException(status_code=400, detail="Invalid bank account")

    voucher_number, series_seq, series_key, fy = await allocate_series_voucher_number(
        db,
        tenant_id=tenant_id,
        voucher_date=vdate,
        voucher_type="JOURNAL",
        branch_code="MAIN",
    )
    voucher = Voucher(
        tenant_id=tenant_id,
        voucher_number=voucher_number,
        voucher_type="JOURNAL",
        voucher_date=vdate,
        status="POSTED",
        description=f"TDS liability deduction #{deduction.id}",
        reference=f"TDS-{deduction.id}",
        source_module="TDS",
        source_module_ref=str(deduction.id),
        books_applied=True,
        created_by=created_by,
        fiscal_year=fy,
        series_sequence=series_seq,
        number_series_key=series_key,
    )
    db.add(voucher)
    await db.flush()

    # Liability booking: Dr Expense/AP clearing for TDS portion, Cr TDS Payable
    # Spec: Dr Vendor AP (gross) / Cr TDS Payable / Cr Bank (net) — used when creating payment with TDS.
    # For auto-hook after payment already posted, we only book TDS liability:
    #   Dr Vendor AP (tds) / Cr TDS Payable (tds)  — reduces AP further? Actually payment already reduced AP.
    # Prefer: Cr TDS Payable / Dr TDS expense OR reclassify from bank.
    # Spec create_tds_voucher: Dr Vendor AP (gross), Cr TDS Payable, Cr Bank (net)
    db.add(
        VoucherLine(
            tenant_id=tenant_id,
            voucher_id=voucher.id,
            account_id=vendor_ap_account_id,
            entry_type="DEBIT",
            amount=str(gross if include_bank_net else tds),
            base_amount=str(gross if include_bank_net else tds),
            notes="Vendor AP / TDS gross",
        )
    )
    db.add(
        VoucherLine(
            tenant_id=tenant_id,
            voucher_id=voucher.id,
            account_id=tds_payable_account_id,
            entry_type="CREDIT",
            amount=str(tds),
            base_amount=str(tds),
            notes="TDS payable",
        )
    )
    if include_bank_net and bank_account_id:
        net = _money(gross - tds)
        db.add(
            VoucherLine(
                tenant_id=tenant_id,
                voucher_id=voucher.id,
                account_id=bank_account_id,
                entry_type="CREDIT",
                amount=str(net),
                base_amount=str(net),
                notes="Net payment",
            )
        )
    await db.flush()
    from app.modules.finance.advanced_voucher_service import apply_voucher_line_balances
    from app.modules.finance.voucher_controls import finalize_posted_voucher_metadata

    # Created directly as POSTED, so it must move CoA balances like any posted voucher.
    await apply_voucher_line_balances(db, tenant_id, voucher)
    tds_lines = list(
        (await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == voucher.id))).scalars().all()
    )
    await finalize_posted_voucher_metadata(db, tenant_id, voucher, tds_lines, strict_duplicate_check=False)
    deduction.tds_liability_voucher_id = voucher.id
    return voucher


async def create_tds_deduction_record(
    db: AsyncSession,
    tenant_id: int,
    *,
    party_ledger_id: int,
    tds_section_id: int,
    taxable_amount: Decimal,
    tds_amount: Decimal,
    voucher_id: int | None = None,
    deduction_date: date | None = None,
    created_by: int | None = None,
    notes: str | None = None,
) -> TdsDeduction:
    await ensure_owned(db, PartyLedger, party_ledger_id, tenant_id, "Party ledger")
    await ensure_owned(db, TdsSection, tds_section_id, tenant_id, "TDS section")
    await ensure_owned(db, Voucher, voucher_id, tenant_id, "Voucher")
    row = TdsDeduction(
        tenant_id=tenant_id,
        party_ledger_id=party_ledger_id,
        voucher_id=voucher_id,
        tds_section_id=tds_section_id,
        taxable_amount=_money(taxable_amount),
        tds_amount=_money(tds_amount),
        net_payment=_money(_d(taxable_amount) - _d(tds_amount)),
        status="PENDING",
        deduction_date=deduction_date or date.today(),
        created_by=created_by,
        notes=notes,
    )
    db.add(row)
    await db.flush()
    return row


TDS_LINE_MARKER = "[TDS]"


def _tds_payable_account_id(feature_flags: Any, override: int | None = None) -> int | None:
    if override:
        return override
    if isinstance(feature_flags, dict):
        settings = feature_flags.get("tds_settings") or {}
        if isinstance(settings, dict) and settings.get("tds_payable_account_id"):
            return int(settings["tds_payable_account_id"])
    return None


async def _tds_party_line(
    db: AsyncSession, tenant_id: int, lines: list[VoucherLine]
) -> tuple[PartyLedger | None, VoucherLine | None]:
    """The DEBIT line on a vendor party account that has a TDS section."""
    for ln in lines:
        if (ln.entry_type or "").upper() != "DEBIT":
            continue
        pl = (
            await db.execute(
                select(PartyLedger).where(
                    PartyLedger.tenant_id == tenant_id,
                    PartyLedger.ledger_account_id == ln.account_id,
                    PartyLedger.is_active.is_(True),
                )
            )
        ).scalars().first()
        if pl and pl.tds_section_id:
            return pl, ln
    return None, None


async def _deduction_for_voucher(db: AsyncSession, tenant_id: int, voucher_id: int) -> TdsDeduction | None:
    return (
        await db.execute(
            select(TdsDeduction).where(TdsDeduction.tenant_id == tenant_id, TdsDeduction.voucher_id == voucher_id)
        )
    ).scalars().first()


async def _load_lines(db: AsyncSession, voucher_id: int) -> list[VoucherLine]:
    return list(
        (await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == voucher_id))).scalars().all()
    )


async def split_tds_into_payment_voucher(
    db: AsyncSession,
    tenant_id: int,
    voucher: Voucher,
    *,
    feature_flags: Any = None,
    created_by: int | None = None,
) -> TdsDeduction | None:
    """Before a PAYMENT is posted: withhold TDS inside the payment itself.

    Dr Vendor (gross) / Cr Bank (gross - tds) / Cr TDS payable (tds). The vendor's payable is
    reduced once, by the gross amount. Only when ``tds_split_in_payment`` is on.
    """
    from app.common.tenant_feature_keys import is_tds_split_in_payment_enabled, is_tds_system_enabled
    from app.modules.finance.posting_core import line_base_amount, to_decimal
    from app.modules.finance.voucher_controls import _is_cash_or_bank

    if not (is_tds_system_enabled(feature_flags) and is_tds_split_in_payment_enabled(feature_flags)):
        return None
    if (voucher.voucher_type or "").upper() != "PAYMENT":
        return None
    payable_id = _tds_payable_account_id(feature_flags)
    if not payable_id:
        return None
    payable = await db.get(ChartOfAccount, payable_id)
    if not payable or payable.tenant_id != tenant_id:
        return None

    lines = await _load_lines(db, voucher.id)
    party, party_line = await _tds_party_line(db, tenant_id, lines)
    if not party or not party_line:
        return None
    section = await get_tds_section(db, tenant_id, section_id=party.tds_section_id)
    if not section:
        return None
    existing = await _deduction_for_voucher(db, tenant_id, voucher.id)
    tds_line = next((ln for ln in lines if (ln.notes or "").startswith(TDS_LINE_MARKER)), None)
    if tds_line is not None:
        # Already split (re-post after cancel-posting): only make sure the deduction record exists.
        if existing is None:
            existing = await create_tds_deduction_record(
                db,
                tenant_id,
                party_ledger_id=party.id,
                tds_section_id=section.id,
                taxable_amount=_money(_d(party_line.amount)),
                tds_amount=_money(_d(tds_line.amount)),
                voucher_id=voucher.id,
                deduction_date=voucher.voucher_date,
                created_by=created_by,
                notes="Auto TDS withheld inside payment",
            )
            existing.tds_liability_voucher_id = voucher.id
        return existing
    if existing is not None:
        return existing

    calc = calculate_tds_amount(_money(_d(party_line.amount)), section)
    tds = calc["tds_amount"]
    if not calc["applicable"] or tds <= ZERO:
        return None

    credit_lines = [
        ln for ln in lines if (ln.entry_type or "").upper() == "CREDIT" and ln.account_id != party_line.account_id
    ]
    if not credit_lines:
        return None
    from app.models.finance import AccountGroup

    acct_rows = (
        await db.execute(
            select(ChartOfAccount, AccountGroup)
            .join(AccountGroup, ChartOfAccount.group_id == AccountGroup.id)
            .where(ChartOfAccount.tenant_id == tenant_id, ChartOfAccount.id.in_({ln.account_id for ln in credit_lines}))
        )
    ).all()
    cash_bank_ids = {a.id for a, g in acct_rows if _is_cash_or_bank(a, g)}
    candidates = [ln for ln in credit_lines if ln.account_id in cash_bank_ids] or credit_lines
    target = max(candidates, key=lambda ln: _d(ln.amount))
    if _d(target.amount) <= tds:
        return None

    rate = to_decimal(target.exchange_rate)
    if rate <= ZERO:
        rate = Decimal("1")
    target_base = line_base_amount(target)
    target.amount = _money(_d(target.amount) - tds)
    target.base_amount = (target_base - tds * rate).quantize(Decimal("0.0001"))
    db.add(
        VoucherLine(
            tenant_id=tenant_id,
            voucher_id=voucher.id,
            account_id=payable.id,
            entry_type="CREDIT",
            amount=tds,
            base_amount=(tds * rate).quantize(Decimal("0.0001")),
            currency=target.currency,
            exchange_rate=target.exchange_rate,
            notes=f"{TDS_LINE_MARKER} {section.section_code} withheld on {calc['taxable_amount']}",
        )
    )
    deduction = await create_tds_deduction_record(
        db,
        tenant_id,
        party_ledger_id=party.id,
        tds_section_id=section.id,
        taxable_amount=calc["taxable_amount"],
        tds_amount=tds,
        voucher_id=voucher.id,
        deduction_date=voucher.voucher_date,
        created_by=created_by,
        notes="Auto TDS withheld inside payment",
    )
    deduction.tds_liability_voucher_id = voucher.id
    voucher.description = (
        f"{voucher.description} | TDS {tds}" if voucher.description else f"TDS {tds} ({section.section_code})"
    )
    await db.flush()
    return deduction


async def maybe_auto_tds_on_payment_voucher(
    db: AsyncSession,
    tenant_id: int,
    voucher: Voucher,
    *,
    feature_flags: Any = None,
    created_by: int | None = None,
    tds_payable_account_id: int | None = None,
) -> TdsDeduction | None:
    """After a PAYMENT posts: record the TDS deduction when it was not withheld inside the payment.

    No ledger entry is made here. A separate "Dr Vendor / Cr TDS payable" journal reduced the
    vendor payable a second time (the payment already debited it in full), so the liability is
    only booked by ``split_tds_into_payment_voucher`` (flag ``tds_split_in_payment``).
    """
    from app.common.tenant_feature_keys import is_tds_system_enabled

    if not is_tds_system_enabled(feature_flags):
        return None
    if (voucher.voucher_type or "").upper() != "PAYMENT":
        return None

    existing = await _deduction_for_voucher(db, tenant_id, voucher.id)
    if existing:
        return existing

    lines = await _load_lines(db, voucher.id)
    if any((ln.notes or "").startswith(TDS_LINE_MARKER) for ln in lines):
        return None
    party, party_line = await _tds_party_line(db, tenant_id, lines)
    if not party or not party_line:
        return None

    section = await get_tds_section(db, tenant_id, section_id=party.tds_section_id)
    if not section:
        return None
    calc = calculate_tds_amount(_money(_d(party_line.amount)), section)
    if not calc["applicable"] or calc["tds_amount"] <= ZERO:
        return None

    logger.info("TDS applicable on payment %s but not withheld inside it (tenant=%s)", voucher.id, tenant_id)
    return await create_tds_deduction_record(
        db,
        tenant_id,
        party_ledger_id=party.id,
        tds_section_id=section.id,
        taxable_amount=calc["taxable_amount"],
        tds_amount=calc["tds_amount"],
        voucher_id=voucher.id,
        deduction_date=voucher.voucher_date,
        created_by=created_by,
        notes=(
            "Auto TDS: liability not booked. Enable tds_split_in_payment and set "
            "tds_settings.tds_payable_account_id to withhold TDS inside the payment."
        ),
    )


async def on_payment_voucher_cancelled(db: AsyncSession, tenant_id: int, voucher: Voucher) -> None:
    """Undo auto TDS when its payment is cancelled or reversed.

    Removes the PENDING deduction record and reverses a separate TDS liability journal made by
    older versions. Raises 409 once the TDS has been deposited or certified.
    """
    from app.modules.finance.advanced_voucher_service import voucher_book_impact_applied
    from app.modules.finance.posting_core import apply_voucher_to_books

    rows = list(
        (
            await db.execute(
                select(TdsDeduction).where(TdsDeduction.tenant_id == tenant_id, TdsDeduction.voucher_id == voucher.id)
            )
        ).scalars().all()
    )
    for ded in rows:
        if ded.status != "PENDING":
            raise HTTPException(
                status_code=409,
                detail=f"TDS on this payment is already {ded.status.lower()}; undo that before cancelling the payment.",
            )
        journal_id = ded.tds_liability_voucher_id
        if journal_id and journal_id != voucher.id:
            journal = (
                await db.execute(
                    select(Voucher)
                    .where(Voucher.id == journal_id, Voucher.tenant_id == tenant_id)
                    .with_for_update()
                )
            ).scalar_one_or_none()
            if journal is not None and journal.status == "POSTED":
                if voucher_book_impact_applied(journal):
                    await apply_voucher_to_books(db, tenant_id, journal, reverse=True)
                journal.status = "CANCELLED"
                journal.description = f"{journal.description or ''} (cancelled with payment {voucher.voucher_number})".strip()
        await db.delete(ded)
    await db.flush()


def quarter_date_range(year: int, quarter: int) -> tuple[date, date]:
    from calendar import monthrange

    if quarter not in (1, 2, 3, 4):
        raise HTTPException(status_code=400, detail="quarter must be 1-4")
    start_month = (quarter - 1) * 3 + 1
    end_month = start_month + 2
    start = date(year, start_month, 1)
    end = date(year, end_month, monthrange(year, end_month)[1])
    return start, end


async def generate_tds_return(
    db: AsyncSession,
    tenant_id: int,
    *,
    year: int,
    quarter: int,
    form: str = "26Q",
) -> dict[str, Any]:
    """Aggregate TDS deductions for Form 26Q (non-salary) / 24Q (salary) style export."""
    start, end = quarter_date_range(year, quarter)
    rows = list(
        (
            await db.execute(
                select(TdsDeduction, TdsSection, PartyLedger)
                .join(TdsSection, TdsSection.id == TdsDeduction.tds_section_id)
                .join(PartyLedger, PartyLedger.id == TdsDeduction.party_ledger_id)
                .where(
                    TdsDeduction.tenant_id == tenant_id,
                    TdsSection.tenant_id == tenant_id,
                    PartyLedger.tenant_id == tenant_id,
                    TdsDeduction.deduction_date >= start,
                    TdsDeduction.deduction_date <= end,
                )
                .order_by(TdsDeduction.deduction_date, TdsDeduction.id)
            )
        ).all()
    )
    form_u = (form or "26Q").upper()
    # 24Q typically section 192; 26Q others — soft filter
    lines_out = []
    total_tds = ZERO
    total_taxable = ZERO
    pending = 0
    deposited = 0
    for ded, section, party in rows:
        if form_u == "24Q" and section.section_code != "192":
            continue
        if form_u == "26Q" and section.section_code == "192":
            continue
        total_tds += _d(ded.tds_amount)
        total_taxable += _d(ded.taxable_amount)
        if ded.status == "PENDING":
            pending += 1
        elif ded.status == "DEPOSITED":
            deposited += 1
        lines_out.append(
            {
                "deduction_id": ded.id,
                "deduction_date": ded.deduction_date.isoformat() if ded.deduction_date else None,
                "section_code": section.section_code,
                "party_ledger_id": party.id,
                "party_type": party.party_type,
                "taxable_amount": str(_money(_d(ded.taxable_amount))),
                "tds_amount": str(_money(_d(ded.tds_amount))),
                "status": ded.status,
                "certificate_number": ded.certificate_number,
                "voucher_id": ded.voucher_id,
            }
        )
    return {
        "form": form_u,
        "year": year,
        "quarter": quarter,
        "from_date": start.isoformat(),
        "to_date": end.isoformat(),
        "rows": lines_out,
        "summary": {
            "count": len(lines_out),
            "total_taxable": str(_money(total_taxable)),
            "total_tds": str(_money(total_tds)),
            "pending_count": pending,
            "deposited_count": deposited,
        },
    }


def tds_section_out(row: TdsSection) -> dict[str, Any]:
    return {
        "id": row.id,
        "section_code": row.section_code,
        "description": row.description,
        "threshold_amount": str(_money(_d(row.threshold_amount))),
        "tds_rate": str(row.tds_rate),
        "rate_company": str(row.rate_company) if row.rate_company is not None else None,
        "rate_non_company": str(row.rate_non_company) if row.rate_non_company is not None else None,
        "is_active": row.is_active,
    }


def tds_deduction_out(row: TdsDeduction) -> dict[str, Any]:
    return {
        "id": row.id,
        "party_ledger_id": row.party_ledger_id,
        "voucher_id": row.voucher_id,
        "tds_section_id": row.tds_section_id,
        "taxable_amount": str(_money(_d(row.taxable_amount))),
        "tds_amount": str(_money(_d(row.tds_amount))),
        "net_payment": str(_money(_d(row.net_payment))) if row.net_payment is not None else None,
        "tds_liability_voucher_id": row.tds_liability_voucher_id,
        "certificate_number": row.certificate_number,
        "certificate_date": row.certificate_date.isoformat() if row.certificate_date else None,
        "status": row.status,
        "deduction_date": row.deduction_date.isoformat() if row.deduction_date else None,
        "notes": row.notes,
    }
