"""Phase 4: organogram + attendance bridge.

Run: docker compose exec backend pytest tests/test_hr_manpower_organogram.py -q
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest

from app.models.hr import Department, Designation, Employee
from app.models.hr_attendance import AttendanceEntry
from tests.bd_hr_fixtures import api_client
from tests.merch_fixtures import create_merch_tenant_with_user

MP = "/api/v1/hr/manpower"


async def _setup(db):
    tenant, user, _ = await create_merch_tenant_with_user(
        db,
        permissions={"hr.access": True, "hr.manpower.read": True, "hr.manpower.manage": True},
    )
    tenant.feature_flags = {**(tenant.feature_flags or {}), "manpower_control_v1": True}
    dept = Department(tenant_id=tenant.id, code=f"D{uuid.uuid4().hex[:6]}", name="Sewing", is_active=True)
    desig = Designation(tenant_id=tenant.id, code=f"G{uuid.uuid4().hex[:6]}", title="Operator", is_active=True)
    db.add_all([dept, desig])
    await db.flush()
    desig.department_id = dept.id
    await db.commit()
    return tenant, user, dept, desig


def _emp(tenant_id, dept_id, desig_id, code, first, mgr=None):
    return Employee(
        tenant_id=tenant_id,
        employee_code=code,
        first_name=first,
        department_id=dept_id,
        designation_id=desig_id,
        reporting_manager_id=mgr,
        is_active=True,
    )


@pytest.mark.asyncio
async def test_organogram_tree_and_cross_tenant_manager_excluded(db_session_integration):
    db = db_session_integration
    tenant, user, dept, desig = await _setup(db)
    other, _, _, _ = await _setup(db)

    boss = _emp(tenant.id, dept.id, desig.id, f"E{uuid.uuid4().hex[:6]}", "Boss")
    db.add(boss)
    await db.flush()

    o_dept = Department(tenant_id=other.id, code=f"D{uuid.uuid4().hex[:6]}", name="X", is_active=True)
    o_desig = Designation(tenant_id=other.id, code=f"G{uuid.uuid4().hex[:6]}", title="Y", is_active=True)
    db.add_all([o_dept, o_desig])
    await db.flush()
    foreign = _emp(other.id, o_dept.id, o_desig.id, f"F{uuid.uuid4().hex[:6]}", "Foreign")
    db.add(foreign)
    await db.flush()

    orphan = _emp(tenant.id, dept.id, desig.id, f"E{uuid.uuid4().hex[:6]}", "Orphan", mgr=foreign.id)
    child = _emp(tenant.id, dept.id, desig.id, f"E{uuid.uuid4().hex[:6]}", "Child", mgr=boss.id)
    db.add_all([orphan, child])
    await db.commit()

    async with api_client(db, tenant, user) as c:
        r = await c.get(f"{MP}/organogram", params={"date": date.today().isoformat()})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["date"] == date.today().isoformat()
        root_ids = {n["employee_id"] for n in body["roots"]}
        assert boss.id in root_ids
        assert orphan.id in root_ids
        boss_node = next(n for n in body["roots"] if n["employee_id"] == boss.id)
        assert any(ch["employee_id"] == child.id for ch in boss_node["children"])
        assert foreign.id not in root_ids


@pytest.mark.asyncio
async def test_attendance_bridge_present_today(db_session_integration):
    db = db_session_integration
    tenant, user, dept, desig = await _setup(db)
    e1 = _emp(tenant.id, dept.id, desig.id, f"E{uuid.uuid4().hex[:6]}", "Here")
    e2 = _emp(tenant.id, dept.id, desig.id, f"E{uuid.uuid4().hex[:6]}", "Away")
    db.add_all([e1, e2])
    await db.flush()
    db.add(
        AttendanceEntry(
            tenant_id=tenant.id,
            employee_id=e1.id,
            attendance_date=date.today(),
            status="PRESENT",
            source="MANUAL",
        )
    )
    await db.commit()

    async with api_client(db, tenant, user) as c:
        r = await c.get(f"{MP}/attendance-bridge", params={"date": date.today().isoformat()})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["standing_active"] == 2
        assert body["present_today"] == 1


@pytest.mark.asyncio
async def test_organogram_caps_fields_present(db_session_integration):
    db = db_session_integration
    tenant, user, dept, desig = await _setup(db)
    db.add(_emp(tenant.id, dept.id, desig.id, f"E{uuid.uuid4().hex[:6]}", "Solo"))
    await db.commit()
    async with api_client(db, tenant, user) as c:
        r = await c.get(f"{MP}/organogram")
        assert r.status_code == 200
        body = r.json()
        assert body["max_depth"] >= 1
        assert body["max_nodes"] >= 1
        assert "truncated" in body
