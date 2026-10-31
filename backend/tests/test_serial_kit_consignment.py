"""Sprint I4: serial tracking, kits, consignment stock.

Run:
    docker compose exec backend pytest tests/test_serial_kit_consignment.py -q
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from app.common.permissions import (
    MATERIAL_CONTROL_GOVERNANCE_KEYS,
    PERMISSION_INVENTORY_CONSIGNMENT_SETTLE,
    PERMISSION_INVENTORY_KIT_CREATE,
    PERMISSION_INVENTORY_SERIAL_CREATE,
)
from app.common.tenant_feature_keys import (
    CONSIGNMENT_STOCK_ENABLED,
    KITTING_ENABLED,
    SERIAL_TRACKING_ENABLED,
    is_consignment_stock_enabled,
    is_kitting_enabled,
    is_serial_tracking_enabled,
)
from app.models import Item, ItemCategory, ItemUnit, Tenant
from app.models.inventory import GoodsReceiving, GoodsReceivingItem, StockMovement, Vendor, Warehouse
from app.models.tenant import TenantType
from app.modules.inventory import consignment_service, kitting_service, serial_tracking_service


class TestI4Flags:
    def test_defaults_off(self):
        assert is_serial_tracking_enabled({}) is False
        assert is_kitting_enabled({}) is False
        assert is_consignment_stock_enabled({}) is False
        assert is_serial_tracking_enabled({SERIAL_TRACKING_ENABLED: True}) is True

    def test_permissions(self):
        keys = {row["key"] for row in MATERIAL_CONTROL_GOVERNANCE_KEYS}
        assert PERMISSION_INVENTORY_SERIAL_CREATE in keys
        assert PERMISSION_INVENTORY_KIT_CREATE in keys
        assert PERMISSION_INVENTORY_CONSIGNMENT_SETTLE in keys


async def _seed(db, *, flags: dict | None = None):
    slug = uuid.uuid4().hex[:8]
    if flags is None:
        flags = {
            SERIAL_TRACKING_ENABLED: True,
            KITTING_ENABLED: True,
            CONSIGNMENT_STOCK_ENABLED: True,
        }
    tenant = Tenant(
        name=f"I4 {slug}",
        tenant_type=TenantType.manufacturer,
        is_active=True,
        company_code=f"i4{slug}"[:18],
        feature_flags=flags,
    )
    db.add(tenant)
    await db.flush()
    cat = ItemCategory(tenant_id=tenant.id, category_code=f"C{slug}"[:10], name="Parts")
    db.add(cat)
    await db.flush()
    unit = ItemUnit(tenant_id=tenant.id, unit_code=f"U{slug}"[:8], name="Pcs")
    db.add(unit)
    await db.flush()
    wh = Warehouse(tenant_id=tenant.id, warehouse_code=f"WH{slug}"[:10], name="Main", is_store=True)
    db.add(wh)
    await db.flush()
    vendor = Vendor(tenant_id=tenant.id, vendor_code=f"V{slug}"[:12], name=f"Vendor {slug}")
    db.add(vendor)
    await db.flush()

    serial_item = Item(
        tenant_id=tenant.id,
        item_code=f"SER-{slug}"[:20],
        name="Serialized device",
        category_id=cat.id,
        unit_id=unit.id,
        default_cost=Decimal("100"),
        avg_cost=Decimal("100"),
        default_warehouse_id=wh.id,
        serial_tracking_enabled=True,
    )
    a = Item(
        tenant_id=tenant.id,
        item_code=f"KA-{slug}"[:20],
        name="Kit part A",
        category_id=cat.id,
        unit_id=unit.id,
        default_cost=Decimal("10"),
        avg_cost=Decimal("10"),
        default_warehouse_id=wh.id,
    )
    b = Item(
        tenant_id=tenant.id,
        item_code=f"KB-{slug}"[:20],
        name="Kit part B",
        category_id=cat.id,
        unit_id=unit.id,
        default_cost=Decimal("20"),
        avg_cost=Decimal("20"),
        default_warehouse_id=wh.id,
    )
    db.add_all([serial_item, a, b])
    await db.flush()
    return tenant, vendor, wh, serial_item, a, b


@pytest.mark.asyncio
async def test_serial_create_and_trace(db_session_integration):
    db = db_session_integration
    tenant, vendor, wh, serial_item, _, _ = await _seed(db)
    grn = GoodsReceiving(
        tenant_id=tenant.id,
        grn_code=f"GRN-{uuid.uuid4().hex[:6]}",
        status="RECEIVED",
        vendor_id=vendor.id,
        default_warehouse_id=wh.id,
    )
    db.add(grn)
    await db.flush()
    line = GoodsReceivingItem(
        tenant_id=tenant.id,
        goods_receiving_id=grn.id,
        item_id=serial_item.id,
        warehouse_id=wh.id,
        quantity=Decimal("3"),
        received_qty="3",
    )
    db.add(line)
    await db.flush()

    created = await serial_tracking_service.create_serials_on_grn(
        db,
        tenant,
        item=serial_item,
        grn_item=line,
        qty=3,
        warehouse_id=wh.id,
    )
    assert len(created) == 3
    assert all(s.status == "IN_STOCK" for s in created)

    trace = await serial_tracking_service.trace_serial(db, tenant.id, created[0].serial_number)
    assert trace["grn_code"] == grn.grn_code
    assert trace["status"] == "IN_STOCK"

    issued = await serial_tracking_service.issue_serials(
        db, tenant, serial_ids=[created[0].id], status="SOLD"
    )
    assert issued[0].status == "SOLD"


@pytest.mark.asyncio
async def test_kit_explode_deducts_components(db_session_integration):
    db = db_session_integration
    tenant, _, wh, _, a, b = await _seed(db)
    for it, qty in ((a, Decimal("100")), (b, Decimal("100"))):
        db.add(
            StockMovement(
                tenant_id=tenant.id,
                item_id=it.id,
                warehouse_id=wh.id,
                movement_type="IN",
                quantity=qty,
            )
        )
    await db.flush()

    kit = await kitting_service.create_kit(
        db,
        tenant,
        kit_code=None,
        name="Starter kit",
        kit_price=Decimal("50"),
        components=[
            {"item_id": a.id, "quantity": "2"},
            {"item_id": b.id, "quantity": "1"},
        ],
    )
    cmp = await kitting_service.kit_cost_comparison(db, tenant.id, kit.id)
    assert Decimal(cmp["component_cost"]) == Decimal("40.0000")  # 2*10 + 1*20

    result = await kitting_service.create_kit_order(
        db, tenant, kit_id=kit.id, qty=Decimal("5"), warehouse_id=wh.id
    )
    assert len(result["components"]) == 2
    assert result["components"][0]["total_qty"] == "10.0000" or result["components"][0]["total_qty"] == "10"


@pytest.mark.asyncio
async def test_consignment_receive_consume_settle(db_session_integration):
    db = db_session_integration
    tenant, vendor, wh, _, a, _ = await _seed(db)

    row = await consignment_service.receive_consignment(
        db,
        tenant,
        vendor_id=vendor.id,
        item_id=a.id,
        warehouse_id=wh.id,
        qty=Decimal("50"),
        unit_cost=Decimal("12"),
    )
    assert Decimal(str(row.remaining_qty)) == Decimal("50")

    row = await consignment_service.consume_consignment(
        db, tenant, consignment_id=row.id, qty=Decimal("20")
    )
    assert Decimal(str(row.consumed_qty)) == Decimal("20")
    assert Decimal(str(row.remaining_qty)) == Decimal("30")

    settled = await consignment_service.settle_consignment(db, tenant, vendor_id=vendor.id)
    assert settled["po_code"]
    assert len(settled["lines"]) == 1
    assert settled["lines"][0]["billed_qty"] == "20.0000"
