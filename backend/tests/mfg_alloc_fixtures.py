"""Shared seeds for the Manufacturing Intelligence Phase 2 (material allocation) tests.

Everything is built inside the test transaction; live data is never touched.
Run: docker compose exec -T backend sh -c "pytest tests/test_mfg_*.py -q"
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from types import SimpleNamespace

from app.models import Bom, BomItem, Item, ItemCategory, ItemUnit, Warehouse
from app.models.inventory import (
    GoodsReceiving,
    GoodsReceivingItem,
    PurchaseOrder,
    PurchaseOrderItem,
    StockMovement,
    StockReservation,
    Vendor,
)
from tests.mfg_intel_fixtures import add_order, add_plan, MONDAY, new_tenant, seed_basic_factory

ALLOC_FLAG = "mfg_material_allocation_v1"
PHASE1_FLAGS = {
    "manufacturing_intelligence_v1": True,
    "planning_math_v2": True,
    "mfg_order_bom_readiness_v2": True,
}


def set_flags(tenant, **flags) -> None:
    """Replace the tenant's flag dict (JSON column: assign a new dict so the change is tracked)."""
    merged = dict(tenant.feature_flags or {})
    merged.update(flags)
    tenant.feature_flags = merged


async def add_warehouse(db, tenant, name="Main store", *, quarantine=False, rejected=False) -> Warehouse:
    wh = Warehouse(
        tenant_id=tenant.id,
        warehouse_code=f"W{uuid.uuid4().hex[:8]}",
        name=name,
        is_store=not (quarantine or rejected),
        is_quarantine=quarantine,
        is_rejected=rejected,
    )
    db.add(wh)
    await db.flush()
    return wh


async def add_item(db, tenant, cat, unit, code: str, **kw) -> Item:
    item = Item(
        tenant_id=tenant.id,
        item_code=f"{code}-{uuid.uuid4().hex[:6]}",
        name=code,
        category_id=cat.id,
        unit_id=unit.id,
        **kw,
    )
    db.add(item)
    await db.flush()
    return item


async def add_movement(
    db,
    tenant,
    item,
    wh,
    qty: str,
    *,
    movement_type="IN",
    reference_type=None,
    movement_kind=None,
    order=None,
    bom_line=None,
    created_at: datetime | None = None,
) -> StockMovement:
    mv = StockMovement(
        tenant_id=tenant.id,
        item_id=item.id,
        warehouse_id=wh.id,
        movement_type=movement_type,
        quantity=Decimal(qty),
        reference_type=reference_type,
        movement_kind=movement_kind,
        order_id=order.id if order else None,
        bom_line_id=bom_line.id if bom_line else None,
    )
    if created_at is not None:
        mv.created_at = created_at
    db.add(mv)
    await db.flush()
    return mv


async def add_reservation(
    db,
    tenant,
    item,
    qty: str,
    *,
    status: str,
    kind: str | None = None,
    order=None,
    bom_item=None,
    warehouse=None,
    expires_at: datetime | None = None,
    reserved_at: datetime | None = None,
    source: str | None = None,
) -> StockReservation:
    """Test helper only (R1 has no production writer; R2 adds create / release / reassign)."""
    row = StockReservation(
        tenant_id=tenant.id,
        item_id=item.id,
        order_id=order.id if order else None,
        bom_item_id=bom_item.id if bom_item else None,
        warehouse_id=warehouse.id if warehouse else None,
        reserved_qty=Decimal(qty),
        status=status,
        reservation_kind=kind,
        reservation_source=source,
        expires_at=expires_at,
    )
    if reserved_at is not None:
        row.reserved_at = reserved_at
    db.add(row)
    await db.flush()
    return row


async def add_vendor(db, tenant) -> Vendor:
    slug = uuid.uuid4().hex[:8]
    vendor = Vendor(tenant_id=tenant.id, vendor_code=f"V{slug}"[:12], name=f"Vendor {slug}")
    db.add(vendor)
    await db.flush()
    return vendor


async def add_po(
    db,
    tenant,
    vendor,
    item,
    qty: str,
    *,
    status="APPROVED",
    order_date: date | None = None,
    expected_date: date | None = None,
) -> tuple[PurchaseOrder, PurchaseOrderItem]:
    po = PurchaseOrder(
        tenant_id=tenant.id,
        po_code=f"PO-{uuid.uuid4().hex[:8]}",
        vendor_id=vendor.id,
        supplier_name=vendor.name,
        status=status,
        order_date=order_date,
        expected_date=expected_date,
    )
    db.add(po)
    await db.flush()
    line = PurchaseOrderItem(
        tenant_id=tenant.id, purchase_order_id=po.id, item_id=item.id, quantity=Decimal(qty), unit_price=Decimal("1")
    )
    db.add(line)
    await db.flush()
    return po, line


async def add_grn_line(
    db,
    tenant,
    po,
    po_line,
    wh,
    *,
    received: str,
    accepted: str | None,
    rejected: str = "0",
    status="RECEIVED",
) -> GoodsReceivingItem:
    grn = GoodsReceiving(
        tenant_id=tenant.id,
        grn_code=f"GRN-{uuid.uuid4().hex[:6]}",
        purchase_order_id=po.id,
        received_date=date.today(),
        status=status,
        default_warehouse_id=wh.id,
    )
    db.add(grn)
    await db.flush()
    line = GoodsReceivingItem(
        tenant_id=tenant.id,
        goods_receiving_id=grn.id,
        item_id=po_line.item_id,
        warehouse_id=wh.id,
        quantity=Decimal(received),
        purchase_order_line_id=po_line.id,
        received_qty=received,
        accepted_qty=accepted,
        rejected_qty=rejected,
    )
    db.add(line)
    await db.flush()
    return line


async def seed_golden(db, *, flags: dict | None = None) -> SimpleNamespace:
    """Dataset behind the F-T1 golden test: legacy SOFT / HARD rows, open + draft POs, one cancelled order.

    Items: FAB (stock 500, base consumption 5 per piece) and TRM (stock 200, base 1, auto-reorder level 160).
    Orders: A CONFIRMED qty 300 (has the BOM and a firm line booking), B NEW qty 50, C CANCELLED qty 20.
    Legacy reservations: FAB SOFT 40 + HARD 60 (order A), FAB HARD 15 (cancelled order C),
    TRM HARD 20 (order A) + SOFT 30 (no order). FAB POs: APPROVED 1000 (300 accepted, so 700 open) + DRAFT 50.
    """
    tenant, user, _ = await new_tenant(db, flags={**PHASE1_FLAGS, **(flags or {})})
    fx = await seed_basic_factory(db, tenant)
    cat = ItemCategory(tenant_id=tenant.id, category_code=f"C{uuid.uuid4().hex[:6]}", name="Mixed")
    unit = ItemUnit(tenant_id=tenant.id, unit_code=f"U{uuid.uuid4().hex[:6]}"[:8], name="Mtr")
    db.add_all([cat, unit])
    await db.flush()
    store = await add_warehouse(db, tenant)
    quarantine = await add_warehouse(db, tenant, "Quarantine", quarantine=True)
    fab = await add_item(
        db, tenant, cat, unit, "FAB", current_stock=Decimal("500"), safety_stock=Decimal("0"), lead_time_days=10
    )
    trm = await add_item(
        db,
        tenant,
        cat,
        unit,
        "TRM",
        current_stock=Decimal("200"),
        safety_stock=Decimal("0"),
        lead_time_days=5,
        reorder_level=Decimal("160"),
        reorder_qty=Decimal("300"),
        auto_reorder_enabled=True,
    )
    await add_movement(db, tenant, fab, store, "500")
    await add_movement(db, tenant, trm, store, "200")
    await add_movement(db, tenant, fab, quarantine, "40")  # excluded from on hand by every reader

    order_a = await add_order(db, tenant, fx.customer, fx.style, status="CONFIRMED", qty=300, delivery=date(2030, 4, 1))
    order_b = await add_order(db, tenant, fx.customer, fx.style, status="NEW", qty=50, delivery=date(2030, 4, 15))
    order_c = await add_order(db, tenant, fx.customer, fx.style, status="CANCELLED", qty=20, delivery=date(2030, 4, 20))
    await add_plan(db, tenant, fx.line, start=MONDAY, end=MONDAY, qty="300", order=order_a, ob=fx.ob, shift=fx.shift)

    bom = Bom(
        tenant_id=tenant.id,
        style_id=fx.style.id,
        order_id=order_a.id,
        status="APPROVED",
        is_active=True,
        version_no=1,
        bom_code=f"B{uuid.uuid4().hex[:8]}",
    )
    db.add(bom)
    await db.flush()
    bi_fab = BomItem(tenant_id=tenant.id, bom_id=bom.id, item_id=fab.id, category="FABRIC", base_consumption=Decimal("5"))
    bi_trm = BomItem(tenant_id=tenant.id, bom_id=bom.id, item_id=trm.id, category="TRIM", base_consumption=Decimal("1"))
    db.add_all([bi_fab, bi_trm])
    await db.flush()

    vendor = await add_vendor(db, tenant)
    po, po_line = await add_po(db, tenant, vendor, fab, "1000", status="APPROVED")
    await add_grn_line(db, tenant, po, po_line, store, received="300", accepted="300")
    await add_po(db, tenant, vendor, fab, "50", status="DRAFT")

    await add_reservation(db, tenant, fab, "40", status="SOFT", order=order_a)
    await add_reservation(db, tenant, fab, "60", status="HARD", order=order_a)
    await add_reservation(db, tenant, fab, "15", status="HARD", order=order_c)
    await add_reservation(db, tenant, trm, "20", status="HARD", order=order_a)
    await add_reservation(db, tenant, trm, "30", status="SOFT")
    await db.commit()
    return SimpleNamespace(
        tenant=tenant,
        user=user,
        fx=fx,
        store=store,
        quarantine=quarantine,
        fab=fab,
        trm=trm,
        order_a=order_a,
        order_b=order_b,
        order_c=order_c,
        bom=bom,
        bi_fab=bi_fab,
        bi_trm=bi_trm,
        po=po,
        po_line=po_line,
        vendor=vendor,
    )


# ---------------------------------------------------------------------------- Phase 2 (R2) allocation seeds
from app.models import User  # noqa: E402
from tests.merch_fixtures import _create_role_for_tenant  # noqa: E402

ALLOC_FLAGS = {**PHASE1_FLAGS, ALLOC_FLAG: True}


async def add_user_with_role(db, tenant, role_name: str, permissions: dict | None = None) -> User:
    """Another user of the tenant whose role has the given name (admin / manager / merch_tester ...)."""
    slug = uuid.uuid4().hex[:8]
    role = await _create_role_for_tenant(
        db,
        tenant_id=tenant.id,
        name=role_name,
        display_name=role_name.title(),
        permissions=permissions if permissions is not None else {"*": True},
    )
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"u{slug}",
        email=f"u{slug}@example.com",
        password_hash="unused",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return user


async def add_order_bom(db, tenant, order, lines: list[tuple[Item, str]], *, status="APPROVED", active=True):
    """An Order BOM (one BomItem per (item, base consumption per piece)); required qty = order qty x consumption."""
    bom = Bom(
        tenant_id=tenant.id,
        style_id=order.style_id,
        order_id=order.id,
        status=status,
        is_active=active,
        version_no=1,
        bom_code=f"B{uuid.uuid4().hex[:8]}",
    )
    db.add(bom)
    await db.flush()
    items = []
    for item, per_piece in lines:
        bi = BomItem(tenant_id=tenant.id, bom_id=bom.id, item_id=item.id, category="FABRIC", base_consumption=Decimal(per_piece))
        db.add(bi)
        items.append(bi)
    await db.flush()
    return bom, items


async def seed_alloc(
    db,
    *,
    flags: dict | None = None,
    stock: str = "100",
    qty: int = 100,
    status: str = "CONFIRMED",
    per_piece: str = "1",
    delivery: date | None = date(2030, 4, 1),
    bom_status: str | None = "APPROVED",
    commit: bool = False,
) -> SimpleNamespace:
    """One tenant, one item FAB with `stock` on hand in the main store, one order (qty x per_piece of FAB)."""
    tenant, user, _ = await new_tenant(db, flags=ALLOC_FLAGS if flags is None else flags)
    fx = await seed_basic_factory(db, tenant)
    cat = ItemCategory(tenant_id=tenant.id, category_code=f"C{uuid.uuid4().hex[:6]}", name="Fabric")
    unit = ItemUnit(tenant_id=tenant.id, unit_code=f"U{uuid.uuid4().hex[:6]}"[:8], name="Mtr")
    db.add_all([cat, unit])
    await db.flush()
    store = await add_warehouse(db, tenant)
    fab = await add_item(db, tenant, cat, unit, "FAB", current_stock=Decimal(stock), safety_stock=Decimal("0"), lead_time_days=10)
    if Decimal(stock) > 0:
        await add_movement(db, tenant, fab, store, stock)
    order = await add_order(db, tenant, fx.customer, fx.style, status=status, qty=qty, delivery=delivery)
    bom = bis = None
    if bom_status is not None:
        bom, bis = await add_order_bom(db, tenant, order, [(fab, per_piece)], status=bom_status)
    ns = SimpleNamespace(
        tenant=tenant, user=user, fx=fx, cat=cat, unit=unit, store=store, fab=fab, order=order,
        bom=bom, bi=bis[0] if bis else None,
    )
    if commit:
        await db.commit()
    return ns


async def add_competing_order(db, ns, *, qty: int = 100, status="CONFIRMED", delivery: date | None = date(2030, 4, 15), per_piece="1"):
    """A second order of the same tenant needing the same item."""
    order = await add_order(db, ns.tenant, ns.fx.customer, ns.fx.style, status=status, qty=qty, delivery=delivery)
    bom, bis = await add_order_bom(db, ns.tenant, order, [(ns.fab, per_piece)])
    return order, bom, bis[0]
