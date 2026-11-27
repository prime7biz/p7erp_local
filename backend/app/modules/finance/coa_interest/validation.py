"""Validate COA interest policy fields on create/update."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.ownership import ensure_owned
from app.models.finance import AccountGroup, ChartOfAccount
from app.modules.finance.coa_interest.calc import (
    ALLOWED_BASIS,
    ALLOWED_FREQUENCIES,
    ALLOWED_METHODS,
    to_decimal,
)
from app.modules.finance.coa_interest.facility_conflict import assert_coa_interest_allowed_for_account


async def validate_interest_policy(
    db: AsyncSession,
    *,
    tenant_id: int,
    account: ChartOfAccount | None,
    group: AccountGroup,
    interest_enabled: bool,
    interest_basis: str | None,
    interest_method: str | None,
    interest_frequency: str | None,
    interest_rate_yearly: Decimal | str | float | None,
    interest_amount: Decimal | str | float | None,
    interest_counterpart_account_id: int | None,
    interest_activation_date: date | None,
    enable_bill_wise: bool | None = None,
    enable_sub_accounts: bool | None = None,
    maintain_fc_balance: bool | None = None,
    account_type: str | None = None,
    allow_bill_wise_with_interest: bool = False,
) -> dict:
    """Return cleaned interest fields. Raises HTTPException on invalid policy."""
    if not interest_enabled:
        return {
            "interest_enabled": False,
            "interest_basis": None,
            "interest_method": None,
            "interest_frequency": None,
            "interest_rate_yearly": None,
            "interest_amount": None,
            "interest_counterpart_account_id": None,
            "interest_activation_date": None,
        }

    nature = (group.nature or "").strip().lower()
    if nature not in ("asset", "liability"):
        raise HTTPException(
            status_code=400,
            detail="Interest can only be activated on Asset or Liability ledgers.",
        )

    bill_wise = bool(account.enable_bill_wise) if enable_bill_wise is None and account is not None else bool(enable_bill_wise)
    sub_accounts = (
        bool(getattr(account, "enable_sub_accounts", False))
        if enable_sub_accounts is None and account is not None
        else bool(enable_sub_accounts)
    )
    foreign_currency = (
        bool(account.maintain_fc_balance) if maintain_fc_balance is None and account is not None else bool(maintain_fc_balance)
    )
    kind = (account.account_type if account_type is None and account is not None else account_type) or "posting"
    if sub_accounts:
        raise HTTPException(
            status_code=400,
            detail="Interest is not used on a sub-account control ledger. Use a separate ledger for an interest-bearing loan.",
        )
    if foreign_currency:
        raise HTTPException(
            status_code=400,
            detail="Interest is not supported on foreign-currency ledgers in this version.",
        )
    if bill_wise and not allow_bill_wise_with_interest:
        raise HTTPException(
            status_code=400,
            detail="Interest is not supported on bill-wise (party) ledgers. Use party ledger interest instead.",
        )
    if kind.lower() != "posting":
        raise HTTPException(status_code=400, detail="Interest can only be activated on posting ledgers.")
    if account is not None:
        await assert_coa_interest_allowed_for_account(db, tenant_id, account.id)

    basis = (interest_basis or "").strip().lower()
    method = (interest_method or "").strip().lower()
    frequency = (interest_frequency or "").strip().lower()
    if basis not in ALLOWED_BASIS:
        raise HTTPException(status_code=400, detail="Choose interest basis: simple or compound.")
    if method not in ALLOWED_METHODS:
        raise HTTPException(
            status_code=400,
            detail="Choose interest method: monthly_fixed, yearly_fixed, or yearly_rate.",
        )
    if frequency not in ALLOWED_FREQUENCIES:
        raise HTTPException(status_code=400, detail="Choose interest frequency: monthly or quarterly.")
    if method == "monthly_fixed" and frequency != "monthly":
        raise HTTPException(status_code=400, detail="Monthly fixed interest requires monthly frequency.")
    if interest_activation_date is None:
        raise HTTPException(status_code=400, detail="Interest activation date is required.")

    rate = None
    amount = None
    if method == "yearly_rate":
        rate = to_decimal(interest_rate_yearly)
        if rate <= 0:
            raise HTTPException(status_code=400, detail="Yearly interest rate must be greater than zero.")
    else:
        amount = to_decimal(interest_amount)
        if amount <= 0:
            raise HTTPException(status_code=400, detail="Interest amount must be greater than zero.")

    if interest_counterpart_account_id is None:
        raise HTTPException(
            status_code=400,
            detail="Pick an Interest Expense (liability) or Interest Income (asset) ledger.",
        )
    counterpart = await ensure_owned(
        db, ChartOfAccount, interest_counterpart_account_id, tenant_id, "Interest counterpart account"
    )
    assert counterpart is not None
    if not counterpart.is_active:
        raise HTTPException(status_code=400, detail="Interest counterpart account is inactive.")
    if (counterpart.account_type or "posting").lower() == "header":
        raise HTTPException(status_code=400, detail="Interest counterpart must be a posting ledger.")
    cg = await db.get(AccountGroup, counterpart.group_id)
    if not cg or cg.tenant_id != tenant_id:
        raise HTTPException(status_code=400, detail="Interest counterpart account group not found.")
    cn = (cg.nature or "").strip().lower()
    if nature == "liability" and cn != "expense":
        raise HTTPException(
            status_code=400,
            detail="For a liability ledger, the counterpart must be an Expense ledger (e.g. Interest Expense).",
        )
    if nature == "asset" and cn != "income":
        raise HTTPException(
            status_code=400,
            detail="For an asset ledger, the counterpart must be an Income ledger (e.g. Interest Income).",
        )
    if account is not None and counterpart.id == account.id:
        raise HTTPException(status_code=400, detail="Counterpart cannot be the same ledger.")

    return {
        "interest_enabled": True,
        "interest_basis": basis,
        "interest_method": method,
        "interest_frequency": frequency,
        "interest_rate_yearly": rate,
        "interest_amount": amount,
        "interest_counterpart_account_id": counterpart.id,
        "interest_activation_date": interest_activation_date,
    }
