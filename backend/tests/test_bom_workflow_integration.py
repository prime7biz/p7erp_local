"""Legacy BOM workflow: submit transition and tenant isolation on order-boms detail.

Run: docker compose exec backend pytest tests/test_bom_workflow_integration.py -q
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app

from tests.merch_fixtures import (
    create_customer,
    create_garment_style,
    create_legacy_bom,
    create_merch_tenant_with_user,
)


@pytest.mark.asyncio
async def test_legacy_bom_submit_transitions_to_submitted(db_session_integration):
    db = db_session_integration
    t, u, _ = await create_merch_tenant_with_user(db)
    c = await create_customer(db, t)
    s = await create_garment_style(db, t, c)
    bom = await create_legacy_bom(db, t, s, customer=c, status="DRAFT")
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
            r = await ac.post(
                f"/api/v1/merch/boms/{bom.id}/submit",
                headers={"X-Tenant-Id": str(t.id)},
            )
        assert r.status_code == 200, r.text
        body = r.json()
        assert (body.get("status") or "").upper() == "SUBMITTED"
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)


@pytest.mark.asyncio
async def test_order_bom_detail_cross_tenant_404(db_session_integration):
    db = db_session_integration
    t_a, _, _ = await create_merch_tenant_with_user(db)
    c_a = await create_customer(db, t_a)
    s_a = await create_garment_style(db, t_a, c_a)
    bom_a = await create_legacy_bom(db, t_a, s_a, customer=c_a)
    t_b, u_b, _ = await create_merch_tenant_with_user(db)
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
                f"/api/v1/merch/order-boms/{bom_a.id}/detail",
                headers={"X-Tenant-Id": str(t_b.id)},
            )
        assert r.status_code == 404, r.text
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)
