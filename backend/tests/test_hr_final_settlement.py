"""Final settlement: statutory components, one-owner extras, clearance gate, balanced voucher posted
once (sequential and concurrent), payroll overlap refusal, paid / reversal, permissions, tenancy.

Run: docker compose exec backend pytest tests/test_hr_final_settlement.py -q
"""

from __future__ import annotations

import asyncio
from datetime import date
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from app.common.business_date import today_local
from app.models import Tenant, User
from app.models.finance import AccountingPeriod, Voucher, VoucherLine
from app.models.hr import Employee
from app.models.hr_allowance import HrAllowanceEntry, HrAllowanceRule
from app.models.hr_leave import LeaveBalance, LeaveType
from app.models.hr_payroll import (
    EmployeeAdvance,
    PayrollAccountingConfig,
    PayrollEmployeeStructureAssignment,
    PayrollPeriod,
    PayrollRun,
    PayrollRunLine,
    PayrollStructure,
)
from app.modules.hr_separation.router import post_settlement
from tests.bd_hr_fixtures import api_client, real_db  # noqa: F401
from tests.merch_fixtures import create_merch_tenant_with_user
from tests.test_accounting_posting_integrity import _account

BD = "/api/v1/hr/localization/bd-rmg"
HR = "/api/v1/hr"


async def _seed(db, *, with_payroll_overlap: bool = False):
    tenant, user, role = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    role.name = "manager"
    await db.commit()
    async with api_client(db, tenant, user) as c:
        assert (await c.post(f"{BD}/apply")).status_code == 200
    today = today_local(tenant)
    db.add(AccountingPeriod(tenant_id=tenant.id, period_name="FY", start_date=today.replace(month=1, day=1), end_date=today.replace(month=12, day=31), is_closed=False))
    accts = {
        "expense": await _account(db, tenant.id, "Salary expense"),
        "payable": await _account(db, tenant.id, "Salary payable", normal="credit"),
        "advance": await _account(db, tenant.id, "Staff advance"),
    }
    db.add(PayrollAccountingConfig(tenant_id=tenant.id, salary_expense_account_id=accts["expense"].id,
                                   salary_payable_account_id=accts["payable"].id, advance_receivable_account_id=accts["advance"].id))
    st = (await db.execute(select(PayrollStructure).where(PayrollStructure.tenant_id == tenant.id, PayrollStructure.code == "BD-W-G2"))).scalar_one()
    emp = Employee(tenant_id=tenant.id, employee_code="EMP-0000030", first_name="Leaver", joining_date=date(2015, 1, 1), is_active=True)
    db.add(emp)
    await db.flush()
    db.add(PayrollEmployeeStructureAssignment(tenant_id=tenant.id, employee_id=emp.id, structure_id=st.id, effective_from=date(2015, 1, 1), base_salary=Decimal("9000")))
    el = (await db.execute(select(LeaveType).where(LeaveType.tenant_id == tenant.id, LeaveType.code == "BD-EL"))).scalar_one()
    db.add(LeaveBalance(tenant_id=tenant.id, employee_id=emp.id, leave_type_id=el.id, balance_year=2026, allocated_days=Decimal("10"), closing_balance_days=Decimal("10")))
    db.add(EmployeeAdvance(tenant_id=tenant.id, employee_id=emp.id, advance_date=date(2026, 8, 1), amount="2000", monthly_deduction="500", total_recovered="0", outstanding="2000", status="ACTIVE"))
    rule = HrAllowanceRule(tenant_id=tenant.id, code="TIFFIN", name="Tiffin", bill_type="TIFFIN", eligibility_basis="PRESENT", amount=Decimal("50"), effective_from=date(2026, 1, 1), status="APPROVED")
    db.add(rule)
    await db.flush()
    extra = HrAllowanceEntry(tenant_id=tenant.id, employee_id=emp.id, work_date=date(2026, 10, 15), rule_id=rule.id, amount=Decimal("50"), status="APPROVED")
    db.add(extra)
    if with_payroll_overlap:
        period = PayrollPeriod(tenant_id=tenant.id, period_code="2026-10", start_date=date(2026, 10, 1), end_date=date(2026, 10, 31), payment_date=date(2026, 11, 5))
        db.add(period)
        await db.flush()
        run = PayrollRun(tenant_id=tenant.id, period_id=period.id, run_code="OCT", run_date=date(2026, 10, 31), status="DRAFT")
        db.add(run)
        await db.flush()
        db.add(PayrollRunLine(tenant_id=tenant.id, run_id=run.id, employee_id=emp.id, gross_pay=1, deductions=0, net_pay=1))
    await db.commit()
    return tenant, user, role, emp, accts, extra


async def _separation(c, emp):
    r = await c.post(f"{HR}/separations", json={
        "employee_id": emp.id, "separation_type": "RESIGNATION", "request_date": "2026-09-01",
        "last_working_date": "2026-10-31", "effective_date": "2026-10-31", "notice_days_served": 60,
    })
    assert r.status_code == 201, r.text
    sep = r.json()
    assert sep["notice_days_required"] == 60
    assert (await c.post(f"{HR}/separations/{sep['id']}/approve")).status_code == 200
    return sep


@pytest.mark.asyncio
async def test_settlement_amounts_clearance_post_once_paid_and_reverse(db_session_integration):
    db = db_session_integration
    tenant, user, _role, emp, accts, extra = await _seed(db)
    async with api_client(db, tenant, user) as c:
        sep = await _separation(c, emp)
        item = (await c.post(f"{HR}/separations/{sep['id']}/clearance", json={"department": "Store", "item": "Scissors", "amount_recoverable": "500"})).json()
        fs = (await c.post(f"{HR}/separations/{sep['id']}/settlement")).json()
        assert Decimal(fs["salary_amount"]) == Decimal("15950.00")  # full October at gross 15,950
        assert Decimal(fs["allowances_amount"]) == Decimal("50.00")
        assert Decimal(fs["leave_encashment_amount"]) == Decimal("6134.60")  # 10 x 15,950 / 26
        assert Decimal(fs["service_benefit_amount"]) == Decimal("99000.00")  # s.27(4): 30 days x 11 years x 300
        assert Decimal(fs["advance_recovery_amount"]) == Decimal("2000.00") and Decimal(fs["other_deductions_amount"]) == Decimal("500.00")
        assert Decimal(fs["gross_amount"]) == Decimal("121134.60") and Decimal(fs["net_amount"]) == Decimal("118634.60")
        assert fs["calculation_trace"]["final_dues_due_by"]
        await db.refresh(extra)
        assert extra.final_settlement_id == fs["id"] and extra.payroll_run_line_id is None
        assert (await c.post(f"{HR}/final-settlements/{fs['id']}/approve")).status_code == 409  # clearance pending
        await c.post(f"{HR}/clearance-items/{item['id']}/sign-off", json={"status": "CLEARED"})
        assert (await c.post(f"{HR}/final-settlements/{fs['id']}/post")).status_code == 409  # not approved
        assert (await c.post(f"{HR}/final-settlements/{fs['id']}/approve")).status_code == 200
        assert (await c.post(f"{HR}/separations/{sep['id']}/settlement")).status_code == 409  # frozen after approval
        p1 = (await c.post(f"{HR}/final-settlements/{fs['id']}/post")).json()
        p2 = (await c.post(f"{HR}/final-settlements/{fs['id']}/post")).json()
        assert p1["voucher_id"] and p1["voucher_id"] == p2["voucher_id"]
        lines = (await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == p1["voucher_id"]))).scalars().all()
        debit = sum(Decimal(str(x.amount)) for x in lines if x.entry_type == "DEBIT")
        credit = sum(Decimal(str(x.amount)) for x in lines if x.entry_type == "CREDIT")
        assert debit == credit == Decimal("120634.60")
        adv = (await db.execute(select(EmployeeAdvance).where(EmployeeAdvance.employee_id == emp.id))).scalar_one()
        await db.refresh(adv)
        assert adv.outstanding == "0.00" and adv.status == "CLOSED"
        paid = await c.post(f"{HR}/final-settlements/{fs['id']}/mark-paid", json={"payment_reference": "BANK-77"})
        assert paid.json()["status"] == "PAID"
        await db.refresh(emp)
        assert emp.is_active is False and emp.exit_date == date(2026, 10, 31)
        rev = await c.post(f"{HR}/final-settlements/{fs['id']}/reverse", json={"reason": "Wrong service date"})
        assert rev.status_code == 200, rev.text
        assert rev.json()["status"] == "REVERSED" and rev.json()["reversal_voucher_id"]
    src = await db.get(Voucher, p1["voucher_id"])
    await db.refresh(src)
    assert src.status == "REVERSED"
    # The HR side is undone with the voucher: the advance is owed again and the bill can be paid again.
    await db.refresh(adv)
    assert Decimal(adv.outstanding) == Decimal("2000.00") and Decimal(adv.total_recovered) == 0 and adv.status == "ACTIVE"
    await db.refresh(extra)
    assert extra.final_settlement_id is None and extra.status == "APPROVED"


@pytest.mark.asyncio
async def test_extras_after_last_working_day_are_not_claimed(db_session_integration):
    db = db_session_integration
    tenant, user, _role, emp, _a, extra = await _seed(db)
    later = HrAllowanceEntry(tenant_id=tenant.id, employee_id=emp.id, work_date=date(2026, 11, 3), rule_id=extra.rule_id,
                             amount=Decimal("70"), status="APPROVED")
    db.add(later)
    await db.commit()
    async with api_client(db, tenant, user) as c:
        sep = await _separation(c, emp)
        fs = (await c.post(f"{HR}/separations/{sep['id']}/settlement")).json()
    assert Decimal(fs["allowances_amount"]) == Decimal("50.00")
    await db.refresh(later)
    await db.refresh(extra)
    assert later.final_settlement_id is None and extra.final_settlement_id == fs["id"]


@pytest.mark.asyncio
async def test_salary_on_payroll_is_not_paid_again_and_deemed_resignation_only_via_case(db_session_integration):
    db = db_session_integration
    tenant, user, _role, emp, _a, _e = await _seed(db, with_payroll_overlap=True)
    async with api_client(db, tenant, user) as c:
        bad = await c.post(f"{HR}/separations", json={"employee_id": emp.id, "separation_type": "DEEMED_RESIGNATION", "request_date": "2026-10-01", "last_working_date": "2026-10-01", "effective_date": "2026-10-01"})
        assert bad.status_code == 400
        sep = await _separation(c, emp)
        fs = (await c.post(f"{HR}/separations/{sep['id']}/settlement")).json()
        assert Decimal(fs["salary_amount"]) == 0 and fs["salary_from"] is None
        assert any("already in a payroll run" in w for w in fs["calculation_trace"]["warnings"])
        assert Decimal(fs["service_benefit_amount"]) == Decimal("99000.00")


@pytest.mark.asyncio
async def test_permissions_and_tenancy(db_session_integration):
    db = db_session_integration
    tenant, user, role, emp, _a, _e = await _seed(db)
    async with api_client(db, tenant, user) as c:
        sep = await _separation(c, emp)
    other, other_user, other_role = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    other_role.name = "manager"
    await db.commit()
    async with api_client(db, other, other_user) as c:
        assert (await c.post(f"{HR}/separations/{sep['id']}/settlement")).status_code == 404
        assert (await c.post(f"{HR}/separations", json={"employee_id": emp.id, "separation_type": "RESIGNATION", "request_date": "2026-09-01", "last_working_date": "2026-10-31", "effective_date": "2026-10-31"})).status_code == 404
    role.name = "clerk"
    await db.commit()
    async with api_client(db, tenant, user) as c:
        assert (await c.get(f"{HR}/separations")).status_code == 403


@pytest.mark.asyncio
async def test_concurrent_post_creates_one_voucher(real_db):  # noqa: F811
    factory, register = real_db
    async with factory() as s:
        tenant, user, _role, emp, _a, _e = await _seed(s)
        tenant_id, user_id = tenant.id, user.id
        async with api_client(s, tenant, user) as c:
            sep = await _separation(c, emp)
            fs = (await c.post(f"{HR}/separations/{sep['id']}/settlement")).json()
            assert (await c.post(f"{HR}/final-settlements/{fs['id']}/approve")).status_code == 200
    register(tenant_id)

    async def attempt():
        async with factory() as s:
            t, u = await s.get(Tenant, tenant_id), await s.get(User, user_id)
            try:
                return (await post_settlement(fs["id"], tenant=t, user=u, db=s))["voucher_id"]
            except HTTPException as exc:
                return exc.status_code

    results = await asyncio.gather(attempt(), attempt())
    assert results[0] == results[1] and isinstance(results[0], int)
    async with factory() as s:
        n = (await s.execute(select(func.count()).select_from(Voucher).where(Voucher.tenant_id == tenant_id, Voucher.source_module == "HR_SETTLEMENT"))).scalar_one()
        assert n == 1
