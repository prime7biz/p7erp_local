"""Customer module wiring: tenant isolation on related-records API.

Run: docker compose exec backend pytest tests/test_customer_module_wiring_integration.py -v
"""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import Customer, Tenant, User
from app.models.tenant import TenantType
from app.models.user import Role


async def _seed_tenant_customer(db):
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"CustWire {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"cw{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"cw{slug}",
        email=f"cw{slug}@e.com",
        password_hash="x",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    customer = Customer(
        tenant_id=tenant.id,
        customer_code=f"CW{slug}"[:12],
        name="Wire Test Co",
        status="active",
    )
    db.add(customer)
    await db.flush()
    return tenant, user, customer


@pytest.mark.asyncio
async def test_customer_related_not_visible_cross_tenant(db_session_integration):
    """Another tenant's customer id must not expose related payload."""
    db = db_session_integration
    t_a, _, c_a = await _seed_tenant_customer(db)
    t_b, u_b, _ = await _seed_tenant_customer(db)
    await db.commit()

    async def override_db():
        yield db

    async def override_user():
        return u_b

    async def override_tenant():
        return t_b

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.get(
                f"/api/v1/customers/{c_a.id}/related",
                headers={"X-Tenant-Id": str(t_b.id)},
            )
        assert r.status_code == 404, r.text
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)


@pytest.mark.asyncio
async def test_customer_related_ok_same_tenant(db_session_integration):
    db = db_session_integration
    t, u, c = await _seed_tenant_customer(db)
    await db.commit()

    async def override_db():
        yield db

    async def override_user():
        return u

    async def override_tenant():
        return t

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.get(
                f"/api/v1/customers/{c.id}/related",
                headers={"X-Tenant-Id": str(t.id)},
            )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "orders" in data and "inquiries" in data and "quotations" in data
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)
