"""Onboarding checklist reflects real tenant data and never counts another tenant's rows."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app

from tests.go_live_fixtures import create_admin_tenant_with_user
from tests.merch_fixtures import create_customer


@pytest.mark.asyncio
async def test_onboarding_checklist_counts_only_own_tenant(db_session_integration):
    db = db_session_integration
    t_new, u_new, _ = await create_admin_tenant_with_user(db)
    t_busy, _u_busy, _ = await create_admin_tenant_with_user(db)
    await create_customer(db, t_busy)
    await create_customer(db, t_new)
    await db.commit()

    async def override_db():
        yield db

    async def override_user():
        return u_new

    async def override_tenant():
        return t_new

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.get("/api/v1/onboarding/checklist")
            assert r.status_code == 200, r.text
            steps = {s["key"]: s["done"] for s in r.json()["steps"]}
            assert steps["customer"] is True
            # A single admin user is not yet a "team".
            assert steps["team"] is False
            assert steps["order"] is False and steps["voucher"] is False
            assert r.json()["completed"] == sum(steps.values())
            assert all(s["href"].startswith("/app/") for s in r.json()["steps"])
    finally:
        app.dependency_overrides.clear()
