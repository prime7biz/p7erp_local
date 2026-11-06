"""Physical count posts counted − on-hand-at-post, not counted − qty captured at creation.

Run (Docker):
    docker compose exec backend pytest tests/test_inventory_accounting_physical_count_post.py -q
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models import StockMovement
from app.modules.inventory.router import _on_hand_qty

from tests.go_live_fixtures import seed_inventory_chain
from tests.inventory_gl_fixtures import account_line_total, add_stock, api_client, setup_inventory_gl


async def _count_movements(db, tenant_id: int, session_id: int) -> list[StockMovement]:
    rows = (
        await db.execute(
            select(StockMovement).where(
                StockMovement.tenant_id == tenant_id,
                StockMovement.reference_type == "PHYSICAL_COUNT",
                StockMovement.reference_id == session_id,
            )
        )
    ).scalars().all()
    return list(rows)


@pytest.mark.asyncio
async def test_receipt_between_count_and_post_is_not_double_counted(db_session_integration):
    db = db_session_integration
    tenant, user, wh, _vendor, item = await seed_inventory_chain(db)
    accounts = await setup_inventory_gl(db, tenant.id, [item])
    await add_stock(db, tenant.id, item.id, wh.id, "10", 10.0)
    await db.commit()

    async with api_client(db, user, tenant) as ac:
        r = await ac.post(
            "/api/v1/inventory/physical-inventory-sessions",
            json={"warehouse_id": wh.id, "lines": [{"item_id": item.id, "counted_qty": "12"}]},
        )
        assert r.status_code == 200, r.text
        session_id = r.json()["id"]
        assert r.json()["lines"][0]["expected_qty"] == "10.0000"

        # A GRN-style receipt of 5 lands after the count was created: on hand is now 15.
        await add_stock(db, tenant.id, item.id, wh.id, "5", 10.0)
        await db.commit()

        r = await ac.post(f"/api/v1/inventory/physical-inventory-sessions/{session_id}/post")
        assert r.status_code == 200, r.text
        line = r.json()["lines"][0]
        assert line["expected_qty"] == "10.0000"  # creation-time snapshot kept for display
        assert line["expected_qty_at_post"] == "15.0000"

    # Adjustment = 12 counted − 15 on hand = 3 OUT (the old code would have posted 2 IN).
    mvs = await _count_movements(db, tenant.id, session_id)
    assert [(m.movement_type, Decimal(str(m.quantity))) for m in mvs] == [("OUT", Decimal("3"))]
    assert await _on_hand_qty(db, tenant.id, item.id, wh.id) == pytest.approx(12.0)
    assert await account_line_total(db, accounts.inventory.id, "CREDIT") == Decimal("30.0000")


@pytest.mark.asyncio
async def test_count_matching_current_on_hand_posts_no_adjustment(db_session_integration):
    db = db_session_integration
    tenant, user, wh, _vendor, item = await seed_inventory_chain(db)
    await add_stock(db, tenant.id, item.id, wh.id, "10", 10.0)
    await db.commit()

    async with api_client(db, user, tenant) as ac:
        r = await ac.post(
            "/api/v1/inventory/physical-inventory-sessions",
            json={"warehouse_id": wh.id, "lines": [{"item_id": item.id, "counted_qty": "14"}]},
        )
        assert r.status_code == 200, r.text
        session_id = r.json()["id"]
        await add_stock(db, tenant.id, item.id, wh.id, "4", 10.0)
        await db.commit()
        r = await ac.post(f"/api/v1/inventory/physical-inventory-sessions/{session_id}/post")
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "POSTED"

    # Counted 14 == on hand 14 at post: nothing to adjust (old code would have added 4 again).
    assert await _count_movements(db, tenant.id, session_id) == []
    assert await _on_hand_qty(db, tenant.id, item.id, wh.id) == pytest.approx(14.0)
