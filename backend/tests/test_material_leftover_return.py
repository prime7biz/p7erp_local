"""Phase 4: leftover return to store — flag, happy path, cross-tenant.

Run: docker compose exec -T backend pytest tests/test_material_leftover_return.py -q
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
from app.models.inventory import InventoryCostLayer, StockMovement

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


@pytest.mark.asyncio
async def test_leftover_404_when_flag_off(db_session_integration):
    db = db_session_integration
    tenant, user, wh, _v, item = await seed_inventory_chain(db)
    flags = dict(tenant.feature_flags or {})
    flags.pop("material_conversion_v1", None)
    tenant.feature_flags = flags
    await db.commit()
    try:
        async with await _api_client(db, tenant, user) as ac:
            res = await ac.post(
                f"{API}/leftover-returns",
                json={"item_id": item.id, "warehouse_id": wh.id, "qty": "5", "unit_cost": "10"},
            )
            assert res.status_code == 404, res.text
    finally:
        _clear()


@pytest.mark.asyncio
async def test_leftover_happy_path_creates_in_movement(db_session_integration):
    db = db_session_integration
    tenant, user, wh, _v, item = await seed_inventory_chain(db)
    flags = dict(tenant.feature_flags or {})
    flags["material_conversion_v1"] = True
    tenant.feature_flags = flags
    await db.commit()

    try:
        async with await _api_client(db, tenant, user) as ac:
            res = await ac.post(
                f"{API}/leftover-returns",
                json={
                    "item_id": item.id,
                    "warehouse_id": wh.id,
                    "qty": "7.5",
                    "unit_cost": "10",
                    "request_id": "leftover-1",
                },
            )
            assert res.status_code == 200, res.text
            body = res.json()
            assert body["status"] == "POSTED"
            assert body["stock_movement_id"] is not None

            mv = await db.get(StockMovement, body["stock_movement_id"])
            assert mv is not None
            assert mv.tenant_id == tenant.id
            assert mv.movement_type == "IN"
            assert Decimal(str(mv.quantity)) == Decimal("7.5")

            layers = (
                await db.execute(
                    select(InventoryCostLayer).where(
                        InventoryCostLayer.tenant_id == tenant.id,
                        InventoryCostLayer.source_movement_id == mv.id,
                    )
                )
            ).scalars().all()
            assert len(layers) == 1

            get_res = await ac.get(f"{API}/leftover-returns/{body['id']}")
            assert get_res.status_code == 200
    finally:
        _clear()


@pytest.mark.asyncio
async def test_leftover_cross_tenant_denied(db_session_integration):
    db = db_session_integration
    tenant, user, wh, _v, item = await seed_inventory_chain(db)
    flags = dict(tenant.feature_flags or {})
    flags["material_conversion_v1"] = True
    tenant.feature_flags = flags
    await db.commit()

    other, other_user, _ = await create_admin_tenant_with_user(db)
    oflags = dict(other.feature_flags or {})
    oflags["material_conversion_v1"] = True
    other.feature_flags = oflags
    await db.commit()

    try:
        async with await _api_client(db, other, other_user) as ac:
            res = await ac.post(
                f"{API}/leftover-returns",
                json={"item_id": item.id, "warehouse_id": wh.id, "qty": "1", "unit_cost": "1"},
            )
            assert res.status_code in (404, 400), res.text
    finally:
        _clear()


@pytest.mark.asyncio
async def test_qc_hold_blocks_quarantine_warehouse(db_session_integration):
    """Phase 3 guard: quarantine WH blocks issue (via thin wrapper)."""
    db = db_session_integration
    tenant, user, wh, _v, item = await seed_inventory_chain(db)
    flags = dict(tenant.feature_flags or {})
    flags["material_inbound_v2"] = True
    tenant.feature_flags = flags
    wh.is_quarantine = True
    await db.commit()

    try:
        async with await _api_client(db, tenant, user) as ac:
            res = await ac.post(
                f"{API}/qc-hold-check",
                json={"item_id": item.id, "warehouse_id": wh.id},
            )
            assert res.status_code == 409, res.text
    finally:
        _clear()
