"""Dated employee / machine line assignments (Manufacturing Intelligence Phase 2, run R4; migration 298).

Covers: create / update / end / deactivate, overlap 409, stale lock_version 409, cross-tenant ids 404, RBAC denial,
HR display fields only, flag off 404, and the capacity engine (flag off identical; flag on operators from
assignments, today's attendance counts, machines as a separate constraint).

Run: docker compose exec -T backend sh -c "pytest tests/test_mfg_line_assignments.py -q -p no:warnings"
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from sqlalchemy import select

from app.models import AttendanceEntry, AuditLog, DepartmentMachine, Employee
from app.modules.mfg_intelligence.assignment_capacity import load_assignment_staffing
from tests.mfg_alloc_fixtures import add_user_with_role
from tests.mfg_intel_fixtures import (
    API,
    FLAGS_ON,
    MONDAY,
    add_line,
    add_order,
    add_plan,
    client_for,
    new_tenant,
    seed_basic_factory,
)

pytestmark = pytest.mark.asyncio

FLAGS = {**FLAGS_ON, "mfg_integrated_planning_v1": True}
EMP_URL = f"{API}/line-assignments/employees"
MACH_URL = f"{API}/line-assignments/machines"
FORBIDDEN_HR_KEYS = {"national_id", "phone", "salary", "base_salary", "bank_account_no", "bank_account_name",
                     "email", "date_of_birth", "address_line", "birth_registration_no"}


async def _employee(db, tenant, *, active=True, name="Rahima"):
    emp = Employee(
        tenant_id=tenant.id, employee_code=f"E{uuid.uuid4().hex[:6]}", first_name=name, last_name="Khatun",
        national_id="1990123456789", phone="01711000000", email="secret@example.com", is_active=active,
    )
    db.add(emp)
    await db.flush()
    return emp


async def _machine(db, tenant, *, active=True):
    m = DepartmentMachine(
        tenant_id=tenant.id, department_type="sewing", machine_code=f"M{uuid.uuid4().hex[:6]}", name="SNLS",
        machine_type="SNLS", is_active=active,
    )
    db.add(m)
    await db.flush()
    return m


async def _setup(db, *, flags=None):
    tenant, user, _ = await new_tenant(db, flags=FLAGS if flags is None else flags)
    fx = await seed_basic_factory(db, tenant)
    emp = await _employee(db, tenant)
    machine = await _machine(db, tenant)
    await db.commit()
    return tenant, user, fx, emp, machine


def _emp_body(emp, line, **kw):
    body = {"employee_id": emp.id, "sewing_line_id": line.id, "valid_from": "2030-03-01"}
    body.update(kw)
    return body


# ------------------------------------------------------------------ CRUD


async def test_create_list_update_end_deactivate_employee_assignment(db_session_integration):
    db = db_session_integration
    tenant, user, fx, emp, _m = await _setup(db)
    async with client_for(db, tenant, user) as c:
        r = await c.post(EMP_URL, json=_emp_body(emp, fx.line, shift_id=fx.shift.id, role="operator"))
        assert r.status_code == 201, r.text
        a = r.json()
        assert a["role"] == "OPERATOR" and a["employee_code"] == emp.employee_code
        assert a["employee_name"] == "Rahima Khatun" and a["line_code"] == "L1" and a["shift_code"] == "DAY"
        assert a["lock_version"] == 0 and a["valid_to"] is None

        listed = (await c.get(EMP_URL, params={"line_id": fx.line.id})).json()
        assert listed["total"] == 1 and listed["items"][0]["id"] == a["id"]
        assert (await c.get(EMP_URL, params={"active_on": "2030-02-01"})).json()["total"] == 0

        r = await c.patch(f"{EMP_URL}/{a['id']}", json={"expected_lock_version": 0, "role": "HELPER"})
        assert r.status_code == 200, r.text
        assert r.json()["role"] == "HELPER" and r.json()["lock_version"] == 1

        r = await c.post(f"{EMP_URL}/{a['id']}/end", json={"expected_lock_version": 1, "valid_to": "2030-03-31"})
        assert r.status_code == 200 and r.json()["valid_to"] == "2030-03-31" and r.json()["changed"] is True
        again = await c.post(f"{EMP_URL}/{a['id']}/end", json={"expected_lock_version": 2, "valid_to": "2030-03-31"})
        assert again.status_code == 200 and again.json()["changed"] is False

        r = await c.post(f"{EMP_URL}/{a['id']}/deactivate", json={"expected_lock_version": 2, "reason": "moved"})
        assert r.status_code == 200 and r.json()["is_active"] is False
        again = await c.post(f"{EMP_URL}/{a['id']}/deactivate", json={"expected_lock_version": 0})
        assert again.status_code == 200 and again.json()["changed"] is False
        # inactive rows are hidden unless asked for
        assert (await c.get(EMP_URL)).json()["total"] == 0
        assert (await c.get(EMP_URL, params={"include_inactive": True})).json()["total"] == 1
        assert (await c.patch(f"{EMP_URL}/{a['id']}", json={"expected_lock_version": 3, "notes": "x"})).status_code == 409

    actions = set(
        (await db.execute(select(AuditLog.action).where(AuditLog.tenant_id == tenant.id))).scalars().all()
    )
    assert {
        "mfg_employee_line_assignment.create",
        "mfg_employee_line_assignment.update",
        "mfg_employee_line_assignment.end",
        "mfg_employee_line_assignment.deactivate",
    } <= actions


async def test_employee_output_has_display_fields_only(db_session_integration):
    db = db_session_integration
    tenant, user, fx, emp, _m = await _setup(db)
    async with client_for(db, tenant, user) as c:
        created = (await c.post(EMP_URL, json=_emp_body(emp, fx.line))).json()
        listed = (await c.get(EMP_URL)).json()["items"][0]
    for payload in (created, listed):
        assert not (set(payload) & FORBIDDEN_HR_KEYS), payload
        text = str(payload)
        assert "1990123456789" not in text and "01711000000" not in text and "secret@example.com" not in text


async def test_overlap_is_409_for_employee_and_machine(db_session_integration):
    db = db_session_integration
    tenant, user, fx, emp, machine = await _setup(db)
    line2 = await add_line(db, tenant, "L2")
    await db.commit()
    async with client_for(db, tenant, user) as c:
        first = (await c.post(EMP_URL, json=_emp_body(emp, fx.line, valid_to="2030-03-31"))).json()
        # same employee, another line, overlapping dates -> 409 naming the other assignment
        r = await c.post(EMP_URL, json=_emp_body(emp, line2, valid_from="2030-03-31"))
        assert r.status_code == 409 and f"#{first['id']}" in r.json()["detail"]
        # open-ended request starting before -> overlaps too
        assert (await c.post(EMP_URL, json=_emp_body(emp, line2, valid_from="2030-01-01"))).status_code == 409
        # the day after the end is free
        assert (await c.post(EMP_URL, json=_emp_body(emp, line2, valid_from="2030-04-01"))).status_code == 201
        # extending the first one into the second -> 409
        r = await c.patch(f"{EMP_URL}/{first['id']}", json={"expected_lock_version": 0, "valid_to": None})
        assert r.status_code == 409

        m1 = await c.post(MACH_URL, json={"machine_id": machine.id, "sewing_line_id": fx.line.id, "valid_from": "2030-03-01"})
        assert m1.status_code == 201, m1.text
        assert m1.json()["machine_code"] == machine.machine_code
        r = await c.post(MACH_URL, json={"machine_id": machine.id, "sewing_line_id": line2.id, "valid_from": "2030-06-01"})
        assert r.status_code == 409
        # after ending the first, the machine can move
        end = await c.post(f"{MACH_URL}/{m1.json()['id']}/end", json={"expected_lock_version": 0, "valid_to": "2030-05-31"})
        assert end.status_code == 200
        r = await c.post(MACH_URL, json={"machine_id": machine.id, "sewing_line_id": line2.id, "valid_from": "2030-06-01"})
        assert r.status_code == 201
        # a deactivated assignment no longer blocks
        await c.post(f"{EMP_URL}/{first['id']}/deactivate", json={"expected_lock_version": 0})
        assert (await c.post(EMP_URL, json=_emp_body(emp, fx.line, valid_from="2030-03-10", valid_to="2030-03-20"))).status_code == 201


async def test_stale_lock_version_is_409_and_writes_nothing(db_session_integration):
    db = db_session_integration
    tenant, user, fx, emp, machine = await _setup(db)
    async with client_for(db, tenant, user) as c:
        a = (await c.post(EMP_URL, json=_emp_body(emp, fx.line))).json()
        assert (await c.patch(f"{EMP_URL}/{a['id']}", json={"expected_lock_version": 0, "notes": "first"})).status_code == 200
        r = await c.patch(f"{EMP_URL}/{a['id']}", json={"expected_lock_version": 0, "notes": "second"})
        assert r.status_code == 409
        r = await c.post(f"{EMP_URL}/{a['id']}/end", json={"expected_lock_version": 0, "valid_to": "2030-04-01"})
        assert r.status_code == 409
        m = (await c.post(MACH_URL, json={"machine_id": machine.id, "sewing_line_id": fx.line.id, "valid_from": "2030-03-01"})).json()
        assert (await c.patch(f"{MACH_URL}/{m['id']}", json={"expected_lock_version": 5, "notes": "x"})).status_code == 409
        got = (await c.get(EMP_URL)).json()["items"][0]
    assert got["notes"] == "first" and got["valid_to"] is None and got["lock_version"] == 1


async def test_validation_errors(db_session_integration):
    db = db_session_integration
    tenant, user, fx, emp, machine = await _setup(db)
    inactive = await _employee(db, tenant, active=False)
    idle_machine = await _machine(db, tenant, active=False)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        assert (await c.post(EMP_URL, json=_emp_body(emp, fx.line, role="DRIVER"))).status_code == 422
        assert (await c.post(EMP_URL, json=_emp_body(emp, fx.line, valid_to="2030-02-01"))).status_code == 422
        assert (await c.post(EMP_URL, json=_emp_body(inactive, fx.line))).status_code == 422
        assert (await c.post(EMP_URL, json={**_emp_body(emp, fx.line), "salary": "1"})).status_code == 422
        a = (await c.post(EMP_URL, json=_emp_body(emp, fx.line))).json()
        # employee_id can never change on update
        r = await c.patch(f"{EMP_URL}/{a['id']}", json={"expected_lock_version": 0, "employee_id": emp.id})
        assert r.status_code == 422
        assert (await c.patch(f"{EMP_URL}/{a['id']}", json={"expected_lock_version": 0})).status_code == 422
        r = await c.post(MACH_URL, json={"machine_id": idle_machine.id, "sewing_line_id": fx.line.id, "valid_from": "2030-03-01"})
        assert r.status_code == 422


async def test_cross_tenant_ids_look_like_not_found(db_session_integration):
    db = db_session_integration
    tenant, user, fx, emp, machine = await _setup(db)
    t2, u2, fx2, emp2, machine2 = await _setup(db)
    async with client_for(db, t2, u2) as c:
        foreign_emp = (await c.post(EMP_URL, json=_emp_body(emp2, fx2.line))).json()
        foreign_mach = (await c.post(MACH_URL, json={"machine_id": machine2.id, "sewing_line_id": fx2.line.id, "valid_from": "2030-03-01"})).json()
    async with client_for(db, tenant, user) as c:
        assert (await c.post(EMP_URL, json=_emp_body(emp2, fx.line))).status_code == 404
        assert (await c.post(EMP_URL, json=_emp_body(emp, fx2.line))).status_code == 404
        assert (await c.post(EMP_URL, json=_emp_body(emp, fx.line, shift_id=fx2.shift.id))).status_code == 404
        r = await c.post(MACH_URL, json={"machine_id": machine2.id, "sewing_line_id": fx.line.id, "valid_from": "2030-03-01"})
        assert r.status_code == 404
        r = await c.post(MACH_URL, json={"machine_id": machine.id, "sewing_line_id": fx2.line.id, "valid_from": "2030-03-01"})
        assert r.status_code == 404
        own = (await c.post(EMP_URL, json=_emp_body(emp, fx.line))).json()
        r = await c.patch(f"{EMP_URL}/{own['id']}", json={"expected_lock_version": 0, "sewing_line_id": fx2.line.id})
        assert r.status_code == 404
        r = await c.patch(f"{EMP_URL}/{own['id']}", json={"expected_lock_version": 0, "shift_id": fx2.shift.id})
        assert r.status_code == 404
        # another tenant's assignment ids
        assert (await c.patch(f"{EMP_URL}/{foreign_emp['id']}", json={"expected_lock_version": 0, "notes": "x"})).status_code == 404
        assert (await c.post(f"{EMP_URL}/{foreign_emp['id']}/end", json={"expected_lock_version": 0, "valid_to": "2030-04-01"})).status_code == 404
        assert (await c.post(f"{EMP_URL}/{foreign_emp['id']}/deactivate", json={"expected_lock_version": 0})).status_code == 404
        assert (await c.post(f"{MACH_URL}/{foreign_mach['id']}/deactivate", json={"expected_lock_version": 0})).status_code == 404
        listed = (await c.get(EMP_URL, params={"employee_id": emp2.id})).json()
        assert listed["total"] == 0
        assert (await c.get(MACH_URL)).json()["total"] == 0
    async with client_for(db, tenant, u2) as c:  # user of another tenant
        assert (await c.get(EMP_URL)).status_code == 403


async def test_permission_denial_under_rbac_enforce(db_session_integration):
    db = db_session_integration
    tenant, user, fx, emp, machine = await _setup(db, flags={**FLAGS, "rbac_enforcement": "enforce"})
    reader = await add_user_with_role(db, tenant, "reader", {"production.planning.read": True})
    nobody = await add_user_with_role(db, tenant, "nobody", {"production.planning.read": False})
    await db.commit()
    async with client_for(db, tenant, reader) as c:
        assert (await c.get(EMP_URL)).status_code == 200
        assert (await c.get(MACH_URL)).status_code == 200
        assert (await c.post(EMP_URL, json=_emp_body(emp, fx.line))).status_code == 403
        r = await c.post(MACH_URL, json={"machine_id": machine.id, "sewing_line_id": fx.line.id, "valid_from": "2030-03-01"})
        assert r.status_code == 403
        assert (await c.patch(f"{EMP_URL}/1", json={"expected_lock_version": 0, "notes": "x"})).status_code == 403
        assert (await c.post(f"{EMP_URL}/1/end", json={"expected_lock_version": 0, "valid_to": "2030-04-01"})).status_code == 403
        assert (await c.post(f"{MACH_URL}/1/deactivate", json={"expected_lock_version": 0})).status_code == 403
    async with client_for(db, tenant, nobody) as c:
        assert (await c.get(EMP_URL)).status_code == 403


async def test_planner_employee_picker_shows_display_fields_of_own_active_staff_only(db_session_integration):
    db = db_session_integration
    tenant, user, fx, emp, _m = await _setup(db, flags={**FLAGS, "rbac_enforcement": "enforce"})
    gone = await _employee(db, tenant, active=False, name="Rahima")
    t2, _u2, _fx2, other_emp, _m2 = await _setup(db)
    planner = await add_user_with_role(
        db, tenant, "planner", {"production.planning.read": True, "production.planning.write": True, "hr.access": False}
    )
    reader = await add_user_with_role(db, tenant, "reader", {"production.planning.read": True})
    await db.commit()
    url = f"{API}/planning-people/employees"
    async with client_for(db, tenant, planner) as c:
        r = await c.get(url, params={"q": "rahima"})
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        assert [i["id"] for i in items] == [emp.id]  # inactive and other tenant's employee are not listed
        assert set(items[0]) == {"id", "employee_code", "employee_name"}
        assert gone.id not in {i["id"] for i in items} and other_emp.id not in {i["id"] for i in items}
        assert (await c.get(url, params={"limit": 51})).status_code == 422
    async with client_for(db, tenant, reader) as c:  # may read plans but not assign people
        assert (await c.get(url)).status_code == 403
    _ = t2


async def test_planning_permissions_hint_follows_rbac(db_session_integration):
    db = db_session_integration
    tenant, user, fx, emp, _m = await _setup(db, flags={**FLAGS, "rbac_enforcement": "enforce"})
    reader = await add_user_with_role(db, tenant, "reader", {"production.planning.read": True})
    await db.commit()
    url = f"{API}/planning-permissions"
    async with client_for(db, tenant, user) as c:
        full = (await c.get(url)).json()
        assert full["can_propose"] and full["can_approve"] and full["can_manage_settings"]
    async with client_for(db, tenant, reader) as c:
        r = await c.get(url)
        assert r.status_code == 200, r.text
        hint = r.json()
        assert not hint["can_propose"] and not hint["can_approve"] and not hint["is_admin_or_manager"]


async def test_everything_is_404_when_the_integrated_flag_is_off(db_session_integration):
    db = db_session_integration
    tenant, user, fx, emp, machine = await _setup(db, flags=dict(FLAGS_ON))
    async with client_for(db, tenant, user) as c:
        assert (await c.get(EMP_URL)).status_code == 404
        assert (await c.get(MACH_URL)).status_code == 404
        assert (await c.post(EMP_URL, json=_emp_body(emp, fx.line))).status_code == 404
        r = await c.post(MACH_URL, json={"machine_id": machine.id, "sewing_line_id": fx.line.id, "valid_from": "2030-03-01"})
        assert r.status_code == 404
        assert (await c.patch(f"{EMP_URL}/1", json={"expected_lock_version": 0, "notes": "x"})).status_code == 404


async def test_sewing_line_with_assignments_cannot_be_deleted(db_session_integration):
    from fastapi import HTTPException

    from app.common.delete_guards import ensure_sewing_line_deletable

    db = db_session_integration
    tenant, user, fx, emp, machine = await _setup(db)
    line2 = await add_line(db, tenant, "L2")
    await db.commit()
    async with client_for(db, tenant, user) as c:
        assert (await c.post(MACH_URL, json={"machine_id": machine.id, "sewing_line_id": line2.id, "valid_from": "2030-03-01"})).status_code == 201
        assert (await c.post(EMP_URL, json=_emp_body(emp, fx.line))).status_code == 201
    for line_id, label in ((fx.line.id, "employee line assignments"), (line2.id, "machine line assignments")):
        with pytest.raises(HTTPException) as exc:
            await ensure_sewing_line_deletable(db, tenant.id, line_id)
        assert exc.value.status_code == 409 and label in exc.value.detail
    # another tenant's assignments never block this tenant's delete
    t2, _u2, fx2, _e2, _m2 = await _setup(db)
    await ensure_sewing_line_deletable(db, t2.id, fx2.line.id)


# ------------------------------------------------------------------ capacity


async def _seed_capacity(db, flags):
    tenant, user, fx, _emp, _m = await _setup(db, flags=flags)
    order = await add_order(db, tenant, fx.customer, fx.style, qty=1000, delivery=date(2030, 4, 30))
    await add_plan(db, tenant, fx.line, start=MONDAY, end=MONDAY + timedelta(days=4), order=order, style=fx.style,
                   ob=fx.ob, operators=30)
    emps = [await _employee(db, tenant, name=f"Op{i}") for i in range(10)]
    helper = await _employee(db, tenant, name="Helper")
    machines = [await _machine(db, tenant) for _ in range(6)]
    await db.commit()
    return tenant, user, fx, emps, helper, machines


async def _assign_all(c, fx, emps, helper, machines):
    for e in emps:
        assert (await c.post(EMP_URL, json=_emp_body(e, fx.line))).status_code == 201
    assert (await c.post(EMP_URL, json=_emp_body(helper, fx.line, role="HELPER"))).status_code == 201
    for m in machines:
        r = await c.post(MACH_URL, json={"machine_id": m.id, "sewing_line_id": fx.line.id, "valid_from": "2030-03-01"})
        assert r.status_code == 201


async def _capacity(c):
    r = await c.get(f"{API}/capacity", params={"date_from": "2030-03-04", "date_to": "2030-03-04"})
    assert r.status_code == 200, r.text
    return r.json()


async def test_capacity_flag_off_is_identical_even_with_assignments(db_session_integration):
    db = db_session_integration
    tenant, user, fx, emps, helper, machines = await _seed_capacity(db, FLAGS)
    async with client_for(db, tenant, user) as c:
        await _assign_all(c, fx, emps, helper, machines)
    # switch the integrated flag off: assignments exist but must change nothing
    tenant.feature_flags = dict(FLAGS_ON)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        with_rows = await _capacity(c)
    day = with_rows["lines"][0]["days"][0]
    assert day["operators"] == 30 and "OPERATORS_FROM_PLAN_ROW" in day["reason_codes"]
    assert "assigned_operators" not in day and "assigned_machines" not in day
    assert day["practical_smv_minutes"] == "8640.00"  # 480 x 30 x 60 %
    assert with_rows["lines"][0]["reason_codes"] == ["MACHINE_PROFILE_NOT_EVALUATED"]

    # same tenant data without any assignment rows gives byte-identical output
    t2, u2, fx2, *_ = await _seed_capacity(db, dict(FLAGS_ON))
    async with client_for(db, t2, u2) as c:
        without = await _capacity(c)
    a, b = with_rows["lines"][0], without["lines"][0]
    for key in ("days", "totals", "legacy_value", "corrected_value", "reason_codes", "missing_inputs"):
        assert a[key] == b[key], key
    assert with_rows["assumptions"] == without["assumptions"]


async def test_capacity_flag_on_operators_from_assignments_machines_separate(db_session_integration):
    db = db_session_integration
    tenant, user, fx, emps, helper, machines = await _seed_capacity(db, FLAGS)
    async with client_for(db, tenant, user) as c:
        await _assign_all(c, fx, emps, helper, machines)
        out = await _capacity(c)
    day = out["lines"][0]["days"][0]
    # 10 OPERATOR assignments (the HELPER is not an operator); plan row operator_count 30 is not used
    assert day["operators"] == 10 and day["assigned_operators"] == 10
    assert day["practical_smv_minutes"] == "2880.00"  # 480 x 10 x 60 %
    assert "OPERATORS_FROM_ASSIGNMENTS" in day["reason_codes"]
    assert "OPERATORS_FROM_PLAN_ROW" not in day["reason_codes"]
    # machines are a separate constraint: reported, never used to change operator minutes
    assert day["assigned_machines"] == 6
    assert "MACHINES_FROM_ASSIGNMENTS" in day["reason_codes"] and "MACHINES_FEWER_THAN_OPERATORS" in day["reason_codes"]
    assert "OPERATORS_FROM_ASSIGNMENTS" in out["lines"][0]["reason_codes"]
    assert any("Integrated planning" in a for a in out["assumptions"])


async def test_capacity_flag_on_without_assignments_keeps_phase1_values(db_session_integration):
    db = db_session_integration
    tenant, user, fx, *_ = await _seed_capacity(db, FLAGS)
    async with client_for(db, tenant, user) as c:
        out = await _capacity(c)
    day = out["lines"][0]["days"][0]
    assert day["operators"] == 30 and day["practical_smv_minutes"] == "8640.00"
    assert "assigned_operators" not in day and "assigned_machines" not in day


async def test_today_uses_attendance_counts_only(db_session_integration):
    db = db_session_integration
    tenant, user, fx, emps, helper, machines = await _seed_capacity(db, FLAGS)
    async with client_for(db, tenant, user) as c:
        await _assign_all(c, fx, emps[:4], helper, [])
    days = {fx.line.id: [MONDAY]}
    # no attendance recorded yet -> the assigned count is used
    staff = (await load_assignment_staffing(db, tenant.id, line_ids=[fx.line.id], days_by_line=days, today=MONDAY)).get(fx.line.id, MONDAY)
    assert staff.operators == 4 and staff.attendance_missing and not staff.attendance_used
    for e, st in zip(emps[:4], ("PRESENT", "LATE", "HALF_DAY", "ABSENT")):
        db.add(AttendanceEntry(tenant_id=tenant.id, employee_id=e.id, attendance_date=MONDAY, status=st, source="MANUAL"))
    await db.commit()
    staff = (await load_assignment_staffing(db, tenant.id, line_ids=[fx.line.id], days_by_line=days, today=MONDAY)).get(fx.line.id, MONDAY)
    assert staff.operators == 3 and staff.attendance_used
    # another day is not "today": assignments only
    tuesday = MONDAY + timedelta(days=1)
    staff = (
        await load_assignment_staffing(db, tenant.id, line_ids=[fx.line.id], days_by_line={fx.line.id: [tuesday]}, today=MONDAY)
    ).get(fx.line.id, tuesday)
    assert staff.operators == 4 and not staff.attendance_used


async def test_attendance_is_decided_per_line(db_session_integration):
    """Attendance entered for line 1 only must not make line 2 (not entered yet) look empty."""
    db = db_session_integration
    tenant, user, fx, emps, helper, machines = await _seed_capacity(db, FLAGS)
    line2 = await add_line(db, tenant, "L2")
    await db.commit()
    async with client_for(db, tenant, user) as c:
        for e in emps[:2]:
            assert (await c.post(EMP_URL, json=_emp_body(e, fx.line))).status_code == 201
        for e in emps[2:5]:
            assert (await c.post(EMP_URL, json=_emp_body(e, line2))).status_code == 201
    # line 1: attendance entered (one present, one without a record = not present); line 2: nothing entered yet
    db.add(AttendanceEntry(tenant_id=tenant.id, employee_id=emps[0].id, attendance_date=MONDAY, status="PRESENT", source="MANUAL"))
    await db.commit()
    days = {fx.line.id: [MONDAY], line2.id: [MONDAY]}
    staffing = await load_assignment_staffing(db, tenant.id, line_ids=[fx.line.id, line2.id], days_by_line=days, today=MONDAY)
    one, two = staffing.get(fx.line.id, MONDAY), staffing.get(line2.id, MONDAY)
    assert one.attendance_used and one.operators == 1
    assert two.attendance_missing and not two.attendance_used and two.operators == 3


async def test_end_retry_after_success_is_not_409(db_session_integration):
    db = db_session_integration
    tenant, user, fx, emp, _m = await _setup(db)
    async with client_for(db, tenant, user) as c:
        a = (await c.post(EMP_URL, json=_emp_body(emp, fx.line))).json()
        body = {"expected_lock_version": 0, "valid_to": "2030-03-31"}
        assert (await c.post(f"{EMP_URL}/{a['id']}/end", json=body)).json()["changed"] is True
        again = await c.post(f"{EMP_URL}/{a['id']}/end", json=body)  # same request sent twice (old version)
        assert again.status_code == 200 and again.json()["changed"] is False


async def test_inactive_employee_assignment_can_only_be_ended(db_session_integration):
    db = db_session_integration
    tenant, user, fx, emp, _m = await _setup(db)
    async with client_for(db, tenant, user) as c:
        a = (await c.post(EMP_URL, json=_emp_body(emp, fx.line))).json()
    emp.is_active = False
    await db.commit()
    async with client_for(db, tenant, user) as c:
        r = await c.patch(f"{EMP_URL}/{a['id']}", json={"expected_lock_version": 0, "valid_to": "2030-12-31"})
        assert r.status_code == 422, r.text
        r = await c.patch(f"{EMP_URL}/{a['id']}", json={"expected_lock_version": 0, "notes": "left the company"})
        assert r.status_code == 200, r.text
        r = await c.post(f"{EMP_URL}/{a['id']}/end", json={"expected_lock_version": 1, "valid_to": "2030-03-15"})
        assert r.status_code == 200, r.text


async def test_shift_with_employee_assignments_cannot_be_deleted(db_session_integration):
    from fastapi import HTTPException

    from app.common.delete_guards import ensure_shift_deletable

    db = db_session_integration
    tenant, user, fx, emp, _m = await _setup(db)
    async with client_for(db, tenant, user) as c:
        assert (await c.post(EMP_URL, json=_emp_body(emp, fx.line, shift_id=fx.shift.id))).status_code == 201
    with pytest.raises(HTTPException) as exc:
        await ensure_shift_deletable(db, tenant.id, fx.shift.id)
    assert exc.value.status_code == 409 and "employee line assignments" in exc.value.detail


async def test_inactive_employee_and_ended_assignment_are_not_counted(db_session_integration):
    db = db_session_integration
    tenant, user, fx, emps, helper, machines = await _seed_capacity(db, FLAGS)
    async with client_for(db, tenant, user) as c:
        await _assign_all(c, fx, emps[:3], helper, [])
        listed = (await c.get(EMP_URL, params={"employee_id": emps[2].id})).json()["items"][0]
        await c.post(f"{EMP_URL}/{listed['id']}/end", json={"expected_lock_version": 0, "valid_to": "2030-03-03"})
    emps[1].is_active = False
    await db.commit()
    staff = (
        await load_assignment_staffing(db, tenant.id, line_ids=[fx.line.id], days_by_line={fx.line.id: [MONDAY]}, today=None)
    ).get(fx.line.id, MONDAY)
    assert staff.operators == 1
