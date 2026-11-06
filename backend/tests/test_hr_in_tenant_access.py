"""HR pay data, attendance and other people's leave need HR rights; self-service leave keeps working.

Run: docker compose exec backend pytest tests/test_hr_in_tenant_access.py -q
"""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from datetime import date, time, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from app.common.auth import get_current_user
from app.common.permissions import PERMISSION_HR_ATTENDANCE_MANAGE, PERMISSION_HR_PAYROLL_MANAGE
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import AttendanceShift, Employee, LeaveRequest, LeaveType, PayrollPeriod, PayrollRun, User
from app.models.compliance import PayrollStatutorySummary
from tests.merch_fixtures import create_merch_tenant_with_user


@asynccontextmanager
async def _client(db, tenant, user):
    async def o_db():
        yield db

    async def o_user():
        return user

    async def o_tenant():
        return tenant

    app.dependency_overrides[get_db] = o_db
    app.dependency_overrides[get_current_user] = o_user
    app.dependency_overrides[require_tenant] = o_tenant
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            ac.headers["X-Tenant-Id"] = str(tenant.id)
            yield ac
    finally:
        for dep in (get_db, get_current_user, require_tenant):
            app.dependency_overrides.pop(dep, None)


async def _count(db, model, *where) -> int:
    return int((await db.execute(select(func.count()).select_from(model).where(*where))).scalar() or 0)


async def _employee(db, tenant, **kw) -> Employee:
    emp = Employee(tenant_id=tenant.id, employee_code=f"E{uuid.uuid4().hex[:6]}", first_name="Worker", **kw)
    db.add(emp)
    await db.flush()
    return emp


async def _second_user(db, tenant, role) -> User:
    slug = uuid.uuid4().hex[:8]
    u = User(
        tenant_id=tenant.id, role_id=role.id, username=f"u2{slug}", email=f"u2{slug}@example.com",
        password_hash="unused", is_active=True,
    )
    db.add(u)
    await db.flush()
    return u


@pytest.mark.asyncio
async def test_pay_data_reads_require_payroll_grant(db_session_integration):
    db = db_session_integration
    tenant, clerk, role = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    await db.commit()
    async with _client(db, tenant, clerk) as c:
        for path in ("/api/v1/hr/payroll/runs/999999/lines", "/api/v1/hr/payroll/assignments", "/api/v1/hr/payroll/advances"):
            r = await c.get(path)
            assert r.status_code == 403, (path, r.text)
    role.permissions = {"hr.access": True, PERMISSION_HR_PAYROLL_MANAGE: True}
    await db.commit()
    async with _client(db, tenant, clerk) as c:
        assert (await c.get("/api/v1/hr/payroll/runs/999999/lines")).status_code == 404
        assert (await c.get("/api/v1/hr/payroll/assignments")).status_code == 200
        assert (await c.get("/api/v1/hr/payroll/advances")).status_code == 200


@pytest.mark.asyncio
async def test_employee_login_link_change_requires_grant(db_session_integration):
    db = db_session_integration
    tenant, clerk, role = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    other = await _second_user(db, tenant, role)
    emp = await _employee(db, tenant)
    await db.commit()
    async with _client(db, tenant, clerk) as c:
        r = await c.patch(f"/api/v1/hr/employees/{emp.id}", json={"user_id": other.id})
        assert r.status_code == 403, r.text
        # Re-sending the unchanged link with other edits is still allowed.
        r = await c.patch(f"/api/v1/hr/employees/{emp.id}", json={"user_id": None, "phone": "123"})
        assert r.status_code == 200, r.text
    await db.refresh(emp)
    assert emp.user_id is None and emp.phone == "123"
    role.name = "manager"
    await db.commit()
    async with _client(db, tenant, clerk) as c:
        r = await c.patch(f"/api/v1/hr/employees/{emp.id}", json={"user_id": other.id})
        assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_employee_sensitive_fields_masked_for_non_hr_users(db_session_integration):
    db = db_session_integration
    tenant, staff, role = await create_merch_tenant_with_user(db, permissions={"production.access": True})
    emp = await _employee(db, tenant, national_id="NID-1", address_line="Road 1", date_of_birth=date(1990, 1, 1))
    await db.commit()
    async with _client(db, tenant, staff) as c:
        rows = (await c.get("/api/v1/hr/employees")).json()
        mine = next(x for x in rows if x["id"] == emp.id)
        assert mine["national_id"] is None and mine["address_line"] is None and mine["date_of_birth"] is None
        assert mine["first_name"] == "Worker"
        # A masked form resubmitted by this user must not wipe stored values.
        r = await c.patch(f"/api/v1/hr/employees/{emp.id}", json={"national_id": None, "phone": "9"})
        assert r.status_code == 200, r.text
    await db.refresh(emp)
    assert emp.national_id == "NID-1"
    role.permissions = {"hr.access": True}
    await db.commit()
    async with _client(db, tenant, staff) as c:
        r = await c.get(f"/api/v1/hr/employees/{emp.id}")
        assert r.json()["national_id"] == "NID-1"


@pytest.mark.asyncio
async def test_leave_for_others_requires_grant_self_service_allowed(db_session_integration):
    db = db_session_integration
    tenant, clerk, role = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    me = await _employee(db, tenant, user_id=clerk.id)
    colleague = await _employee(db, tenant)
    lt = LeaveType(tenant_id=tenant.id, code=f"L{uuid.uuid4().hex[:5]}", name="Casual")
    db.add(lt)
    await db.commit()
    today = date(2026, 10, 6)  # a Tuesday: a weekend-only request would be refused as 0 leave days
    base = {"leave_type_id": lt.id, "from_date": today.isoformat(), "to_date": today.isoformat(), "days_requested": "1"}
    async with _client(db, tenant, clerk) as c:
        r = await c.post("/api/v1/hr/leave/requests", json={**base, "employee_id": colleague.id})
        assert r.status_code == 403, r.text
        assert await _count(db, LeaveRequest, LeaveRequest.employee_id == colleague.id) == 0
        r = await c.post(
            "/api/v1/hr/leave/requests",
            json={**base, "employee_id": me.id, "to_date": (today - timedelta(days=1)).isoformat()},
        )
        assert r.status_code == 400, r.text
        r = await c.post("/api/v1/hr/leave/requests", json={**base, "employee_id": me.id})
        assert r.status_code == 201, r.text
        req_id = r.json()["id"]
        r = await c.patch(
            f"/api/v1/hr/leave/requests/{req_id}", json={"to_date": (today - timedelta(days=3)).isoformat()}
        )
        assert r.status_code == 400, r.text

    role.permissions = {"hr.access": True, PERMISSION_HR_ATTENDANCE_MANAGE: True}
    await db.commit()
    async with _client(db, tenant, clerk) as c:
        r = await c.post("/api/v1/hr/leave/requests", json={**base, "employee_id": colleague.id})
        assert r.status_code == 201, r.text


@pytest.mark.asyncio
async def test_attendance_writes_require_grant(db_session_integration):
    db = db_session_integration
    tenant, clerk, role = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    emp = await _employee(db, tenant)
    shift = AttendanceShift(tenant_id=tenant.id, code=f"S{uuid.uuid4().hex[:5]}", name="Day", start_time=time(8), end_time=time(17))
    db.add(shift)
    await db.commit()
    today = date.today().isoformat()
    calls = [
        ("/api/v1/hr/attendance/entries", {"employee_id": emp.id, "attendance_date": today}),
        ("/api/v1/hr/attendance/overtime", {"employee_id": emp.id, "work_date": today, "ot_hours": "2"}),
        ("/api/v1/hr/attendance/rosters", {"employee_id": emp.id, "roster_date": today, "shift_id": shift.id}),
    ]
    async with _client(db, tenant, clerk) as c:
        for path, body in calls:
            r = await c.post(path, json=body)
            assert r.status_code == 403, (path, r.text)
    role.permissions = {"hr.access": True, PERMISSION_HR_ATTENDANCE_MANAGE: True}
    await db.commit()
    async with _client(db, tenant, clerk) as c:
        for path, body in (calls[0], calls[2]):
            r = await c.post(path, json=body)
            assert r.status_code == 201, (path, r.text)


@pytest.mark.asyncio
async def test_statutory_persist_requires_grant_and_own_run(db_session_integration):
    db = db_session_integration
    t_a, _u_a, _ = await create_merch_tenant_with_user(db)
    tenant, clerk, role = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    period_a = PayrollPeriod(
        tenant_id=t_a.id, period_code=f"P{uuid.uuid4().hex[:5]}", start_date=date.today(), end_date=date.today(),
        payment_date=date.today(),
    )
    db.add(period_a)
    await db.flush()
    run_a = PayrollRun(tenant_id=t_a.id, period_id=period_a.id, run_code=f"R{uuid.uuid4().hex[:5]}", run_date=date.today())
    db.add(run_a)
    await db.commit()
    body = {"gross_pay": "1000", "period_year": 2026, "period_month": 1, "persist": True}
    async with _client(db, tenant, clerk) as c:
        r = await c.post("/api/v1/compliance/payroll/statutory-calculate", json={**body, "persist": False})
        assert r.status_code == 200, r.text
        r = await c.post("/api/v1/compliance/payroll/statutory-calculate", json=body)
        assert r.status_code == 403, r.text
    role.name = "manager"
    await db.commit()
    async with _client(db, tenant, clerk) as c:
        r = await c.post("/api/v1/compliance/payroll/statutory-calculate", json={**body, "payroll_run_id": run_a.id})
        assert r.status_code == 400, r.text
    assert await _count(db, PayrollStatutorySummary, PayrollStatutorySummary.tenant_id == tenant.id) == 0
