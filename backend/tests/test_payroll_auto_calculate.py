"""Phase 1.4: payroll assignment + auto-calculate tests."""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.models import Tenant, User
from app.models.hr import Employee
from app.models.hr_attendance import AttendanceEntry, OvertimeEntry
from app.models.hr_leave import LeaveRequest, LeaveType
from app.models.hr_payroll import (
    PayrollCalculationSnapshot,
    PayrollComponent,
    PayrollPeriod,
    PayrollRun,
    PayrollRunLine,
    PayrollStructure,
    PayrollStructureLine,
)
from app.models.tenant import TenantType
from app.models.user import Role
from app.modules.hr_payroll import service as payroll_service
from app.modules.hr_payroll.formula_engine import assert_valid_calculation_type, calculate_component_amount


async def _seed_payroll(db, *, flag_on: bool = True):
    slug = uuid.uuid4().hex[:8]
    tenant = Tenant(
        name=f"Pay {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"py{slug}"[:18],
        feature_flags={"payroll_auto_calculate_enabled": flag_on},
    )
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"py{slug}",
        email=f"py{slug}@e.com",
        password_hash="x",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    emp = Employee(
        tenant_id=tenant.id,
        employee_code=f"E{slug}"[:12],
        first_name="Demo",
        last_name="Worker",
        is_active=True,
    )
    db.add(emp)
    await db.flush()
    basic = PayrollComponent(
        tenant_id=tenant.id,
        code=f"BASIC{slug}"[:16],
        name="Basic",
        component_type="EARNING",
        calculation_type="FIXED",
        default_amount=Decimal("10000"),
        is_active=True,
    )
    food = PayrollComponent(
        tenant_id=tenant.id,
        code=f"FOOD{slug}"[:16],
        name="Food",
        component_type="EARNING",
        calculation_type="PER_DAY",
        default_amount=Decimal("100"),
        is_active=True,
    )
    ot = PayrollComponent(
        tenant_id=tenant.id,
        code=f"OT{slug}"[:16],
        name="OT",
        component_type="EARNING",
        calculation_type="PER_HOUR_OT",
        default_amount=Decimal("200"),
        is_active=True,
    )
    db.add_all([basic, food, ot])
    await db.flush()
    structure = PayrollStructure(
        tenant_id=tenant.id,
        code=f"ST{slug}"[:12],
        name="Standard",
        is_active=True,
    )
    db.add(structure)
    await db.flush()
    db.add_all(
        [
            PayrollStructureLine(
                tenant_id=tenant.id,
                structure_id=structure.id,
                component_id=basic.id,
                amount=Decimal("10000"),
                sort_order=0,
            ),
            PayrollStructureLine(
                tenant_id=tenant.id,
                structure_id=structure.id,
                component_id=food.id,
                amount=Decimal("100"),
                sort_order=1,
            ),
            PayrollStructureLine(
                tenant_id=tenant.id,
                structure_id=structure.id,
                component_id=ot.id,
                amount=Decimal("200"),
                sort_order=2,
            ),
        ]
    )
    await db.flush()
    today = date.today()
    period = PayrollPeriod(
        tenant_id=tenant.id,
        period_code=f"P{slug}"[:12],
        start_date=today - timedelta(days=9),
        end_date=today,
        payment_date=today,
        status="OPEN",
        is_locked=False,
    )
    db.add(period)
    await db.flush()
    run = PayrollRun(
        tenant_id=tenant.id,
        period_id=period.id,
        status="DRAFT",
        run_code=f"PR{slug}"[:16],
        run_date=today,
    )
    db.add(run)
    await db.flush()
    return tenant, user, emp, structure, run, period, basic, food, ot


@pytest.mark.asyncio
async def test_assignment_and_preview(db_session_integration):
    db = db_session_integration
    tenant, _user, emp, structure, run, period, *_ = await _seed_payroll(db, flag_on=True)
    await payroll_service.create_structure_assignment(
        db,
        tenant_id=tenant.id,
        employee_id=emp.id,
        structure_id=structure.id,
        effective_from=period.start_date,
        effective_to=None,
        base_salary="12000",
        component_overrides=None,
        created_by=None,
    )
    preview = await payroll_service.preview_auto_calculate(db, tenant=tenant, run_id=run.id)
    ready = [e for e in preview.employees if not e.skipped]
    assert len(ready) >= 1
    assert ready[0].status == "Ready"
    assert Decimal(ready[0].base_salary) == Decimal("12000.0000")


@pytest.mark.asyncio
async def test_missing_assignment_flagged(db_session_integration):
    db = db_session_integration
    tenant, _user, emp, _structure, run, *_rest = await _seed_payroll(db, flag_on=True)
    preview = await payroll_service.preview_auto_calculate(db, tenant=tenant, run_id=run.id)
    assert emp.id in preview.missing_assignment_employee_ids
    skipped = next(e for e in preview.employees if e.employee_id == emp.id)
    assert skipped.skipped
    assert skipped.status == "Missing Assignment"


@pytest.mark.asyncio
async def test_apply_requires_flag(db_session_integration):
    db = db_session_integration
    tenant, _user, emp, structure, run, period, *_ = await _seed_payroll(db, flag_on=False)
    await payroll_service.create_structure_assignment(
        db,
        tenant_id=tenant.id,
        employee_id=emp.id,
        structure_id=structure.id,
        effective_from=period.start_date,
        effective_to=None,
        base_salary=None,
        component_overrides=None,
        created_by=None,
    )
    with pytest.raises(HTTPException) as exc:
        await payroll_service.apply_auto_calculate(
            db, tenant=tenant, run_id=run.id, force=True, created_by=None
        )
    assert "disabled" in str(exc.value.detail).lower()


@pytest.mark.asyncio
async def test_preview_requires_flag(db_session_integration):
    db = db_session_integration
    tenant, _user, _emp, _structure, run, *_ = await _seed_payroll(db, flag_on=False)
    with pytest.raises(HTTPException) as exc:
        await payroll_service.preview_auto_calculate(db, tenant=tenant, run_id=run.id)
    assert "disabled" in str(exc.value.detail).lower()


@pytest.mark.asyncio
async def test_locked_period_rejects_preview(db_session_integration):
    db = db_session_integration
    tenant, _user, emp, structure, run, period, *_ = await _seed_payroll(db, flag_on=True)
    period.is_locked = True
    await db.flush()
    await payroll_service.create_structure_assignment(
        db,
        tenant_id=tenant.id,
        employee_id=emp.id,
        structure_id=structure.id,
        effective_from=period.start_date,
        effective_to=None,
        base_salary=None,
        component_overrides=None,
        created_by=None,
    )
    with pytest.raises(HTTPException):
        await payroll_service.preview_auto_calculate(db, tenant=tenant, run_id=run.id)


@pytest.mark.asyncio
async def test_effective_dates_assignment_active_in_period(db_session_integration):
    db = db_session_integration
    tenant, _user, emp, structure, run, period, *_ = await _seed_payroll(db, flag_on=True)
    await payroll_service.create_structure_assignment(
        db,
        tenant_id=tenant.id,
        employee_id=emp.id,
        structure_id=structure.id,
        effective_from=period.start_date - timedelta(days=60),
        effective_to=period.start_date - timedelta(days=1),
        base_salary="10000",
        component_overrides=None,
        created_by=None,
    )
    preview = await payroll_service.preview_auto_calculate(db, tenant=tenant, run_id=run.id)
    assert emp.id in preview.missing_assignment_employee_ids


@pytest.mark.asyncio
async def test_paid_leave_and_ot_affect_formulas(db_session_integration):
    db = db_session_integration
    tenant, user, emp, structure, run, period, _basic, food, ot = await _seed_payroll(db, flag_on=True)
    await payroll_service.create_structure_assignment(
        db,
        tenant_id=tenant.id,
        employee_id=emp.id,
        structure_id=structure.id,
        effective_from=period.start_date,
        effective_to=None,
        base_salary="10000",
        component_overrides=None,
        created_by=None,
    )
    for i in range(2):
        db.add(
            AttendanceEntry(
                tenant_id=tenant.id,
                employee_id=emp.id,
                attendance_date=period.start_date + timedelta(days=i),
                status="PRESENT",
            )
        )
    ltype = LeaveType(tenant_id=tenant.id, code=f"PL{emp.id}"[:16], name="Paid", is_paid=True, is_active=True)
    db.add(ltype)
    await db.flush()
    db.add(
        LeaveRequest(
            tenant_id=tenant.id,
            employee_id=emp.id,
            leave_type_id=ltype.id,
            from_date=period.start_date + timedelta(days=2),
            to_date=period.start_date + timedelta(days=2),
            days_requested=Decimal("1"),
            status="APPROVED",
            requested_by=user.id,
        )
    )
    db.add(
        OvertimeEntry(
            tenant_id=tenant.id,
            employee_id=emp.id,
            work_date=period.start_date,
            ot_hours=Decimal("3"),
            status="APPROVED",
        )
    )
    await db.flush()

    preview = await payroll_service.preview_auto_calculate(db, tenant=tenant, run_id=run.id)
    row = next(e for e in preview.employees if e.employee_id == emp.id)
    assert not row.skipped
    food_line = next(c for c in row.components if c.component_id == food.id)
    ot_line = next(c for c in row.components if c.component_id == ot.id)
    assert Decimal(food_line.amount) == Decimal("300.0000")
    assert Decimal(ot_line.amount) == Decimal("600.0000")


@pytest.mark.asyncio
async def test_manual_override_preserved_unless_force(db_session_integration):
    db = db_session_integration
    tenant, _user, emp, structure, run, period, *_ = await _seed_payroll(db, flag_on=True)
    await payroll_service.create_structure_assignment(
        db,
        tenant_id=tenant.id,
        employee_id=emp.id,
        structure_id=structure.id,
        effective_from=period.start_date,
        effective_to=None,
        base_salary="10000",
        component_overrides=None,
        created_by=None,
    )
    db.add(
        PayrollRunLine(
            tenant_id=tenant.id,
            run_id=run.id,
            employee_id=emp.id,
            structure_id=structure.id,
            gross_pay=Decimal("1"),
            deductions=Decimal("0"),
            net_pay=Decimal("1"),
            calculation_source="MANUAL",
            remarks="manual",
        )
    )
    await db.flush()

    result = await payroll_service.apply_auto_calculate(
        db, tenant=tenant, run_id=run.id, employee_ids=[emp.id], force=False, created_by=None
    )
    assert result["applied"] == 0
    assert result["skipped"] >= 1

    line = (
        await db.execute(
            select(PayrollRunLine).where(
                PayrollRunLine.run_id == run.id,
                PayrollRunLine.employee_id == emp.id,
            )
        )
    ).scalar_one()
    assert line.calculation_source == "MANUAL"
    assert Decimal(str(line.net_pay)) == Decimal("1")

    result2 = await payroll_service.apply_auto_calculate(
        db, tenant=tenant, run_id=run.id, employee_ids=[emp.id], force=True, created_by=None
    )
    assert result2["applied"] == 1
    await db.refresh(line)
    assert line.calculation_source == "AUTO"
    assert Decimal(str(line.net_pay)) > Decimal("1")

    snaps = (
        await db.execute(
            select(PayrollCalculationSnapshot).where(
                PayrollCalculationSnapshot.payroll_run_line_id == line.id
            )
        )
    ).scalars().all()
    assert len(snaps) >= 1
    assert snaps[-1].trace_json is not None


@pytest.mark.asyncio
async def test_formula_validation_rejects_invalid():
    with pytest.raises(ValueError):
        assert_valid_calculation_type("EVAL_SCRIPT")
    with pytest.raises(ValueError):
        calculate_component_amount(
            calculation_type="EVAL_SCRIPT",
            amount=Decimal("10"),
            strict=True,
        )


@pytest.mark.asyncio
async def test_tenant_isolation_assignment(db_session_integration):
    db = db_session_integration
    t1, _u1, e1, s1, _run1, p1, *_ = await _seed_payroll(db, flag_on=True)
    t2, _u2, _e2, s2, run2, p2, *_ = await _seed_payroll(db, flag_on=True)
    await payroll_service.create_structure_assignment(
        db,
        tenant_id=t1.id,
        employee_id=e1.id,
        structure_id=s1.id,
        effective_from=p1.start_date,
        effective_to=None,
        base_salary="5000",
        component_overrides=None,
        created_by=None,
    )
    with pytest.raises(HTTPException):
        await payroll_service.create_structure_assignment(
            db,
            tenant_id=t2.id,
            employee_id=e1.id,
            structure_id=s2.id,
            effective_from=p2.start_date,
            effective_to=None,
            base_salary="5000",
            component_overrides=None,
            created_by=None,
        )
    preview2 = await payroll_service.preview_auto_calculate(db, tenant=t2, run_id=run2.id)
    ready_ids = {e.employee_id for e in preview2.employees if not e.skipped}
    assert e1.id not in ready_ids
