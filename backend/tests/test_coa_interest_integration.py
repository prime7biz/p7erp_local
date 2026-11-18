"""COA ledger interest: draft journals, idempotency, facility conflict, lifecycle.

Run:
    docker compose exec backend pytest tests/test_coa_interest_calc.py tests/test_coa_interest_integration.py -q
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import select, text

from app.models.facility import Facility
from app.models.finance import (
    AccountGroup,
    AccountingPeriod,
    ChartOfAccount,
    CoaInterestAccrual,
    Voucher,
    VoucherLine,
    VoucherType,
)
from app.modules.finance.coa_interest import SOURCE_MODULE
from app.modules.finance.coa_interest.facility_conflict import (
    assert_coa_interest_allowed_for_account,
    assert_facility_liability_not_coa_interest,
)
from app.modules.finance.coa_interest.lifecycle import (
    on_coa_interest_voucher_cancelled,
    on_coa_interest_voucher_posted,
)
from app.modules.finance.coa_interest.service import run_coa_interest
from app.modules.finance.coa_interest.validation import validate_interest_policy
from tests.bd_hr_fixtures import real_db  # noqa: F401
from tests.go_live_fixtures import create_admin_tenant_with_user


async def _purge(factory, tenant_id: int) -> None:
    async with factory() as s:
        for table in (
            "coa_interest_accruals",
            "voucher_lines",
            "vouchers",
            "facilities",
            "voucher_types",
            "voucher_number_series",
            "accounting_periods",
            "chart_of_accounts",
            "account_groups",
        ):
            if (await s.execute(text("SELECT to_regclass(:t)"), {"t": table})).scalar():
                await s.execute(text(f"DELETE FROM {table} WHERE tenant_id = :t"), {"t": tenant_id})
        await s.commit()


async def _group(db, tenant_id: int, nature: str, normal: str) -> AccountGroup:
    slug = uuid.uuid4().hex[:6]
    g = AccountGroup(
        tenant_id=tenant_id,
        name=f"{nature}-{slug}",
        code=f"{nature[:3].upper()}{slug}"[:12],
        nature=nature,
        default_normal_balance=normal,
        allow_posting=True,
    )
    db.add(g)
    await db.flush()
    return g


async def _acct(
    db,
    tenant_id: int,
    group: AccountGroup,
    name: str,
    *,
    normal: str,
    opening: Decimal = Decimal("0"),
) -> ChartOfAccount:
    slug = uuid.uuid4().hex[:6]
    row = ChartOfAccount(
        tenant_id=tenant_id,
        account_number=f"CI-{slug}",
        name=f"{name}-{slug}",
        group_id=group.id,
        normal_balance=normal,
        opening_balance=opening,
        balance=opening,
        is_active=True,
        account_type="posting",
    )
    db.add(row)
    await db.flush()
    return row


async def _seed(factory, register) -> dict:
    async with factory() as db:
        tenant, user, _ = await create_admin_tenant_with_user(db)
        # Wide open period covering prior months so catch-up can draft.
        today = date.today()
        db.add(
            AccountingPeriod(
                tenant_id=tenant.id,
                period_name=f"CI{uuid.uuid4().hex[:4]}",
                start_date=today.replace(day=1) - timedelta(days=400),
                end_date=today + timedelta(days=60),
                is_closed=False,
            )
        )
        db.add(VoucherType(tenant_id=tenant.id, code="JOURNAL", name="Journal", is_active=True))
        liab_g = await _group(db, tenant.id, "Liability", "credit")
        exp_g = await _group(db, tenant.id, "Expense", "debit")
        asset_g = await _group(db, tenant.id, "Asset", "debit")
        income_g = await _group(db, tenant.id, "Income", "credit")
        loan = await _acct(db, tenant.id, liab_g, "Hand loan", normal="credit", opening=Decimal("100000"))
        expense = await _acct(db, tenant.id, exp_g, "Interest expense", normal="debit")
        fd = await _acct(db, tenant.id, asset_g, "Bank FD", normal="debit", opening=Decimal("50000"))
        income = await _acct(db, tenant.id, income_g, "Interest income", normal="credit")
        # Activate two full months ago so at least one completed period exists.
        activation = (today.replace(day=1) - timedelta(days=40)).replace(day=1)
        loan.interest_enabled = True
        loan.interest_basis = "compound"
        loan.interest_method = "yearly_rate"
        loan.interest_frequency = "monthly"
        loan.interest_rate_yearly = Decimal("12")
        loan.interest_counterpart_account_id = expense.id
        loan.interest_activation_date = activation
        await db.commit()
        register(tenant.id)
        return {
            "tenant_id": tenant.id,
            "user_id": user.id,
            "loan_id": loan.id,
            "expense_id": expense.id,
            "fd_id": fd.id,
            "income_id": income.id,
            "liab_g": liab_g.id,
            "activation": activation,
        }


@pytest.mark.asyncio
async def test_run_creates_draft_idempotent(real_db):
    factory, register = real_db
    s = await _seed(factory, register)
    try:
        async with factory() as db:
            first = await run_coa_interest(db, tenant_id=s["tenant_id"], user_id=s["user_id"])
            await db.commit()
            assert first["created"] >= 1
        async with factory() as db:
            second = await run_coa_interest(db, tenant_id=s["tenant_id"], user_id=s["user_id"])
            await db.commit()
            assert second["created"] == 0
            assert second["skipped"] >= 1
        async with factory() as db:
            rows = list(
                (
                    await db.execute(
                        select(CoaInterestAccrual).where(
                            CoaInterestAccrual.tenant_id == s["tenant_id"],
                            CoaInterestAccrual.account_id == s["loan_id"],
                        )
                    )
                ).scalars().all()
            )
            assert rows
            assert all(r.status == "draft" for r in rows)
            v = await db.get(Voucher, rows[0].journal_voucher_id)
            assert v is not None
            assert v.tenant_id == s["tenant_id"]
            assert v.status == "DRAFT"
            assert v.source_module == SOURCE_MODULE
            lines = list(
                (await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == v.id))).scalars().all()
            )
            assert len(lines) == 2
            debits = sum((ln.amount for ln in lines if ln.entry_type == "DEBIT"), Decimal("0"))
            credits = sum((ln.amount for ln in lines if ln.entry_type == "CREDIT"), Decimal("0"))
            assert debits == credits
            # Liability: expense debit, same loan credit
            assert any(ln.account_id == s["expense_id"] and ln.entry_type == "DEBIT" for ln in lines)
            assert any(ln.account_id == s["loan_id"] and ln.entry_type == "CREDIT" for ln in lines)
    finally:
        await _purge(factory, s["tenant_id"])


@pytest.mark.asyncio
async def test_post_and_cancel_lifecycle(real_db):
    factory, register = real_db
    s = await _seed(factory, register)
    try:
        async with factory() as db:
            await run_coa_interest(db, tenant_id=s["tenant_id"], user_id=s["user_id"])
            await db.commit()
        async with factory() as db:
            row = (
                await db.execute(
                    select(CoaInterestAccrual).where(
                        CoaInterestAccrual.tenant_id == s["tenant_id"],
                        CoaInterestAccrual.account_id == s["loan_id"],
                    )
                )
            ).scalars().first()
            assert row is not None
            v = await db.get(Voucher, row.journal_voucher_id)
            assert v is not None
            v.status = "POSTED"
            v.books_applied = True
            await on_coa_interest_voucher_posted(db, s["tenant_id"], v)
            await db.commit()
            await db.refresh(row)
            assert row.status == "posted"

            v.status = "CANCELLED"
            await on_coa_interest_voucher_cancelled(db, s["tenant_id"], v)
            # posted accruals ignore cancel
            await db.refresh(row)
            assert row.status == "posted"
    finally:
        await _purge(factory, s["tenant_id"])


@pytest.mark.asyncio
async def test_facility_conflict_both_ways(real_db):
    factory, register = real_db
    s = await _seed(factory, register)
    try:
        async with factory() as db:
            # No facility yet — must allow COA interest.
            await assert_coa_interest_allowed_for_account(db, s["tenant_id"], s["loan_id"])
        async with factory() as db:
            # Clear interest, link facility, then refuse re-enable
            loan = await db.get(ChartOfAccount, s["loan_id"])
            loan.interest_enabled = False
            fac = Facility(
                tenant_id=s["tenant_id"],
                facility_code=f"F{uuid.uuid4().hex[:6]}",
                facility_type="term_loan",
                sanctioned_amount=Decimal("100000"),
                interest_rate=Decimal("12"),
                status="active",
                gl_liability_account_id=s["loan_id"],
                gl_interest_expense_account_id=s["expense_id"],
            )
            db.add(fac)
            await db.commit()
        async with factory() as db:
            with pytest.raises(HTTPException) as ei:
                await assert_coa_interest_allowed_for_account(db, s["tenant_id"], s["loan_id"])
            assert ei.value.status_code == 409
        async with factory() as db:
            loan = await db.get(ChartOfAccount, s["loan_id"])
            loan.interest_enabled = True
            await db.commit()
        async with factory() as db:
            with pytest.raises(HTTPException) as ei:
                await assert_facility_liability_not_coa_interest(db, s["tenant_id"], s["loan_id"])
            assert ei.value.status_code == 409
    finally:
        await _purge(factory, s["tenant_id"])


@pytest.mark.asyncio
async def test_validate_rejects_wrong_counterpart_nature(real_db):
    factory, register = real_db
    s = await _seed(factory, register)
    try:
        async with factory() as db:
            loan = await db.get(ChartOfAccount, s["loan_id"])
            group = await db.get(AccountGroup, loan.group_id)
            with pytest.raises(HTTPException) as ei:
                await validate_interest_policy(
                    db,
                    tenant_id=s["tenant_id"],
                    account=loan,
                    group=group,
                    interest_enabled=True,
                    interest_basis="simple",
                    interest_method="yearly_rate",
                    interest_frequency="monthly",
                    interest_rate_yearly=Decimal("10"),
                    interest_amount=None,
                    interest_counterpart_account_id=s["income_id"],  # income is wrong for liability
                    interest_activation_date=date.today(),
                )
            assert ei.value.status_code == 400
    finally:
        await _purge(factory, s["tenant_id"])


@pytest.mark.asyncio
async def test_asset_fd_journal_and_cross_tenant_counterpart(real_db):
    factory, register = real_db
    s = await _seed(factory, register)
    other = None
    try:
        async with factory() as db:
            fd = await db.get(ChartOfAccount, s["fd_id"])
            fd.interest_enabled = True
            fd.interest_basis = "simple"
            fd.interest_method = "yearly_rate"
            fd.interest_frequency = "monthly"
            fd.interest_rate_yearly = Decimal("6")
            fd.interest_counterpart_account_id = s["income_id"]
            fd.interest_activation_date = s["activation"]
            await db.commit()
        async with factory() as db:
            result = await run_coa_interest(
                db, tenant_id=s["tenant_id"], user_id=s["user_id"], account_id=s["fd_id"]
            )
            await db.commit()
            assert result["created"] >= 1
        async with factory() as db:
            row = (
                await db.execute(
                    select(CoaInterestAccrual).where(
                        CoaInterestAccrual.tenant_id == s["tenant_id"],
                        CoaInterestAccrual.account_id == s["fd_id"],
                    )
                )
            ).scalars().first()
            assert row is not None
            lines = list(
                (await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == row.journal_voucher_id))).scalars().all()
            )
            assert any(ln.account_id == s["fd_id"] and ln.entry_type == "DEBIT" for ln in lines)
            assert any(ln.account_id == s["income_id"] and ln.entry_type == "CREDIT" for ln in lines)

        # Cross-tenant counterpart must look like "not found"
        async with factory() as db:
            other_tenant, _, _ = await create_admin_tenant_with_user(db)
            other = other_tenant.id
            register(other)
            foreign_income = await _acct(
                db,
                other,
                await _group(db, other, "Income", "credit"),
                "Foreign income",
                normal="credit",
            )
            await db.commit()
            foreign_id = foreign_income.id
        async with factory() as db:
            loan = await db.get(ChartOfAccount, s["loan_id"])
            group = await db.get(AccountGroup, loan.group_id)
            with pytest.raises(HTTPException) as ei:
                await validate_interest_policy(
                    db,
                    tenant_id=s["tenant_id"],
                    account=loan,
                    group=group,
                    interest_enabled=True,
                    interest_basis="simple",
                    interest_method="yearly_rate",
                    interest_frequency="monthly",
                    interest_rate_yearly=Decimal("10"),
                    interest_amount=None,
                    interest_counterpart_account_id=foreign_id,
                    interest_activation_date=date.today(),
                )
            assert ei.value.status_code in (400, 404)
            assert "not found" in str(ei.value.detail).lower()
    finally:
        await _purge(factory, s["tenant_id"])
        if other is not None:
            await _purge(factory, other)
