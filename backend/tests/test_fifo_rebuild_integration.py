"""FIFO rebuild: inbound cost layers must be visible to later outbound movements in the same session.

Run:
    docker compose exec backend pytest tests/test_fifo_rebuild_integration.py -q
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models import InventoryCostLayer, Item, ItemCategory, ItemUnit, Tenant, Warehouse
from app.models.inventory import GoodsReceiving, PurchaseOrder, PurchaseOrderItem, StockMovement
from app.models.tenant import TenantType
from app.services.fifo_inventory import finalize_movement_fifo, rebuild_fifo_layers_for_tenant


async def _seed(db):
    slug = uuid.uuid4().hex[:8]
    tenant = Tenant(
        name=f"FIFO {slug}",
        tenant_type=TenantType.manufacturer,
        is_active=True,
        company_code=f"ff{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    cat = ItemCategory(tenant_id=tenant.id, category_code=f"C{slug}"[:10], name="Cat")
    unit = ItemUnit(tenant_id=tenant.id, unit_code=f"U{slug}"[:8], name="Pcs")
    wh = Warehouse(tenant_id=tenant.id, warehouse_code=f"W{slug}"[:10], name="Store", is_store=True)
    db.add_all([cat, unit, wh])
    await db.flush()
    # default_cost is deliberately different from the layer costs so a fallback would be visible.
    item = Item(
        tenant_id=tenant.id,
        item_code=f"I{slug}"[:12],
        name=f"Yarn {slug}",
        category_id=cat.id,
        unit_id=unit.id,
        default_cost=Decimal("100"),
    )
    db.add(item)
    await db.flush()
    return tenant, wh, item


async def _grn_with_price(db, tenant, item, price: str, idx: int) -> GoodsReceiving:
    po = PurchaseOrder(
        tenant_id=tenant.id,
        po_code=f"PO-FIFO-{uuid.uuid4().hex[:8]}",
        supplier_name="Supplier",
        status="APPROVED",
    )
    db.add(po)
    await db.flush()
    db.add(
        PurchaseOrderItem(
            tenant_id=tenant.id,
            purchase_order_id=po.id,
            item_id=item.id,
            quantity=Decimal("10"),
            unit_price=Decimal(price),
        )
    )
    grn = GoodsReceiving(
        tenant_id=tenant.id,
        grn_code=f"GRN-FIFO-{idx}-{uuid.uuid4().hex[:6]}",
        purchase_order_id=po.id,
        status="RECEIVED",
    )
    db.add(grn)
    await db.flush()
    return grn


def _movement(tenant, wh, item, mtype: str, qty: str, *, ref_type=None, ref_id=None) -> StockMovement:
    return StockMovement(
        tenant_id=tenant.id,
        item_id=item.id,
        warehouse_id=wh.id,
        movement_type=mtype,
        quantity=Decimal(qty),
        reference_type=ref_type,
        reference_id=ref_id,
        movement_date=date(2026, 1, 1),
    )


async def _layers(db, tenant_id: int, item_id: int) -> list[InventoryCostLayer]:
    rows = (
        await db.execute(
            select(InventoryCostLayer)
            .where(InventoryCostLayer.tenant_id == tenant_id, InventoryCostLayer.item_id == item_id)
            .order_by(InventoryCostLayer.id)
        )
    ).scalars().all()
    return list(rows)


@pytest.mark.asyncio
async def test_finalize_sequence_consumes_layers_in_same_session(db_session_integration):
    db = db_session_integration
    tenant, wh, item = await _seed(db)

    in_a = _movement(tenant, wh, item, "IN", "10")
    in_b = _movement(tenant, wh, item, "IN", "10")
    out = _movement(tenant, wh, item, "OUT", "15")
    db.add_all([in_a, in_b, out])
    await db.flush()

    # No explicit flushes between steps: the service itself must make layers visible.
    await finalize_movement_fifo(db, tenant.id, in_a, in_unit_cost=5.0)
    await finalize_movement_fifo(db, tenant.id, in_b, in_unit_cost=8.0)
    await finalize_movement_fifo(db, tenant.id, out)
    await db.flush()

    # 10 @ 5 + 5 @ 8 = 90 (not 15 @ default_cost 100)
    assert Decimal(out.movement_value) == Decimal("90.0000")
    layers = await _layers(db, tenant.id, item.id)
    assert [Decimal(str(layer.qty_remaining)) for layer in layers] == [Decimal("0"), Decimal("5")]


@pytest.mark.asyncio
async def test_rebuild_replays_layers_with_correct_cost(db_session_integration):
    db = db_session_integration
    tenant, wh, item = await _seed(db)
    grn_a = await _grn_with_price(db, tenant, item, "5", 1)
    grn_b = await _grn_with_price(db, tenant, item, "8", 2)

    out = _movement(tenant, wh, item, "OUT", "15")
    db.add_all(
        [
            _movement(tenant, wh, item, "IN", "10", ref_type="GRN", ref_id=grn_a.id),
            _movement(tenant, wh, item, "IN", "10", ref_type="GRN", ref_id=grn_b.id),
        ]
    )
    await db.flush()
    db.add(out)
    await db.flush()

    result = await rebuild_fifo_layers_for_tenant(db, tenant.id)
    assert result["movements_replayed"] == 3

    assert Decimal(out.movement_value) == Decimal("90.0000")
    layers = await _layers(db, tenant.id, item.id)
    assert len(layers) == 2
    assert [Decimal(str(layer.qty_remaining)) for layer in layers] == [Decimal("0"), Decimal("5")]
    assert [Decimal(str(layer.unit_cost)) for layer in layers] == [Decimal("5"), Decimal("8")]
