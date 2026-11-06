"""Auto GST must only tax sales/purchase lines (or tagged lines), never bank/cash lines.

Run:
docker compose exec backend pytest tests/test_accounting_gst_inference.py -q
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models.finance import Voucher, VoucherLine
from app.modules.finance.gst_tax_hooks import maybe_auto_calculate_tax_on_voucher
from app.modules.finance.tax_calculation_service import calculate_tax_on_voucher

from tests.test_gst_tax_system import _coa, _seed_tenant, _tax_ledgers


async def _voucher(db, tenant_id: int, vtype: str, lines: list[tuple[int, str, str, str | None]]) -> Voucher:
    v = Voucher(
        tenant_id=tenant_id,
        voucher_number=f"V-{uuid.uuid4().hex[:6]}",
        voucher_type=vtype,
        voucher_date=date.today(),
        status="DRAFT",
        description="gst inference",
        currency="INR",
        base_currency="INR",
        exchange_rate="1",
        source_module="MANUAL",
    )
    db.add(v)
    await db.flush()
    for account_id, entry, amount, notes in lines:
        db.add(
            VoucherLine(
                tenant_id=tenant_id,
                voucher_id=v.id,
                account_id=account_id,
                entry_type=entry,
                amount=amount,
                base_amount=amount,
                notes=notes,
            )
        )
    await db.flush()
    return v


async def _lines(db, voucher_id: int) -> list[VoucherLine]:
    return list((await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == voucher_id))).scalars().all())


@pytest.mark.asyncio
async def test_manual_payment_from_bank_gets_no_gst(db_session_integration):
    db = db_session_integration
    tenant = await _seed_tenant(db)
    await _tax_ledgers(db, tenant.id)
    expense = await _coa(db, tenant.id, "EXP", "Office expense")
    bank = await _coa(db, tenant.id, "BANK", "City Bank current a/c")
    bank.is_bank_account = True
    await db.flush()
    v = await _voucher(db, tenant.id, "PAYMENT", [(expense.id, "DEBIT", "1000", None), (bank.id, "CREDIT", "1000", None)])

    await maybe_auto_calculate_tax_on_voucher(db, tenant.id, v, feature_flags=tenant.feature_flags)

    lines = await _lines(db, v.id)
    assert len(lines) == 2
    assert all(Decimal(str(ln.amount)) == Decimal("1000") for ln in lines)


@pytest.mark.asyncio
async def test_untagged_journal_is_not_taxed(db_session_integration):
    db = db_session_integration
    tenant = await _seed_tenant(db)
    await _tax_ledgers(db, tenant.id)
    expense = await _coa(db, tenant.id, "EXP", "Rent")
    payable = await _coa(db, tenant.id, "AP", "Landlord payable")
    v = await _voucher(db, tenant.id, "JOURNAL", [(expense.id, "DEBIT", "500", None), (payable.id, "CREDIT", "500", None)])

    preview = await calculate_tax_on_voucher(db, tenant.id, v.id, feature_flags=tenant.feature_flags, apply=False)
    assert preview["lines"] == []
    assert Decimal(preview["tax_total"]) == Decimal("0")


@pytest.mark.asyncio
async def test_tagged_bank_line_is_never_taxed(db_session_integration):
    db = db_session_integration
    tenant = await _seed_tenant(db)
    await _tax_ledgers(db, tenant.id)
    sales = await _coa(db, tenant.id, "SAL", "Sales")
    bank = await _coa(db, tenant.id, "BANK", "Bank")
    bank.is_bank_account = True
    await db.flush()
    v = await _voucher(
        db,
        tenant.id,
        "RECEIPT",
        [(bank.id, "DEBIT", "1000", None), (sales.id, "CREDIT", "1000", None), ],
    )
    # Even a wrongly tagged bank line is skipped.
    for ln in await _lines(db, v.id):
        if ln.account_id == bank.id:
            ln.notes = "GST_RATE:18"
    await db.flush()
    preview = await calculate_tax_on_voucher(db, tenant.id, v.id, feature_flags=tenant.feature_flags, apply=False)
    assert preview["lines"] == []


@pytest.mark.asyncio
async def test_sales_voucher_taxes_only_income_line(db_session_integration):
    db = db_session_integration
    tenant = await _seed_tenant(db)
    await _tax_ledgers(db, tenant.id)
    customer = await _coa(db, tenant.id, "CUST", "Customer A")
    customer.normal_balance = "debit"
    sales = await _coa(db, tenant.id, "SAL", "Sales")
    await db.flush()
    v = await _voucher(db, tenant.id, "SALES", [(customer.id, "DEBIT", "1000", None), (sales.id, "CREDIT", "1000", None)])

    await maybe_auto_calculate_tax_on_voucher(db, tenant.id, v, feature_flags=tenant.feature_flags, place_of_supply_state="27")

    lines = await _lines(db, v.id)
    gst_lines = [ln for ln in lines if (ln.notes or "").startswith("[GST]")]
    assert len(gst_lines) == 2  # CGST + SGST on the 1,000 sale
    assert sum(Decimal(str(ln.amount)) for ln in gst_lines) == Decimal("180")
    debit = sum(Decimal(str(ln.amount)) for ln in lines if ln.entry_type == "DEBIT")
    credit = sum(Decimal(str(ln.amount)) for ln in lines if ln.entry_type == "CREDIT")
    assert debit == credit == Decimal("1180")
    debit_base = sum(Decimal(str(ln.base_amount)) for ln in lines if ln.entry_type == "DEBIT")
    credit_base = sum(Decimal(str(ln.base_amount)) for ln in lines if ln.entry_type == "CREDIT")
    assert debit_base == credit_base
