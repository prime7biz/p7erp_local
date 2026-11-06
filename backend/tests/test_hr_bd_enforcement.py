"""Phase C Bangladesh workflows: strict flags, wage grades, maternity, accrual, festival work, benefits,
and the payroll hook (minimum-wage block + festival compensation paid through exactly one run line).

Run: docker compose exec backend pytest tests/test_hr_bd_enforcement.py -q
"""

from __future__ import annotations

from datetime import date, time, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models.hr import Employee
from app.models.hr_attendance import AttendanceEntry, AttendanceHoliday
from app.models.hr_bd import HrBdFestivalWorkEntry, HrBdLeaveAccrualEntry, HrBdWageScheduleRate
from app.models.hr_leave import LeaveBalance
from app.models.hr_payroll import PayrollPeriod, PayrollRun, PayrollRunLine, PayrollStructure
from app.modules.hr_localization.enforcement_flags import (
    HR_BD_FESTIVAL_COMPENSATION_ENABLED,
    HR_BD_LEAVE_ACCRUAL_ENFORCEMENT_ENABLED,
    HR_BD_MATERNITY_ENFORCEMENT_ENABLED,
    HR_BD_MINIMUM_WAGE_ENFORCEMENT_ENABLED,
    HR_BD_SERVICE_BENEFITS_ENABLED,
)
from tests.bd_hr_fixtures import api_client
from tests.merch_fixtures import create_merch_tenant_with_user

URL = "/api/v1/hr/localization/bd-rmg"
PAY = "/api/v1/hr/payroll"


async def _setup(db, *, flags=(), role_name="manager"):
    tenant, user, role = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    role.name = "manager"
    await db.commit()
    async with api_client(db, tenant, user) as c:
        assert (await c.post(f"{URL}/apply")).status_code == 200
        rs_id = (await c.post(f"{URL}/rules/seed-official")).json()["rule_set"]["id"]
        assert (await c.post(f"{URL}/rules/{rs_id}/approve")).status_code == 200
        if flags:
            r = await c.put(f"{URL}/enforcement", json={"flags": {f: True for f in flags}})
            assert r.status_code == 200, r.text
    role.name = role_name
    await db.commit()
    await db.refresh(tenant)
    return tenant, user, role


async def _employee(db, tenant, code="E1", gender="female", joined=date(2018, 1, 1)):
    emp = Employee(tenant_id=tenant.id, employee_code=code, first_name=code, gender=gender, joining_date=joined, is_active=True)
    db.add(emp)
    await db.commit()
    return emp


async def _rate(db, tenant, code):
    return (
        await db.execute(
            select(HrBdWageScheduleRate).where(HrBdWageScheduleRate.tenant_id == tenant.id, HrBdWageScheduleRate.rate_code == code)
        )
    ).scalar_one()


async def _structure(db, tenant, code="BD-W-G4"):
    return (
        await db.execute(select(PayrollStructure).where(PayrollStructure.tenant_id == tenant.id, PayrollStructure.code == code))
    ).scalar_one()


@pytest.mark.asyncio
async def test_mutations_refused_while_flags_off(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await _setup(db)
    emp = await _employee(db, tenant)
    async with api_client(db, tenant, user) as c:
        r = await c.post(f"{URL}/maternity-cases", json={"employee_id": emp.id, "expected_delivery_date": "2027-01-15", "surviving_children": 0})
        assert r.status_code == 409
        r = await c.post(f"{URL}/leave-accrual/apply", json={"period_start": "2026-01-01", "period_end": "2026-06-30"})
        assert r.status_code == 409
        r = await c.post(f"{URL}/service-benefits", json={"employee_id": emp.id, "benefit_type": "RESIGNATION", "service_end_date": "2026-06-30"})
        assert r.status_code == 409
        r = await c.post(f"{URL}/festival-work/generate", json={"from_date": "2026-01-01", "to_date": "2026-06-30"})
        assert r.status_code == 409


@pytest.mark.asyncio
async def test_wage_grade_and_minimum_wage_enforcement(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await _setup(db, flags=(HR_BD_MINIMUM_WAGE_ENFORCEMENT_ENABLED,))
    emp = await _employee(db, tenant)
    rate = await _rate(db, tenant, "W-G4")
    st = await _structure(db, tenant)
    async with api_client(db, tenant, user) as c:
        r = await c.post(f"{URL}/wage-assignments", json={"employee_id": emp.id, "wage_rate_id": rate.id, "effective_from": "2024-01-01"})
        assert r.status_code == 201, r.text
        dup = await c.post(f"{URL}/wage-assignments", json={"employee_id": emp.id, "wage_rate_id": rate.id, "effective_from": "2025-01-01"})
        assert dup.status_code == 409
        low = await c.post(f"{PAY}/assignments", json={"employee_id": emp.id, "structure_id": st.id, "effective_from": "2024-01-01", "base_salary": "6000"})
        assert low.status_code == 400 and "minimum" in low.text
        ok = await c.post(f"{PAY}/assignments", json={"employee_id": emp.id, "structure_id": st.id, "effective_from": "2024-01-01", "base_salary": "6700"})
        assert ok.status_code == 201, ok.text

    other, other_user, _ = await _setup(db)
    async with api_client(db, other, other_user) as c:
        r = await c.post(f"{URL}/wage-assignments", json={"employee_id": emp.id, "wage_rate_id": rate.id, "effective_from": "2024-01-01"})
        assert r.status_code == 404  # another tenant's employee / rate looks missing


@pytest.mark.asyncio
async def test_minimum_wage_not_enforced_when_flag_off(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await _setup(db)
    emp = await _employee(db, tenant)
    rate = await _rate(db, tenant, "W-G4")
    st = await _structure(db, tenant)
    async with api_client(db, tenant, user) as c:
        await c.post(f"{URL}/wage-assignments", json={"employee_id": emp.id, "wage_rate_id": rate.id, "effective_from": "2024-01-01"})
        r = await c.post(f"{PAY}/assignments", json={"employee_id": emp.id, "structure_id": st.id, "effective_from": "2024-01-01", "base_salary": "6000"})
        assert r.status_code == 201


@pytest.mark.asyncio
async def test_maternity_case_lifecycle_and_permissions(db_session_integration):
    db = db_session_integration
    tenant, user, role = await _setup(db, flags=(HR_BD_MATERNITY_ENFORCEMENT_ENABLED,))
    emp = await _employee(db, tenant)
    man = await _employee(db, tenant, code="M1", gender="male")
    st = await _structure(db, tenant)
    async with api_client(db, tenant, user) as c:
        await c.post(f"{PAY}/assignments", json={"employee_id": emp.id, "structure_id": st.id, "effective_from": "2024-01-01", "base_salary": "6700"})
        bad = await c.post(f"{URL}/maternity-cases", json={"employee_id": man.id, "expected_delivery_date": "2027-01-15", "surviving_children": 0})
        assert bad.status_code == 400
        r = await c.post(f"{URL}/maternity-cases", json={"employee_id": emp.id, "expected_delivery_date": "2027-01-15", "surviving_children": 0})
        assert r.status_code == 201, r.text
        case = r.json()
        assert case["status"] == "ELIGIBLE" and case["leave_start"] == "2026-11-16" and case["leave_end"] == "2027-03-15"
        assert Decimal(case["benefit_amount"]) == Decimal("57692.40")
        again = await c.post(f"{URL}/maternity-cases", json={"employee_id": emp.id, "expected_delivery_date": "2027-02-01", "surviving_children": 0})
        assert again.status_code == 409
        assert (await c.post(f"{URL}/maternity-cases/{case['id']}/mark-paid", json={"payment_reference": "X"})).status_code == 409
        assert (await c.post(f"{URL}/maternity-cases/{case['id']}/approve")).status_code == 200
        paid = await c.post(f"{URL}/maternity-cases/{case['id']}/mark-paid", json={"payment_reference": "BKASH-123"})
        assert paid.status_code == 200 and paid.json()["status"] == "PAID"
        assert (await c.post(f"{URL}/maternity-cases/{case['id']}/cancel")).status_code == 409
    role.name = "clerk"
    await db.commit()
    async with api_client(db, tenant, user) as c:
        assert (await c.get(f"{URL}/maternity-cases")).status_code == 403


@pytest.mark.asyncio
async def test_earned_leave_accrual_is_idempotent_and_capped(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await _setup(db, flags=(HR_BD_LEAVE_ACCRUAL_ENFORCEMENT_ENABLED,))
    emp = await _employee(db, tenant, joined=date(2024, 1, 1))
    day = date(2025, 7, 1)
    for i in range(300):
        d = day + timedelta(days=i)
        db.add(AttendanceEntry(tenant_id=tenant.id, employee_id=emp.id, attendance_date=d, in_time=time(8), out_time=time(17), status="PRESENT", source="MANUAL"))
    await db.commit()
    body = {"period_start": "2025-07-01", "period_end": "2026-04-26"}
    async with api_client(db, tenant, user) as c:
        prev = (await c.post(f"{URL}/leave-accrual/preview", json=body)).json()
        row = next(e for e in prev["employees"] if e["employee_id"] == emp.id)
        assert row["worked_days"] == 300 and row["accrued_days"] == "16"
        r = await c.post(f"{URL}/leave-accrual/apply", json=body)
        assert r.status_code == 200 and r.json()["applied"] >= 1
        r2 = await c.post(f"{URL}/leave-accrual/apply", json=body)
        assert r2.json()["applied"] == 0
    entries = (await db.execute(select(HrBdLeaveAccrualEntry).where(HrBdLeaveAccrualEntry.employee_id == emp.id))).scalars().all()
    assert len(entries) == 1 and entries[0].accrued_days == Decimal("16")
    bal = (await db.execute(select(LeaveBalance).where(LeaveBalance.employee_id == emp.id))).scalar_one()
    assert bal.closing_balance_days == Decimal("16")


@pytest.mark.asyncio
async def test_service_benefit_case_duplicate_and_approval(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await _setup(db, flags=(HR_BD_SERVICE_BENEFITS_ENABLED,))
    emp = await _employee(db, tenant, joined=date(2015, 1, 1))
    st = await _structure(db, tenant, "BD-W-G2")
    body = {"employee_id": emp.id, "benefit_type": "RESIGNATION", "service_end_date": "2026-06-30"}
    async with api_client(db, tenant, user) as c:
        await c.post(f"{PAY}/assignments", json={"employee_id": emp.id, "structure_id": st.id, "effective_from": "2015-01-01", "base_salary": "9000"})
        r = await c.post(f"{URL}/service-benefits", json=body)
        assert r.status_code == 201, r.text
        assert r.json()["calculation_trace"]["trace"]["days_per_year"] == 30
        assert Decimal(r.json()["amount"]) == Decimal("300.00") * 30 * 11
        assert (await c.post(f"{URL}/service-benefits", json=body)).status_code == 409
        assert (await c.post(f"{URL}/service-benefits/{r.json()['id']}/approve")).json()["status"] == "APPROVED"


@pytest.mark.asyncio
async def test_festival_work_paid_once_through_payroll(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await _setup(db, flags=(HR_BD_FESTIVAL_COMPENSATION_ENABLED,))
    tenant.feature_flags = {**tenant.feature_flags, "payroll_auto_calculate_enabled": True}
    emp = await _employee(db, tenant)
    st = await _structure(db, tenant)
    holiday = AttendanceHoliday(tenant_id=tenant.id, holiday_date=date(2026, 6, 16), name="Eid-ul-Adha", is_optional=False)
    db.add(holiday)
    db.add(AttendanceEntry(tenant_id=tenant.id, employee_id=emp.id, attendance_date=date(2026, 6, 16), in_time=time(8), out_time=time(17), status="PRESENT", source="MANUAL"))
    await db.commit()
    async with api_client(db, tenant, user) as c:
        await c.post(f"{PAY}/assignments", json={"employee_id": emp.id, "structure_id": st.id, "effective_from": "2024-01-01", "base_salary": "6700"})
        gen = await c.post(f"{URL}/festival-work/generate", json={"from_date": "2026-06-01", "to_date": "2026-06-30"})
        assert gen.status_code == 200 and gen.json()["created"] == 1
        assert (await c.post(f"{URL}/festival-work/generate", json={"from_date": "2026-06-01", "to_date": "2026-06-30"})).json()["created"] == 0
        entry = (await c.get(f"{URL}/festival-work")).json()[0]
        assert Decimal(entry["compensation_amount"]) == Decimal("961.54")  # 12,500 / 26 x 2
        bad = await c.post(f"{URL}/festival-work/{entry['id']}/approve", json={"alternative_holiday_date": "2026-06-10"})
        assert bad.status_code == 400
        ok = await c.post(f"{URL}/festival-work/{entry['id']}/approve", json={"alternative_holiday_date": "2026-06-20"})
        assert ok.status_code == 200

        period = (await c.post(f"{PAY}/periods", json={"period_code": "2026-06", "start_date": "2026-06-01", "end_date": "2026-06-30", "payment_date": "2026-07-05"})).json()
        run = (await c.post(f"{PAY}/runs", json={"period_id": period["id"], "run_date": "2026-06-30"})).json()
        applied = await c.post(f"{PAY}/runs/{run['id']}/auto-calculate/apply", json={})
        assert applied.status_code == 200, applied.text
        line = (await c.get(f"{PAY}/runs/{run['id']}/lines")).json()[0]
        assert Decimal(line["gross_pay"]) == Decimal("12500") + Decimal("961.54")
        # Recalculating the same run keeps exactly one owner.
        assert (await c.post(f"{PAY}/runs/{run['id']}/auto-calculate/apply", json={"force": True})).status_code == 200
    row = (await db.execute(select(HrBdFestivalWorkEntry).where(HrBdFestivalWorkEntry.id == entry["id"]))).scalar_one()
    await db.refresh(row)
    assert row.payroll_run_line_id == line["id"] and row.final_settlement_id is None

    # A second run in the same period cannot take the same compensation again.
    run2 = PayrollRun(tenant_id=tenant.id, period_id=period["id"], run_code="PRUN-B", run_date=date(2026, 6, 30), status="DRAFT")
    db.add(run2)
    await db.commit()
    from app.modules.hr_localization.payroll_extras import collect_extras

    extras = await collect_extras(db, tenant=tenant, employee_id=emp.id, start=date(2026, 6, 1), end=date(2026, 6, 30), run_line_id=None)
    assert extras.total == 0
    # After the first run is rejected the row becomes payable again.
    first = await db.get(PayrollRun, run["id"])
    first.status = "REJECTED"
    await db.commit()
    extras = await collect_extras(db, tenant=tenant, employee_id=emp.id, start=date(2026, 6, 1), end=date(2026, 6, 30), run_line_id=None)
    assert extras.total == Decimal("961.54")


@pytest.mark.asyncio
async def test_payroll_apply_blocked_below_minimum_when_enforced(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await _setup(db)
    tenant.feature_flags = {**tenant.feature_flags, "payroll_auto_calculate_enabled": True}
    emp = await _employee(db, tenant)
    st = await _structure(db, tenant)
    await db.commit()
    async with api_client(db, tenant, user) as c:
        await c.post(f"{PAY}/assignments", json={"employee_id": emp.id, "structure_id": st.id, "effective_from": "2024-01-01", "base_salary": "6000"})
        period = (await c.post(f"{PAY}/periods", json={"period_code": "2026-05", "start_date": "2026-05-01", "end_date": "2026-05-31", "payment_date": "2026-06-05"})).json()
        run = (await c.post(f"{PAY}/runs", json={"period_id": period["id"], "run_date": "2026-05-31"})).json()
        tenant.feature_flags = {**tenant.feature_flags, HR_BD_MINIMUM_WAGE_ENFORCEMENT_ENABLED: True}
        await db.commit()
        r = await c.post(f"{PAY}/runs/{run['id']}/auto-calculate/apply", json={})
        assert r.status_code == 409 and "minimum wage" in r.text
    lines = (await db.execute(select(PayrollRunLine).where(PayrollRunLine.run_id == run["id"]))).scalars().all()
    assert lines == []
