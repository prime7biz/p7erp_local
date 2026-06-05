"""Inventory PO -> GRN -> delivery challan POSTED HTTP test for go-live readiness."""

from __future__ import annotations

from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app

from tests.go_live_fixtures import seed_inventory_chain


@pytest.mark.asyncio
async def test_po_grn_receive_and_delivery_challan_posted(db_session_integration):
    db = db_session_integration
    tenant, user, wh, vendor, item = await seed_inventory_chain(db)
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
        today = str(date.today())
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            po = await ac.post(
                "/api/v1/inventory/purchase-orders",
                headers=headers,
                json={
                    "vendor_id": vendor.id,
                    "supplier_name": vendor.name,
                    "order_date": today,
                    "status": "APPROVED",
                    "items": [
                        {
                            "item_id": item.id,
                            "warehouse_id": wh.id,
                            "quantity": "100",
                            "unit_price": "10",
                        }
                    ],
                },
            )
            assert po.status_code == 200, po.text
            po_id = po.json()["id"]

            grn = await ac.post(
                "/api/v1/inventory/goods-receiving",
                headers=headers,
                json={
                    "purchase_order_id": po_id,
                    "received_date": today,
                    "status": "DRAFT",
                    "default_warehouse_id": wh.id,
                },
            )
            assert grn.status_code == 200, grn.text
            grn_id = grn.json()["id"]

            recv = await ac.post(f"/api/v1/inventory/goods-receiving/{grn_id}/receive", headers=headers)
            assert recv.status_code == 200, recv.text

            dc = await ac.post(
                "/api/v1/inventory/delivery-challans",
                headers=headers,
                json={
                    "customer_name": "Buyer UAT",
                    "delivery_date": today,
                    "status": "DRAFT",
                    "items": [
                        {
                            "item_id": item.id,
                            "warehouse_id": wh.id,
                            "quantity": "10",
                        }
                    ],
                },
            )
            assert dc.status_code == 200, dc.text
            dc_id = dc.json()["id"]

            posted = await ac.post(
                f"/api/v1/inventory/delivery-challans/{dc_id}/status",
                headers=headers,
                json={"status": "POSTED"},
            )
            assert posted.status_code == 200, posted.text
            assert posted.json().get("status") == "POSTED"
    finally:
        app.dependency_overrides.clear()
