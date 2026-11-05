"""Payroll posting: balanced entries, ledger balances moved, tenant fiscal year, optional gross posting.

Run:
docker compose exec backend pytest tests/test_accounting_payroll_posting.py -q
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.common.tenant_feature_keys import (
    FISCAL_YEAR_START_MONTH,
    PAYROLL_GROSS_POSTING,
    STATUTORY_PAYROLL_ENABLED,
)
from app.main import app
from app.models import PayrollAccountingConfig, PayrollRun, PayrollRunLine
from app.models.finance import AccountingPeriod, Voucher, VoucherLine
from app.models.hr_payroll import PayrollCalculationSnapshot
from app.modules.finance.fiscal_year import fiscal_year_of

from tests.go_live_fixtures import seed_hr_leave_approval_context, seed_payroll_period
from tests.test_accounting_posting_integrity import _account, _override


async def _seed(db, *, flags: dict, with_tax_account: bool = True):
    tenant, user, emp, _ = await seed_hr_leave_approval_context(db)
    tenant.feature_flags = {**(tenant.feature_flags or {}), FISCAL_YEAR_START_MONTH: 12, **flags}
    period = await seed_payroll_period(db, tenant)
    db.add(
        AccountingPeriod(
            tenant_id=tenant.id,
            period_name=f"GL-{period.period_code}",
            start_date=period.start_date,
            end_date=period.end_date,
            is_closed=False,
        )
    )
    accts = {
        "expense": await _account(db, tenant.id, "Salary expense"),
        "payable": await _account(db, tenant.id, "Salary payable", normal="credit"),
        "pf": await _account(db, tenant.id, "PF payable", normal="credit"),
        "tax": await _account(db, tenant.id, "Tax payable", normal="credit"),
        "bank": await _account(db, tenant.id, "Bank"),
    }
    db.add(
        PayrollAccountingConfig(
            tenant_id=tenant.id,
            salary_expense_account_id=accts["expense"].id,
            salary_payable_account_id=accts["payable"].id,
            pf_payable_account_id=accts["pf"].id,
            tax_payable_account_id=accts["tax"].id if with_tax_account else None,
            bank_account_id=accts["bank"].id,
        )
    )
    run = PayrollRun(
        tenant_id=tenant.id,
        period_id=period.id,
        run_code=f"R{uuid.uuid4().hex[:6]}",
        run_date=period.start_date,
        status="APPROVED",
    )
    db.add(run)
    await db.flush()
    line = PayrollRunLine(
        tenant_id=tenant.id,
        run_id=run.id,
        employee_id=emp.id,
        gross_pay=Decimal("10000"),
        deductions=Decimal("1500"),
        net_pay=Decimal("8500"),
    )
    db.add(line)
    await db.flush()
    # Employee PF 1,200 (+ employer 1,200); the other 300 of deductions is income tax.
    db.add(
        PayrollCalculationSnapshot(
            tenant_id=tenant.id,
            payroll_run_line_id=line.id,
            trace_json={
                "statutory": {
                    "pf": {"employee_pf": "1200", "employer_pf": "1200"},
                    "esi": {"employee_esi": "0", "employer_esi": "0"},
                    "pt_amount": "0",
                }
            },
        )
    )
    await db.commit()
    return tenant, user, period, run, accts


async def _post(db, tenant, user, run):
    _override(db, user, tenant)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            return await ac.post(
                f"/api/v1/hr/payroll/runs/{run.id}/post", headers={"X-Tenant-Id": str(tenant.id)}, json={}
            )
    finally:
        app.dependency_overrides.clear()


async def _bal(db, acct) -> Decimal:
    await db.refresh(acct)
    return Decimal(str(acct.balance))


async def _lines(db, voucher_id: int) -> list[VoucherLine]:
    return list((await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == voucher_id))).scalars().all())


def _totals(lines) -> tuple[Decimal, Decimal]:
    dr = sum(Decimal(str(ln.amount)) for ln in lines if ln.entry_type == "DEBIT")
    cr = sum(Decimal(str(ln.amount)) for ln in lines if ln.entry_type == "CREDIT")
    return dr, cr


@pytest.mark.asyncio
async def test_net_posting_moves_balances_and_uses_tenant_fiscal_year(db_session_integration):
    db = db_session_integration
    tenant, user, period, run, accts = await _seed(db, flags={})
    r = await _post(db, tenant, user, run)
    assert r.status_code == 200, r.text
    voucher = await db.get(Voucher, r.json()["voucher_id"])
    await db.refresh(voucher)
    assert voucher.books_applied is True
    assert voucher.fiscal_year == fiscal_year_of(period.payment_date, 12)
    lines = await _lines(db, voucher.id)
    assert _totals(lines) == (Decimal("8500"), Decimal("8500"))
    assert await _bal(db, accts["expense"]) == Decimal("8500")
    assert await _bal(db, accts["payable"]) == Decimal("8500")


@pytest.mark.asyncio
async def test_gross_posting_credits_deduction_liabilities(db_session_integration):
    db = db_session_integration
    tenant, user, _period, run, accts = await _seed(db, flags={PAYROLL_GROSS_POSTING: True})
    r = await _post(db, tenant, user, run)
    assert r.status_code == 200, r.text
    lines = await _lines(db, r.json()["voucher_id"])
    dr, cr = _totals(lines)
    # Dr expense 10,000 gross + 1,200 employer PF
    assert dr == cr == Decimal("11200")
    assert await _bal(db, accts["expense"]) == Decimal("11200")
    assert await _bal(db, accts["payable"]) == Decimal("8500")
    assert await _bal(db, accts["pf"]) == Decimal("2400")  # employee 1,200 + employer 1,200
    assert await _bal(db, accts["tax"]) == Decimal("300")


@pytest.mark.asyncio
async def test_gross_posting_requires_liability_accounts(db_session_integration):
    db = db_session_integration
    tenant, user, _period, run, accts = await _seed(db, flags={PAYROLL_GROSS_POSTING: True}, with_tax_account=False)
    r = await _post(db, tenant, user, run)
    assert r.status_code == 400, r.text
    assert "Tax payable" in r.text
    assert await _bal(db, accts["expense"]) == Decimal("0")


@pytest.mark.asyncio
async def test_statutory_remittance_is_balanced_and_applied(db_session_integration):
    db = db_session_integration
    tenant, user, _period, run, accts = await _seed(
        db, flags={PAYROLL_GROSS_POSTING: True, STATUTORY_PAYROLL_ENABLED: True}
    )
    r = await _post(db, tenant, user, run)
    assert r.status_code == 200, r.text
    rem_id = r.json().get("statutory_remittance_voucher_id")
    assert rem_id
    rem = await db.get(Voucher, rem_id)
    await db.refresh(rem)
    assert rem.books_applied is True
    dr, cr = _totals(await _lines(db, rem.id))
    assert dr == cr == Decimal("2400")
    # Liability booked at posting (2,400) and cleared by the remittance.
    assert await _bal(db, accts["pf"]) == Decimal("0")
    assert await _bal(db, accts["bank"]) == Decimal("-2400")


@pytest.mark.asyncio
async def test_remittance_skipped_when_liability_account_missing(db_session_integration):
    db = db_session_integration
    tenant, user, _period, run, accts = await _seed(db, flags={STATUTORY_PAYROLL_ENABLED: True})
    cfg = (
        await db.execute(select(PayrollAccountingConfig).where(PayrollAccountingConfig.tenant_id == tenant.id))
    ).scalar_one()
    cfg.pf_payable_account_id = None
    cfg.tax_payable_account_id = None
    await db.commit()
    r = await _post(db, tenant, user, run)
    assert r.status_code == 200, r.text
    assert not r.json().get("statutory_remittance_voucher_id")
    assert await _bal(db, accts["bank"]) == Decimal("0")
    remittances = (
        await db.execute(select(Voucher).where(Voucher.tenant_id == tenant.id, Voucher.source_module == "PAYROLL_STATUTORY"))
    ).scalars().all()
    assert remittances == []
