"""Sprint I2: GRN quality inspection + quarantine.

Run:
    docker compose exec backend pytest tests/test_grn_quality_inspection.py -q
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest

from sqlalchemy import select

from app.common.permissions import (
    MATERIAL_CONTROL_GOVERNANCE_KEYS,
    PERMISSION_INVENTORY_QC_INSPECT,
    PERMISSION_INVENTORY_QC_VIEW,
    PERMISSION_INVENTORY_VENDOR_SCORECARD_VIEW,
)
from app.common.tenant_feature_keys import (
    GRN_QUALITY_INSPECTION_ENABLED,
    is_grn_quality_inspection_enabled,
)
from app.models import Item, ItemCategory, ItemUnit, Tenant
from app.models.inventory import (
    GoodsReceiving,
    GoodsReceivingItem,
    StockMovement,
    Vendor,
)
from app.models.tenant import TenantType
from app.modules.inventory.grn_qc_service import (
    calculate_result,
    create_inspection,
    create_pending_inspections_for_grn,
    ensure_qc_warehouses,
    get_non_available_warehouse_ids,
    item_has_pending_quarantine_qc,
    vendor_scorecard,
)
from app.modules.inventory.stock_availability_service import compute_items_availability


class TestI2Flags:
    def test_defaults_off(self):
        assert is_grn_quality_inspection_enabled(None) is False
        assert is_grn_quality_inspection_enabled({}) is False
        assert is_grn_quality_inspection_enabled({GRN_QUALITY_INSPECTION_ENABLED: True}) is True

    def test_permissions_registered(self):
        keys = {row["key"] for row in MATERIAL_CONTROL_GOVERNANCE_KEYS}
        assert PERMISSION_INVENTORY_QC_INSPECT in keys
        assert PERMISSION_INVENTORY_QC_VIEW in keys
        assert PERMISSION_INVENTORY_VENDOR_SCORECARD_VIEW in keys


class TestCalculateResult:
    def test_pass_fail_partial_hold(self):
        assert calculate_result(Decimal("10"), Decimal("10"), Decimal("0"), Decimal("0")) == "PASS"
        assert calculate_result(Decimal("10"), Decimal("0"), Decimal("10"), Decimal("0")) == "FAIL"
        assert calculate_result(Decimal("10"), Decimal("0"), Decimal("0"), Decimal("10")) == "HOLD"
        assert calculate_result(Decimal("10"), Decimal("6"), Decimal("4"), Decimal("0")) == "PARTIAL"


async def _seed(db, *, flags: dict | None = None):
    slug = uuid.uuid4().hex[:8]
    if flags is None:
        flags = {GRN_QUALITY_INSPECTION_ENABLED: True}
    tenant = Tenant(
        name=f"I2 {slug}",
        tenant_type=TenantType.manufacturer,
        is_active=True,
        company_code=f"i2{slug}"[:18],
        feature_flags=flags,
    )
    db.add(tenant)
    await db.flush()
    cat = ItemCategory(tenant_id=tenant.id, category_code=f"C{slug}"[:10], name="Fabric")
    db.add(cat)
    await db.flush()
    unit = ItemUnit(tenant_id=tenant.id, unit_code=f"U{slug}"[:8], name="Kg")
    db.add(unit)
    await db.flush()
    vendor = Vendor(
        tenant_id=tenant.id,
        vendor_code=f"V{slug}"[:12],
        name=f"Vendor {slug}",
    )
    db.add(vendor)
    await db.flush()
    whs = await ensure_qc_warehouses(db, tenant.id)
    item = Item(
        tenant_id=tenant.id,
        item_code=f"FAB-{slug}"[:20],
        name="Fabric",
        category_id=cat.id,
        unit_id=unit.id,
        default_cost=Decimal("50"),
        avg_cost=Decimal("50"),
        default_warehouse_id=whs["store"].id,
    )
    db.add(item)
    await db.flush()
    return tenant, vendor, item, whs


async def _make_grn(db, tenant, vendor, item, whs, *, qty: str = "100"):
    grn = GoodsReceiving(
        tenant_id=tenant.id,
        grn_code=f"GRN-{uuid.uuid4().hex[:6]}",
        received_date=date.today(),
        status="RECEIVED",
        vendor_id=vendor.id,
        default_warehouse_id=whs["store"].id,
    )
    db.add(grn)
    await db.flush()
    line = GoodsReceivingItem(
        tenant_id=tenant.id,
        goods_receiving_id=grn.id,
        item_id=item.id,
        warehouse_id=whs["store"].id,
        quantity=Decimal(qty),
        received_qty=qty,
        accepted_qty="0",
        rejected_qty="0",
        lot_number=f"LOT-{uuid.uuid4().hex[:4]}",
        unit_price="50",
    )
    db.add(line)
    await db.flush()
    # Simulate quarantine receipt
    db.add(
        StockMovement(
            tenant_id=tenant.id,
            item_id=item.id,
            warehouse_id=whs["quarantine"].id,
            movement_type="IN",
            quantity=Decimal(qty),
            reference_type="GRN",
            reference_id=grn.id,
            movement_date=date.today(),
            movement_kind="GRN_RECEIPT_QUARANTINE",
            goods_receiving_id=grn.id,
            goods_receiving_item_id=line.id,
            vendor_id=vendor.id,
        )
    )
    await db.flush()
    pending = await create_pending_inspections_for_grn(
        db,
        tenant,
        grn,
        [line],
        quarantine_id=whs["quarantine"].id,
        rejected_id=whs["rejected"].id,
    )
    return grn, line, pending


@pytest.mark.asyncio
async def test_ensure_qc_warehouses(db_session_integration):
    db = db_session_integration
    tenant, _, _, whs = await _seed(db)
    assert whs["quarantine"].is_quarantine is True
    assert whs["rejected"].is_rejected is True
    assert whs["store"] is not None
    assert whs["finished_goods"] is not None
    non_avail = await get_non_available_warehouse_ids(db, tenant.id)
    assert whs["quarantine"].id in non_avail
    assert whs["rejected"].id in non_avail
    assert whs["store"].id not in non_avail


@pytest.mark.asyncio
async def test_pass_moves_to_store(db_session_integration):
    db = db_session_integration
    tenant, vendor, item, whs = await _seed(db)
    grn, line, pending = await _make_grn(db, tenant, vendor, item, whs)
    assert len(pending) == 1
    assert pending[0].status == "PENDING"
    assert await item_has_pending_quarantine_qc(db, tenant.id, item.id) is True

    insp = await create_inspection(
        db,
        tenant,
        grn_id=grn.id,
        grn_item_id=line.id,
        accepted_qty=Decimal("100"),
        rejected_qty=Decimal("0"),
        hold_qty=Decimal("0"),
        parameters={"color": "navy"},
        inspected_by=None,
    )
    assert insp.result == "PASS"
    assert insp.status == "COMPLETED"
    await db.flush()

    q_mvs = list(
        (
            await db.execute(
                select(StockMovement).where(
                    StockMovement.tenant_id == tenant.id,
                    StockMovement.warehouse_id == whs["quarantine"].id,
                    StockMovement.item_id == item.id,
                )
            )
        )
        .scalars()
        .all()
    )
    q_in = sum(Decimal(str(m.quantity)) for m in q_mvs if m.movement_type == "IN")
    q_out = sum(Decimal(str(m.quantity)) for m in q_mvs if m.movement_type == "OUT")
    assert q_in - q_out == Decimal("0")

    avail = await compute_items_availability(db, tenant.id, [item.id])
    assert avail[item.id].on_hand == pytest.approx(100.0)
    assert await item_has_pending_quarantine_qc(db, tenant.id, item.id) is False


@pytest.mark.asyncio
async def test_fail_to_rejected_and_debit_suggested(db_session_integration):
    db = db_session_integration
    tenant, vendor, item, whs = await _seed(db)
    grn, line, _ = await _make_grn(db, tenant, vendor, item, whs, qty="40")
    insp = await create_inspection(
        db,
        tenant,
        grn_id=grn.id,
        grn_item_id=line.id,
        accepted_qty=Decimal("0"),
        rejected_qty=Decimal("40"),
        hold_qty=Decimal("0"),
    )
    assert insp.result == "FAIL"
    assert insp.debit_note_suggested is True
    await db.flush()

    rej = list(
        (
            await db.execute(
                select(StockMovement).where(
                    StockMovement.tenant_id == tenant.id,
                    StockMovement.warehouse_id == whs["rejected"].id,
                    StockMovement.item_id == item.id,
                    StockMovement.movement_type == "IN",
                )
            )
        )
        .scalars()
        .all()
    )
    assert sum(Decimal(str(m.quantity)) for m in rej) == Decimal("40")
    avail = await compute_items_availability(db, tenant.id, [item.id])
    assert avail[item.id].on_hand == pytest.approx(0.0)


@pytest.mark.asyncio
async def test_hold_stays_quarantine_not_available(db_session_integration):
    db = db_session_integration
    tenant, vendor, item, whs = await _seed(db)
    grn, line, _ = await _make_grn(db, tenant, vendor, item, whs, qty="25")
    insp = await create_inspection(
        db,
        tenant,
        grn_id=grn.id,
        grn_item_id=line.id,
        accepted_qty=Decimal("0"),
        rejected_qty=Decimal("0"),
        hold_qty=Decimal("25"),
    )
    assert insp.result == "HOLD"
    await db.flush()
    avail = await compute_items_availability(db, tenant.id, [item.id])
    assert avail[item.id].on_hand == pytest.approx(0.0)


@pytest.mark.asyncio
async def test_partial_split(db_session_integration):
    db = db_session_integration
    tenant, vendor, item, whs = await _seed(db)
    grn, line, _ = await _make_grn(db, tenant, vendor, item, whs, qty="50")
    insp = await create_inspection(
        db,
        tenant,
        grn_id=grn.id,
        grn_item_id=line.id,
        accepted_qty=Decimal("30"),
        rejected_qty=Decimal("20"),
        hold_qty=Decimal("0"),
    )
    assert insp.result == "PARTIAL"
    assert insp.debit_note_suggested is True
    await db.flush()
    avail = await compute_items_availability(db, tenant.id, [item.id])
    assert avail[item.id].on_hand == pytest.approx(30.0)


@pytest.mark.asyncio
async def test_vendor_scorecard_alert(db_session_integration):
    db = db_session_integration
    tenant, vendor, item, whs = await _seed(db)
    grn, line, _ = await _make_grn(db, tenant, vendor, item, whs, qty="100")
    await create_inspection(
        db,
        tenant,
        grn_id=grn.id,
        grn_item_id=line.id,
        accepted_qty=Decimal("90"),
        rejected_qty=Decimal("10"),
        hold_qty=Decimal("0"),
    )
    await db.flush()
    card = await vendor_scorecard(db, tenant.id, days=90)
    assert len(card) == 1
    assert card[0]["vendor_id"] == vendor.id
    assert card[0]["rejection_rate_pct"] == 10.0
    assert card[0]["alert"] is True
