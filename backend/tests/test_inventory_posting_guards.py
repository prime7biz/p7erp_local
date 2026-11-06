"""Inventory posting guards: quantity formatting, per-item transfer stock check, GRN source type, QC input."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import Warehouse
from app.modules.inventory.grn_qc_router import InspectLineBody

from tests.go_live_fixtures import seed_inventory_chain


def test_qc_inspect_line_rejects_negative_quantities():
    with pytest.raises(ValidationError):
        InspectLineBody(grn_item_id=1, accepted_qty=Decimal("150"), rejected_qty=Decimal("-50"))
    with pytest.raises(ValidationError):
        InspectLineBody(grn_item_id=1, hold_qty=Decimal("-1"))


@pytest.mark.asyncio
async def test_grn_quantities_transfer_stock_check_and_source_type(db_session_integration):
    db = db_session_integration
    tenant, user, wh, vendor, item = await seed_inventory_chain(db)
    tenant.allow_negative_stock = False
    wh2 = Warehouse(
        tenant_id=tenant.id,
        warehouse_code=f"WH{uuid.uuid4().hex[:4]}",
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
        today = str(date.today())
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # A "PO receipt" without a purchase order must be rejected (it used to skip non-PO approval).
            bad = await ac.post(
                "/api/v1/inventory/goods-receiving",
                headers=headers,
                json={"source_type": "PO", "received_date": today, "default_warehouse_id": wh.id},
            )
            assert bad.status_code == 400, bad.text

            po = await ac.post(
                "/api/v1/inventory/purchase-orders",
                headers=headers,
                json={
                    "vendor_id": vendor.id,
                    "supplier_name": vendor.name,
                    "order_date": today,
                    "status": "APPROVED",
                    "items": [
                        {"item_id": item.id, "warehouse_id": wh.id, "quantity": "12345.5", "unit_price": "1"}
                    ],
                },
            )
            assert po.status_code == 200, po.text

            grn = await ac.post(
                "/api/v1/inventory/goods-receiving",
                headers=headers,
                json={"purchase_order_id": po.json()["id"], "received_date": today, "default_warehouse_id": wh.id},
            )
            assert grn.status_code == 200, grn.text
            lines = grn.json()["items"]
            assert len(lines) == 1
            # Used to be formatted with 4 significant digits ("1.235e+04").
            assert Decimal(lines[0]["received_qty"]) == Decimal("12345.5")
            assert Decimal(lines[0]["rejected_qty"]) == Decimal("0")

            recv = await ac.post(f"/api/v1/inventory/goods-receiving/{grn.json()['id']}/receive", headers=headers)
            assert recv.status_code == 200, recv.text

            # Two lines of the same item: each fits on its own, together they exceed stock.
            wt = await ac.post(
                "/api/v1/inventory/warehouse-transfers",
                headers=headers,
                json={
                    "from_warehouse_id": wh.id,
                    "to_warehouse_id": wh2.id,
                    "transfer_date": today,
                    "items": [
                        {"item_id": item.id, "quantity": "7000"},
                        {"item_id": item.id, "quantity": "7000"},
                    ],
                },
            )
            assert wt.status_code == 200, wt.text
            post_wt = await ac.post(f"/api/v1/inventory/warehouse-transfers/{wt.json()['id']}/post", headers=headers)
            assert post_wt.status_code == 400, post_wt.text
            assert "Insufficient stock" in post_wt.text

            adj = await ac.post(
                "/api/v1/inventory/stock-adjustments",
                headers=headers,
                json={"warehouse_id": wh.id, "item_id": item.id, "quantity": "-5", "reason_code": "DAMAGE"},
            )
            assert adj.status_code == 200, adj.text
            adj_id = adj.json()["id"]
            first = await ac.post(f"/api/v1/inventory/stock-adjustments/{adj_id}/post", headers=headers)
            assert first.status_code == 200, first.text
            second = await ac.post(f"/api/v1/inventory/stock-adjustments/{adj_id}/post", headers=headers)
            assert second.status_code == 400, second.text
    finally:
        app.dependency_overrides.clear()
