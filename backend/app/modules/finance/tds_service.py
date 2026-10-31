"""Sprint 5: TDS calculation, liability vouchers, Form 26Q/24Q export data."""

from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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


async def maybe_auto_tds_on_payment_voucher(
    db: AsyncSession,
    tenant_id: int,
    voucher: Voucher,
    *,
    feature_flags: Any = None,
    created_by: int | None = None,
    tds_payable_account_id: int | None = None,
) -> TdsDeduction | None:
    """On PAYMENT post: if party has TDS section and amount > threshold, create deduction + liability."""
    from app.common.tenant_feature_keys import is_tds_system_enabled

    if not is_tds_system_enabled(feature_flags):
        return None
    if (voucher.voucher_type or "").upper() != "PAYMENT":
        return None

    # Avoid duplicate
    existing = (
        await db.execute(
            select(TdsDeduction).where(
                TdsDeduction.tenant_id == tenant_id,
                TdsDeduction.voucher_id == voucher.id,
            )
        )
    ).scalars().first()
    if existing:
        return existing

    lines = list(
        (await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == voucher.id))).scalars().all()
    )
    # Find party AP line (DEBIT on vendor AP for payment)
    party = None
    payment_amount = ZERO
    vendor_ap_id = None
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
            party = pl
            payment_amount = _money(_d(ln.amount))
            vendor_ap_id = ln.account_id
            break
    if not party or not vendor_ap_id:
        return None

    section = await get_tds_section(db, tenant_id, section_id=party.tds_section_id)
    if not section:
        return None
    calc = calculate_tds_amount(payment_amount, section)
    if not calc["applicable"] or calc["tds_amount"] <= ZERO:
        return None

    # Resolve TDS payable account from feature_flags.tds_settings or tax payable style
    payable_id = tds_payable_account_id
    if not payable_id and isinstance(feature_flags, dict):
        settings = feature_flags.get("tds_settings") or {}
        if isinstance(settings, dict) and settings.get("tds_payable_account_id"):
            payable_id = int(settings["tds_payable_account_id"])
    if not payable_id:
        logger.info("TDS applicable but tds_payable_account_id not configured tenant=%s", tenant_id)
        # Still create deduction record without liability voucher
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
            notes="Auto TDS (liability voucher skipped — configure tds_payable_account_id)",
        )

    deduction = await create_tds_deduction_record(
        db,
        tenant_id,
        party_ledger_id=party.id,
        tds_section_id=section.id,
        taxable_amount=calc["taxable_amount"],
        tds_amount=calc["tds_amount"],
        voucher_id=voucher.id,
        deduction_date=voucher.voucher_date,
        created_by=created_by,
        notes="Auto TDS on payment post",
    )
    await create_tds_liability_voucher(
        db,
        tenant_id,
        deduction=deduction,
        vendor_ap_account_id=vendor_ap_id,
        tds_payable_account_id=payable_id,
        voucher_date=voucher.voucher_date,
        created_by=created_by,
        include_bank_net=False,
    )
    if voucher.description:
        voucher.description = f"{voucher.description} | TDS {calc['tds_amount']}"
    else:
        voucher.description = f"TDS {calc['tds_amount']} ({section.section_code})"
    await db.flush()
    return deduction


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
