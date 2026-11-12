"""Facility interest accrual is safe against double submits from two separate sessions (RC-12).

These tests commit for real (two independent sessions), so they use the `real_db` fixture, which
removes the test tenant afterwards.

Run:
    docker compose exec backend pytest tests/test_facility_accrual_concurrency.py -q
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select, text

from app.models.facility import Facility, FacilityUtilization, InterestAccrual
from app.models.finance import AccountingPeriod, Voucher, VoucherLine, VoucherType
from app.modules.facility.accrual_service import reverse_accrual, run_monthly_accrual
from tests.bd_hr_fixtures import real_db  # noqa: F401  (pytest fixture)
from tests.go_live_fixtures import create_admin_tenant_with_user
from tests.test_accounting_posting_integrity import _account


async def _purge_facility_rows(factory, tenant_id: int) -> None:
    async with factory() as s:
        for table in (
            "interest_accruals",
            "voucher_lines",
            "vouchers",
            "repayment_schedule_lines",
            "facility_transactions",
            "facility_utilizations",
            "facilities",
            "voucher_types",
            "voucher_number_series",
            "accounting_periods",
        ):
            if (await s.execute(text("SELECT to_regclass(:t)"), {"t": table})).scalar():
                await s.execute(text(f"DELETE FROM {table} WHERE tenant_id = :t"), {"t": tenant_id})
        await s.commit()


async def _seed(factory, register) -> dict:
    async with factory() as db:
        tenant, user, _ = await create_admin_tenant_with_user(db)
        today = date.today()
        db.add(
            AccountingPeriod(
                tenant_id=tenant.id,
                period_name=f"P{uuid.uuid4().hex[:4]}",
                start_date=today - timedelta(days=60),
                end_date=today + timedelta(days=60),
                is_closed=False,
            )
        )
        db.add(VoucherType(tenant_id=tenant.id, code="JOURNAL", name="Journal", is_active=True))
        loan = await _account(db, tenant.id, "Term loan", normal="credit")
        payable = await _account(db, tenant.id, "Interest payable", normal="credit")
        expense = await _account(db, tenant.id, "Interest expense")
        bank = await _account(db, tenant.id, "Bank")
        fac = Facility(
            tenant_id=tenant.id,
            facility_code=f"F{uuid.uuid4().hex[:6]}",
            facility_type="term_loan",
            sanctioned_amount=Decimal("120000"),
            interest_rate=Decimal("12"),
            interest_type="reducing_balance",
            status="active",
            gl_liability_account_id=loan.id,
            gl_interest_payable_account_id=payable.id,
            gl_interest_expense_account_id=expense.id,
            repayment_source_account_id=bank.id,
        )
        db.add(fac)
        await db.flush()
        util = FacilityUtilization(
            tenant_id=tenant.id,
            facility_id=fac.id,
            utilization_code=f"U{uuid.uuid4().hex[:6]}",
            principal_amount=Decimal("120000"),
            outstanding_principal=Decimal("120000"),
            disbursement_date=today,
            repayment_policy="emi_reducing",
            num_installments=12,
            installment_frequency="monthly",
            interest_rate=Decimal("12"),
            status="active",
        )
        db.add(util)
        await db.commit()
        register(tenant.id)
        return {"tenant_id": tenant.id, "user_id": user.id, "util_id": util.id, "expense": expense.id, "payable": payable.id}


async def _posted_accrual(factory, s: dict) -> int:
    async with factory() as db:
        v = Voucher(
            tenant_id=s["tenant_id"],
            voucher_number=f"ACC-{uuid.uuid4().hex[:6]}",
            voucher_type="JOURNAL",
            voucher_date=date.today(),
            status="POSTED",
            source_module="FACILITY_ACCRUAL",
            source_module_ref="accrual:0",
        )
        db.add(v)
        await db.flush()
        db.add_all(
            [
                VoucherLine(tenant_id=s["tenant_id"], voucher_id=v.id, account_id=s["expense"], entry_type="DEBIT", amount=Decimal("1200"), base_amount=Decimal("1200")),
                VoucherLine(tenant_id=s["tenant_id"], voucher_id=v.id, account_id=s["payable"], entry_type="CREDIT", amount=Decimal("1200"), base_amount=Decimal("1200")),
            ]
        )
        row = InterestAccrual(
            tenant_id=s["tenant_id"],
            facility_utilization_id=s["util_id"],
            accrual_month="2026-01",
            accrual_date=date.today(),
            interest_amount=Decimal("1200"),
            status="accrued",
            journal_voucher_id=v.id,
        )
        db.add(row)
        await db.commit()
        return row.id


async def _reverse_in_own_session(factory, s: dict, accrual_id: int, tenant_id: int | None = None):
    async with factory() as db:
        try:
            out = await reverse_accrual(
                db, tenant_id=tenant_id or s["tenant_id"], accrual_id=accrual_id, reason="double click", user_id=s["user_id"]
            )
            await db.commit()
            return out
        except HTTPException as exc:
            await db.rollback()
            return exc


@pytest.mark.asyncio
async def test_two_sessions_reversing_the_same_accrual_create_one_draft(real_db):
    factory, register = real_db
    s = await _seed(factory, register)
    try:
        accrual_id = await _posted_accrual(factory, s)
        results = await asyncio.gather(
            _reverse_in_own_session(factory, s, accrual_id),
            _reverse_in_own_session(factory, s, accrual_id),
        )
        errors = [r for r in results if isinstance(r, HTTPException)]
        assert len(errors) == 1 and errors[0].status_code == 400
        async with factory() as db:
            n = (
                await db.execute(
                    select(func.count())
                    .select_from(Voucher)
                    .where(Voucher.tenant_id == s["tenant_id"], Voucher.source_module_ref == f"accrual_reversal:{accrual_id}")
                )
            ).scalar_one()
            row = await db.get(InterestAccrual, accrual_id)
        assert n == 1
        assert row.reversal_voucher_id is not None
    finally:
        await _purge_facility_rows(factory, s["tenant_id"])


@pytest.mark.asyncio
async def test_other_tenant_cannot_reverse_accrual(real_db):
    factory, register = real_db
    s = await _seed(factory, register)
    other = await _seed(factory, register)
    try:
        accrual_id = await _posted_accrual(factory, s)
        result = await _reverse_in_own_session(factory, s, accrual_id, tenant_id=other["tenant_id"])
        assert isinstance(result, HTTPException) and result.status_code == 404
    finally:
        await _purge_facility_rows(factory, s["tenant_id"])
        await _purge_facility_rows(factory, other["tenant_id"])


@pytest.mark.asyncio
async def test_two_sessions_running_the_same_month_create_one_accrual(real_db):
    factory, register = real_db
    s = await _seed(factory, register)
    month = "2026-02"

    async def run():
        async with factory() as db:
            out = await run_monthly_accrual(db, tenant_id=s["tenant_id"], user_id=s["user_id"], accrual_month=month)
            await db.commit()
            return out

    try:
        a, b = await asyncio.gather(run(), run())
        assert a["created"] + b["created"] == 1
        assert a["skipped"] + b["skipped"] == 1
        async with factory() as db:
            rows = (
                await db.execute(
                    select(InterestAccrual).where(
                        InterestAccrual.tenant_id == s["tenant_id"], InterestAccrual.accrual_month == month
                    )
                )
            ).scalars().all()
            vouchers = (
                await db.execute(
                    select(func.count())
                    .select_from(Voucher)
                    .where(Voucher.tenant_id == s["tenant_id"], Voucher.source_module == "FACILITY_ACCRUAL")
                )
            ).scalar_one()
        assert len(rows) == 1
        assert rows[0].journal_voucher_id is not None
        assert vouchers == 1
        assert Decimal(rows[0].interest_amount) == Decimal("1200.0000")
    finally:
        await _purge_facility_rows(factory, s["tenant_id"])
