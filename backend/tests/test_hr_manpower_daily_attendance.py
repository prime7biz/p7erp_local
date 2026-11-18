"""Phase 4: daily attendance report.

Run: docker compose exec backend pytest tests/test_hr_manpower_daily_attendance.py -q
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
        permissions={"hr.access": True, "hr.manpower.read": True},
    )
    tenant.feature_flags = {**(tenant.feature_flags or {}), "manpower_control_v1": True}
    dept = Department(tenant_id=tenant.id, code=f"D{uuid.uuid4().hex[:6]}", name="Cutting", is_active=True)
    desig = Designation(tenant_id=tenant.id, code=f"G{uuid.uuid4().hex[:6]}", title="Cutter", is_active=True)
    db.add_all([dept, desig])
    await db.flush()
    await db.commit()
    return tenant, user, dept, desig


@pytest.mark.asyncio
async def test_daily_attendance_by_department_and_category(db_session_integration):
    db = db_session_integration
    tenant, user, dept, desig = await _setup(db)
    today = date.today()
    a = Employee(
        tenant_id=tenant.id,
        employee_code=f"A{uuid.uuid4().hex[:6]}",
        first_name="Ann",
        department_id=dept.id,
        designation_id=desig.id,
        employee_category="WORKER",
        is_active=True,
    )
    b = Employee(
        tenant_id=tenant.id,
        employee_code=f"B{uuid.uuid4().hex[:6]}",
        first_name="Bob",
        department_id=dept.id,
        designation_id=desig.id,
        employee_category=None,
        is_active=True,
    )
    db.add_all([a, b])
    await db.flush()
    db.add(
        AttendanceEntry(
            tenant_id=tenant.id,
            employee_id=a.id,
            attendance_date=today,
            status="LATE",
            source="MANUAL",
        )
    )
    await db.commit()

    async with api_client(db, tenant, user) as c:
        r = await c.get(
            f"{MP}/daily-attendance",
            params={"date": today.isoformat(), "group_by": "department"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["date"] == today.isoformat()
        row = next(x for x in body["rows"] if x["group_key"] == "Cutting")
        assert row["standing"] == 2
        assert row["late"] == 1
        assert row["not_marked"] == 1

        cat = await c.get(
            f"{MP}/daily-attendance",
            params={"date": today.isoformat(), "group_by": "category"},
        )
        assert cat.status_code == 200, cat.text
        keys = {x["group_key"] for x in cat.json()["rows"]}
        assert "WORKER" in keys
        assert "Unmapped" in keys


@pytest.mark.asyncio
async def test_daily_attendance_tenant_isolation(db_session_integration):
    db = db_session_integration
    tenant_a, user_a, dept_a, desig_a = await _setup(db)
    tenant_b, _, dept_b, desig_b = await _setup(db)
    db.add(
        Employee(
            tenant_id=tenant_b.id,
            employee_code=f"X{uuid.uuid4().hex[:6]}",
            first_name="Other",
            department_id=dept_b.id,
            designation_id=desig_b.id,
            is_active=True,
        )
    )
    await db.commit()

    async with api_client(db, tenant_a, user_a) as c:
        r = await c.get(f"{MP}/daily-attendance", params={"group_by": "department"})
        assert r.status_code == 200
        assert r.json()["totals"]["standing"] == 0
