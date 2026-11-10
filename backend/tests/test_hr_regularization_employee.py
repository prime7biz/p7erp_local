"""GET /hr/attendance/regularizations includes the entry's employee_id (display only), own tenant only.

Run: docker compose exec backend pytest tests/test_hr_regularization_employee.py -q
"""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import AttendanceEntry, AttendanceRegularizationRequest, Employee
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


async def _regularization(db, tenant, user, reason: str) -> tuple[Employee, AttendanceRegularizationRequest]:
    emp = Employee(tenant_id=tenant.id, employee_code=f"E{uuid.uuid4().hex[:6]}", first_name="Worker")
    db.add(emp)
    await db.flush()
    entry = AttendanceEntry(tenant_id=tenant.id, employee_id=emp.id, attendance_date=date(2026, 11, 3), created_by=user.id)
    db.add(entry)
    await db.flush()
    req = AttendanceRegularizationRequest(tenant_id=tenant.id, attendance_entry_id=entry.id, reason=reason, requested_by=user.id)
    db.add(req)
    await db.flush()
    return emp, req


@pytest.mark.asyncio
async def test_list_regularizations_includes_employee_and_stays_in_tenant(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    other_tenant, other_user, _ = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    emp, mine = await _regularization(db, tenant, user, "Forgot to punch out")
    _, foreign = await _regularization(db, other_tenant, other_user, "Other company")
    await db.commit()

    async with _client(db, tenant, user) as c:
        r = await c.get("/api/v1/hr/attendance/regularizations")
    assert r.status_code == 200, r.text
    rows = {row["id"]: row for row in r.json()}
    assert mine.id in rows and foreign.id not in rows
    assert rows[mine.id]["employee_id"] == emp.id
    # Existing keys are unchanged.
    assert {"attendance_entry_id", "reason", "status", "requested_by", "decision_note"} <= set(rows[mine.id])
