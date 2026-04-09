"""Draft voucher creation for facility lifecycle (posting updates state via hooks)."""

from __future__ import annotations

from datetime import date

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.finance import AccountGroup, ChartOfAccount, Voucher, VoucherLine, VoucherType
from app.modules.finance.voucher_controls import allocate_series_voucher_number

from app.modules.facility.constants import (
    SOURCE_FACILITY_ACCRUAL,
    SOURCE_FACILITY_DISBURSE,
    SOURCE_FACILITY_REPAYMENT,
)


async def _validate_posting_account(db: AsyncSession, tenant_id: int, account_id: int) -> ChartOfAccount:
    account = await db.get(ChartOfAccount, account_id)
    if not account or account.tenant_id != tenant_id:
        raise HTTPException(status_code=400, detail=f"Account not found: {account_id}")
    if (account.account_type or "posting").lower() == "header":
        raise HTTPException(status_code=400, detail=f"Posting not allowed to header account: {account.account_number}")
    group = await db.get(AccountGroup, account.group_id)
    if group and group.tenant_id != tenant_id:
        raise HTTPException(status_code=400, detail="Account group not found for this tenant")
    if group and not bool(group.allow_posting):
        raise HTTPException(status_code=400, detail=f"Posting not allowed to accounts in group '{group.name}'.")
    return account


async def _ensure_voucher_type(db: AsyncSession, tenant_id: int, code: str) -> None:
    r = await db.execute(
        select(VoucherType).where(
            VoucherType.tenant_id == tenant_id,
            VoucherType.code == code,
            VoucherType.is_active.is_(True),
        )
    )
    if r.scalar_one_or_none() is None:
        raise HTTPException(status_code=400, detail=f"Voucher type {code} is inactive or not configured.")


async def create_facility_journal_draft(
    *,
    db: AsyncSession,
    tenant_id: int,
    user_id: int | None,
    voucher_date: date,
    description: str | None,
    reference: str | None,
    debit_account_id: int,
    credit_account_id: int,
    amount: float,
    facility_utilization_id: int,
    source_module: str,
    source_module_ref: str | None,
    voucher_type_code: str = "JOURNAL",
    base_currency: str = "BDT",
) -> Voucher:
    await _ensure_voucher_type(db, tenant_id, voucher_type_code)
    await _validate_posting_account(db, tenant_id, debit_account_id)
    await _validate_posting_account(db, tenant_id, credit_account_id)
    voucher_number, series_seq, series_key, fy = await allocate_series_voucher_number(
        db,
        tenant_id=tenant_id,
        voucher_date=voucher_date,
        voucher_type=voucher_type_code,
        branch_code="MAIN",
    )
    voucher = Voucher(
        tenant_id=tenant_id,
        voucher_number=voucher_number,
        voucher_type=voucher_type_code,
        voucher_date=voucher_date,
        status="DRAFT",
        description=description,
        reference=reference,
        currency=base_currency,
        base_currency=base_currency,
        exchange_rate="1",
        exchange_rate_source="system",
        branch_code="MAIN",
        fiscal_year=fy,
        series_sequence=series_seq,
        number_series_key=series_key,
        source_module=source_module,
        source_module_ref=source_module_ref,
        facility_utilization_id=facility_utilization_id,
        allow_manual_edit=True,
        created_by=user_id,
    )
    db.add(voucher)
    await db.flush()
    amount_str = f"{float(amount):.2f}"
    db.add(
        VoucherLine(
            tenant_id=tenant_id,
            voucher_id=voucher.id,
            account_id=debit_account_id,
            entry_type="DEBIT",
            amount=amount_str,
            notes="Facility auto entry",
        )
    )
    db.add(
        VoucherLine(
            tenant_id=tenant_id,
            voucher_id=voucher.id,
            account_id=credit_account_id,
            entry_type="CREDIT",
            amount=amount_str,
            notes="Facility auto entry",
        )
    )
    await db.flush()
    return voucher


async def create_disbursement_draft(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    util_id: int,
    principal: float,
    bank_or_cash_account_id: int,
    liability_account_id: int,
    voucher_date: date,
    base_currency: str = "BDT",
) -> Voucher:
    """DR Bank / CR Liability."""
    return await create_facility_journal_draft(
        db=db,
        tenant_id=tenant_id,
        user_id=user_id,
        voucher_date=voucher_date,
        description=f"Facility disbursement util #{util_id}",
        reference=f"FAC-DISB-{util_id}",
        debit_account_id=bank_or_cash_account_id,
        credit_account_id=liability_account_id,
        amount=principal,
        facility_utilization_id=util_id,
        source_module=SOURCE_FACILITY_DISBURSE,
        source_module_ref=f"disbursement:{util_id}",
        voucher_type_code="JOURNAL",
        base_currency=base_currency,
    )


async def create_accrual_draft(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    util_id: int,
    interest_amount: float,
    expense_account_id: int,
    interest_payable_account_id: int,
    voucher_date: date,
    accrual_id: int,
    base_currency: str = "BDT",
) -> Voucher:
    """DR Interest expense / CR Interest payable."""
    return await create_facility_journal_draft(
        db=db,
        tenant_id=tenant_id,
        user_id=user_id,
        voucher_date=voucher_date,
        description=f"Facility interest accrual util #{util_id}",
        reference=f"FAC-ACC-{accrual_id}",
        debit_account_id=expense_account_id,
        credit_account_id=interest_payable_account_id,
        amount=interest_amount,
        facility_utilization_id=util_id,
        source_module=SOURCE_FACILITY_ACCRUAL,
        source_module_ref=f"accrual:{accrual_id}",
        base_currency=base_currency,
    )


async def create_repayment_draft(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    util_id: int,
    schedule_line_id: int,
    principal_part: float,
    interest_part: float,
    liability_account_id: int,
    interest_payable_account_id: int,
    bank_account_id: int,
    voucher_date: date,
    base_currency: str = "BDT",
) -> Voucher:
    """DR Liability + DR Interest payable / CR Bank (single bank line = principal+interest)."""
    await _ensure_voucher_type(db, tenant_id, "PAYMENT")
    await _validate_posting_account(db, tenant_id, liability_account_id)
    await _validate_posting_account(db, tenant_id, interest_payable_account_id)
    await _validate_posting_account(db, tenant_id, bank_account_id)
    total = round(float(principal_part) + float(interest_part), 2)
    voucher_number, series_seq, series_key, fy = await allocate_series_voucher_number(
        db,
        tenant_id=tenant_id,
        voucher_date=voucher_date,
        voucher_type="PAYMENT",
        branch_code="MAIN",
    )
    voucher = Voucher(
        tenant_id=tenant_id,
        voucher_number=voucher_number,
        voucher_type="PAYMENT",
        voucher_date=voucher_date,
        status="DRAFT",
        description=f"Facility repayment util #{util_id} line #{schedule_line_id}",
        reference=f"FAC-PAY-{schedule_line_id}",
        currency=base_currency,
        base_currency=base_currency,
        exchange_rate="1",
        exchange_rate_source="system",
        branch_code="MAIN",
        fiscal_year=fy,
        series_sequence=series_seq,
        number_series_key=series_key,
        source_module=SOURCE_FACILITY_REPAYMENT,
        source_module_ref=f"repayment:{schedule_line_id}",
        facility_utilization_id=util_id,
        allow_manual_edit=True,
        created_by=user_id,
    )
    db.add(voucher)
    await db.flush()
    if principal_part > 0:
        db.add(
            VoucherLine(
                tenant_id=tenant_id,
                voucher_id=voucher.id,
                account_id=liability_account_id,
                entry_type="DEBIT",
                amount=f"{principal_part:.2f}",
                notes="Principal",
            )
        )
    if interest_part > 0:
        db.add(
            VoucherLine(
                tenant_id=tenant_id,
                voucher_id=voucher.id,
                account_id=interest_payable_account_id,
                entry_type="DEBIT",
                amount=f"{interest_part:.2f}",
                notes="Interest",
            )
        )
    db.add(
        VoucherLine(
            tenant_id=tenant_id,
            voucher_id=voucher.id,
            account_id=bank_account_id,
            entry_type="CREDIT",
            amount=f"{total:.2f}",
            notes="Payment",
        )
    )
    await db.flush()
    return voucher
