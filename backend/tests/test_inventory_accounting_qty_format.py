"""Stock quantities keep 4 decimals (no 4-significant-digit rounding / scientific notation).

Run (Docker):
    docker compose exec backend pytest tests/test_inventory_accounting_qty_format.py -q
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import (
    BomItem,
    GoodsReceiving,
    GoodsReceivingItem,
    PurchaseOrder,
    PurchaseOrderItem,
)
from app.modules.inventory.qty_format import format_qty, quantize_qty
from app.modules.merch.bom_procurement_service import bulk_create_pos_by_vendor, create_po_from_bom_line

from tests.go_live_fixtures import seed_inventory_chain
from tests.merch_fixtures import create_garment_style, create_legacy_bom


def test_format_qty_keeps_four_decimals_without_scientific_notation():
    assert format_qty(12345.6789) == "12345.6789"
    assert format_qty(12345.6) == "12345.6"
    assert format_qty(Decimal("1234567.12345")) == "1234567.1235"
    assert format_qty("100.0000") == "100"
    assert format_qty(0) == "0"
    assert format_qty(None) == "0"
    assert "e" not in format_qty(98765432.1).lower()
    assert quantize_qty("2.00005") == Decimal("2.0001")


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


def _clear_overrides():
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(require_tenant, None)


@pytest.mark.asyncio
async def test_grn_prefill_keeps_large_qty_and_skips_fully_received_lines(db_session_integration):
    db = db_session_integration
    tenant, user, wh, vendor, item = await seed_inventory_chain(db)
    slug = uuid.uuid4().hex[:6]
    po = PurchaseOrder(
        tenant_id=tenant.id,
        po_code=f"PO-Q{slug}",
        vendor_id=vendor.id,
        supplier_name=vendor.name,
        status="APPROVED",
    )
    db.add(po)
    await db.flush()
    line_open = PurchaseOrderItem(
        tenant_id=tenant.id,
        purchase_order_id=po.id,
        item_id=item.id,
        warehouse_id=wh.id,
        quantity=Decimal("12345.6789"),
        unit_price=Decimal("2"),
    )
    line_done = PurchaseOrderItem(
        tenant_id=tenant.id,
        purchase_order_id=po.id,
        item_id=item.id,
        warehouse_id=wh.id,
        quantity=Decimal("50"),
        unit_price=Decimal("2"),
    )
    db.add_all([line_open, line_done])
    await db.flush()

    # Earlier GRN already received: 45.5 on the open line, all 50 on the other line.
    old_grn = GoodsReceiving(
        tenant_id=tenant.id,
        grn_code=f"GRN-Q{slug}",
        purchase_order_id=po.id,
        status="RECEIVED",
        source_type="PO",
    )
    db.add(old_grn)
    await db.flush()
    db.add_all(
        [
            GoodsReceivingItem(
                tenant_id=tenant.id,
                goods_receiving_id=old_grn.id,
                item_id=item.id,
                warehouse_id=wh.id,
                quantity=Decimal("45.5"),
                purchase_order_line_id=line_open.id,
                received_qty="45.5",
                accepted_qty="45.5",
            ),
            GoodsReceivingItem(
                tenant_id=tenant.id,
                goods_receiving_id=old_grn.id,
                item_id=item.id,
                warehouse_id=wh.id,
                quantity=Decimal("50"),
                purchase_order_line_id=line_done.id,
                received_qty="50",
                accepted_qty="50",
            ),
        ]
    )
    await db.commit()

    try:
        async with await _api_client(db, tenant, user) as ac:
            r = await ac.post(
                "/api/v1/inventory/goods-receiving",
                json={"purchase_order_id": po.id, "default_warehouse_id": wh.id},
            )
            assert r.status_code == 200, r.text
            items = r.json()["items"]
    finally:
        _clear_overrides()

    # Only the open line is prefilled; the fully received line is skipped.
    assert [it["purchase_order_line_id"] for it in items] == [line_open.id]
    it = items[0]
    assert it["received_qty"] == "12300.1789"
    assert it["accepted_qty"] == "12300.1789"
    assert it["previously_received_qty"] == "45.5"
    assert it["pending_qty"] == "12300.1789"
    assert it["rejected_qty"] == "0"
    assert "e" not in it["received_qty"].lower()


@pytest.mark.asyncio
async def test_grn_rejected_qty_is_exact(db_session_integration):
    db = db_session_integration
    tenant, user, wh, _vendor, item = await seed_inventory_chain(db)
    await db.commit()
    try:
        async with await _api_client(db, tenant, user) as ac:
            r = await ac.post(
                "/api/v1/inventory/goods-receiving",
                json={
                    "source_type": "NON_PO",
                    "non_po_reason": "test",
                    "items": [
                        {
                            "item_id": item.id,
                            "warehouse_id": wh.id,
                            "quantity": "23456.7891",
                            "received_qty": "23456.7891",
                            "accepted_qty": "11111.1111",
                        }
                    ],
                },
            )
            assert r.status_code == 200, r.text
            line = r.json()["items"][0]
    finally:
        _clear_overrides()
    assert line["rejected_qty"] == "12345.678"


@pytest.mark.asyncio
async def test_po_from_bom_line_keeps_large_qty(db_session_integration):
    db = db_session_integration
    tenant, _user, wh, vendor, item = await seed_inventory_chain(db)
    style = await create_garment_style(db, tenant)
    bom = await create_legacy_bom(db, tenant, style)
    line = BomItem(
        tenant_id=tenant.id,
        bom_id=bom.id,
        item_id=item.id,
        category="FABRIC",
        base_consumption=Decimal("1"),
        required_gross_qty=12345.6789,
        preferred_vendor_id=vendor.id,
    )
    db.add(line)
    await db.flush()

    _po, poi, _warnings = await create_po_from_bom_line(
        db,
        tenant_id=tenant.id,
        bom=bom,
        line=line,
        vendor_id=vendor.id,
        quantity=12345.6789,
        unit_price="1",
        currency=None,
        warehouse_id=wh.id,
    )
    await db.refresh(poi)
    assert poi.quantity == Decimal("12345.6789")

    # Bulk create: the BOM line already has a PO for its full qty, so nothing remains.
    created = await bulk_create_pos_by_vendor(db, tenant_id=tenant.id, bom=bom, lines=[line])
    assert created == []

    line2 = BomItem(
        tenant_id=tenant.id,
        bom_id=bom.id,
        item_id=item.id,
        category="FABRIC",
        base_consumption=Decimal("1"),
        required_gross_qty=23456.7891,
        preferred_vendor_id=vendor.id,
    )
    db.add(line2)
    await db.flush()
    created = await bulk_create_pos_by_vendor(db, tenant_id=tenant.id, bom=bom, lines=[line2])
    assert len(created) == 1
    pois = created[0][1]
    await db.refresh(pois[0])
    assert pois[0].quantity == Decimal("23456.7891")
    rows = (
        await db.execute(select(PurchaseOrderItem).where(PurchaseOrderItem.source_bom_line_id == line2.id))
    ).scalars().all()
    assert len(rows) == 1
