"""Roadmap item 3: create supplier on the fly (vendor code auto-generated when blank).

Run: docker compose exec backend pytest tests/test_benchmark_quick_create.py -q
"""

from __future__ import annotations

import pytest

from tests.benchmark_fixtures import api_client, seed_tenant_admin


@pytest.mark.asyncio
async def test_vendor_code_generated_when_blank(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    await db.commit()
    async with api_client(db, tenant, user) as ac:
        r1 = await ac.post("/api/v1/inventory/vendors", json={"name": "Quick Fabric Ltd"})
        r2 = await ac.post("/api/v1/inventory/vendors", json={"vendor_code": "", "name": "Quick Trims Ltd"})
    assert r1.status_code == 201, r1.text
    assert r2.status_code == 201, r2.text
    c1, c2 = r1.json()["vendor_code"], r2.json()["vendor_code"]
    assert c1.startswith("VEN-") and c2.startswith("VEN-")
    assert c1 != c2


@pytest.mark.asyncio
async def test_vendor_manual_code_still_unique(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    await db.commit()
    async with api_client(db, tenant, user) as ac:
        ok = await ac.post("/api/v1/inventory/vendors", json={"vendor_code": "SUP-01", "name": "A"})
        dup = await ac.post("/api/v1/inventory/vendors", json={"vendor_code": "sup-01", "name": "B"})
        blank_name = await ac.post("/api/v1/inventory/vendors", json={"name": "   "})
    assert ok.status_code == 201, ok.text
    assert ok.json()["vendor_code"] == "SUP-01"
    assert dup.status_code == 400
    assert blank_name.status_code == 400
