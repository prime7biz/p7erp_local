"""INV-02: GRN FIFO layers use PO exchange_rate_to_base (foreign PO → base unit cost).

Run: docker compose exec backend pytest tests/test_grn_fx_valuation.py -q
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import InventoryCostLayer

from tests.go_live_fixtures import seed_inventory_chain


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
async def test_usd_po_grn_fifo_layer_in_base_currency(db_session_integration):
    db = db_session_integration
    tenant, user, wh, vendor, item = await seed_inventory_chain(db)
    await db.commit()
    today = str(date.today())
    try:
        async with await _api_client(db, tenant, user) as ac:
            po = await ac.post(
                "/api/v1/inventory/purchase-orders",
                headers={"X-Tenant-Id": str(tenant.id)},
                json={
                    "vendor_id": vendor.id,
                    "supplier_name": vendor.name,
                    "order_date": today,
                    "status": "APPROVED",
                    "currency": "USD",
                    "exchange_rate_to_base": 110.0,
                    "items": [
                        {
                            "item_id": item.id,
                            "warehouse_id": wh.id,
                            "quantity": "10",
                            "unit_price": "2",
                        }
                    ],
                },
            )
            assert po.status_code == 200, po.text
            po_id = po.json()["id"]
            assert float(po.json().get("exchange_rate_to_base") or 0) == 110.0

            grn = await ac.post(
                "/api/v1/inventory/goods-receiving",
                headers={"X-Tenant-Id": str(tenant.id)},
                json={
                    "purchase_order_id": po_id,
                    "received_date": today,
                    "status": "DRAFT",
                    "default_warehouse_id": wh.id,
                },
            )
            assert grn.status_code == 200, grn.text
            recv = await ac.post(
                f"/api/v1/inventory/goods-receiving/{grn.json()['id']}/receive",
                headers={"X-Tenant-Id": str(tenant.id)},
            )
            assert recv.status_code == 200, recv.text
    finally:
        _clear()

    layers = list(
        (
            await db.execute(
                select(InventoryCostLayer).where(
                    InventoryCostLayer.tenant_id == tenant.id,
                    InventoryCostLayer.item_id == item.id,
                    InventoryCostLayer.warehouse_id == wh.id,
                )
            )
        ).scalars().all()
    )
    assert layers, "expected FIFO layer after GRN receive"
    # 2 USD × 110 BDT/USD = 220 base per unit
    unit_cost = Decimal(str(layers[0].unit_cost))
    assert unit_cost == Decimal("220") or abs(unit_cost - Decimal("220")) < Decimal("0.0001")
    qty = Decimal(str(layers[0].qty_remaining))
    assert qty == Decimal("10") or abs(qty - Decimal("10")) < Decimal("0.0001")
