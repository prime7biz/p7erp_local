"""Delivery challan posting fails (409, nothing saved) when batch stock cannot be issued.

Only batch-tracked items (tenant flag + item flag) need batches; other items post as before.

Run (Docker):
    docker compose exec backend pytest tests/test_inventory_accounting_challan_batches.py -q
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.common.tenant_feature_keys import BATCH_TRACKING_ENABLED
from app.models import StockBatch, StockMovement

from tests.go_live_fixtures import seed_inventory_chain
from tests.inventory_gl_fixtures import add_stock, api_client


async def _seed(db, *, batch_tracked: bool, batch_qty: str | None):
    tenant, user, wh, _vendor, item = await seed_inventory_chain(db)
    tenant.feature_flags = {**(tenant.feature_flags or {}), BATCH_TRACKING_ENABLED: True}
    item.batch_tracking = batch_tracked
    mv = await add_stock(db, tenant.id, item.id, wh.id, "10", 10.0)
    if batch_qty is not None:
        db.add(
            StockBatch(
                tenant_id=tenant.id,
                stock_item_id=item.id,
                batch_number=f"B-{mv.id}",
                opening_qty=Decimal("0"),
                received_qty=Decimal(batch_qty),
                issued_qty=Decimal("0"),
                current_qty=Decimal(batch_qty),
                cost_per_unit=Decimal("10"),
                godown_id=wh.id,
                status="ACTIVE",
                source_movement_id=mv.id,
            )
        )
    await db.commit()
    return tenant, user, wh, item


async def _create_and_post(ac, wh_id: int, item_id: int, qty: str):
    r = await ac.post(
        "/api/v1/inventory/delivery-challans",
        json={
            "customer_name": "Buyer",
            "delivery_date": date.today().isoformat(),
            "status": "DRAFT",
            "items": [{"item_id": item_id, "warehouse_id": wh_id, "quantity": qty}],
        },
    )
    assert r.status_code == 200, r.text
    dc_id = r.json()["id"]
    posted = await ac.post(f"/api/v1/inventory/delivery-challans/{dc_id}/status", json={"status": "POSTED"})
    return dc_id, posted


@pytest.mark.asyncio
async def test_challan_blocked_when_batch_stock_is_short(db_session_integration):
    db = db_session_integration
    # 10 on hand, but only 3 of it sits in batches.
    tenant, user, wh, item = await _seed(db, batch_tracked=True, batch_qty="3")
    tenant_id, item_id, wh_id = tenant.id, item.id, wh.id

    async with api_client(db, user, tenant) as ac:
        dc_id, posted = await _create_and_post(ac, wh_id, item_id, "5")

    assert posted.status_code == 409, posted.text
    assert "batch stock" in posted.json()["detail"]
    # The posting was rolled back: no stock left the warehouse for this challan.
    mvs = (
        await db.execute(
            select(StockMovement).where(
                StockMovement.tenant_id == tenant_id,
                StockMovement.reference_type == "DELIVERY_CHALLAN",
                StockMovement.reference_id == dc_id,
            )
        )
    ).scalars().all()
    assert mvs == []


@pytest.mark.asyncio
async def test_challan_consumes_batches_when_enough(db_session_integration):
    db = db_session_integration
    tenant, user, wh, item = await _seed(db, batch_tracked=True, batch_qty="10")

    async with api_client(db, user, tenant) as ac:
        _dc_id, posted = await _create_and_post(ac, wh.id, item.id, "4")
    assert posted.status_code == 200, posted.text
    assert posted.json()["status"] == "POSTED"

    batch = (
        await db.execute(select(StockBatch).where(StockBatch.tenant_id == tenant.id, StockBatch.stock_item_id == item.id))
    ).scalar_one()
    await db.refresh(batch)
    assert Decimal(str(batch.current_qty)) == Decimal("6")


@pytest.mark.asyncio
async def test_challan_for_non_batch_item_needs_no_batches(db_session_integration):
    db = db_session_integration
    tenant, user, wh, item = await _seed(db, batch_tracked=False, batch_qty=None)

    async with api_client(db, user, tenant) as ac:
        _dc_id, posted = await _create_and_post(ac, wh.id, item.id, "4")
    assert posted.status_code == 200, posted.text
    assert posted.json()["status"] == "POSTED"
