"""Phase 1 Material Control hub: flag gate + read-only action queue / style sheet.

Run: docker compose exec backend pytest tests/test_material_control_hub.py -q
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models.merch import Order

from tests.go_live_fixtures import seed_inventory_chain
from tests.merch_fixtures import create_customer, create_garment_style


async def _api_client(db, tenant, user):
    async def override_db():
        yield db

    async def override_user():
        return user

    async def override_tenant():
        return tenant

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant
    return AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        headers={"X-Tenant-Id": str(tenant.id)},
    )


def _clear():
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(require_tenant, None)


@pytest.mark.asyncio
async def test_material_control_actions_404_when_flag_off(db_session_integration):
    db = db_session_integration
    tenant, user, _wh, _vendor, _item = await seed_inventory_chain(db)
    flags = dict(tenant.feature_flags or {})
    flags.pop("material_control_hub_v1", None)
    tenant.feature_flags = flags
    await db.commit()
    try:
        async with await _api_client(db, tenant, user) as ac:
            res = await ac.get("/api/v1/material-control/actions")
            assert res.status_code == 404, res.text
    finally:
        _clear()


@pytest.mark.asyncio
async def test_material_control_actions_and_style_sheet_when_flag_on(db_session_integration):
    db = db_session_integration
    tenant, user, _wh, _vendor, _item = await seed_inventory_chain(db)
    flags = dict(tenant.feature_flags or {})
    flags["material_control_hub_v1"] = True
    tenant.feature_flags = flags

    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    order = Order(
        tenant_id=tenant.id,
        customer_id=customer.id,
        order_code=f"MC-ORD-{tenant.id}",
        style_id=style.id,
        status="CONFIRMED",
        quantity=100,
    )
    db.add(order)
    await db.commit()

    try:
        async with await _api_client(db, tenant, user) as ac:
            actions = await ac.get("/api/v1/material-control/actions")
            assert actions.status_code == 200, actions.text
            assert "items" in actions.json()

            styles = await ac.get("/api/v1/material-control/styles")
            assert styles.status_code == 200, styles.text
            assert any(s["style_id"] == style.id for s in styles.json().get("items", []))

            sheet = await ac.get(f"/api/v1/material-control/styles/{style.id}/control-sheet")
            assert sheet.status_code == 200, sheet.text
            assert sheet.json()["counts"]["orders"] >= 1

            missing = await ac.get("/api/v1/material-control/styles/999999999/control-sheet")
            assert missing.status_code == 404

            gene = await ac.get("/api/v1/material-control/genealogy", params={"lot_number": "NO-SUCH-LOT"})
            assert gene.status_code == 200, gene.text
            assert gene.json()["movements"] == []
    finally:
        _clear()
