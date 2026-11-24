"""Phase 6: material RTV — flag, happy path OUT+FIFO, cross-tenant.

Run: docker compose exec -T backend pytest tests/test_material_rtv.py -q
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
from app.services.fifo_inventory import finalize_movement_fifo

from tests.go_live_fixtures import create_admin_tenant_with_user, seed_inventory_chain

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


async def _seed_stock(db, tenant, wh, item, qty: str = "50"):
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
    await finalize_movement_fifo(db, tenant.id, mv, in_unit_cost=10.0)
    return mv


@pytest.mark.asyncio
async def test_rtv_404_when_flag_off(db_session_integration):
    db = db_session_integration
    tenant, user, wh, vendor, item = await seed_inventory_chain(db)
    flags = dict(tenant.feature_flags or {})
    flags.pop("material_returns_v1", None)
    tenant.feature_flags = flags
    await db.commit()
    try:
        async with await _api_client(db, tenant, user) as ac:
            res = await ac.post(
                f"{API}/rtv",
                json={
                    "vendor_id": vendor.id,
                    "warehouse_id": wh.id,
                    "lines": [{"item_id": item.id, "qty": "1"}],
                },
            )
            assert res.status_code == 404, res.text
    finally:
        _clear()


@pytest.mark.asyncio
async def test_rtv_happy_path(db_session_integration):
    db = db_session_integration
    tenant, user, wh, vendor, item = await seed_inventory_chain(db)
    flags = dict(tenant.feature_flags or {})
    flags["material_returns_v1"] = True
    tenant.feature_flags = flags
    await _seed_stock(db, tenant, wh, item, "40")
    await db.commit()

    try:
        async with await _api_client(db, tenant, user) as ac:
            res = await ac.post(
                f"{API}/rtv",
                json={
                    "vendor_id": vendor.id,
                    "warehouse_id": wh.id,
                    "lines": [{"item_id": item.id, "qty": "3", "unit_cost": "10"}],
                    "request_id": "rtv-1",
                },
            )
            assert res.status_code == 200, res.text
            body = res.json()
            assert body["status"] == "POSTED"
            assert body["stock_movement_id"] is not None
            mv = await db.get(StockMovement, body["stock_movement_id"])
            assert mv is not None and mv.movement_type == "OUT"

            get_res = await ac.get(f"{API}/rtv/{body['id']}")
            assert get_res.status_code == 200
    finally:
        _clear()


@pytest.mark.asyncio
async def test_rtv_cross_tenant_denied(db_session_integration):
    db = db_session_integration
    tenant, user, wh, vendor, item = await seed_inventory_chain(db)
    flags = dict(tenant.feature_flags or {})
    flags["material_returns_v1"] = True
    tenant.feature_flags = flags
    await db.commit()

    other, other_user, _ = await create_admin_tenant_with_user(db)
    oflags = dict(other.feature_flags or {})
    oflags["material_returns_v1"] = True
    other.feature_flags = oflags
    await db.commit()

    try:
        async with await _api_client(db, other, other_user) as ac:
            res = await ac.post(
                f"{API}/rtv",
                json={
                    "vendor_id": vendor.id,
                    "warehouse_id": wh.id,
                    "lines": [{"item_id": item.id, "qty": "1"}],
                },
            )
            assert res.status_code in (404, 400), res.text
    finally:
        _clear()
