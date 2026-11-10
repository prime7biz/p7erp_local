"""GET /hr/employees/lookup: code + name for list tables, own tenant only.

Run: docker compose exec backend pytest tests/test_hr_employee_lookup.py -q
"""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import Employee
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


async def _employee(db, tenant, **kw) -> Employee:
    emp = Employee(tenant_id=tenant.id, employee_code=f"E{uuid.uuid4().hex[:6]}", **kw)
    db.add(emp)
    await db.flush()
    return emp


@pytest.mark.asyncio
async def test_lookup_returns_code_and_name_for_own_tenant_only(db_session_integration):
    db = db_session_integration
    tenant, user, _role = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    other_tenant, _other_user, _ = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    a = await _employee(db, tenant, first_name="Rahima", last_name="Akter", national_id="NID-SECRET")
    b = await _employee(db, tenant, first_name="Karim", last_name=None, is_active=False)
    foreign = await _employee(db, other_tenant, first_name="Other", last_name="Company")
    await db.commit()

    async with _client(db, tenant, user) as c:
        r = await c.get("/api/v1/hr/employees/lookup", params={"ids": f"{a.id},{b.id},{foreign.id},999999999"})
    assert r.status_code == 200, r.text
    rows = {row["id"]: row for row in r.json()}
    # Another tenant's id and an unknown id look the same: simply missing.
    assert set(rows) == {a.id, b.id}
    assert rows[a.id]["full_name"] == "Rahima Akter"
    assert rows[a.id]["employee_code"] == a.employee_code
    assert rows[b.id]["full_name"] == "Karim"
    assert rows[b.id]["is_active"] is False
    # Display fields only: nothing sensitive or pay-related.
    assert set(rows[a.id]) == {"id", "employee_code", "full_name", "department_id", "is_active"}


@pytest.mark.asyncio
async def test_lookup_validates_ids(db_session_integration):
    db = db_session_integration
    tenant, user, _role = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    await db.commit()
    async with _client(db, tenant, user) as c:
        assert (await c.get("/api/v1/hr/employees/lookup", params={"ids": ""})).json() == []
        assert (await c.get("/api/v1/hr/employees/lookup", params={"ids": "1,abc"})).status_code == 422
        # Non-ASCII digits and numbers beyond the integer column give a clean 422, not a 500.
        assert (await c.get("/api/v1/hr/employees/lookup", params={"ids": "\u00b2"})).status_code == 422
        assert (await c.get("/api/v1/hr/employees/lookup", params={"ids": "99999999999999999999"})).status_code == 422
        assert (await c.get("/api/v1/hr/employees/lookup", params={"ids": "0"})).status_code == 422
        too_many = ",".join(str(i) for i in range(1, 502))
        assert (await c.get("/api/v1/hr/employees/lookup", params={"ids": too_many})).status_code == 422
        assert (await c.get("/api/v1/hr/employees/lookup")).status_code == 422


@pytest.mark.asyncio
async def test_lookup_denied_without_hr_access_when_rbac_enforced(db_session_integration):
    db = db_session_integration
    tenant, user, _role = await create_merch_tenant_with_user(db, permissions={"hr.access": False})
    emp = await _employee(db, tenant, first_name="Hidden")
    tenant.feature_flags = {**(tenant.feature_flags or {}), "rbac_enforcement": "enforce"}
    await db.commit()
    async with _client(db, tenant, user) as c:
        r = await c.get("/api/v1/hr/employees/lookup", params={"ids": str(emp.id)})
    assert r.status_code == 403, r.text
