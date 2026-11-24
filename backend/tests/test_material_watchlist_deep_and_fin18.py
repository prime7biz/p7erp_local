"""Phase 7 watchlist deepen + FIN-18 VendorBill from-grn idempotency.

Run: docker compose exec -T backend pytest tests/test_material_watchlist_deep_and_fin18.py -q
"""

from __future__ import annotations

from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.modules.finance.system_coa_seeding_service import seed_tenant_system_coa

from tests.go_live_fixtures import seed_inventory_chain
from tests.inventory_gl_fixtures import setup_inventory_gl

API_MC = "/api/v1/material-control"


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
async def test_watchlist_five_buckets_ok(db_session_integration):
    db = db_session_integration
    tenant, user, *_ = await seed_inventory_chain(db)
    flags = dict(tenant.feature_flags or {})
    flags["material_budget_plan_v1"] = True
    tenant.feature_flags = flags
    await db.commit()
    try:
        async with await _api_client(db, tenant, user) as ac:
            res = await ac.get(f"{API_MC}/watchlist")
            assert res.status_code == 200, res.text
            body = res.json()
            assert body["overbuy_vs_bom"]["status"] == "ok"
            assert body["qc_reject_unclaimed"]["status"] == "ok"
            assert body["process_loss_over_std"]["status"] == "ok"
            assert "count" in body["overbuy_vs_bom"]
            assert "count" in body["qc_reject_unclaimed"]
            assert "count" in body["process_loss_over_std"]
    finally:
        _clear()


@pytest.mark.asyncio
async def test_supplier_scorecard_empty_ok(db_session_integration):
    db = db_session_integration
    tenant, user, *_ = await seed_inventory_chain(db)
    flags = dict(tenant.feature_flags or {})
    flags["material_control_hub_v1"] = True
    tenant.feature_flags = flags
    await db.commit()
    try:
        async with await _api_client(db, tenant, user) as ac:
            res = await ac.get(f"{API_MC}/supplier-scorecard")
            assert res.status_code == 200, res.text
            assert "items" in res.json()
    finally:
        _clear()


@pytest.mark.asyncio
async def test_fin18_vendor_bill_from_grn_replay(db_session_integration):
    """Second from-grn returns the same VendorBill (no duplicate draft)."""
    db = db_session_integration
    tenant, user, wh, vendor, item = await seed_inventory_chain(db)
    await seed_tenant_system_coa(db, tenant.id)
    await setup_inventory_gl(db, tenant.id, [item])
    await db.commit()
    today = str(date.today())
    try:
        async with await _api_client(db, tenant, user) as ac:
            po = await ac.post(
                "/api/v1/inventory/purchase-orders",
                json={
                    "vendor_id": vendor.id,
                    "supplier_name": vendor.name,
                    "order_date": today,
                    "status": "APPROVED",
                    "items": [
                        {
                            "item_id": item.id,
                            "warehouse_id": wh.id,
                            "quantity": "5",
                            "unit_price": "20",
                        }
                    ],
                },
            )
            assert po.status_code == 200, po.text
            grn = await ac.post(
                "/api/v1/inventory/goods-receiving",
                json={
                    "purchase_order_id": po.json()["id"],
                    "received_date": today,
                    "status": "DRAFT",
                    "default_warehouse_id": wh.id,
                },
            )
            assert grn.status_code == 200, grn.text
            grn_id = grn.json()["id"]
            recv = await ac.post(f"/api/v1/inventory/goods-receiving/{grn_id}/receive")
            assert recv.status_code == 200, recv.text

            bill1 = await ac.post(f"/api/v1/finance/vendor-bills/from-grn/{grn_id}")
            assert bill1.status_code == 201, bill1.text
            bill2 = await ac.post(f"/api/v1/finance/vendor-bills/from-grn/{grn_id}")
            assert bill2.status_code == 201, bill2.text
            assert bill1.json()["id"] == bill2.json()["id"]
            assert bill2.json().get("replay") is True
    finally:
        _clear()
