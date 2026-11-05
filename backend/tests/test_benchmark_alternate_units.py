"""Roadmap item 7: alternate unit + conversion factor on items (1 alternate = factor base units).

Run: docker compose exec backend pytest tests/test_benchmark_alternate_units.py -q
"""

from __future__ import annotations

import pytest

from tests.benchmark_fixtures import api_client, seed_item, seed_tenant_admin


@pytest.mark.asyncio
async def test_item_alternate_unit_saved_and_validated(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    item, _wh, _unit = await seed_item(db, tenant.id, code="AU-1")
    await db.commit()
    async with api_client(db, tenant, user) as ac:
        ok = await ac.patch(f"/api/v1/inventory/items/{item.id}", json={"alternate_unit": "  Roll ", "conversion_factor": "50"})
        zero = await ac.patch(f"/api/v1/inventory/items/{item.id}", json={"conversion_factor": "0"})
        negative = await ac.patch(f"/api/v1/inventory/items/{item.id}", json={"conversion_factor": "-3"})
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["alternate_unit"] == "Roll"
    assert float(body["conversion_factor"]) == 50.0
    assert zero.status_code == 400
    assert negative.status_code == 400
