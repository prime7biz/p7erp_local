"""Inventory list responses include item code/name so list rows don't show bare ids.

Run: docker compose exec backend pytest tests/test_inventory_list_item_labels.py -v
"""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import Warehouse

from tests.go_live_fixtures import seed_inventory_chain


@pytest.mark.asyncio
async def test_adjustment_and_transfer_lists_include_item_labels(db_session_integration):
    db = db_session_integration
    tenant, user, wh, _vendor, item = await seed_inventory_chain(db)
    wh2 = Warehouse(
        tenant_id=tenant.id,
        warehouse_code=f"W2{uuid.uuid4().hex[:4]}",
        name="Second WH",
        is_active=True,
    )
    db.add(wh2)
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
        headers = {"X-Tenant-Id": str(tenant.id)}
        async with AsyncClient(transport=transport, base_url="http://test", headers=headers) as ac:
            r = await ac.post(
                "/api/v1/inventory/stock-adjustments",
                json={"warehouse_id": wh.id, "item_id": item.id, "quantity": "5", "reason_code": "COUNT"},
            )
            assert r.status_code == 200, r.text

            r = await ac.post(
                "/api/v1/inventory/warehouse-transfers",
                json={
                    "from_warehouse_id": wh.id,
                    "to_warehouse_id": wh2.id,
                    "items": [{"item_id": item.id, "quantity": "1"}],
                },
            )
            assert r.status_code == 200, r.text

            r = await ac.get("/api/v1/inventory/stock-adjustments")
            assert r.status_code == 200, r.text
            adj = r.json()[0]
            assert adj["item_code"] == item.item_code
            assert adj["item_name"] == item.name

            r = await ac.get("/api/v1/inventory/warehouse-transfers")
            assert r.status_code == 200, r.text
            line = r.json()[0]["items"][0]
            assert line["item_code"] == item.item_code
            assert line["item_name"] == item.name
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)
