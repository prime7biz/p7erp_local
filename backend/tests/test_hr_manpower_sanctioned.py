"""Phase 1: sanctioned strength, settings, department groups (flag manpower_control_v1).

Run: docker compose exec backend pytest tests/test_hr_manpower_sanctioned.py -q
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from sqlalchemy import select

from app.models import AuditLog
from app.models.hr import Department, Designation, Employee
from app.models.hr_manpower import HrManpowerSanctionedStrength
from tests.bd_hr_fixtures import api_client
from tests.merch_fixtures import create_merch_tenant_with_user

HR = "/api/v1/hr/manpower"
ON = {"manpower_control_v1": True}


async def _setup(db, *, flags: dict | None = None):
    tenant, user, _role = await create_merch_tenant_with_user(
        db, permissions={"hr.access": True, "hr.manpower.manage": True, "hr.manpower.read": True}
    )
    # Admin/manager bypass for manage; role name from fixture is usually admin-like — ensure manager path works.
    tenant.feature_flags = {**(tenant.feature_flags or {}), **(ON if flags is None else flags)}
    dept = Department(tenant_id=tenant.id, code=f"D{uuid.uuid4().hex[:6]}", name="Sewing", is_active=True)
    desig = Designation(
        tenant_id=tenant.id, code=f"G{uuid.uuid4().hex[:6]}", title="Operator", is_active=True
    )
    db.add_all([dept, desig])
    await db.flush()
    desig.department_id = dept.id
    emp = Employee(
        tenant_id=tenant.id,
        employee_code=f"E{uuid.uuid4().hex[:6]}",
        first_name="Karim",
        is_active=True,
        department_id=dept.id,
        designation_id=desig.id,
    )
    db.add(emp)
    await db.commit()
    return tenant, user, dept, desig, emp


@pytest.mark.asyncio
async def test_flag_off_returns_404(db_session_integration):
    db = db_session_integration
    tenant, user, *_ = await _setup(db, flags={})
    async with api_client(db, tenant, user) as c:
        r = await c.get(f"{HR}/sanctioned")
        assert r.status_code == 404


@pytest.mark.asyncio
async def test_upsert_list_present_count_and_seed(db_session_integration):
    db = db_session_integration
    tenant, user, dept, desig, emp = await _setup(db)
    today = date.today().isoformat()

    async with api_client(db, tenant, user) as c:
        put = await c.put(
            f"{HR}/sanctioned",
            json={
                "department_id": dept.id,
                "designation_id": desig.id,
                "approved_quota": 5,
                "effective_from": today,
                "notes": "Line plan",
            },
        )
        assert put.status_code == 200, put.text
        body = put.json()
        assert body["approved_quota"] == 5
        assert body["present_active"] == 1
        assert body["variance"] == -4
        assert body["department_name"] == "Sewing"
        assert body["designation_title"] == "Operator"

        listed = await c.get(f"{HR}/sanctioned")
        assert listed.status_code == 200
        assert len(listed.json()) == 1

        summary = await c.get(f"{HR}/standing-summary")
        assert summary.status_code == 200
        s = summary.json()
        assert s["total_quota"] == 5 and s["total_present"] == 1 and s["cells_under"] == 1

        # Seed skips the existing cell.
        seed = await c.post(f"{HR}/sanctioned/seed-from-current")
        assert seed.status_code == 200, seed.text
        assert seed.json()["created"] == 0
        assert seed.json()["skipped_existing"] == 1

    actions = set(
        (await db.execute(select(AuditLog.action).where(AuditLog.tenant_id == tenant.id))).scalars().all()
    )
    assert "HR_MANPOWER_SANCTIONED_CREATED" in actions
    # emp still present
    assert emp.id is not None


@pytest.mark.asyncio
async def test_cross_tenant_department_rejected(db_session_integration):
    db = db_session_integration
    tenant_a, user_a, dept_a, desig_a, _ = await _setup(db)
    tenant_b, user_b, *_ = await _setup(db)
    today = date.today().isoformat()

    async with api_client(db, tenant_b, user_b) as c:
        r = await c.put(
            f"{HR}/sanctioned",
            json={
                "department_id": dept_a.id,
                "designation_id": desig_a.id,
                "approved_quota": 1,
                "effective_from": today,
            },
        )
        assert r.status_code == 400
        assert "not found" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_overlap_rejected(db_session_integration):
    db = db_session_integration
    tenant, user, dept, desig, _ = await _setup(db)
    today = date.today()
    dept_id, desig_id = dept.id, desig.id

    async with api_client(db, tenant, user) as c:
        first = await c.put(
            f"{HR}/sanctioned",
            json={
                "department_id": dept_id,
                "designation_id": desig_id,
                "approved_quota": 2,
                "effective_from": today.isoformat(),
            },
        )
        assert first.status_code == 200, first.text

        overlap = await c.put(
            f"{HR}/sanctioned",
            json={
                "department_id": dept_id,
                "designation_id": desig_id,
                "approved_quota": 3,
                "effective_from": (today + timedelta(days=10)).isoformat(),
            },
        )
        assert overlap.status_code == 409


@pytest.mark.asyncio
async def test_designation_department_mismatch_rejected(db_session_integration):
    db = db_session_integration
    tenant, user, dept, desig, _ = await _setup(db)
    other_dept = Department(tenant_id=tenant.id, code=f"X{uuid.uuid4().hex[:6]}", name="Cutting", is_active=True)
    db.add(other_dept)
    await db.flush()
    other_dept_id, desig_id = other_dept.id, desig.id
    await db.commit()
    today = date.today().isoformat()

    async with api_client(db, tenant, user) as c:
        mismatch = await c.put(
            f"{HR}/sanctioned",
            json={
                "department_id": other_dept_id,
                "designation_id": desig_id,
                "approved_quota": 1,
                "effective_from": today,
            },
        )
        assert mismatch.status_code == 400
        assert "different department" in mismatch.json()["detail"].lower()


@pytest.mark.asyncio
async def test_settings_and_department_groups(db_session_integration):
    db = db_session_integration
    tenant, user, dept, *_ = await _setup(db)

    async with api_client(db, tenant, user) as c:
        got = await c.get(f"{HR}/settings")
        assert got.status_code == 200
        assert got.json()["allow_unmapped_hire"] is False

        put = await c.put(
            f"{HR}/settings",
            json={
                "targets": {"operator_to_helper": "4:1"},
                "allow_unmapped_hire": False,
            },
        )
        assert put.status_code == 200, put.text
        assert put.json()["targets"]["operator_to_helper"] == "4:1"

        g = await c.put(
            f"{HR}/department-groups",
            json={"department_id": dept.id, "group_key": "SEWING"},
        )
        assert g.status_code == 200, g.text
        assert g.json()["group_key"] == "SEWING"

        listed = await c.get(f"{HR}/department-groups")
        assert listed.status_code == 200
        assert len(listed.json()) == 1


@pytest.mark.asyncio
async def test_seed_creates_from_headcount(db_session_integration):
    db = db_session_integration
    tenant, user, dept, desig, _ = await _setup(db)
    # No sanctioned row yet — seed should create one with quota = 1.
    async with api_client(db, tenant, user) as c:
        seed = await c.post(f"{HR}/sanctioned/seed-from-current")
        assert seed.status_code == 200, seed.text
        assert seed.json()["created"] == 1
        rows = (await c.get(f"{HR}/sanctioned")).json()
        assert len(rows) == 1
        assert rows[0]["approved_quota"] == 1
        assert rows[0]["present_active"] == 1

    count = (
        await db.execute(
            select(HrManpowerSanctionedStrength).where(HrManpowerSanctionedStrength.tenant_id == tenant.id)
        )
    ).scalars().all()
    assert len(count) == 1
