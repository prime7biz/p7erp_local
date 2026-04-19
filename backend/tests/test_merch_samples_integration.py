"""Merchandising sample requests API (Phase 6)."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app

from tests.merch_fixtures import create_customer, create_garment_style, create_merch_tenant_with_user


@pytest.mark.asyncio
async def test_create_list_sample_request(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db)
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    await db.commit()

    async def override_db():
        yield db

    async def override_user():
        return user

    async def override_tenant():
        return tenant

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            c = await ac.post(
                "/api/v1/merch/samples",
                headers={"X-Tenant-Id": str(tenant.id)},
                json={"style_id": style.id, "sample_type": "proto", "remarks": "First proto"},
            )
            assert c.status_code == 201, c.text
            body = c.json()
            assert body["style_id"] == style.id
            assert body["status"] == "requested"
            assert body["sample_code"].startswith("SMP-")

            lst = await ac.get(
                "/api/v1/merch/samples",
                headers={"X-Tenant-Id": str(tenant.id)},
            )
            assert lst.status_code == 200
            rows = lst.json()
            assert len(rows) >= 1
            assert "style_code" in rows[0]
            assert "sample_subtype" in rows[0] or rows[0].get("sample_subtype") is None

            by_type = await ac.get(
                f"/api/v1/merch/samples?sample_type=proto",
                headers={"X-Tenant-Id": str(tenant.id)},
            )
            assert by_type.status_code == 200

            sid = rows[0]["id"]
            m = await ac.get(
                f"/api/v1/merch/samples/{sid}/metrics",
                headers={"X-Tenant-Id": str(tenant.id)},
            )
            assert m.status_code == 200
            mj = m.json()
            assert "task_count" in mj
            assert "total_cost_amount" in mj
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)


@pytest.mark.asyncio
async def test_sample_cross_tenant_404(db_session_integration):
    db = db_session_integration
    tenant_a, user_a, _ = await create_merch_tenant_with_user(db)
    customer_a = await create_customer(db, tenant_a)
    style_a = await create_garment_style(db, tenant_a, customer_a)
    await db.commit()

    tenant_b, user_b, _ = await create_merch_tenant_with_user(db)
    await db.commit()

    async def override_db():
        yield db

    async def override_user():
        return user_a

    async def override_tenant():
        return tenant_a

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant
    sample_id = 0
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            c = await ac.post(
                "/api/v1/merch/samples",
                headers={"X-Tenant-Id": str(tenant_a.id)},
                json={"style_id": style_a.id, "sample_type": "fit"},
            )
            assert c.status_code == 201
            sample_id = c.json()["id"]
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)

    async def override_db_b():
        yield db

    async def override_user_b():
        return user_b

    async def override_tenant_b():
        return tenant_b

    app.dependency_overrides[get_db] = override_db_b
    app.dependency_overrides[get_current_user] = override_user_b
    app.dependency_overrides[require_tenant] = override_tenant_b
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.get(
                f"/api/v1/merch/samples/{sample_id}",
                headers={"X-Tenant-Id": str(tenant_b.id)},
            )
            assert r.status_code == 404
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)
