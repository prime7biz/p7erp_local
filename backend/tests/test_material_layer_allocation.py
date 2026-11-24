"""Phase 2B: FIFO layer allocation — flag gate, cross-tenant, happy path.

Run: docker compose exec -T backend pytest tests/test_material_layer_allocation.py -q
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models.inventory import InventoryCostLayer, StockMovement
from app.models.merch import Order

from tests.go_live_fixtures import create_admin_tenant_with_user, seed_inventory_chain
from tests.merch_fixtures import create_customer, create_garment_style

API = "/api/v1/material-control"


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


async def _seed_layer(db, tenant, wh, item, qty: str = "100"):
    mv = StockMovement(
        tenant_id=tenant.id,
        item_id=item.id,
        warehouse_id=wh.id,
        movement_type="IN",
        quantity=Decimal(qty),
        movement_date=date.today(),
        reference_type="TEST",
        movement_kind="TEST_IN",
    )
    db.add(mv)
    await db.flush()
    layer = InventoryCostLayer(
        tenant_id=tenant.id,
        item_id=item.id,
        warehouse_id=wh.id,
        source_movement_id=mv.id,
        qty_original=Decimal(qty),
        qty_remaining=Decimal(qty),
        unit_cost=Decimal("10"),
        layer_date=date.today(),
    )
    db.add(layer)
    await db.flush()
    return layer


@pytest.mark.asyncio
async def test_allocation_404_when_flag_off(db_session_integration):
    db = db_session_integration
    tenant, user, wh, _v, item = await seed_inventory_chain(db)
    flags = dict(tenant.feature_flags or {})
    flags.pop("material_alloc_ud_v1", None)
    tenant.feature_flags = flags
    layer = await _seed_layer(db, tenant, wh, item)
    await db.commit()
    try:
        async with await _api_client(db, tenant, user) as ac:
            res = await ac.post(
                f"{API}/allocations",
                json={"cost_layer_id": layer.id, "qty": "10"},
            )
            assert res.status_code == 404, res.text
    finally:
        _clear()


@pytest.mark.asyncio
async def test_allocation_happy_path_and_release(db_session_integration):
    db = db_session_integration
    tenant, user, wh, _v, item = await seed_inventory_chain(db)
    flags = dict(tenant.feature_flags or {})
    flags["material_alloc_ud_v1"] = True
    tenant.feature_flags = flags
    layer = await _seed_layer(db, tenant, wh, item)
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    order = Order(
        tenant_id=tenant.id,
        customer_id=customer.id,
        order_code=f"ALLOC-{tenant.id}",
        style_id=style.id,
        status="CONFIRMED",
        quantity=50,
    )
    db.add(order)
    await db.commit()

    try:
        async with await _api_client(db, tenant, user) as ac:
            res = await ac.post(
                f"{API}/allocations",
                json={
                    "cost_layer_id": layer.id,
                    "qty": "25",
                    "order_id": order.id,
                    "style_id": style.id,
                    "request_id": "alloc-req-1",
                },
            )
            assert res.status_code == 200, res.text
            body = res.json()
            assert body["status"] == "ACTIVE"
            assert body["qty_allocated"] == "25.0000" or body["qty_allocated"].startswith("25")
            alloc_id = body["id"]

            replay = await ac.post(
                f"{API}/allocations",
                json={
                    "cost_layer_id": layer.id,
                    "qty": "25",
                    "order_id": order.id,
                    "request_id": "alloc-req-1",
                },
            )
            assert replay.status_code == 200
            assert replay.json()["id"] == alloc_id

            get_res = await ac.get(f"{API}/allocations/{alloc_id}")
            assert get_res.status_code == 200

            rel = await ac.post(f"{API}/allocations/{alloc_id}/release")
            assert rel.status_code == 200, rel.text
            assert rel.json()["status"] == "RELEASED"
    finally:
        _clear()


@pytest.mark.asyncio
async def test_allocation_cross_tenant_denied(db_session_integration):
    db = db_session_integration
    tenant, user, wh, _v, item = await seed_inventory_chain(db)
    flags = dict(tenant.feature_flags or {})
    flags["material_alloc_ud_v1"] = True
    tenant.feature_flags = flags
    layer = await _seed_layer(db, tenant, wh, item)
    await db.commit()

    other, other_user, _ = await create_admin_tenant_with_user(db)
    oflags = dict(other.feature_flags or {})
    oflags["material_alloc_ud_v1"] = True
    other.feature_flags = oflags
    await db.commit()

    try:
        async with await _api_client(db, other, other_user) as ac:
            res = await ac.post(
                f"{API}/allocations",
                json={"cost_layer_id": layer.id, "qty": "5"},
            )
            assert res.status_code in (404, 400), res.text
    finally:
        _clear()
