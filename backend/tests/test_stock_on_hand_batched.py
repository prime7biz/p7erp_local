"""On-hand qty: SQL SUM matches the old Python loop, and the batched helper matches per-item results.

Run:
docker compose exec backend pytest tests/test_stock_on_hand_batched.py -q
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models import Item, ItemCategory, ItemUnit, Tenant, Warehouse
from app.models.inventory import StockMovement
from app.models.tenant import TenantType
from app.modules.inventory.router import _on_hand_qty
from app.modules.inventory.stock_on_hand import on_hand_qty_by_item_warehouse


async def _seed_tenant(db, slug: str):
    tenant = Tenant(
        name=f"OnHand {slug}",
        tenant_type=TenantType.manufacturer,
        is_active=True,
        company_code=f"oh{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    cat = ItemCategory(tenant_id=tenant.id, category_code=f"C{slug}"[:10], name="Cat")
    unit = ItemUnit(tenant_id=tenant.id, unit_code=f"U{slug}"[:8], name="Pcs")
    wh1 = Warehouse(tenant_id=tenant.id, warehouse_code=f"A{slug}"[:10], name="Store A", is_store=True)
    wh2 = Warehouse(tenant_id=tenant.id, warehouse_code=f"B{slug}"[:10], name="Store B", is_store=True)
    db.add_all([cat, unit, wh1, wh2])
    await db.flush()
    items = [
        Item(tenant_id=tenant.id, item_code=f"I{n}{slug}"[:12], name=f"Item {n}", category_id=cat.id, unit_id=unit.id)
        for n in range(3)
    ]
    db.add_all(items)
    await db.flush()
    return tenant, [wh1, wh2], items


def _mv(tenant_id, item_id, wh_id, mtype, qty):
    return StockMovement(
        tenant_id=tenant_id,
        item_id=item_id,
        warehouse_id=wh_id,
        movement_type=mtype,
        quantity=Decimal(qty),
    )


async def _python_loop_on_hand(db, tenant_id, item_id, warehouse_id) -> float:
    """The previous implementation, kept here as the reference."""
    stmt = select(StockMovement).where(StockMovement.tenant_id == tenant_id, StockMovement.item_id == item_id)
    if warehouse_id is None:
        stmt = stmt.where(StockMovement.warehouse_id.is_(None))
    else:
        stmt = stmt.where(StockMovement.warehouse_id == warehouse_id)
    rows = (await db.execute(stmt)).scalars().all()
    in_qty = sum(float(r.quantity) for r in rows if r.movement_type == "IN")
    out_qty = sum(float(r.quantity) for r in rows if r.movement_type == "OUT")
    return round(in_qty - out_qty, 3)


@pytest.mark.asyncio
async def test_batched_on_hand_matches_per_item_and_old_loop(db_session_integration):
    db = db_session_integration
    slug = uuid.uuid4().hex[:8]
    tenant, (wh1, wh2), (a, b, c) = await _seed_tenant(db, slug)
    other_tenant, (owh, _), (oa, _, _) = await _seed_tenant(db, uuid.uuid4().hex[:8])

    db.add_all(
        [
            _mv(tenant.id, a.id, wh1.id, "IN", "100.5"),
            _mv(tenant.id, a.id, wh1.id, "OUT", "20.25"),
            _mv(tenant.id, a.id, wh1.id, "ADJUST", "999"),  # ignored by the sign rule
            _mv(tenant.id, a.id, wh2.id, "IN", "7.1234"),
            _mv(tenant.id, a.id, None, "IN", "3"),  # no warehouse
            _mv(tenant.id, b.id, wh1.id, "OUT", "5"),  # negative stock
            _mv(tenant.id, b.id, wh2.id, "IN", "0.0005"),
            _mv(tenant.id, b.id, wh2.id, "IN", "0.0004"),
            # item c has no movements at all
            _mv(other_tenant.id, oa.id, owh.id, "IN", "50"),
        ]
    )
    await db.flush()

    warehouses = [wh1.id, wh2.id]
    items = [a.id, b.id, c.id]
    batched = await on_hand_qty_by_item_warehouse(db, tenant.id, warehouse_ids=warehouses, item_ids=items)
    batched_all_items = await on_hand_qty_by_item_warehouse(db, tenant.id, warehouse_ids=warehouses)

    for item_id in items:
        for wh_id in warehouses:
            single = await _on_hand_qty(db, tenant.id, item_id, wh_id)
            reference = await _python_loop_on_hand(db, tenant.id, item_id, wh_id)
            assert single == reference, (item_id, wh_id)
            assert batched.get((item_id, wh_id), 0.0) == single, (item_id, wh_id)
            assert batched_all_items.get((item_id, wh_id), 0.0) == single, (item_id, wh_id)

    assert await _on_hand_qty(db, tenant.id, a.id, None) == await _python_loop_on_hand(db, tenant.id, a.id, None) == 3.0
    assert batched[(a.id, wh1.id)] == 80.25
    assert batched[(b.id, wh1.id)] == -5.0
    assert (c.id, wh1.id) not in batched
    # Other tenant's movements never leak in.
    assert all(item_id in items for item_id, _ in batched_all_items)
    assert await on_hand_qty_by_item_warehouse(db, tenant.id, warehouse_ids=[]) == {}
