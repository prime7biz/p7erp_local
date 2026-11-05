"""Pay-affecting HR writes need a manager-type role or an explicit permission grant (fail-closed).

Run: docker compose exec backend pytest tests/test_hr_pay_setup_authz.py -q
"""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from datetime import date, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from app.common.auth import get_current_user
from app.common.permissions import (
    PERMISSION_HR_ATTENDANCE_MANAGE,
    PERMISSION_HR_LEAVE_TYPES_MANAGE,
    PERMISSION_HR_PAYROLL_MANAGE,
)
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import AttendanceEntry, Employee, LeaveType, PayrollComponent, PayrollPeriod
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


def _component_body() -> dict:
    return {"code": f"C{uuid.uuid4().hex[:6]}", "name": "Allowance", "default_amount": "100"}


@pytest.mark.asyncio
async def test_pay_setup_denied_without_grant_allowed_with_grant(db_session_integration):
    db = db_session_integration
    tenant, clerk, _ = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    _t, granted_user, _ = await create_merch_tenant_with_user(db, permissions={PERMISSION_HR_PAYROLL_MANAGE: True})
    granted_tenant = _t
    await db.commit()

    async with _client(db, tenant, clerk) as c:
        r = await c.post("/api/v1/hr/payroll/components", json=_component_body())
        assert r.status_code == 403, r.text
        r = await c.post(
            "/api/v1/hr/payroll/periods",
            json={
                "period_code": f"P{uuid.uuid4().hex[:5]}",
                "start_date": date.today().isoformat(),
                "end_date": date.today().isoformat(),
                "payment_date": date.today().isoformat(),
            },
        )
        assert r.status_code == 403, r.text
    assert await _count(db, PayrollComponent, PayrollComponent.tenant_id == tenant.id) == 0
    assert await _count(db, PayrollPeriod, PayrollPeriod.tenant_id == tenant.id) == 0

    async with _client(db, granted_tenant, granted_user) as c:
        r = await c.post("/api/v1/hr/payroll/components", json=_component_body())
        assert r.status_code == 201, r.text


@pytest.mark.asyncio
async def test_manager_role_keeps_pay_setup_access(db_session_integration):
    db = db_session_integration
    tenant, manager, role = await create_merch_tenant_with_user(db, permissions={})
    role.name = "manager"
    await db.commit()
    async with _client(db, tenant, manager) as c:
        r = await c.post("/api/v1/hr/payroll/components", json=_component_body())
        assert r.status_code == 201, r.text


@pytest.mark.asyncio
async def test_leave_type_change_requires_grant(db_session_integration):
    db = db_session_integration
    tenant, clerk, _ = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    g_tenant, g_user, _ = await create_merch_tenant_with_user(db, permissions={PERMISSION_HR_LEAVE_TYPES_MANAGE: True})
    await db.commit()
    body = {"code": f"L{uuid.uuid4().hex[:5]}", "name": "No approval", "requires_approval": False}
    async with _client(db, tenant, clerk) as c:
        r = await c.post("/api/v1/hr/leave/types", json=body)
        assert r.status_code == 403, r.text
    assert await _count(db, LeaveType, LeaveType.tenant_id == tenant.id) == 0
    async with _client(db, g_tenant, g_user) as c:
        r = await c.post("/api/v1/hr/leave/types", json=body)
        assert r.status_code == 201, r.text


@pytest.mark.asyncio
async def test_attendance_edit_requires_grant_and_open_period(db_session_integration):
    db = db_session_integration
    tenant, clerk, role = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    emp = Employee(tenant_id=tenant.id, employee_code=f"E{uuid.uuid4().hex[:6]}", first_name="Worker")
    db.add(emp)
    await db.flush()
    open_day = date.today()
    locked_day = date.today() - timedelta(days=60)
    entry_open = AttendanceEntry(tenant_id=tenant.id, employee_id=emp.id, attendance_date=open_day, status="PRESENT")
    entry_locked = AttendanceEntry(tenant_id=tenant.id, employee_id=emp.id, attendance_date=locked_day, status="PRESENT")
    db.add_all([entry_open, entry_locked])
    db.add(
        PayrollPeriod(
            tenant_id=tenant.id,
            period_code=f"LK{uuid.uuid4().hex[:5]}",
            start_date=locked_day - timedelta(days=1),
            end_date=locked_day + timedelta(days=1),
            payment_date=locked_day + timedelta(days=2),
            status="FINALIZED",
            is_locked=True,
        )
    )
    await db.commit()

    async with _client(db, tenant, clerk) as c:
        r = await c.patch(f"/api/v1/hr/attendance/entries/{entry_open.id}", json={"status": "ABSENT"})
        assert r.status_code == 403, r.text
    await db.refresh(entry_open)
    assert entry_open.status == "PRESENT"

    role.permissions = {"hr.access": True, PERMISSION_HR_ATTENDANCE_MANAGE: True}
    await db.commit()
    async with _client(db, tenant, clerk) as c:
        r = await c.patch(f"/api/v1/hr/attendance/entries/{entry_locked.id}", json={"status": "ABSENT"})
        assert r.status_code == 400, r.text
        r = await c.patch(f"/api/v1/hr/attendance/entries/{entry_open.id}", json={"status": "ABSENT"})
        assert r.status_code == 200, r.text
    await db.refresh(entry_locked)
    assert entry_locked.status == "PRESENT"
