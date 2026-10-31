"""Sprint I1: MRP, auto-reorder, IDT, process loss, job-work costing.

Run:
    docker compose exec backend pytest tests/test_mrp_idt_process_loss.py -q
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.common.permissions import (
    MATERIAL_CONTROL_GOVERNANCE_KEYS,
    PERMISSION_INVENTORY_IDT_CREATE,
    PERMISSION_INVENTORY_MRP_RUN,
    PERMISSION_INVENTORY_PROCESS_LOSS_VIEW,
)
from app.common.tenant_feature_keys import (
    AUTO_REORDER_ENABLED,
    INTER_DEPARTMENT_TRANSFER_ENABLED,
    JOB_WORK_COSTING_ENABLED,
    MRP_ENGINE_ENABLED,
    PROCESS_LOSS_TRACKING_ENABLED,
    is_auto_reorder_enabled,
    is_inter_department_transfer_enabled,
    is_mrp_engine_enabled,
    is_process_loss_tracking_enabled,
)
from app.models import Item, ItemCategory, ItemUnit, Tenant, Warehouse
from app.models.customer import Customer
from app.models.inventory import StockMovement
from app.models.merch import Bom, BomItem, GarmentStyle, Order
from app.models.tenant import TenantType
from app.modules.inventory.job_work_costing_service import calculate_job_work_cost_from_idt
from app.modules.inventory.mrp_engine_service import run_mrp
from app.modules.inventory.process_loss_service import (
    ensure_default_standards,
    get_post_costing_report,
    get_process_loss_report,
)
from app.modules.inventory.reorder_service import check_reorder_points, generate_po_from_suggestion


class TestI1Flags:
    def test_defaults_off(self):
        assert is_mrp_engine_enabled(None) is False
        assert is_auto_reorder_enabled({}) is False
        assert is_inter_department_transfer_enabled({}) is False
        assert is_process_loss_tracking_enabled({}) is False
        assert is_mrp_engine_enabled({MRP_ENGINE_ENABLED: True}) is True

    def test_permissions_registered(self):
        keys = {row["key"] for row in MATERIAL_CONTROL_GOVERNANCE_KEYS}
        assert PERMISSION_INVENTORY_MRP_RUN in keys
        assert PERMISSION_INVENTORY_IDT_CREATE in keys
        assert PERMISSION_INVENTORY_PROCESS_LOSS_VIEW in keys


async def _seed_tenant(db, *, flags: dict | None = None):
    slug = uuid.uuid4().hex[:8]
    if flags is None:
        flags = {
            MRP_ENGINE_ENABLED: True,
            AUTO_REORDER_ENABLED: True,
            INTER_DEPARTMENT_TRANSFER_ENABLED: True,
            PROCESS_LOSS_TRACKING_ENABLED: True,
            JOB_WORK_COSTING_ENABLED: True,
        }
    tenant = Tenant(
        name=f"I1 {slug}",
        tenant_type=TenantType.manufacturer,
        is_active=True,
        company_code=f"i1{slug}"[:18],
        feature_flags=flags,
    )
    db.add(tenant)
    await db.flush()
    cat = ItemCategory(tenant_id=tenant.id, category_code=f"C{slug}"[:10], name="Yarn")
    db.add(cat)
    await db.flush()
    unit = ItemUnit(tenant_id=tenant.id, unit_code=f"U{slug}"[:8], name="Kg")
    db.add(unit)
    await db.flush()
    wh_rm = Warehouse(
        tenant_id=tenant.id,
        warehouse_code=f"RM{slug}"[:10],
        name="RM Store",
        is_store=True,
    )
    wh_knit = Warehouse(
        tenant_id=tenant.id,
        warehouse_code=f"KN{slug}"[:10],
        name="Knitting",
        is_production_floor=True,
        is_store=False,
    )
    db.add_all([wh_rm, wh_knit])
    await db.flush()
    yarn = Item(
        tenant_id=tenant.id,
        item_code=f"YARN-{slug}"[:20],
        name="Yarn",
        category_id=cat.id,
        unit_id=unit.id,
        default_cost=Decimal("100"),
        avg_cost=Decimal("100"),
        current_stock=Decimal("50"),
        reorder_level=Decimal("100"),
        auto_reorder_enabled=True,
        safety_stock=Decimal("10"),
        lead_time_days=7,
        lot_size_method="L4L",
        default_warehouse_id=wh_rm.id,
    )
    greige = Item(
        tenant_id=tenant.id,
        item_code=f"GRG-{slug}"[:20],
        name="Greige Fabric",
        category_id=cat.id,
        unit_id=unit.id,
        default_cost=Decimal("150"),
        avg_cost=Decimal("150"),
        current_stock=Decimal("0"),
        auto_reorder_enabled=False,
        default_warehouse_id=wh_knit.id,
    )
    thread = Item(
        tenant_id=tenant.id,
        item_code=f"THR-{slug}"[:20],
        name="Thread",
        category_id=cat.id,
        unit_id=unit.id,
        default_cost=Decimal("5"),
        avg_cost=Decimal("5"),
        current_stock=Decimal("1000"),
        auto_reorder_enabled=False,
        lead_time_days=3,
    )
    db.add_all([yarn, greige, thread])
    await db.flush()
    return tenant, cat, unit, wh_rm, wh_knit, yarn, greige, thread


@pytest.mark.asyncio
async def test_planning_fields_and_reorder_only_when_enabled(db_session_integration):
    db = db_session_integration
    tenant, *_rest, yarn, greige, thread = await _seed_tenant(db)
    await db.refresh(yarn)
    assert yarn.auto_reorder_enabled is True
    assert greige.auto_reorder_enabled is False

    created = await check_reorder_points(db, tenant.id)
    await db.flush()
    item_ids = {s.item_id for s in created}
    assert yarn.id in item_ids
    assert greige.id not in item_ids
    assert thread.id not in item_ids


@pytest.mark.asyncio
async def test_mrp_bom_explosion_and_lead_time(db_session_integration):
    db = db_session_integration
    tenant, cat, unit, wh_rm, wh_knit, yarn, greige, thread = await _seed_tenant(db)
    slug = uuid.uuid4().hex[:6]
    style = GarmentStyle(
        tenant_id=tenant.id,
        style_code=f"ST{slug}",
        name="Tee",
    )
    db.add(style)
    await db.flush()
    cust = Customer(
        tenant_id=tenant.id,
        customer_code=f"CU{slug}",
        name="Buyer",
    )
    db.add(cust)
    await db.flush()
    order = Order(
        tenant_id=tenant.id,
        customer_id=cust.id,
        style_id=style.id,
        order_code=f"ORD-{slug}",
        quantity=1000,
        delivery_date=date.today() + timedelta(days=30),
        status="CONFIRMED",
    )
    db.add(order)
    await db.flush()
    bom = Bom(
        tenant_id=tenant.id,
        style_id=style.id,
        order_id=order.id,
        is_active=True,
        status="APPROVED",
        order_qty_snapshot=1000,
    )
    db.add(bom)
    await db.flush()
    db.add(
        BomItem(
            tenant_id=tenant.id,
            bom_id=bom.id,
            item_id=yarn.id,
            category="FABRIC",
            base_consumption=Decimal("0.5"),
            bom_gross_consumption_per_unit=0.5,
            required_gross_qty=500,
            order_qty_snapshot=1000,
        )
    )
    await db.flush()

    result = await run_mrp(db, tenant.id, order_ids=[order.id], horizon_days=90)
    await db.flush()
    assert result.planned_orders or result.explosion
    assert any(x.item_id == yarn.id for x in result.explosion)
    if result.planned_orders:
        po = result.planned_orders[0]
        assert po.release_date == po.requirement_date - timedelta(days=int(yarn.lead_time_days or 0))


@pytest.mark.asyncio
async def test_reorder_convert_to_po(db_session_integration):
    db = db_session_integration
    tenant, *_r, yarn, greige, thread = await _seed_tenant(db)
    created = await check_reorder_points(db, tenant.id)
    await db.flush()
    sug = next(s for s in created if s.item_id == yarn.id)
    sug.status = "APPROVED"
    await db.flush()
    row, po = await generate_po_from_suggestion(db, tenant.id, sug.id)
    await db.flush()
    assert row.status == "CONVERTED"
    assert row.generated_po_id == po.id
    assert po.po_code


@pytest.mark.asyncio
async def test_idt_issue_receive_loss_and_job_work(db_session_integration):
    db = db_session_integration
    tenant, cat, unit, wh_rm, wh_knit, yarn, greige, thread = await _seed_tenant(db)
    db.add(
        StockMovement(
            tenant_id=tenant.id,
            item_id=yarn.id,
            warehouse_id=wh_rm.id,
            movement_type="IN",
            quantity=Decimal("200"),
            notes="seed",
        )
    )
    yarn.current_stock = Decimal("200")
    yarn.avg_cost = Decimal("150")
    await db.flush()

    await ensure_default_standards(db, tenant.id)
    from app.modules.inventory import idt_service

    idt = await idt_service.create_idt_issue(
        db,
        tenant,
        from_warehouse_id=wh_rm.id,
        to_warehouse_id=wh_knit.id,
        process_name="Knitting",
        source_item_id=yarn.id,
        source_qty=Decimal("100"),
        source_qty_unit="kg",
        target_item_id=greige.id,
        target_qty_expected=Decimal("100"),
        target_qty_unit="kg",
        is_job_work=True,
        job_work_cost_per_unit=Decimal("20"),
        transport_cost=Decimal("200"),
        other_charges=Decimal("100"),
        linked_order_id=None,
    )
    await db.flush()
    assert idt.status == "ISSUED"
    assert idt.source_item_cost is not None

    received = await idt_service.receive_idt(
        db,
        tenant,
        idt.id,
        Decimal("94"),
        target_batch_number="JW-TEST-01",
    )
    await db.flush()
    assert received.status == "RECEIVED_PARTIALLY"
    assert float(received.process_loss_qty) == pytest.approx(6.0, rel=0.01)
    assert float(received.process_loss_percent) == pytest.approx(6.0, rel=0.01)
    assert received.loss_exception is True

    br = calculate_job_work_cost_from_idt(received)
    assert float(br.unit_cost) == pytest.approx(182.766, rel=0.01)
    assert float(received.target_item_value) == pytest.approx(182.766, rel=0.01)


@pytest.mark.asyncio
async def test_process_loss_and_post_costing_reports(db_session_integration):
    db = db_session_integration
    tenant, cat, unit, wh_rm, wh_knit, yarn, greige, thread = await _seed_tenant(db)
    slug = uuid.uuid4().hex[:6]
    cust = Customer(tenant_id=tenant.id, customer_code=f"C{slug}", name="B")
    db.add(cust)
    await db.flush()
    order = Order(
        tenant_id=tenant.id,
        customer_id=cust.id,
        order_code=f"O-{slug}",
        quantity=100,
        status="CONFIRMED",
    )
    db.add(order)
    await db.flush()

    db.add(
        StockMovement(
            tenant_id=tenant.id,
            item_id=yarn.id,
            warehouse_id=wh_rm.id,
            movement_type="IN",
            quantity=Decimal("500"),
        )
    )
    yarn.current_stock = Decimal("500")
    yarn.avg_cost = Decimal("100")
    await db.flush()

    from app.modules.inventory import idt_service

    idt = await idt_service.create_idt_issue(
        db,
        tenant,
        from_warehouse_id=wh_rm.id,
        to_warehouse_id=wh_knit.id,
        process_name="Knitting",
        source_item_id=yarn.id,
        source_qty=Decimal("100"),
        source_qty_unit="kg",
        target_item_id=greige.id,
        target_qty_expected=Decimal("100"),
        target_qty_unit="kg",
        linked_order_id=order.id,
    )
    await idt_service.receive_idt(db, tenant, idt.id, Decimal("97"))
    await db.flush()

    report = await get_process_loss_report(
        db, tenant.id, date.today() - timedelta(days=1), date.today() + timedelta(days=1)
    )
    assert any(r.process_name == "Knitting" for r in report.rows)

    post = await get_post_costing_report(db, tenant.id, order.id)
    assert post.order_id == order.id
    assert len(post.stages) >= 1
    assert post.stages[0].stage == "Knitting"


@pytest.mark.asyncio
async def test_flags_off(db_session_integration):
    db = db_session_integration
    tenant, *_ = await _seed_tenant(db, flags={})
    assert is_mrp_engine_enabled(tenant.feature_flags) is False
    assert is_inter_department_transfer_enabled(tenant.feature_flags) is False
