"""Employee compensation (structure + Bangladesh wage grade): legal floors, effective dating, locking.

Refused requests roll the shared test session back, so tests keep plain ids / amounts, not ORM rows.

Run: docker compose exec backend pytest tests/test_hr_onboarding_compensation.py -q
"""

from __future__ import annotations

import asyncio
from datetime import date
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.exc import DBAPIError

from app.models import AuditLog, Tenant, User
from app.models.hr_bd import HrBdEmployeeWageAssignment
from app.models.hr_payroll import PayrollEmployeeStructureAssignment, PayrollPeriod, PayrollStructure
from app.modules.hr_localization.enforcement_flags import HR_BD_MINIMUM_WAGE_ENFORCEMENT_ENABLED
from app.modules.hr_localization.enforcement_router import WageAssignmentCreate, create_wage_assignment
from app.modules.hr_payroll import compensation_service as comp
from app.modules.hr_payroll import service as payroll_service
from tests.bd_hr_fixtures import api_client, real_db  # noqa: F401
from tests.test_hr_bd_enforcement import _employee, _rate, _setup, _structure

HR = "/api/v1/hr"
PAY = "/api/v1/hr/payroll"


async def _ranges(db, model, tenant_id: int, employee_id: int) -> list[tuple]:
    rows = (
        await db.execute(
            select(model)
            .where(model.tenant_id == tenant_id, model.employee_id == employee_id)
            .order_by(model.effective_from)
            .execution_options(populate_existing=True)
        )
    ).scalars().all()
    if model is HrBdEmployeeWageAssignment:
        return [(r.effective_from, r.effective_to, r.wage_rate_id) for r in rows]
    return [(r.effective_from, r.effective_to) for r in rows]


async def _seeded(db, *, flags=(), code="E1"):
    tenant, user, role = await _setup(db, flags=flags)
    emp = await _employee(db, tenant, code=code)
    g4, g3 = await _rate(db, tenant, "W-G4"), await _rate(db, tenant, "W-G3")
    st4, st3 = await _structure(db, tenant, "BD-W-G4"), await _structure(db, tenant, "BD-W-G3")
    bare = PayrollStructure(tenant_id=tenant.id, code="BARE", name="No allowances", is_active=True)
    db.add(bare)
    await db.commit()
    return {
        "tenant": tenant, "user": user, "role": role, "tid": tenant.id, "emp": emp.id,
        "g4": g4.id, "g4_basic": Decimal(g4.basic), "g4_gross": Decimal(g4.gross),
        "g3": g3.id, "st4": st4.id, "st3": st3.id, "bare": bare.id,
    }


@pytest.mark.asyncio
async def test_selected_grade_enforces_basic_and_gross_with_flag_on_and_off(db_session_integration):
    db = db_session_integration
    for flags in ((), (HR_BD_MINIMUM_WAGE_ENFORCEMENT_ENABLED,)):
        s = await _seeded(db, flags=flags, code=f"G{len(flags)}")
        url = f"{HR}/employees/{s['emp']}/compensation"
        async with api_client(db, s["tenant"], s["user"]) as c:
            low_basic = await c.put(url, json={
                "structure_id": s["st4"], "bd_wage_rate_id": s["g4"], "effective_from": "2026-01-01",
                "base_salary": str(s["g4_basic"] - 1),
            })
            assert low_basic.status_code == 400 and "minimum basic" in low_basic.text, low_basic.text
            low_gross = await c.put(url, json={
                "structure_id": s["bare"], "bd_wage_rate_id": s["g4"], "effective_from": "2026-01-01",
            })
            assert low_gross.status_code == 400 and "minimum gross" in low_gross.text, low_gross.text
            preview = (await c.post(f"{HR}/compensation/preview", json={
                "structure_id": s["bare"], "bd_wage_rate_id": s["g4"], "effective_from": "2026-01-01",
            })).json()
            assert preview["meets_minimum"] is False and "minimum gross" in preview["message"]
            assert await _ranges(db, PayrollEmployeeStructureAssignment, s["tid"], s["emp"]) == []
            assert await _ranges(db, HrBdEmployeeWageAssignment, s["tid"], s["emp"]) == []

            ok = await c.put(url, json={"structure_id": s["st4"], "bd_wage_rate_id": s["g4"], "effective_from": "2026-01-01"})
            assert ok.status_code == 200, ok.text
            snap = ok.json()["snapshot"]
        assert Decimal(snap["basic"]) == s["g4_basic"]  # defaults to the grade minimum basic
        assert Decimal(snap["gross"]) >= s["g4_gross"]
        assert snap["wage_rate_code"] == "W-G4"


@pytest.mark.asyncio
async def test_compensation_requires_structure(db_session_integration):
    db = db_session_integration
    s = await _seeded(db)
    url = f"{HR}/employees/{s['emp']}/compensation"
    async with api_client(db, s["tenant"], s["user"]) as c:
        missing = await c.put(url, json={"effective_from": "2026-01-01", "base_salary": "20000"})
        assert missing.status_code == 422
        unknown = await c.put(url, json={"structure_id": 999_999_999, "effective_from": "2026-01-01", "base_salary": "20000"})
        assert unknown.status_code == 404
        no_amount = await c.put(url, json={"structure_id": s["st4"], "effective_from": "2026-01-01"})
        assert no_amount.status_code == 400 and "base salary" in no_amount.text
        bad_money = await c.put(url, json={"structure_id": s["st4"], "effective_from": "2026-01-01", "base_salary": "12,000"})
        assert bad_money.status_code == 400
    assert await _ranges(db, PayrollEmployeeStructureAssignment, s["tid"], s["emp"]) == []


@pytest.mark.asyncio
async def test_compensation_input_bounds_and_audit_without_amounts(db_session_integration):
    db = db_session_integration
    s = await _seeded(db)
    url = f"{HR}/employees/{s['emp']}/compensation"
    async with api_client(db, s["tenant"], s["user"]) as c:
        for bad in ("1E+30", "999999999999999", "-5", "NaN"):
            r = await c.put(url, json={"structure_id": s["st4"], "effective_from": "2026-01-01", "base_salary": bad})
            assert r.status_code == 400, (bad, r.text)
        before_joining = await c.put(url, json={"structure_id": s["st4"], "bd_wage_rate_id": s["g4"], "effective_from": "2017-12-31"})
        assert before_joining.status_code == 400 and "joining date" in before_joining.text
        db.add(PayrollPeriod(
            tenant_id=s["tid"], period_code="2025-12", start_date=date(2025, 12, 1), end_date=date(2025, 12, 31),
            payment_date=date(2026, 1, 5), status="FINALIZED", is_locked=True,
        ))
        await db.commit()
        locked = await c.put(url, json={"structure_id": s["st4"], "bd_wage_rate_id": s["g4"], "effective_from": "2025-12-15"})
        assert locked.status_code == 400 and "finalized up to 2025-12-31" in locked.text
        ok = await c.put(url, json={"structure_id": s["st4"], "bd_wage_rate_id": s["g4"], "effective_from": "2026-01-01"})
        assert ok.status_code == 200, ok.text
    audit = (
        await db.execute(
            select(AuditLog).where(AuditLog.tenant_id == s["tid"], AuditLog.action == "HR_EMPLOYEE_COMPENSATION_REPLACED")
        )
    ).scalars().all()
    assert len(audit) == 1 and "grade=W-G4" in audit[0].details
    assert str(s["g4_basic"].normalize()) not in audit[0].details and "basic" not in audit[0].details


@pytest.mark.asyncio
async def test_compensation_replacement_closes_inclusive_range_atomically(db_session_integration):
    db = db_session_integration
    s = await _seeded(db)
    url = f"{HR}/employees/{s['emp']}/compensation"
    expected_structures = [(date(2026, 1, 1), date(2026, 6, 30)), (date(2026, 7, 1), None)]
    expected_wages = [(date(2026, 1, 1), date(2026, 6, 30), s["g4"]), (date(2026, 7, 1), None, s["g3"])]
    async with api_client(db, s["tenant"], s["user"]) as c:
        first = await c.put(url, json={"structure_id": s["st4"], "bd_wage_rate_id": s["g4"], "effective_from": "2026-01-01"})
        assert first.status_code == 200, first.text
        second = await c.put(url, json={"structure_id": s["st3"], "bd_wage_rate_id": s["g3"], "effective_from": "2026-07-01"})
        assert second.status_code == 200, second.text
        assert await _ranges(db, PayrollEmployeeStructureAssignment, s["tid"], s["emp"]) == expected_structures
        assert await _ranges(db, HrBdEmployeeWageAssignment, s["tid"], s["emp"]) == expected_wages

        # A refused replacement (below the grade) leaves both open windows untouched.
        bad = await c.put(url, json={
            "structure_id": s["st3"], "bd_wage_rate_id": s["g3"], "effective_from": "2026-09-01", "base_salary": "1",
        })
        assert bad.status_code == 400
        # Backdating before the current window is refused.
        back = await c.put(url, json={"structure_id": s["st4"], "bd_wage_rate_id": s["g4"], "effective_from": "2026-06-15"})
        assert back.status_code == 409
    assert await _ranges(db, PayrollEmployeeStructureAssignment, s["tid"], s["emp"]) == expected_structures
    assert await _ranges(db, HrBdEmployeeWageAssignment, s["tid"], s["emp"]) == expected_wages


@pytest.mark.asyncio
async def test_future_assignment_overlap_is_rejected(db_session_integration):
    db = db_session_integration
    s = await _seeded(db)
    async with api_client(db, s["tenant"], s["user"]) as c:
        future = await c.post(f"{PAY}/assignments", json={
            "employee_id": s["emp"], "structure_id": s["st4"], "effective_from": "2027-01-01", "base_salary": str(s["g4_basic"]),
        })
        assert future.status_code == 201, future.text
        overlap = await c.post(f"{PAY}/assignments", json={
            "employee_id": s["emp"], "structure_id": s["st4"], "effective_from": "2026-06-01", "base_salary": str(s["g4_basic"]),
        })
        assert overlap.status_code == 400
        replace = await c.put(f"{HR}/employees/{s['emp']}/compensation", json={
            "structure_id": s["st4"], "bd_wage_rate_id": s["g4"], "effective_from": "2026-08-01",
        })
        assert replace.status_code == 409 and "2027-01-01" in replace.text
    assert await _ranges(db, PayrollEmployeeStructureAssignment, s["tid"], s["emp"]) == [(date(2027, 1, 1), None)]


@pytest.mark.asyncio
async def test_compensation_permissions_and_tenancy(db_session_integration):
    db = db_session_integration
    s = await _seeded(db)
    body = {"structure_id": s["st4"], "bd_wage_rate_id": s["g4"], "effective_from": "2026-01-01"}
    role = s["role"]
    role.name, role.permissions = "clerk", {"hr.access": True}
    await db.commit()
    async with api_client(db, s["tenant"], s["user"]) as c:
        assert (await c.put(f"{HR}/employees/{s['emp']}/compensation", json=body)).status_code == 403
        assert (await c.get(f"{HR}/employees/{s['emp']}/compensation")).status_code == 403
        assert (await c.get(f"{HR}/compensation/options")).status_code == 403
        assert (await c.get(f"{HR}/employees/{s['emp']}")).json()["pay_snapshot"] is None
    role.permissions = {"hr.access": True, "hr.payroll.manage": True}
    await db.commit()
    async with api_client(db, s["tenant"], s["user"]) as c:
        options = (await c.get(f"{HR}/compensation/options")).json()
        assert any(x["id"] == s["st4"] for x in options["structures"])
        assert any(g["id"] == s["g4"] for g in options["wage_grades"])
        assert (await c.put(f"{HR}/employees/{s['emp']}/compensation", json=body)).status_code == 200
        assert (await c.get(f"{HR}/employees/{s['emp']}")).json()["pay_snapshot"]["wage_rate_code"] == "W-G4"

    o = await _seeded(db, code="O1")
    async with api_client(db, o["tenant"], o["user"]) as c:
        foreign_emp = await c.put(f"{HR}/employees/{s['emp']}/compensation", json={**body, "structure_id": o["st4"]})
        assert foreign_emp.status_code == 404
        foreign_structure = await c.put(f"{HR}/employees/{o['emp']}/compensation", json={**body, "bd_wage_rate_id": o["g4"]})
        assert foreign_structure.status_code == 404 and "structure" in foreign_structure.text
        foreign_rate = await c.put(f"{HR}/employees/{o['emp']}/compensation", json={**body, "structure_id": o["st4"]})
        assert foreign_rate.status_code == 404 and "Wage rate" in foreign_rate.text
        assert (await c.get(f"{HR}/employees/{s['emp']}/compensation")).status_code == 404
    assert await _ranges(db, PayrollEmployeeStructureAssignment, o["tid"], o["emp"]) == []


@pytest.mark.asyncio
async def test_legacy_and_onboarding_assignment_race_serializes_on_employee(real_db):  # noqa: F811
    factory, register = real_db
    async with factory() as session:
        s = await _seeded(session)
        register(s["tid"])
    tid, emp_id, st_id, rate_id, user_id = s["tid"], s["emp"], s["st4"], s["g4"], s["user"].id
    basic = str(s["g4_basic"])

    # 1) Every legacy writer waits on the employee row lock held by the shared compensation lock.
    async with factory() as holder:
        await comp.lock_employee(holder, tid, emp_id)
        async with factory() as other:
            probes = (
                lambda t, u: payroll_service.create_structure_assignment(
                    other, tenant_id=tid, employee_id=emp_id, structure_id=st_id,
                    effective_from=date(2026, 1, 1), effective_to=None, base_salary=basic,
                    component_overrides=None, created_by=None,
                ),
                lambda t, u: create_wage_assignment(
                    WageAssignmentCreate(employee_id=emp_id, wage_rate_id=rate_id, effective_from=date(2026, 1, 1)),
                    tenant=t, user=u, db=other,
                ),
            )
            for probe in probes:
                t, u = await other.get(Tenant, tid), await other.get(User, user_id)
                await other.execute(text("SET LOCAL lock_timeout = '300ms'"))
                with pytest.raises(DBAPIError, match="lock timeout"):
                    await probe(t, u)
                await other.rollback()
        await holder.rollback()

    # 2) Real concurrency: the legacy service path and the new service race for the same start date.
    async def legacy():
        async with factory() as session:
            try:
                await payroll_service.create_structure_assignment(
                    session, tenant_id=tid, employee_id=emp_id, structure_id=st_id,
                    effective_from=date(2026, 1, 1), effective_to=None, base_salary=basic,
                    component_overrides=None, created_by=None,
                )
                return "ok"
            except HTTPException as exc:
                return exc.status_code

    async def onboarding():
        async with factory() as session:
            t = await session.get(Tenant, tid)
            try:
                await comp.replace_employee_compensation(
                    session, tenant=t, employee_id=emp_id, structure_id=st_id, bd_wage_rate_id=rate_id,
                    base_salary=None, effective_from=date(2026, 1, 1), actor_id=None,
                )
                await session.commit()
                return "ok"
            except HTTPException as exc:
                await session.rollback()
                return exc.status_code

    results = await asyncio.gather(legacy(), onboarding())
    assert sorted(map(str, results)) in (["400", "ok"], ["409", "ok"]), results
    async with factory() as session:
        n = (
            await session.execute(
                select(func.count()).select_from(PayrollEmployeeStructureAssignment).where(
                    PayrollEmployeeStructureAssignment.tenant_id == tid,
                    PayrollEmployeeStructureAssignment.employee_id == emp_id,
                )
            )
        ).scalar_one()
        assert n == 1

    # 3) The "end" paths wait on the same employee lock.
    async with factory() as session:
        structure_id = (
            await session.execute(
                select(PayrollEmployeeStructureAssignment.id).where(PayrollEmployeeStructureAssignment.employee_id == emp_id)
            )
        ).scalar_one()
        await comp.lock_employee(session, tid, emp_id)
        wage_id = (
            await session.execute(
                select(HrBdEmployeeWageAssignment.id).where(HrBdEmployeeWageAssignment.employee_id == emp_id)
            )
        ).scalar_one_or_none()
        if wage_id is None:  # the legacy writer won the race, so no grade was assigned yet
            wage = await comp.insert_wage_assignment(
                session, tenant_id=tid, employee_id=emp_id,
                rate=await comp.approved_wage_rate(session, tid, rate_id, date(2030, 1, 1)),
                effective_from=date(2030, 1, 1), created_by=None,
            )
            wage_id = wage.id
        await session.commit()
    async with factory() as holder:
        await comp.lock_employee(holder, tid, emp_id)
        async with factory() as other:
            for probe in (
                lambda: payroll_service.end_structure_assignment(other, tenant_id=tid, assignment_id=structure_id, effective_to=date(2031, 1, 1)),
                lambda: comp.close_wage_assignment(other, tenant_id=tid, assignment_id=wage_id, effective_to=date(2031, 1, 1), ended_by=None),
            ):
                await other.execute(text("SET LOCAL lock_timeout = '300ms'"))
                with pytest.raises(DBAPIError, match="lock timeout"):
                    await probe()
                await other.rollback()
        await holder.rollback()
