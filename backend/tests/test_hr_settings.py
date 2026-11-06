"""HR settings (weekend days + overtime from salary) stored in tenants.feature_flags.

Run: docker exec <backend> pytest tests/test_hr_settings.py -q
"""

from __future__ import annotations

from contextlib import asynccontextmanager

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.permissions import PERMISSION_HR_ATTENDANCE_MANAGE, PERMISSION_HR_PAYROLL_MANAGE
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.modules.hr_leave.leave_days import load_weekend_weekdays
from tests.merch_fixtures import create_merch_tenant_with_user

URL = "/api/v1/hr/settings"


@asynccontextmanager
async def _client(db, tenant, user):
    async def o_db():
        yield db

    app.dependency_overrides[get_db] = o_db
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[require_tenant] = lambda: tenant
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            ac.headers["X-Tenant-Id"] = str(tenant.id)
            yield ac
    finally:
        for dep in (get_db, get_current_user, require_tenant):
            app.dependency_overrides.pop(dep, None)


@pytest.mark.asyncio
async def test_defaults_and_read_only_user(db_session_integration):
    db = db_session_integration
    tenant, clerk, _role = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    await db.commit()
    async with _client(db, tenant, clerk) as c:
        r = await c.get(URL)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["weekend_days"] == ["friday"] and body["weekend_days_is_default"] is True
        assert body["ot_from_salary_enabled"] is False
        assert body["ot_hours_per_month"] == 208 and body["ot_multiplier"] == 2
        assert body["can_edit_weekend"] is False and body["can_edit_overtime"] is False
        assert (await c.put(URL, json={"weekend_days": ["saturday"]})).status_code == 403
        assert (await c.put(URL, json={"ot_multiplier": 1.5})).status_code == 403


@pytest.mark.asyncio
async def test_weekend_days_saved_without_touching_other_flags(db_session_integration):
    db = db_session_integration
    tenant, user, _role = await create_merch_tenant_with_user(
        db, permissions={"hr.access": True, PERMISSION_HR_ATTENDANCE_MANAGE: True}
    )
    tenant.feature_flags = {"payroll_lop_enabled": False, "vat_bin": "123456789"}
    await db.commit()
    async with _client(db, tenant, user) as c:
        for bad in ([], ["funday"], ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]):
            assert (await c.put(URL, json={"weekend_days": bad})).status_code == 400, bad
        r = await c.put(URL, json={"weekend_days": ["Saturday", " friday "]})
        assert r.status_code == 200, r.text
        assert r.json()["weekend_days"] == ["friday", "saturday"]
        assert r.json()["weekend_days_is_default"] is False
        assert r.json()["can_edit_weekend"] is True and r.json()["can_edit_overtime"] is False
        # Overtime settings need the payroll permission.
        assert (await c.put(URL, json={"ot_from_salary_enabled": True})).status_code == 403
    await db.refresh(tenant)
    assert tenant.feature_flags["hr_weekend_days"] == ["friday", "saturday"]
    assert tenant.feature_flags["payroll_lop_enabled"] is False
    assert tenant.feature_flags["vat_bin"] == "123456789"
    assert "payroll_ot_from_salary_enabled" not in tenant.feature_flags
    assert await load_weekend_weekdays(db, tenant) == {4, 5}


@pytest.mark.asyncio
async def test_overtime_settings_validation_and_save(db_session_integration):
    db = db_session_integration
    tenant, user, _role = await create_merch_tenant_with_user(
        db, permissions={"hr.access": True, PERMISSION_HR_PAYROLL_MANAGE: True}
    )
    await db.commit()
    async with _client(db, tenant, user) as c:
        assert (await c.put(URL, json={"ot_hours_per_month": 10})).status_code == 400
        assert (await c.put(URL, json={"ot_hours_per_month": 1000})).status_code == 400
        assert (await c.put(URL, json={"ot_multiplier": 0})).status_code == 400
        assert (await c.put(URL, json={"ot_multiplier": 6})).status_code == 400
        assert (await c.put(URL, json={"weekend_days": ["saturday"]})).status_code == 403
        r = await c.put(URL, json={"ot_from_salary_enabled": True, "ot_hours_per_month": 200, "ot_multiplier": 1.5})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ot_from_salary_enabled"] is True
        assert body["ot_hours_per_month"] == 200 and body["ot_multiplier"] == 1.5
    await db.refresh(tenant)
    assert tenant.feature_flags["payroll_ot_from_salary_enabled"] is True
    assert tenant.feature_flags["hr_ot_hours_per_month"] == 200
    assert tenant.feature_flags["hr_ot_multiplier"] == 1.5


@pytest.mark.asyncio
async def test_manager_role_can_edit_everything(db_session_integration):
    db = db_session_integration
    tenant, manager, role = await create_merch_tenant_with_user(db, permissions={})
    role.name = "manager"
    await db.commit()
    async with _client(db, tenant, manager) as c:
        r = await c.put(URL, json={"weekend_days": ["friday"], "ot_from_salary_enabled": False})
        assert r.status_code == 200, r.text
        assert r.json()["can_edit_weekend"] is True and r.json()["can_edit_overtime"] is True
