"""Factory-type workflow verification (engineering proxies per factory profile)."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models.tenant import TenantType

from tests.go_live_fixtures import create_admin_tenant_with_user
from tests.merch_fixtures import create_customer, create_garment_style, create_quotation_and_order


def _override_app(db, user, tenant):
    async def override_db():
        yield db

    async def override_user():
        return user

    async def override_tenant():
        return tenant

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant


@pytest.mark.asyncio
async def test_apply_knit_factory_profile_updates_units_and_flags(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_admin_tenant_with_user(db)
    _override_app(db, user, tenant)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.put(
                "/api/v1/production/settings",
                headers={"X-Tenant-Id": str(tenant.id)},
                json={"factory_profile": "knit"},
            )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["factory_profile"] == "knit"
        assert "knitting" in body["enabled_optional_units"]
        assert "dyeing" in body["enabled_optional_units"]
        await db.refresh(tenant)
        assert tenant.feature_flags.get("knitting_enabled") is True
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "tenant_type",
    [
        TenantType.manufacturer,
        TenantType.buying_house,
        TenantType.both,
    ],
)
async def test_merch_chain_customer_to_order_by_tenant_type(db_session_integration, tenant_type):
    db = db_session_integration
    tenant, user, _ = await create_admin_tenant_with_user(db, tenant_type=tenant_type)
    cust = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant)
    _quo, order = await create_quotation_and_order(db, tenant, cust, style)
    await db.commit()

    _override_app(db, user, tenant)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.get(f"/api/v1/orders/{order.id}", headers={"X-Tenant-Id": str(tenant.id)})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["id"] == order.id
        assert body.get("customer_id") == cust.id
    finally:
        app.dependency_overrides.clear()
