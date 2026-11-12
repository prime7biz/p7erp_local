"""GRN receive is all-or-nothing: if the batch record fails, nothing of the receipt is kept (RC-04).

Run:
    docker compose exec backend pytest tests/test_grn_batch_atomicity.py -q
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import BATCH_TRACKING_ENABLED, RBAC_ENFORCEMENT, SERIAL_TRACKING_ENABLED
from app.database import get_db
from app.main import app
from app.models import GoodsReceiving, InventoryCostLayer, StockBatch, StockMovement
from tests.go_live_fixtures import create_admin_tenant_with_user, seed_inventory_chain


@asynccontextmanager
async def _client(db, user, tenant):
    async def override_db():
        # Same as app.database.get_db: commit a finished request, roll back a failed one.
        try:
            yield db
            await db.commit()
        except Exception:
            await db.rollback()
            raise

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[require_tenant] = lambda: tenant
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app, raise_app_exceptions=False),
            base_url="http://test",
            headers={"X-Tenant-Id": str(tenant.id)},
        ) as ac:
            yield ac
    finally:
        for dep in (get_db, get_current_user, require_tenant):
            app.dependency_overrides.pop(dep, None)


async def _draft_grn(ac, vendor, item, wh) -> int:
    today = str(date.today())
    po = await ac.post(
        "/api/v1/inventory/purchase-orders",
        json={
            "vendor_id": vendor.id,
            "supplier_name": vendor.name,
            "order_date": today,
            "status": "APPROVED",
            "items": [{"item_id": item.id, "warehouse_id": wh.id, "quantity": "25", "unit_price": "4"}],
        },
    )
    assert po.status_code == 200, po.text
    grn = await ac.post(
        "/api/v1/inventory/goods-receiving",
        json={"purchase_order_id": po.json()["id"], "received_date": today, "default_warehouse_id": wh.id},
    )
    assert grn.status_code == 200, grn.text
    return grn.json()["id"]


async def _counts(db, tenant_id: int, grn_id: int) -> dict:
    movements = (
        await db.execute(
            select(StockMovement.id).where(StockMovement.tenant_id == tenant_id, StockMovement.goods_receiving_id == grn_id)
        )
    ).scalars().all()
    layers = (
        await db.execute(
            select(func.count()).select_from(InventoryCostLayer).where(InventoryCostLayer.tenant_id == tenant_id)
        )
    ).scalar_one()
    batches = (
        await db.execute(select(func.count()).select_from(StockBatch).where(StockBatch.tenant_id == tenant_id))
    ).scalar_one()
    return {"movements": len(movements), "layers": layers, "batches": batches}


@pytest.mark.asyncio
@pytest.mark.parametrize("failing_step", ["batch", "serial"])
async def test_batch_failure_rolls_back_the_whole_receipt(db_session_integration, monkeypatch, failing_step):
    db = db_session_integration
    tenant, user, wh, vendor, item = await seed_inventory_chain(db)
    tenant.feature_flags = {
        **(tenant.feature_flags or {}),
        BATCH_TRACKING_ENABLED: True,
        SERIAL_TRACKING_ENABLED: failing_step == "serial",
    }
    item.batch_tracking = True
    await db.commit()

    async def boom(*_a, **_k):
        raise RuntimeError(f"{failing_step} store unavailable")

    if failing_step == "batch":
        import app.modules.inventory.stock_batch_service as batch_service

        monkeypatch.setattr(batch_service, "create_batch_on_grn", boom)
    else:
        from app.modules.inventory import serial_tracking_service

        monkeypatch.setattr(serial_tracking_service, "create_serials_on_grn", boom)
    tenant_id = tenant.id  # ORM objects are expired by the rollback; keep plain ids

    async with _client(db, user, tenant) as ac:
        grn_id = await _draft_grn(ac, vendor, item, wh)
        before = await _counts(db, tenant_id, grn_id)
        r = await ac.post(f"/api/v1/inventory/goods-receiving/{grn_id}/receive")
        assert r.status_code == 500

    after = await _counts(db, tenant_id, grn_id)
    assert after == before, f"receipt left partial data behind: {before} -> {after}"
    db.expire_all()
    grn = await db.get(GoodsReceiving, grn_id)
    assert (grn.status or "").upper() != "RECEIVED"


@pytest.mark.asyncio
async def test_receipt_with_batch_tracking_creates_batch(db_session_integration):
    db = db_session_integration
    tenant, user, wh, vendor, item = await seed_inventory_chain(db)
    tenant.feature_flags = {**(tenant.feature_flags or {}), BATCH_TRACKING_ENABLED: True}
    item.batch_tracking = True
    await db.commit()

    async with _client(db, user, tenant) as ac:
        grn_id = await _draft_grn(ac, vendor, item, wh)
        r = await ac.post(f"/api/v1/inventory/goods-receiving/{grn_id}/receive")
        assert r.status_code == 200, r.text
    counts = await _counts(db, tenant.id, grn_id)
    assert counts["movements"] == 1 and counts["batches"] == 1


@pytest.mark.asyncio
async def test_other_tenant_cannot_receive_the_grn(db_session_integration):
    db = db_session_integration
    tenant, user, wh, vendor, item = await seed_inventory_chain(db)
    other, other_user, _ = await create_admin_tenant_with_user(db)
    await db.commit()
    tenant_id = tenant.id

    async with _client(db, user, tenant) as ac:
        grn_id = await _draft_grn(ac, vendor, item, wh)
    async with _client(db, other_user, other) as ac:
        r = await ac.post(f"/api/v1/inventory/goods-receiving/{grn_id}/receive")
        assert r.status_code == 404
    assert (await _counts(db, tenant_id, grn_id))["movements"] == 0


@pytest.mark.asyncio
async def test_receive_needs_inventory_permission(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_admin_tenant_with_user(db, permissions={"inventory.access": False})
    tenant.feature_flags = {**(tenant.feature_flags or {}), RBAC_ENFORCEMENT: "enforce"}
    user.role.name = "storekeeper"
    await db.commit()
    async with _client(db, user, tenant) as ac:
        r = await ac.post("/api/v1/inventory/goods-receiving/1/receive")
        assert r.status_code == 403
