"""Physical count session responses serialize expected_qty (Numeric column) as a string.

Run (Docker):
    docker compose exec backend pytest tests/test_inventory_accounting_physical_count.py -q
"""

from __future__ import annotations

from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import StockMovement

from tests.go_live_fixtures import seed_inventory_chain


@pytest.mark.asyncio
async def test_physical_count_create_and_list_return_string_expected_qty(db_session_integration):
    db = db_session_integration
    tenant, user, wh, _vendor, item = await seed_inventory_chain(db)
    db.add(
        StockMovement(
            tenant_id=tenant.id,
            item_id=item.id,
            warehouse_id=wh.id,
            movement_type="IN",
            quantity="12.5",
            movement_date=date.today(),
            notes="seed",
        )
    )
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
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"X-Tenant-Id": str(tenant.id)},
        ) as ac:
            r = await ac.post(
                "/api/v1/inventory/physical-inventory-sessions",
                json={"warehouse_id": wh.id, "lines": [{"item_id": item.id, "counted_qty": "12"}]},
            )
            assert r.status_code == 200, r.text
            line = r.json()["lines"][0]
            assert line["expected_qty"] == "12.5000"
            assert line["counted_qty"] == "12"

            db.expunge_all()
            r = await ac.get("/api/v1/inventory/physical-inventory-sessions")
            assert r.status_code == 200, r.text
            assert r.json()[0]["lines"][0]["expected_qty"] == "12.5000"
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)
