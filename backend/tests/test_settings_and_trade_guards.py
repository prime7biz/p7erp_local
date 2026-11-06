"""Production factory profile / AI config need an admin; trade case status only moves via /transition.

Run: docker compose exec backend pytest tests/test_settings_and_trade_guards.py -q
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
from app.models import TradeCase
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
async def test_production_settings_admin_only_for_profile_and_ai(db_session_integration):
    db = db_session_integration
    tenant, user, role = await create_merch_tenant_with_user(db)
    await db.commit()
    async with _client(db, tenant, user) as c:
        r = await c.put("/api/v1/production/settings", json={"ai_provider_config": {"enabled": True}})
        assert r.status_code == 403, r.text
        r = await c.put("/api/v1/production/settings", json={"factory_profile": "unknown-profile"})
        assert r.status_code == 403, r.text
        r = await c.put("/api/v1/production/settings", json={"cm_alert_threshold_pct": 12})
        assert r.status_code == 200, r.text
    role.name = "admin"
    await db.commit()
    async with _client(db, tenant, user) as c:
        r = await c.put("/api/v1/production/settings", json={"ai_provider_config": {"enabled": False}})
        assert r.status_code == 200, r.text
        assert r.json()["ai_provider_config"] == {"enabled": False}


@pytest.mark.asyncio
async def test_trade_case_patch_cannot_change_status_or_stage(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db)
    tc = TradeCase(tenant_id=tenant.id, reference=f"TC-{uuid.uuid4().hex[:6]}")
    db.add(tc)
    await db.commit()
    async with _client(db, tenant, user) as c:
        for bad in ({"status": "SETTLED"}, {"current_stage": "SHIPPED"}):
            r = await c.patch(f"/api/v1/trade-cases/{tc.id}", json=bad)
            assert r.status_code == 400, r.text
        r = await c.patch(f"/api/v1/trade-cases/{tc.id}", json={"status": "draft", "currency": "USD"})
        assert r.status_code == 200, r.text
    await db.refresh(tc)
    assert tc.status == "DRAFT" and tc.current_stage == "DRAFT" and tc.currency == "USD"
