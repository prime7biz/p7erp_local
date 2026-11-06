"""Overtime priced from salary (flag payroll_ot_from_salary_enabled, default OFF).

Run: docker exec <backend> pytest tests/test_payroll_ot_from_salary.py -q

Period: 2026-09-01 .. 2026-09-30. Base salary 20,800 -> hourly rate 20,800 / 208 = 100.
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest

from app.common.tenant_feature_keys import (
    get_hr_ot_hours_per_month,
    get_hr_ot_multiplier,
    is_payroll_ot_from_salary_enabled,
)
from app.models import Tenant, User
from app.models.hr import Employee
from app.models.hr_attendance import AttendanceEntry, OvertimeEntry, OvertimeRule
from app.models.hr_payroll import (
    PayrollComponent,
    PayrollEmployeeStructureAssignment,
    PayrollPeriod,
    PayrollRun,
    PayrollStructure,
    PayrollStructureLine,
)
from app.models.tenant import TenantType
from app.models.user import Role
from app.modules.hr_payroll import service as payroll_service

START = date(2026, 9, 1)
END = date(2026, 9, 30)
FLAG_ON = {"payroll_ot_from_salary_enabled": True}


async def _seed(db, *, flags: dict | None = None, per_hour_ot_rate: str | None = None):
    slug = uuid.uuid4().hex[:8]
    tenant = Tenant(
        name=f"Ot {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"ot{slug}"[:18],
        feature_flags={"payroll_auto_calculate_enabled": True, **(flags or {})},
    )
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    db.add(role)
    await db.flush()
    db.add(
        User(
            tenant_id=tenant.id, role_id=role.id, username=f"ot{slug}", email=f"ot{slug}@e.com",
            password_hash="x", is_active=True,
        )
    )
    basic = PayrollComponent(
        tenant_id=tenant.id, code=f"B{slug}"[:16], name="Basic", component_type="EARNING",
        calculation_type="FIXED", default_amount=Decimal("0"), is_active=True,
    )
    structure = PayrollStructure(tenant_id=tenant.id, code=f"S{slug}"[:12], name="Monthly", is_active=True)
    db.add_all([basic, structure])
    await db.flush()
    db.add(
        PayrollStructureLine(
            tenant_id=tenant.id, structure_id=structure.id, component_id=basic.id, amount=Decimal("20800"), sort_order=0
        )
    )
    if per_hour_ot_rate is not None:
        ot_component = PayrollComponent(
            tenant_id=tenant.id, code=f"O{slug}"[:16], name="OT per hour", component_type="EARNING",
            calculation_type="PER_HOUR_OT", default_amount=Decimal("0"), is_active=True,
        )
        db.add(ot_component)
        await db.flush()
        db.add(
            PayrollStructureLine(
                tenant_id=tenant.id, structure_id=structure.id, component_id=ot_component.id,
                amount=Decimal(per_hour_ot_rate), sort_order=1,
            )
        )
    await db.flush()
    run = await _run(db, tenant, START, END)
    return tenant, structure, run


async def _run(db, tenant, start, end):
    slug = uuid.uuid4().hex[:8]
    period = PayrollPeriod(
        tenant_id=tenant.id, period_code=f"P{slug}"[:12], start_date=start, end_date=end,
        payment_date=end, status="OPEN", is_locked=False,
    )
    db.add(period)
    await db.flush()
    run = PayrollRun(tenant_id=tenant.id, period_id=period.id, status="DRAFT", run_code=f"R{slug}"[:16], run_date=end)
    db.add(run)
    await db.flush()
    return run


async def _employee(db, tenant, structure, *, joining=None, salaries=((date(2026, 1, 1), None, "20800"),)):
    emp = Employee(
        tenant_id=tenant.id, employee_code=f"E{uuid.uuid4().hex[:8]}", first_name="Worker",
        is_active=True, joining_date=joining,
    )
    db.add(emp)
    await db.flush()
    for effective_from, effective_to, base in salaries:
        db.add(
            PayrollEmployeeStructureAssignment(
                tenant_id=tenant.id, employee_id=emp.id, structure_id=structure.id,
                effective_from=effective_from, effective_to=effective_to, base_salary=Decimal(base),
            )
        )
    await db.flush()
    return emp


def _ot(tenant, emp, day: date, hours: str, *, ot_type="WEEKDAY", rule=None, status="APPROVED") -> OvertimeEntry:
    return OvertimeEntry(
        tenant_id=tenant.id, employee_id=emp.id, work_date=day, ot_hours=Decimal(hours), ot_type=ot_type,
        rate_multiplier=Decimal("1.5"), rule_id=rule.id if rule else None, status=status,
    )


async def _row(db, tenant, run, emp):
    preview = await payroll_service.preview_auto_calculate(db, tenant=tenant, run_id=run.id)
    return preview, next(e for e in preview.employees if e.employee_id == emp.id)


def test_flag_and_setting_helpers():
    assert is_payroll_ot_from_salary_enabled(None) is False
    assert is_payroll_ot_from_salary_enabled({"payroll_ot_from_salary_enabled": "true"}) is False
    assert is_payroll_ot_from_salary_enabled(FLAG_ON) is True
    assert get_hr_ot_hours_per_month({}) == 208
    assert get_hr_ot_hours_per_month({"hr_ot_hours_per_month": -5}) == 208
    assert get_hr_ot_hours_per_month({"hr_ot_hours_per_month": "200"}) == 200
    assert get_hr_ot_multiplier({"hr_ot_multiplier": True}) == 2
    assert get_hr_ot_multiplier({"hr_ot_multiplier": 1.5}) == 1.5


@pytest.mark.asyncio
async def test_ot_priced_from_base_salary_and_default_multiplier(db_session_integration):
    db = db_session_integration
    tenant, structure, run = await _seed(db, flags=FLAG_ON)
    emp = await _employee(db, tenant, structure)
    db.add_all(
        [
            _ot(tenant, emp, date(2026, 9, 2), "6"),
            _ot(tenant, emp, date(2026, 9, 3), "4"),
            _ot(tenant, emp, date(2026, 9, 4), "9", status="PENDING"),
        ]
    )
    # Loss of pay must not reduce overtime.
    db.add(AttendanceEntry(tenant_id=tenant.id, employee_id=emp.id, attendance_date=date(2026, 9, 8), status="ABSENT"))
    await db.flush()

    preview, row = await _row(db, tenant, run, emp)
    assert preview.ot_from_salary is True and row.ot_from_salary is True
    assert Decimal(row.ot_paid_hours) == Decimal("10")
    assert Decimal(row.ot_hourly_rate) == Decimal("100")
    assert Decimal(row.ot_amount) == Decimal("2000")
    assert Decimal(row.overtime_amount) == Decimal("2000")
    ot_line = next(c for c in row.components if c.component_code == "OT_SALARY")
    assert Decimal(ot_line.amount) == Decimal("2000")
    # Basic 20,800 less one LOP day (20,800 / 30), plus the full overtime.
    basic = Decimal("20800") - Decimal("20800") / 30
    assert Decimal(row.gross_pay) == (basic + Decimal("2000")).quantize(Decimal("0.0001"))
    assert row.trace["ot_from_salary"] is True


@pytest.mark.asyncio
async def test_rule_multiplier_by_type_and_daily_cap(db_session_integration):
    db = db_session_integration
    tenant, structure, run = await _seed(db, flags={**FLAG_ON, "hr_ot_multiplier": 2})
    rule = OvertimeRule(
        tenant_id=tenant.id, code=f"R{uuid.uuid4().hex[:6]}", name="Factory", max_ot_hours_per_day="2",
        weekday_multiplier="1.5", weekend_multiplier="2", holiday_multiplier="3", is_active=True,
    )
    db.add(rule)
    await db.flush()
    emp = await _employee(db, tenant, structure)
    db.add_all(
        [
            _ot(tenant, emp, date(2026, 9, 2), "3", rule=rule),  # capped to 2h x 100 x 1.5 = 300
            _ot(tenant, emp, date(2026, 9, 3), "1", ot_type="HOLIDAY", rule=rule),  # 1h x 100 x 3 = 300
            _ot(tenant, emp, date(2026, 9, 3), "2", ot_type="HOLIDAY", rule=rule),  # cap left: 1h -> 300
            _ot(tenant, emp, date(2026, 9, 4), "1"),  # no rule: 1h x 100 x 2 = 200
        ]
    )
    await db.flush()
    _preview, row = await _row(db, tenant, run, emp)
    assert Decimal(row.ot_paid_hours) == Decimal("5")
    assert Decimal(row.ot_amount) == Decimal("1100")
    assert Decimal(row.ot_hours) == Decimal("7")
    assert any("capped at 2" in w for w in row.warnings)


@pytest.mark.asyncio
async def test_salary_change_mid_period_and_employment_dates(db_session_integration):
    db = db_session_integration
    tenant, structure, run = await _seed(db, flags=FLAG_ON)
    emp = await _employee(
        db,
        tenant,
        structure,
        salaries=(
            (date(2026, 1, 1), date(2026, 9, 15), "20800"),
            (date(2026, 9, 16), None, "41600"),
        ),
    )
    joiner = await _employee(db, tenant, structure, joining=date(2026, 9, 12))
    db.add_all(
        [
            _ot(tenant, emp, date(2026, 9, 10), "1"),  # 100 x 2 = 200
            _ot(tenant, emp, date(2026, 9, 20), "1"),  # 200 x 2 = 400
            _ot(tenant, joiner, date(2026, 9, 5), "4"),  # before joining: not paid
            _ot(tenant, joiner, date(2026, 9, 20), "1"),  # 100 x 2 = 200
        ]
    )
    await db.flush()
    preview, row = await _row(db, tenant, run, emp)
    assert Decimal(row.ot_amount) == Decimal("600")
    assert Decimal(row.ot_hourly_rate) == Decimal("200")  # salary in effect at the period end
    joiner_row = next(e for e in preview.employees if e.employee_id == joiner.id)
    assert Decimal(joiner_row.ot_paid_hours) == Decimal("1")
    assert Decimal(joiner_row.ot_amount) == Decimal("200")


@pytest.mark.asyncio
async def test_flag_off_keeps_per_hour_component_and_flag_on_zeroes_it(db_session_integration):
    db = db_session_integration
    tenant, structure, run = await _seed(db, per_hour_ot_rate="50")
    emp = await _employee(db, tenant, structure)
    db.add(_ot(tenant, emp, date(2026, 9, 2), "10"))
    await db.flush()

    preview, row = await _row(db, tenant, run, emp)
    assert preview.ot_from_salary is False and row.ot_from_salary is False
    assert Decimal(row.overtime_amount) == Decimal("500")
    assert Decimal(row.gross_pay) == Decimal("21300")
    assert all(c.component_code != "OT_SALARY" for c in row.components)
    assert Decimal(row.ot_amount) == 0

    tenant2, structure2, run2 = await _seed(db, flags=FLAG_ON, per_hour_ot_rate="50")
    emp2 = await _employee(db, tenant2, structure2)
    db.add(_ot(tenant2, emp2, date(2026, 9, 2), "10"))
    await db.flush()
    _preview2, row2 = await _row(db, tenant2, run2, emp2)
    per_hour_line = next(c for c in row2.components if c.calculation_type == "PER_HOUR_OT")
    assert Decimal(per_hour_line.amount) == 0
    assert Decimal(row2.overtime_amount) == Decimal("2000")
    assert Decimal(row2.gross_pay) == Decimal("22800")
    assert any("paid from salary" in w for w in row2.warnings)


@pytest.mark.asyncio
async def test_run_keeps_the_ot_mode_of_its_first_calculation(db_session_integration):
    db = db_session_integration
    tenant, structure, run = await _seed(db, per_hour_ot_rate="50")
    emp = await _employee(db, tenant, structure)
    db.add(_ot(tenant, emp, date(2026, 9, 2), "10"))
    await db.flush()

    first = await payroll_service.apply_auto_calculate(db, tenant=tenant, run_id=run.id, created_by=None)
    assert Decimal(first["gross_total"]) == Decimal("21300")

    tenant.feature_flags = {**tenant.feature_flags, **FLAG_ON}
    await db.flush()
    preview, row = await _row(db, tenant, run, emp)
    assert preview.ot_from_salary is False
    assert any("before overtime from salary" in w for w in preview.warnings)
    again = await payroll_service.apply_auto_calculate(db, tenant=tenant, run_id=run.id, created_by=None)
    assert Decimal(again["gross_total"]) == Decimal("21300")

    # A new run (next month) uses the flag, and keeps it on recalculation.
    october = await _run(db, tenant, date(2026, 10, 1), date(2026, 10, 31))
    db.add(_ot(tenant, emp, date(2026, 10, 5), "10"))
    await db.flush()
    applied = await payroll_service.apply_auto_calculate(db, tenant=tenant, run_id=october.id, created_by=None)
    assert Decimal(applied["gross_total"]) == Decimal("22800")
    recalculated = await payroll_service.apply_auto_calculate(db, tenant=tenant, run_id=october.id, created_by=None)
    assert Decimal(recalculated["gross_total"]) == Decimal("22800")
