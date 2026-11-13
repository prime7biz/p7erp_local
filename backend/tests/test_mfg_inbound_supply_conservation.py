"""F-T2: inbound supply is counted once (open PO supply service, availability, MRP).

Plan section 15: open = APPROVED / PARTIALLY_RECEIVED; usable received = QC-accepted quantity on RECEIVED GRNs;
pending QC is inbound, never on hand; line_on_order_net = max(0, ordered - usable_received).
Pegging (run R2): free_inbound = on_order_net - effective HARD pegs; the stressed view also subtracts TENTATIVE pegs;
free_inbound + hard_pegged = on_order_net always (F-T2 invariant).

Run: docker compose exec -T backend sh -c "pytest tests/test_mfg_inbound_supply_conservation.py -q"
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest

from app.models import Bom, BomItem, ItemCategory, ItemUnit
from app.models.inventory import GrnQualityInspection
from app.models.supplier_portal import SupplierPoUpdate
from app.modules.inventory.mrp_engine_service import run_mrp
from app.modules.inventory.open_po_supply_service import (
    ETA_ORDER_DATE_LEAD_TIME,
    ETA_PO_EXPECTED_DATE,
    ETA_SUPPLIER_CONFIRMED,
    ETA_SUPPLIER_SHIP_DATE,
    ETA_UNKNOWN,
    inbound_by_item,
    load_open_po_lines,
    on_order_net_by_item,
    pending_po_by_item,
    usable_received_qty,
)
from app.modules.inventory.stock_availability_service import compute_items_availability
from tests.mfg_alloc_fixtures import (
    ALLOC_FLAG,
    add_grn_line,
    add_item,
    add_movement,
    add_po,
    add_reservation,
    add_vendor,
    add_warehouse,
    set_flags,
)
from tests.mfg_intel_fixtures import MONDAY, add_order, new_tenant, seed_basic_factory


async def _base(db, *, flags=None):
    tenant, user, _ = await new_tenant(db, flags=flags or {})
    cat = ItemCategory(tenant_id=tenant.id, category_code=f"C{uuid.uuid4().hex[:6]}", name="Mixed")
    unit = ItemUnit(tenant_id=tenant.id, unit_code=f"U{uuid.uuid4().hex[:6]}"[:8], name="Mtr")
    db.add_all([cat, unit])
    await db.flush()
    store = await add_warehouse(db, tenant)
    quarantine = await add_warehouse(db, tenant, "Quarantine", quarantine=True)
    vendor = await add_vendor(db, tenant)
    item = await add_item(db, tenant, cat, unit, "FAB", current_stock=Decimal("0"), lead_time_days=10)
    return tenant, user, cat, unit, store, quarantine, vendor, item


def test_usable_received_rule_blank_accepted_falls_back_to_received_only():
    assert usable_received_qty("300", "300") == Decimal("300")
    assert usable_received_qty("0", "100") == Decimal("0")  # waiting for QC or fully rejected: NOT usable
    assert usable_received_qty(None, "100") == Decimal("100")  # legacy row without a QC result
    assert usable_received_qty("  ", "100") == Decimal("100")
    assert usable_received_qty("abc", "100") == Decimal("0")


@pytest.mark.asyncio
async def test_po_1000_accepted_300_leaves_700_open_and_status_rules(db_session_integration):
    db = db_session_integration
    tenant, _u, _c, _n, store, _q, vendor, item = await _base(db)
    po, line = await add_po(db, tenant, vendor, item, "1000", status="APPROVED")
    await add_grn_line(db, tenant, po, line, store, received="300", accepted="300")
    await add_po(db, tenant, vendor, item, "50", status="DRAFT")
    await add_po(db, tenant, vendor, item, "70", status="SUBMITTED")
    await add_po(db, tenant, vendor, item, "400", status="RECEIVED")  # fully received: not supply
    await add_po(db, tenant, vendor, item, "400", status="CANCELLED")
    _po2, line2 = await add_po(db, tenant, vendor, item, "200", status="PARTIALLY_RECEIVED")
    await add_grn_line(db, tenant, _po2, line2, store, received="50", accepted="50", status="DRAFT")  # DRAFT GRN
    await db.flush()

    inbound = (await inbound_by_item(db, tenant.id, [item.id]))[item.id]
    assert inbound.ordered == Decimal("1200")
    assert inbound.usable_received == Decimal("300")
    assert inbound.on_order_net == Decimal("700") + Decimal("200")  # 700 + the partially received PO, DRAFT GRN ignored
    assert (await on_order_net_by_item(db, tenant.id, [item.id]))[item.id] == Decimal("900")
    assert (await pending_po_by_item(db, tenant.id, [item.id]))[item.id] == Decimal("120")  # DRAFT 50 + SUBMITTED 70


@pytest.mark.asyncio
async def test_availability_counts_inbound_once_and_never_the_draft_po(db_session_integration):
    db = db_session_integration
    tenant, _u, _c, _n, store, _q, vendor, item = await _base(db, flags={ALLOC_FLAG: True})
    await add_movement(db, tenant, item, store, "100")
    po, line = await add_po(db, tenant, vendor, item, "1000", status="APPROVED")
    await add_grn_line(db, tenant, po, line, store, received="300", accepted="300")
    await add_po(db, tenant, vendor, item, "50", status="DRAFT")
    await add_reservation(db, tenant, item, "40", status="ACTIVE", kind="HARD_ATP")
    await db.commit()

    slot = (await compute_items_availability(db, tenant.id, [item.id]))[item.id]
    assert (slot.on_hand, slot.in_transit, slot.reserved, slot.available) == (100.0, 700.0, 40.0, 760.0)
    # on_hand + free inbound (700) never exceeds stock + what is still to arrive
    assert slot.on_hand + slot.in_transit - slot.reserved == slot.available


@pytest.mark.asyncio
async def test_pending_qc_is_inbound_not_on_hand_and_rejected_stays_open(db_session_integration):
    db = db_session_integration
    tenant, _u, _c, _n, store, quarantine, vendor, item = await _base(db, flags={ALLOC_FLAG: True})
    po, line = await add_po(db, tenant, vendor, item, "300", status="APPROVED")
    # 100 received, QC not done: accepted 0, stock sits in quarantine
    waiting = await add_grn_line(db, tenant, po, line, quarantine, received="100", accepted="0")
    await add_movement(db, tenant, item, quarantine, "100")
    db.add(
        GrnQualityInspection(
            tenant_id=tenant.id, grn_id=waiting.goods_receiving_id, grn_item_id=waiting.id,
            received_qty=Decimal("100"), status="PENDING",
        )
    )
    # 100 received, QC done: 60 accepted, 40 rejected
    done = await add_grn_line(db, tenant, po, line, store, received="100", accepted="60", rejected="40")
    await add_movement(db, tenant, item, store, "60")
    db.add(
        GrnQualityInspection(
            tenant_id=tenant.id, grn_id=done.goods_receiving_id, grn_item_id=done.id,
            received_qty=Decimal("100"), accepted_qty=Decimal("60"), rejected_qty=Decimal("40"),
            status="COMPLETED", result="PARTIAL",
        )
    )
    await db.commit()

    (ln,) = await load_open_po_lines(db, tenant.id, [item.id])
    assert ln.usable_received == Decimal("60")
    assert ln.on_order_net == Decimal("240")  # 300 - 60: pending QC (100) and rejected (40) both stay open
    assert ln.pending_qc == Decimal("100")  # received, waiting for QC
    slot = (await compute_items_availability(db, tenant.id, [item.id]))[item.id]
    assert slot.on_hand == 60.0  # quarantine stock is NOT on hand
    assert slot.in_transit == 240.0


@pytest.mark.asyncio
async def test_eta_chain(db_session_integration):
    db = db_session_integration
    tenant, _u, _c, _n, _s, _q, vendor, item = await _base(db)
    d = date(2030, 5, 10)
    # 1 supplier SHIP_DATE wins over PO expected date; receipt buffer is added
    po1, l1 = await add_po(db, tenant, vendor, item, "10", expected_date=date(2030, 6, 1), order_date=date(2030, 1, 1))
    db.add(SupplierPoUpdate(tenant_id=tenant.id, purchase_order_id=po1.id, kind="SHIP_DATE", expected_ship_date=d))
    # 2 newest update is DECLINED: supplier dates are ignored, PO expected date is used
    po2, l2 = await add_po(db, tenant, vendor, item, "10", expected_date=date(2030, 6, 2), order_date=date(2030, 1, 1))
    old = datetime(2030, 1, 1)
    db.add(SupplierPoUpdate(tenant_id=tenant.id, purchase_order_id=po2.id, kind="CONFIRMED", expected_ship_date=d, created_at=old))
    db.add(SupplierPoUpdate(tenant_id=tenant.id, purchase_order_id=po2.id, kind="DECLINED", created_at=old + timedelta(days=1)))
    # 3 no dates: order_date + item lead time (10 days)
    po3, l3 = await add_po(db, tenant, vendor, item, "10", order_date=date(2030, 1, 1))
    # 4 nothing: UNKNOWN
    po4, l4 = await add_po(db, tenant, vendor, item, "10")
    # 5 only CONFIRMED with a date
    po5, l5 = await add_po(db, tenant, vendor, item, "10")
    db.add(SupplierPoUpdate(tenant_id=tenant.id, purchase_order_id=po5.id, kind="CONFIRMED", expected_ship_date=d))
    await db.flush()

    got = {ln.po_line_id: ln for ln in await load_open_po_lines(db, tenant.id, [item.id], receipt_buffer_days=2)}
    assert (got[l1.id].expected_date, got[l1.id].eta_source) == (d + timedelta(days=2), ETA_SUPPLIER_SHIP_DATE)
    assert (got[l2.id].expected_date, got[l2.id].eta_source) == (date(2030, 6, 4), ETA_PO_EXPECTED_DATE)
    assert (got[l3.id].expected_date, got[l3.id].eta_source) == (date(2030, 1, 13), ETA_ORDER_DATE_LEAD_TIME)
    assert (got[l4.id].expected_date, got[l4.id].eta_source) == (None, ETA_UNKNOWN)
    assert (got[l5.id].expected_date, got[l5.id].eta_source) == (d + timedelta(days=2), ETA_SUPPLIER_CONFIRMED)


@pytest.mark.asyncio
async def test_other_tenant_supply_is_never_counted(db_session_integration):
    db = db_session_integration
    tenant, _u, _c, _n, store, _q, vendor, item = await _base(db)
    other, _ou, _oc, _on, ostore, _oq, overdor, oitem = await _base(db)
    po, line = await add_po(db, tenant, vendor, item, "100", status="APPROVED")
    opo, oline = await add_po(db, other, overdor, oitem, "900", status="APPROVED")
    await db.flush()
    assert (await on_order_net_by_item(db, tenant.id, [item.id, oitem.id])) == {item.id: Decimal("100.0000"), oitem.id: Decimal("0.0000")}


async def _mrp_dataset(db, *, flags):
    """One confirmed order needing 100 of FAB; stock 100; the order holds 100 for itself (HARD)."""
    tenant, user, cat, unit, store, _q, vendor, item = await _base(db, flags=flags)
    item.current_stock = Decimal("100")
    item.safety_stock = Decimal("0")
    fx = await seed_basic_factory(db, tenant)
    order = await add_order(db, tenant, fx.customer, fx.style, status="CONFIRMED", qty=100, delivery=date(2030, 4, 1))
    bom = Bom(tenant_id=tenant.id, style_id=fx.style.id, order_id=order.id, status="APPROVED", is_active=True,
              version_no=1, bom_code=f"B{uuid.uuid4().hex[:8]}")
    db.add(bom)
    await db.flush()
    db.add(BomItem(tenant_id=tenant.id, bom_id=bom.id, item_id=item.id, category="FABRIC", base_consumption=Decimal("1")))
    await add_movement(db, tenant, item, store, "100")
    await add_reservation(db, tenant, item, "100", status="ACTIVE", kind="HARD_ATP", order=order, source="TEST")
    await db.commit()
    return tenant, item, order


@pytest.mark.asyncio
async def test_mrp_does_not_subtract_the_gross_orders_own_hold_twice(db_session_integration):
    db = db_session_integration
    tenant, item, order = await _mrp_dataset(db, flags={ALLOC_FLAG: True})
    result = await run_mrp(db, tenant.id, as_of_date=MONDAY)
    # stock 100 covers the order's 100; its own hold is NOT subtracted again, so nothing is planned
    assert result.planned_orders == []

    # flag OFF: the ACTIVE row is invisible to the legacy rule (it reads only SOFT / HARD), still nothing planned
    set_flags(tenant, **{ALLOC_FLAG: False})
    await db.flush()
    legacy = await run_mrp(db, tenant.id, as_of_date=MONDAY)
    assert legacy.planned_orders == []


@pytest.mark.asyncio
async def test_mrp_uses_net_open_supply_and_ignores_draft_pos_when_flag_on(db_session_integration):
    db = db_session_integration
    tenant, _u, cat, unit, store, _q, vendor, item = await _base(db, flags={})
    item.current_stock = Decimal("0")
    item.safety_stock = Decimal("0")
    fx = await seed_basic_factory(db, tenant)
    order = await add_order(db, tenant, fx.customer, fx.style, status="CONFIRMED", qty=1000, delivery=date(2030, 4, 1))
    bom = Bom(tenant_id=tenant.id, style_id=fx.style.id, order_id=order.id, status="APPROVED", is_active=True,
              version_no=1, bom_code=f"B{uuid.uuid4().hex[:8]}")
    db.add(bom)
    await db.flush()
    db.add(BomItem(tenant_id=tenant.id, bom_id=bom.id, item_id=item.id, category="FABRIC", base_consumption=Decimal("1")))
    po, line = await add_po(db, tenant, vendor, item, "800", status="APPROVED")
    await add_grn_line(db, tenant, po, line, store, received="300", accepted="300")
    await add_po(db, tenant, vendor, item, "500", status="DRAFT")
    await db.commit()

    legacy = await run_mrp(db, tenant.id, as_of_date=MONDAY)
    # legacy: on order = 800 (no receipt netting) + 500 (DRAFT) = 1300 -> nothing planned (over-covered)
    assert legacy.planned_orders == []

    set_flags(tenant, **{ALLOC_FLAG: True})
    await db.flush()
    net = await run_mrp(db, tenant.id, as_of_date=MONDAY)
    # flag ON: stock 0 + net open 500 (800 - 300 accepted; DRAFT excluded) -> short 500
    assert [(str(p.required_qty), str(p.planned_qty)) for p in net.planned_orders] == [("1000.0000", "500.0000")]


# ------------------------------------------------------------------ pegging (run R2)


async def _pegged_item(db, *, hard: str | None = None, tentative: str | None = None, accepted: str = "300"):
    """PO 1000 with `accepted` received (so 1000 - accepted is open), plus optional pegs of one confirmed order."""
    from app.models import MfgMaterialSupplyPegging

    tenant, _u, _c, _n, store, _q, vendor, item = await _base(db, flags={ALLOC_FLAG: True})
    fx = await seed_basic_factory(db, tenant)
    order = await add_order(db, tenant, fx.customer, fx.style, status="CONFIRMED", qty=10, delivery=date(2030, 4, 1))
    po, line = await add_po(db, tenant, vendor, item, "1000", status="APPROVED", expected_date=date(2030, 5, 1))
    await add_grn_line(db, tenant, po, line, store, received=accepted, accepted=accepted)
    pegs = []
    for kind, qty in (("HARD", hard), ("TENTATIVE", tentative)):
        if qty is None:
            continue
        peg = MfgMaterialSupplyPegging(
            tenant_id=tenant.id, purchase_order_item_id=line.id, purchase_order_id=po.id, item_id=item.id,
            order_id=order.id, peg_kind=kind, pegged_qty=Decimal(qty), status="ACTIVE",
            expires_at=datetime.utcnow() + timedelta(days=5) if kind == "TENTATIVE" else None,
        )
        db.add(peg)
        pegs.append(peg)
    await db.commit()
    return tenant, item, order, line, pegs


@pytest.mark.asyncio
async def test_hard_peg_400_of_700_open_leaves_300_free(db_session_integration):
    from app.modules.inventory.reservation_service import item_allocation_views

    db = db_session_integration
    tenant, item, _order, _line, _pegs = await _pegged_item(db, hard="400")
    view = (await item_allocation_views(db, tenant.id, [item.id]))[item.id]
    assert (view.on_order_net, view.hard_pegged, view.free_inbound) == (Decimal("700"), Decimal("400"), Decimal("300"))
    assert view.free_inbound + view.hard_pegged == view.on_order_net  # F-T2 invariant
    slot = (await compute_items_availability(db, tenant.id, [item.id]))[item.id]
    assert slot.in_transit == 300.0  # the legacy-shaped reader shows free inbound only


@pytest.mark.asyncio
async def test_tentative_peg_only_reduces_the_stressed_view(db_session_integration):
    from app.modules.inventory.reservation_service import item_allocation_views

    db = db_session_integration
    tenant, item, _order, _line, _pegs = await _pegged_item(db, hard="400", tentative="200")
    view = (await item_allocation_views(db, tenant.id, [item.id]))[item.id]
    assert view.free_inbound == Decimal("300")  # tentative never reduces the hard view
    assert view.tentative_pegged == Decimal("200")
    assert view.atp_hard - view.atp_stressed == Decimal("200")
    assert view.free_inbound - view.tentative_pegged == Decimal("100")  # stressed free inbound


@pytest.mark.asyncio
async def test_own_order_pegs_are_added_back_for_that_order(db_session_integration):
    from app.modules.inventory.reservation_service import compute_items_availability_v1

    db = db_session_integration
    tenant, item, order, _line, _pegs = await _pegged_item(db, hard="400")
    other = (await compute_items_availability_v1(db, tenant.id, [item.id]))[item.id]
    own = (await compute_items_availability_v1(db, tenant.id, [item.id], own_order_id=order.id))[item.id]
    assert other.in_transit == 300.0 and own.in_transit == 700.0


@pytest.mark.asyncio
async def test_receipts_shrinking_open_supply_below_pegs_never_goes_negative_and_is_a_conflict(db_session_integration):
    from app.modules.inventory import allocation_reconcile_service as reconcile
    from app.modules.inventory.reservation_service import item_allocation_views

    db = db_session_integration
    # PO 1000, 800 accepted -> only 200 still open, but 400 are pegged
    tenant, item, _order, _line, pegs = await _pegged_item(db, hard="400", accepted="800")
    view = (await item_allocation_views(db, tenant.id, [item.id]))[item.id]
    assert view.on_order_net == Decimal("200")
    assert view.hard_pegged == Decimal("200")  # capped to the open balance
    assert view.free_inbound == Decimal("0") and view.free_inbound >= 0
    assert view.free_inbound + view.hard_pegged == view.on_order_net
    out = await reconcile.list_conflicts(db, tenant.id)
    assert any(i["code"] == "PEG_EXCEEDS_OPEN_SUPPLY" and i["peg_id"] == pegs[0].id for i in out["items"])


@pytest.mark.asyncio
async def test_other_tenants_pegs_never_reduce_free_inbound(db_session_integration):
    from app.modules.inventory.reservation_service import item_allocation_views

    db = db_session_integration
    tenant, item, _order, _line, _pegs = await _pegged_item(db, hard="400")
    other_tenant, other_item, *_ = await _pegged_item(db)
    view = (await item_allocation_views(db, other_tenant.id, [other_item.id]))[other_item.id]
    assert view.hard_pegged == Decimal("0") and view.free_inbound == Decimal("700")
    _ = (tenant, item)
