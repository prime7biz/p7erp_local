"""Delivery challan COGS voucher values every line once, even when item + warehouse repeat.

Run (Docker):
    docker compose exec backend pytest tests/test_inventory_accounting_challan_gl.py -q
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models import StockMovement

from tests.go_live_fixtures import seed_inventory_chain
from tests.inventory_gl_fixtures import account_line_total, add_stock, api_client, setup_inventory_gl


@pytest.mark.asyncio
async def test_repeated_challan_lines_post_cogs_once_each(db_session_integration):
    db = db_session_integration
    tenant, user, wh, _vendor, item = await seed_inventory_chain(db)
    accounts = await setup_inventory_gl(db, tenant.id, [item])
    # FIFO layers: 5 @ 4, then 10 @ 10.
    await add_stock(db, tenant.id, item.id, wh.id, "5", 4.0)
    await add_stock(db, tenant.id, item.id, wh.id, "10", 10.0)
    await db.commit()

    async with api_client(db, user, tenant) as ac:
        r = await ac.post(
            "/api/v1/inventory/delivery-challans",
            json={
                "customer_name": "Buyer",
                "delivery_date": date.today().isoformat(),
                "status": "DRAFT",
                "items": [
                    {"item_id": item.id, "warehouse_id": wh.id, "quantity": "5"},
                    {"item_id": item.id, "warehouse_id": wh.id, "quantity": "3"},
                ],
            },
        )
        assert r.status_code == 200, r.text
        dc_id = r.json()["id"]
        posted = await ac.post(f"/api/v1/inventory/delivery-challans/{dc_id}/status", json={"status": "POSTED"})
        assert posted.status_code == 200, posted.text

    mvs = (
        await db.execute(
            select(StockMovement).where(
                StockMovement.tenant_id == tenant.id,
                StockMovement.reference_type == "DELIVERY_CHALLAN",
                StockMovement.reference_id == dc_id,
            )
        )
    ).scalars().all()
    stock_value_out = sum((Decimal(str(m.movement_value)) for m in mvs), Decimal("0"))
    # Line 1: 5 @ 4 = 20; line 2: 3 @ 10 = 30 (old code posted 20 + 20 = 40).
    assert stock_value_out == Decimal("50.0000")
    assert await account_line_total(db, accounts.cogs.id, "DEBIT") == stock_value_out
    assert await account_line_total(db, accounts.inventory.id, "CREDIT") == stock_value_out
