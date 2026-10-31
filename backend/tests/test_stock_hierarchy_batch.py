"""Sprint 2: stock hierarchy, batches, valuation, godown transfer.

Run:
    docker compose exec backend pytest tests/test_stock_hierarchy_batch.py -q
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.common.permissions import (
    MATERIAL_CONTROL_GOVERNANCE_KEYS,
    PERMISSION_INVENTORY_BATCH_VIEW,
    PERMISSION_INVENTORY_STOCK_GROUP_VIEW,
)
from app.common.tenant_feature_keys import (
    BATCH_TRACKING_ENABLED,
    STOCK_HIERARCHY_ENABLED,
    is_batch_tracking_enabled,
    is_stock_hierarchy_enabled,
)
from app.models import Item, ItemCategory, ItemUnit, StockBatch, StockGroup, StockItemPrice, Tenant, Warehouse
from app.models.inventory import GoodsReceiving, GoodsReceivingItem, StockMovement
from app.models.tenant import TenantType
from app.modules.inventory.stock_batch_service import (
    create_batch_on_grn,
    get_expiring_batches,
    issue_batch_fifo,
    mark_expired_batches,
    transfer_batch_qty,
)
from app.modules.inventory.stock_valuation_service import get_stock_value


class TestStockFlags:
    def test_defaults_off(self):
        assert is_stock_hierarchy_enabled(None) is False
        assert is_batch_tracking_enabled({}) is False
        assert is_stock_hierarchy_enabled({STOCK_HIERARCHY_ENABLED: True}) is True
        assert is_batch_tracking_enabled({BATCH_TRACKING_ENABLED: True}) is True

    def test_permissions_registered(self):
        keys = {row["key"] for row in MATERIAL_CONTROL_GOVERNANCE_KEYS}
        assert PERMISSION_INVENTORY_STOCK_GROUP_VIEW in keys
        assert PERMISSION_INVENTORY_BATCH_VIEW in keys


async def _seed(db):
    slug = uuid.uuid4().hex[:8]
    tenant = Tenant(
        name=f"ST {slug}",
        tenant_type=TenantType.manufacturer,
        is_active=True,
        company_code=f"st{slug}"[:18],
        feature_flags={STOCK_HIERARCHY_ENABLED: True, BATCH_TRACKING_ENABLED: True},
    )
    db.add(tenant)
    await db.flush()
    cat = ItemCategory(tenant_id=tenant.id, category_code=f"C{slug}"[:10], name="Cat")
    db.add(cat)
    await db.flush()
    unit = ItemUnit(tenant_id=tenant.id, unit_code=f"U{slug}"[:8], name="Pcs")
    db.add(unit)
    await db.flush()
    parent = StockGroup(
        tenant_id=tenant.id,
        group_code=f"GP{slug}"[:10],
        name="Parent",
        default_valuation_method="FIFO",
    )
    db.add(parent)
    await db.flush()
    child = StockGroup(
        tenant_id=tenant.id,
        group_code=f"GC{slug}"[:10],
        name="Child",
        parent_id=parent.id,
        default_valuation_method="AVG",
    )
    db.add(child)
    await db.flush()
    wh1 = Warehouse(tenant_id=tenant.id, warehouse_code=f"W1{slug}"[:10], name="Store", is_store=True)
    wh2 = Warehouse(
        tenant_id=tenant.id,
        warehouse_code=f"W2{slug}"[:10],
        name="Floor",
        is_production_floor=True,
        is_store=False,
    )
    db.add_all([wh1, wh2])
    await db.flush()
    item = Item(
        tenant_id=tenant.id,
        item_code=f"I{slug}"[:12],
        name=f"Fabric {slug}",
        category_id=cat.id,
        unit_id=unit.id,
        stock_group_id=child.id,
        default_cost=Decimal("10"),
        standard_price=Decimal("12"),
        batch_tracking=True,
        expiry_tracking=True,
        reorder_level=Decimal("5"),
    )
    db.add(item)
    await db.flush()
    return tenant, parent, child, wh1, wh2, item


@pytest.mark.asyncio
async def test_nested_stock_groups_and_item_link(db_session_integration):
    db = db_session_integration
    tenant, parent, child, _wh1, _wh2, item = await _seed(db)
    assert child.parent_id == parent.id
    assert item.stock_group_id == child.id
    kids = (
        await db.execute(select(StockGroup).where(StockGroup.parent_id == parent.id))
    ).scalars().all()
    assert any(k.id == child.id for k in kids)


@pytest.mark.asyncio
async def test_batch_fifo_lifo_avg_std_and_transfer(db_session_integration):
    db = db_session_integration
    tenant, _p, _c, wh1, wh2, item = await _seed(db)
    flags = tenant.feature_flags

    # Simulate two GRN receipts → two batches
    for i, (qty, cost, days_ago) in enumerate(
        ((Decimal("100"), Decimal("10"), 20), (Decimal("50"), Decimal("14"), 5)),
        start=1,
    ):
        grn = GoodsReceiving(
            tenant_id=tenant.id,
            grn_code=f"G{i}-{uuid.uuid4().hex[:6]}",
            received_date=date.today() - timedelta(days=days_ago),
            status="RECEIVED",
        )
        db.add(grn)
        await db.flush()
        gi = GoodsReceivingItem(
            tenant_id=tenant.id,
            goods_receiving_id=grn.id,
            item_id=item.id,
            warehouse_id=wh1.id,
            quantity=qty,
            accepted_qty=str(qty),
            lot_number=f"LOT-{i}",
        )
        db.add(gi)
        await db.flush()
        mv = StockMovement(
            tenant_id=tenant.id,
            item_id=item.id,
            warehouse_id=wh1.id,
            movement_type="IN",
            quantity=qty,
            movement_date=date.today() - timedelta(days=days_ago),
            lot_number=f"LOT-{i}",
        )
        db.add(mv)
        await db.flush()
        await create_batch_on_grn(
            db,
            tenant.id,
            item=item,
            grn_item=gi,
            movement=mv,
            qty=qty,
            unit_cost=cost,
            feature_flags=flags,
            batch_number=f"LOT-{i}",
            expiry_date=date.today() + timedelta(days=10 if i == 1 else 40),
        )

    batches = (
        await db.execute(
            select(StockBatch).where(
                StockBatch.tenant_id == tenant.id,
                StockBatch.stock_item_id == item.id,
            )
        )
    ).scalars().all()
    assert len(batches) == 2

    fifo = await get_stock_value(db, tenant.id, item.id, godown_id=wh1.id, method="FIFO")
    assert Decimal(fifo["qty"]) == Decimal("150")
    avg = await get_stock_value(db, tenant.id, item.id, godown_id=wh1.id, method="AVG")
    # (100*10 + 50*14) / 150 = 11.3333
    assert Decimal(avg["unit_cost"]) == Decimal("11.3333")
    std = await get_stock_value(db, tenant.id, item.id, godown_id=wh1.id, method="STD")
    assert Decimal(std["unit_cost"]) == Decimal("12")

    # Issue FIFO: takes from oldest LOT-1 first
    allocs = await issue_batch_fifo(
        db, tenant.id, item.id, wh1.id, Decimal("110"), method="FIFO", feature_flags=flags
    )
    assert len(allocs) == 2
    assert allocs[0]["batch_number"] == "LOT-1"
    assert Decimal(allocs[0]["qty"]) == Decimal("100")
    assert Decimal(allocs[1]["qty"]) == Decimal("10")

    remaining = (
        await db.execute(
            select(StockBatch).where(
                StockBatch.tenant_id == tenant.id,
                StockBatch.stock_item_id == item.id,
                StockBatch.status == "ACTIVE",
            )
        )
    ).scalars().all()
    assert len(remaining) == 1
    assert remaining[0].batch_number == "LOT-2"
    assert Decimal(str(remaining[0].current_qty)) == Decimal("40")

    # Transfer remaining to wh2
    dest = await transfer_batch_qty(
        db, tenant.id, batch_id=remaining[0].id, to_godown_id=wh2.id, qty=Decimal("40")
    )
    assert dest.godown_id == wh2.id
    assert Decimal(str(dest.current_qty)) == Decimal("40")


@pytest.mark.asyncio
async def test_price_lists_and_expiring(db_session_integration):
    db = db_session_integration
    tenant, _p, _c, _w1, _w2, item = await _seed(db)
    db.add(
        StockItemPrice(
            tenant_id=tenant.id,
            stock_item_id=item.id,
            price_list_name="Wholesale",
            price=Decimal("9.5"),
            currency="USD",
            effective_from=date.today(),
        )
    )
    db.add(
        StockItemPrice(
            tenant_id=tenant.id,
            stock_item_id=item.id,
            price_list_name="Retail",
            price=Decimal("15"),
            currency="USD",
        )
    )
    await db.flush()
    prices = (
        await db.execute(
            select(StockItemPrice).where(StockItemPrice.stock_item_id == item.id)
        )
    ).scalars().all()
    assert len(prices) == 2

    batch = StockBatch(
        tenant_id=tenant.id,
        stock_item_id=item.id,
        batch_number="EXP-1",
        expiry_date=date.today() + timedelta(days=5),
        received_qty=Decimal("10"),
        current_qty=Decimal("10"),
        cost_per_unit=Decimal("1"),
        status="ACTIVE",
    )
    db.add(batch)
    await db.flush()
    expiring = await get_expiring_batches(db, tenant.id, days=30)
    assert any(e["batch_number"] == "EXP-1" for e in expiring)

    batch.expiry_date = date.today() - timedelta(days=1)
    await db.flush()
    n = await mark_expired_batches(db, tenant.id)
    assert n >= 1
    await db.refresh(batch)
    assert batch.status == "EXPIRED"


@pytest.mark.asyncio
async def test_batch_noop_when_flag_off(db_session_integration):
    db = db_session_integration
    tenant, _p, _c, wh1, _wh2, item = await _seed(db)
    grn = GoodsReceiving(
        tenant_id=tenant.id,
        grn_code=f"OFF-{uuid.uuid4().hex[:6]}",
        received_date=date.today(),
        status="RECEIVED",
    )
    db.add(grn)
    await db.flush()
    gi = GoodsReceivingItem(
        tenant_id=tenant.id,
        goods_receiving_id=grn.id,
        item_id=item.id,
        warehouse_id=wh1.id,
        quantity=Decimal("5"),
        accepted_qty="5",
    )
    db.add(gi)
    await db.flush()
    mv = StockMovement(
        tenant_id=tenant.id,
        item_id=item.id,
        warehouse_id=wh1.id,
        movement_type="IN",
        quantity=Decimal("5"),
        movement_date=date.today(),
    )
    db.add(mv)
    await db.flush()
    result = await create_batch_on_grn(
        db,
        tenant.id,
        item=item,
        grn_item=gi,
        movement=mv,
        qty=Decimal("5"),
        unit_cost=Decimal("1"),
        feature_flags={},  # flag off
    )
    assert result is None
