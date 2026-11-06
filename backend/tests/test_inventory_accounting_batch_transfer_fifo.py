"""Batch-aware godown transfer moves FIFO cost: value out of source == value into destination.

Run (Docker):
    docker compose exec backend pytest tests/test_inventory_accounting_batch_transfer_fifo.py -q
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.common.tenant_feature_keys import BATCH_TRACKING_ENABLED, STOCK_HIERARCHY_ENABLED
from app.models import StockBatch, StockMovement, Warehouse

from tests.go_live_fixtures import seed_inventory_chain
from tests.inventory_gl_fixtures import add_stock, api_client, layer_value


async def _seed(db, *, batch_tracked: bool):
    tenant, user, wh, _vendor, item = await seed_inventory_chain(db)
    tenant.feature_flags = {
        **(tenant.feature_flags or {}),
        STOCK_HIERARCHY_ENABLED: True,
        BATCH_TRACKING_ENABLED: True,
    }
    item.batch_tracking = batch_tracked
    dest = Warehouse(tenant_id=tenant.id, warehouse_code=f"D{uuid.uuid4().hex[:4]}", name="Dest", is_active=True)
    db.add(dest)
    await db.flush()
    # Two receipts at different costs: 10 @ 5 and 10 @ 8.
    for qty, cost in (("10", 5.0), ("10", 8.0)):
        mv = await add_stock(db, tenant.id, item.id, wh.id, qty, cost)
        if batch_tracked:
            db.add(
                StockBatch(
                    tenant_id=tenant.id,
                    stock_item_id=item.id,
                    batch_number=f"B-{mv.id}",
                    opening_qty=Decimal("0"),
                    received_qty=Decimal(qty),
                    issued_qty=Decimal("0"),
                    current_qty=Decimal(qty),
                    cost_per_unit=Decimal(str(cost)),
                    godown_id=wh.id,
                    status="ACTIVE",
                    source_movement_id=mv.id,
                )
            )
    await db.commit()
    return tenant, user, wh, dest, item


@pytest.mark.asyncio
@pytest.mark.parametrize("batch_tracked", [True, False])
async def test_batch_transfer_consumes_and_recreates_fifo_layers(db_session_integration, batch_tracked):
    db = db_session_integration
    tenant, user, src, dest, item = await _seed(db, batch_tracked=batch_tracked)
    before_total = await layer_value(db, tenant.id, item.id)
    assert before_total == Decimal("130.0000")

    async with api_client(db, user, tenant) as ac:
        r = await ac.post(
            "/api/v1/inventory/stock-transfers",
            json={
                "from_godown_id": src.id,
                "to_godown_id": dest.id,
                "items": [{"stock_item_id": item.id, "qty": "15"}],
            },
        )
        assert r.status_code == 200, r.text
        transfer_id = r.json()["id"]

    mvs = (
        await db.execute(
            select(StockMovement).where(
                StockMovement.tenant_id == tenant.id,
                StockMovement.reference_type == "STOCK_TRANSFER",
                StockMovement.reference_id == transfer_id,
            )
        )
    ).scalars().all()
    out_mv = next(m for m in mvs if m.movement_type == "OUT")
    in_mv = next(m for m in mvs if m.movement_type == "IN")
    # FIFO: 10 @ 5 + 5 @ 8 = 90 leaves the source and arrives at the destination.
    assert Decimal(str(out_mv.movement_value)) == Decimal("90.0000")
    assert Decimal(str(in_mv.movement_value)) == Decimal("90.0000")

    assert await layer_value(db, tenant.id, item.id, src.id) == Decimal("40.0000")
    assert await layer_value(db, tenant.id, item.id, dest.id) == Decimal("90.0000")
    assert await layer_value(db, tenant.id, item.id) == before_total

    if batch_tracked:
        dest_batches = (
            await db.execute(
                select(StockBatch).where(
                    StockBatch.tenant_id == tenant.id,
                    StockBatch.stock_item_id == item.id,
                    StockBatch.godown_id == dest.id,
                )
            )
        ).scalars().all()
        assert sum((Decimal(str(b.current_qty)) for b in dest_batches), Decimal("0")) == Decimal("15")
