"""Overtime rules / entries API returns 2xx with numeric fields serialized as strings.

Run: docker compose exec backend pytest tests/test_hr_overtime_api.py -q
"""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from datetime import date
from decimal import Decimal

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


@pytest.mark.asyncio
async def test_overtime_rule_and_entry_create_return_serialized_body(db_session_integration):
    db = db_session_integration
    tenant, manager, role = await create_merch_tenant_with_user(db, permissions={})
    role.name = "manager"
    emp = Employee(tenant_id=tenant.id, employee_code=f"E{uuid.uuid4().hex[:6]}", first_name="Worker")
    db.add(emp)
    await db.commit()

    async with _client(db, tenant, manager) as c:
        r = await c.post(
            "/api/v1/hr/attendance/overtime-rules",
            json={"code": f"OT{uuid.uuid4().hex[:5]}", "name": "Standard OT", "max_ot_hours_per_day": "4"},
        )
        assert r.status_code == 201, r.text
        rule = r.json()
        assert Decimal(rule["weekday_multiplier"]) == Decimal("1.5")
        assert Decimal(rule["max_ot_hours_per_day"]) == Decimal("4")

        work_day = date.today()
        r = await c.post(
            "/api/v1/hr/attendance/overtime",
            json={
                "employee_id": emp.id,
                "work_date": work_day.isoformat(),
                "ot_hours": "2.5",
                "ot_type": "WEEKDAY",
                "rate_multiplier": "1.5",
                "rule_id": rule["id"],
                "remarks": " late shipment ",
            },
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["employee_id"] == emp.id
        assert body["tenant_id"] == tenant.id
        assert body["work_date"] == work_day.isoformat()
        assert isinstance(body["ot_hours"], str) and Decimal(body["ot_hours"]) == Decimal("2.5")
        assert isinstance(body["rate_multiplier"], str) and Decimal(body["rate_multiplier"]) == Decimal("1.5")
        assert body["amount"] is None
        assert body["rule_id"] == rule["id"]
        assert body["status"] == "PENDING"
        assert body["remarks"] == "late shipment"

        r = await c.get("/api/v1/hr/attendance/overtime")
        assert r.status_code == 200, r.text
        assert any(e["id"] == body["id"] for e in r.json())

        r = await c.post(f"/api/v1/hr/attendance/overtime/{body['id']}/approve")
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "APPROVED"
        assert r.json()["approved_at"]

        r = await c.post(
            "/api/v1/hr/attendance/overtime",
            json={"employee_id": emp.id, "work_date": work_day.isoformat(), "ot_hours": "abc"},
        )
        assert r.status_code == 400, r.text
