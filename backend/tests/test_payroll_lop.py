"""Payroll loss of pay (flag payroll_lop_enabled, default ON for runs not yet auto-calculated).

Run: docker compose exec backend pytest tests/test_payroll_lop.py -q

Period used everywhere: 2026-09-01 .. 2026-09-30 (30 days, Fridays are the weekend).
Salary: one FIXED basic of 30,000 = 1,000 per calendar day.
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest

from app.common.tenant_feature_keys import is_payroll_lop_enabled
from app.models import Tenant, User
from app.models.hr import Employee
from app.models.hr_attendance import AttendanceEntry
from app.models.hr_leave import LeaveRequest, LeaveType
from app.models.hr_payroll import (
    PayrollCalculationSnapshot,
    PayrollComponent,
    PayrollEmployeeStructureAssignment,
    PayrollPeriod,
    PayrollRun,
    PayrollRunLine,
    PayrollStructure,
    PayrollStructureLine,
)
from app.models.tenant import TenantType
from app.models.user import Role
from app.modules.hr_payroll import service as payroll_service

START = date(2026, 9, 1)
END = date(2026, 9, 30)


async def _seed(db, *, flags: dict | None = None):
    slug = uuid.uuid4().hex[:8]
    tenant = Tenant(
        name=f"Lop {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"lop{slug}"[:18],
        feature_flags={"payroll_auto_calculate_enabled": True, **(flags or {})},
    )
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id, role_id=role.id, username=f"lop{slug}", email=f"lop{slug}@e.com",
        password_hash="x", is_active=True,
    )
    db.add(user)
    basic = PayrollComponent(
        tenant_id=tenant.id, code=f"B{slug}"[:16], name="Basic", component_type="EARNING",
        calculation_type="FIXED", default_amount=Decimal("0"), is_active=True,
    )
    structure = PayrollStructure(tenant_id=tenant.id, code=f"S{slug}"[:12], name="Monthly", is_active=True)
    db.add_all([basic, structure])
    await db.flush()
    db.add(
        PayrollStructureLine(
            tenant_id=tenant.id, structure_id=structure.id, component_id=basic.id, amount=Decimal("30000"), sort_order=0
        )
    )
    period = PayrollPeriod(
        tenant_id=tenant.id, period_code=f"P{slug}"[:12], start_date=START, end_date=END,
        payment_date=END, status="OPEN", is_locked=False,
    )
    db.add(period)
    await db.flush()
    run = PayrollRun(tenant_id=tenant.id, period_id=period.id, status="DRAFT", run_code=f"R{slug}"[:16], run_date=END)
    db.add(run)
    await db.flush()
    return tenant, user, structure, run


async def _employee(db, tenant, structure, *, is_active=True, joining=None, exit_date=None, assign_to=None):
    emp = Employee(
        tenant_id=tenant.id, employee_code=f"E{uuid.uuid4().hex[:8]}", first_name="Worker",
        is_active=is_active, joining_date=joining, exit_date=exit_date,
    )
    db.add(emp)
    await db.flush()
    db.add(
        PayrollEmployeeStructureAssignment(
            tenant_id=tenant.id, employee_id=emp.id, structure_id=structure.id,
            effective_from=date(2026, 1, 1), effective_to=assign_to, base_salary=Decimal("30000"),
        )
    )
    await db.flush()
    return emp


async def _leave(db, tenant, user, emp, *, paid: bool, start: date, end: date):
    ltype = LeaveType(
        tenant_id=tenant.id, code=f"L{uuid.uuid4().hex[:6]}", name="Paid" if paid else "Unpaid",
        is_paid=paid, is_active=True,
    )
    db.add(ltype)
    await db.flush()
    db.add(
        LeaveRequest(
            tenant_id=tenant.id, employee_id=emp.id, leave_type_id=ltype.id, from_date=start, to_date=end,
            days_requested=Decimal("1"), status="APPROVED", requested_by=user.id,
        )
    )
    await db.flush()


def _absent(tenant, emp, day: date) -> AttendanceEntry:
    return AttendanceEntry(tenant_id=tenant.id, employee_id=emp.id, attendance_date=day, status="ABSENT")


async def _row(db, tenant, run, emp):
    preview = await payroll_service.preview_auto_calculate(db, tenant=tenant, run_id=run.id)
    return preview, next((e for e in preview.employees if e.employee_id == emp.id), None)


def test_flag_helper_defaults_on():
    assert is_payroll_lop_enabled(None) is True
    assert is_payroll_lop_enabled({}) is True
    assert is_payroll_lop_enabled({"payroll_lop_enabled": True}) is True
    assert is_payroll_lop_enabled({"payroll_lop_enabled": False}) is False


@pytest.mark.asyncio
async def test_full_month_without_absence_is_unchanged(db_session_integration):
    db = db_session_integration
    tenant, _user, structure, run = await _seed(db)
    emp = await _employee(db, tenant, structure)
    preview, row = await _row(db, tenant, run, emp)
    assert preview.lop_applied is True
    assert row.lop_applied is True
    assert Decimal(row.gross_pay) == Decimal("30000")
    assert Decimal(row.payable_days) == Decimal("30")
    assert Decimal(row.lop_days) == 0
    assert Decimal(row.lop_amount) == 0


@pytest.mark.asyncio
async def test_unpaid_absence_and_unpaid_leave_reduce_pay(db_session_integration):
    db = db_session_integration
    tenant, user, structure, run = await _seed(db)
    emp = await _employee(db, tenant, structure)
    # 2 unpaid absences (Tue, Wed).
    db.add_all([_absent(tenant, emp, date(2026, 9, 8)), _absent(tenant, emp, date(2026, 9, 9))])
    # Unpaid leave Mon 14 .. Sat 19: Friday 18 is the weekend, so 5 days.
    await _leave(db, tenant, user, emp, paid=False, start=date(2026, 9, 14), end=date(2026, 9, 19))
    # Absent on a paid-leave day: covered by the leave, not loss of pay.
    await _leave(db, tenant, user, emp, paid=True, start=date(2026, 9, 22), end=date(2026, 9, 22))
    db.add(_absent(tenant, emp, date(2026, 9, 22)))
    await db.flush()

    _preview, row = await _row(db, tenant, run, emp)
    assert Decimal(row.lop_absent_days) == Decimal("2")
    assert Decimal(row.lop_unpaid_leave_days) == Decimal("5")
    assert Decimal(row.lop_days) == Decimal("7")
    assert Decimal(row.payable_days) == Decimal("23")
    assert Decimal(row.gross_pay) == Decimal("23000")
    assert Decimal(row.lop_amount) == Decimal("7000")
    assert Decimal(row.net_pay) == Decimal("23000")
    assert any("Loss of pay" in w for w in row.warnings)


@pytest.mark.asyncio
async def test_mid_period_leaver_and_joiner_are_prorated(db_session_integration):
    db = db_session_integration
    tenant, _user, structure, run = await _seed(db)
    # Left on 10 Sep (inactive now); assignment ended on the exit date.
    leaver = await _employee(
        db, tenant, structure, is_active=False, exit_date=date(2026, 9, 10), assign_to=date(2026, 9, 10)
    )
    joiner = await _employee(db, tenant, structure, joining=date(2026, 9, 21))
    left_in_august = await _employee(db, tenant, structure, is_active=False, exit_date=date(2026, 8, 31))

    preview, leaver_row = await _row(db, tenant, run, leaver)
    assert leaver_row is not None and not leaver_row.skipped
    assert Decimal(leaver_row.employed_days) == Decimal("10")
    assert Decimal(leaver_row.gross_pay) == Decimal("10000")
    joiner_row = next(e for e in preview.employees if e.employee_id == joiner.id)
    assert Decimal(joiner_row.gross_pay) == Decimal("10000")
    assert Decimal(joiner_row.lop_amount) == Decimal("20000")
    assert all(e.employee_id != left_in_august.id for e in preview.employees)

    result = await payroll_service.apply_auto_calculate(db, tenant=tenant, run_id=run.id, created_by=None)
    assert result["applied"] == 2
    assert Decimal(result["gross_total"]) == Decimal("20000")


@pytest.mark.asyncio
async def test_flag_false_keeps_old_behaviour(db_session_integration):
    db = db_session_integration
    tenant, _user, structure, run = await _seed(db, flags={"payroll_lop_enabled": False})
    emp = await _employee(db, tenant, structure)
    leaver = await _employee(db, tenant, structure, is_active=False, exit_date=date(2026, 9, 10))
    db.add_all([_absent(tenant, emp, date(2026, 9, 8)), _absent(tenant, emp, date(2026, 9, 9))])
    await db.flush()

    preview, row = await _row(db, tenant, run, emp)
    assert preview.lop_applied is False
    assert row.lop_applied is False
    assert Decimal(row.gross_pay) == Decimal("30000")
    assert Decimal(row.absent_days) == Decimal("2")
    assert all(e.employee_id != leaver.id for e in preview.employees)


@pytest.mark.asyncio
async def test_run_calculated_before_lop_keeps_its_numbers(db_session_integration):
    db = db_session_integration
    tenant, _user, structure, run = await _seed(db)
    emp = await _employee(db, tenant, structure)
    # This run was auto-calculated by the old code: its snapshot trace has no "lop_applied" key.
    line = PayrollRunLine(
        tenant_id=tenant.id, run_id=run.id, employee_id=emp.id, structure_id=structure.id,
        gross_pay=Decimal("30000"), deductions=Decimal("0"), net_pay=Decimal("30000"), calculation_source="AUTO",
    )
    db.add(line)
    await db.flush()
    db.add(
        PayrollCalculationSnapshot(
            tenant_id=tenant.id, payroll_run_line_id=line.id, trace_json={"as_of": END.isoformat()}
        )
    )
    db.add_all([_absent(tenant, emp, date(2026, 9, 8)), _absent(tenant, emp, date(2026, 9, 9))])
    await db.flush()

    preview, row = await _row(db, tenant, run, emp)
    assert preview.lop_applied is False
    assert Decimal(row.gross_pay) == Decimal("30000")
    assert any("before loss of pay" in w for w in preview.warnings)

    await payroll_service.apply_auto_calculate(db, tenant=tenant, run_id=run.id, created_by=None)
    await db.refresh(line)
    assert Decimal(str(line.gross_pay)) == Decimal("30000")


@pytest.mark.asyncio
async def test_new_run_mode_sticks_after_first_apply(db_session_integration):
    db = db_session_integration
    tenant, _user, structure, run = await _seed(db)
    emp = await _employee(db, tenant, structure)
    db.add(_absent(tenant, emp, date(2026, 9, 8)))
    await db.flush()

    first = await payroll_service.apply_auto_calculate(db, tenant=tenant, run_id=run.id, created_by=None)
    assert Decimal(first["gross_total"]) == Decimal("29000")
    again = await payroll_service.apply_auto_calculate(db, tenant=tenant, run_id=run.id, created_by=None)
    assert Decimal(again["gross_total"]) == Decimal("29000")
