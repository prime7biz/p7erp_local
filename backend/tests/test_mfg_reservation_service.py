"""Reservation taxonomy: flag helpers, consumption netting allowlist, effective holds (R1, read side).

Run: docker compose exec -T backend sh -c "pytest tests/test_mfg_reservation_service.py -q"
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError

from app.common import tenant_feature_keys as keys
from app.models import ItemCategory, ItemUnit
from app.modules.inventory.reservation_service import (
    CONSUMPTION_REFERENCES,
    OPEN_HOLD_ORDER_STATUSES,
    allocation_v1_enabled,
    compute_items_availability_v1,
    hard_reserved_by_item,
    is_consumption_movement,
    load_effective_holds,
    tentative_reserved_by_item,
)
from tests.mfg_alloc_fixtures import (
    ALLOC_FLAG,
    add_item,
    add_movement,
    add_reservation,
    add_warehouse,
    set_flags,
)
from tests.mfg_intel_fixtures import add_order, new_tenant, seed_basic_factory


def test_phase2_flags_are_strict_and_never_default_on():
    for key, fn in (
        ("mfg_material_allocation_v1", keys.is_mfg_material_allocation_v1_enabled),
        ("mfg_integrated_planning_v1", keys.is_mfg_integrated_planning_v1_enabled),
        ("mfg_plan_four_eyes", keys.is_mfg_plan_four_eyes_enabled),
    ):
        assert fn(None) is False and fn({}) is False and fn("true") is False
        assert fn({key: "true"}) is False and fn({key: 1}) is False and fn({key: False}) is False
        assert fn({key: True}) is True
        assert key not in keys.DEFAULT_ON_FEATURE_FLAGS


@pytest.mark.parametrize(
    "movement_type,reference_type,kind,expected",
    [
        ("OUT", "PRODUCTION_MATERIAL_ISSUE", "PROD_ISSUE", True),
        ("OUT", "CONSUMPTION_ISSUE", "CONSUMPTION_ISSUE", True),
        ("OUT", "PROCESS_ORDER", "PROCESS_INPUT", True),
        ("OUT", "MFG_ISSUE", None, True),
        ("OUT", "mfg_issue", "", True),
        ("IN", "MFG_ISSUE", None, False),  # not an OUT
        ("OUT", "MFG_RETURN", None, False),  # returns are not in the allowlist (R2 decision)
        ("IN", "MFG_RETURN", None, False),
        ("OUT", "PROCESS_ORDER", "PROCESS_OUTPUT", False),
        ("OUT", "PRODUCTION_MATERIAL_ISSUE", None, False),  # kind must match
        ("OUT", "DELIVERY_CHALLAN", None, False),
        ("OUT", "WAREHOUSE_TRANSFER", None, False),
        ("OUT", "STOCK_ADJUSTMENT", None, False),
        ("OUT", "PHYSICAL_COUNT", None, False),
        ("OUT", "GRN", "GRN_RECEIPT", False),
        ("ADJUST", "CONSUMPTION_ISSUE", "CONSUMPTION_ISSUE", False),
        ("OUT", None, None, False),
    ],
)
def test_consumption_allowlist(movement_type, reference_type, kind, expected):
    assert is_consumption_movement(movement_type, reference_type, kind) is expected


def test_allowlist_constants_are_the_verified_strings():
    assert dict(CONSUMPTION_REFERENCES) == {
        "PRODUCTION_MATERIAL_ISSUE": "PROD_ISSUE",
        "CONSUMPTION_ISSUE": "CONSUMPTION_ISSUE",
        "PROCESS_ORDER": "PROCESS_INPUT",
        "MFG_ISSUE": None,
    }
    assert OPEN_HOLD_ORDER_STATUSES == {"NEW", "CONFIRMED", "IN_PROGRESS", "DRAFT"}


async def _setup(db, *, flags=None):
    tenant, user, _ = await new_tenant(db, flags=flags or {})
    fx = await seed_basic_factory(db, tenant)
    cat = ItemCategory(tenant_id=tenant.id, category_code=f"C{uuid.uuid4().hex[:6]}", name="Mixed")
    unit = ItemUnit(tenant_id=tenant.id, unit_code=f"U{uuid.uuid4().hex[:6]}"[:8], name="Mtr")
    db.add_all([cat, unit])
    await db.flush()
    store = await add_warehouse(db, tenant)
    item = await add_item(db, tenant, cat, unit, "FAB", current_stock=Decimal("0"))
    order = await add_order(db, tenant, fx.customer, fx.style, status="CONFIRMED", qty=100, delivery=date(2030, 4, 1))
    return tenant, fx, store, item, order


async def _effective(db, tenant, item, **kw) -> Decimal:
    return (await hard_reserved_by_item(db, tenant.id, [item.id], **kw))[item.id]


@pytest.mark.asyncio
async def test_flag_lookup_strict_and_override(db_session_integration):
    db = db_session_integration
    tenant, *_ = await _setup(db)
    assert await allocation_v1_enabled(db, tenant.id) is False
    set_flags(tenant, **{ALLOC_FLAG: "true"})
    assert await allocation_v1_enabled(db, tenant.id) is False  # only a real true counts
    set_flags(tenant, **{ALLOC_FLAG: True})
    assert await allocation_v1_enabled(db, tenant.id) is True
    assert await allocation_v1_enabled(db, tenant.id, False) is False  # explicit override wins
    assert await allocation_v1_enabled(db, 999_999_999) is False  # unknown tenant


@pytest.mark.asyncio
async def test_kinds_and_legacy_mapping(db_session_integration):
    db = db_session_integration
    tenant, fx, store, item, order = await _setup(db)
    await add_reservation(db, tenant, item, "10", status="HARD", order=order)  # legacy HARD -> hard
    await add_reservation(db, tenant, item, "7", status="SOFT")  # legacy SOFT -> tentative
    await add_reservation(db, tenant, item, "5", status="RELEASED")  # released: nowhere
    await add_reservation(db, tenant, item, "20", status="ACTIVE", kind="HARD_ATP", order=order)
    await add_reservation(db, tenant, item, "3", status="ACTIVE", kind="TENTATIVE", order=order)
    await add_reservation(db, tenant, item, "99", status="ACTIVE", kind="INFORMATIONAL", order=order)
    await db.flush()
    assert await _effective(db, tenant, item) == Decimal("30")
    assert (await tentative_reserved_by_item(db, tenant.id, [item.id]))[item.id] == Decimal("10")


@pytest.mark.asyncio
async def test_expired_tentative_and_non_open_orders_count_zero(db_session_integration):
    db = db_session_integration
    tenant, fx, store, item, order = await _setup(db)
    cancelled = await add_order(db, tenant, fx.customer, fx.style, status="CANCELLED", qty=1)
    shipped = await add_order(db, tenant, fx.customer, fx.style, status="SHIPPED", qty=1)
    draft = await add_order(db, tenant, fx.customer, fx.style, status="DRAFT", qty=1)
    draft2 = await add_order(db, tenant, fx.customer, fx.style, status="DRAFT", qty=1)
    now = datetime.utcnow()
    await add_reservation(db, tenant, item, "10", status="ACTIVE", kind="TENTATIVE", order=draft, expires_at=now - timedelta(days=1))
    await add_reservation(db, tenant, item, "4", status="ACTIVE", kind="TENTATIVE", order=draft2, expires_at=now + timedelta(days=1))
    await add_reservation(db, tenant, item, "50", status="HARD", order=cancelled)
    await add_reservation(db, tenant, item, "60", status="ACTIVE", kind="HARD_ATP", order=shipped)
    await add_reservation(db, tenant, item, "8", status="HARD", order=order)
    await db.flush()
    assert await _effective(db, tenant, item) == Decimal("8")
    assert (await tentative_reserved_by_item(db, tenant.id, [item.id]))[item.id] == Decimal("4")


@pytest.mark.asyncio
async def test_own_order_and_excluded_orders_are_skipped(db_session_integration):
    db = db_session_integration
    tenant, fx, store, item, order = await _setup(db)
    other = await add_order(db, tenant, fx.customer, fx.style, status="CONFIRMED", qty=1)
    await add_reservation(db, tenant, item, "10", status="ACTIVE", kind="HARD_ATP", order=order)
    await add_reservation(db, tenant, item, "6", status="ACTIVE", kind="HARD_ATP", order=other)
    await add_reservation(db, tenant, item, "2", status="HARD")  # no order
    await db.flush()
    assert await _effective(db, tenant, item) == Decimal("18")
    assert await _effective(db, tenant, item, own_order_id=order.id) == Decimal("8")
    assert await _effective(db, tenant, item, exclude_order_ids={order.id, other.id}) == Decimal("2")


@pytest.mark.asyncio
async def test_consumption_netting_by_allowlist(db_session_integration):
    db = db_session_integration
    tenant, fx, store, item, order = await _setup(db)
    quarantine = await add_warehouse(db, tenant, "Quarantine", quarantine=True)
    past = datetime.utcnow() - timedelta(days=2)
    hold = await add_reservation(db, tenant, item, "100", status="ACTIVE", kind="HARD_ATP", order=order, reserved_at=past + timedelta(hours=1))
    await add_movement(db, tenant, item, store, "500")
    # counted (30 + 10 + 5 + 5 = 50)
    await add_movement(db, tenant, item, store, "30", movement_type="OUT", reference_type="PRODUCTION_MATERIAL_ISSUE", movement_kind="PROD_ISSUE", order=order)
    await add_movement(db, tenant, item, store, "10", movement_type="OUT", reference_type="CONSUMPTION_ISSUE", movement_kind="CONSUMPTION_ISSUE", order=order)
    await add_movement(db, tenant, item, store, "5", movement_type="OUT", reference_type="PROCESS_ORDER", movement_kind="PROCESS_INPUT", order=order)
    await add_movement(db, tenant, item, store, "5", movement_type="OUT", reference_type="MFG_ISSUE", order=order)
    # ignored: wrong reference, transfer, challan, no order, quarantine warehouse, before the hold, IN movement
    await add_movement(db, tenant, item, store, "9", movement_type="OUT", reference_type="WAREHOUSE_TRANSFER", order=order)
    await add_movement(db, tenant, item, store, "9", movement_type="OUT", reference_type="DELIVERY_CHALLAN", order=order)
    await add_movement(db, tenant, item, store, "9", movement_type="OUT", reference_type="MFG_ISSUE", order=None)
    await add_movement(db, tenant, item, quarantine, "9", movement_type="OUT", reference_type="MFG_ISSUE", order=order)
    await add_movement(db, tenant, item, store, "9", movement_type="OUT", reference_type="MFG_ISSUE", order=order, created_at=past)
    await add_movement(db, tenant, item, store, "9", movement_type="IN", reference_type="MFG_ISSUE", order=order)
    await db.flush()
    (h,) = await load_effective_holds(db, tenant.id, [item.id])
    assert (h.reserved_qty, h.consumed_qty, h.effective_qty) == (Decimal("100"), Decimal("50"), Decimal("50"))
    assert h.reservation_id == hold.id


@pytest.mark.asyncio
async def test_netting_never_goes_below_zero_and_matches_bom_line(db_session_integration):
    from app.models import Bom, BomItem

    db = db_session_integration
    tenant, fx, store, item, order = await _setup(db)
    bom = Bom(tenant_id=tenant.id, style_id=fx.style.id, order_id=order.id, status="APPROVED", is_active=True,
              version_no=1, bom_code=f"B{uuid.uuid4().hex[:8]}")
    db.add(bom)
    await db.flush()
    line_a = BomItem(tenant_id=tenant.id, bom_id=bom.id, item_id=item.id, category="FABRIC", base_consumption=Decimal("1"))
    line_b = BomItem(tenant_id=tenant.id, bom_id=bom.id, item_id=item.id, category="FABRIC", base_consumption=Decimal("1"))
    db.add_all([line_a, line_b])
    await db.flush()
    old = datetime.utcnow() - timedelta(days=1)
    await add_reservation(db, tenant, item, "40", status="ACTIVE", kind="HARD_ATP", order=order, bom_item=line_a, reserved_at=old)
    await add_reservation(db, tenant, item, "40", status="ACTIVE", kind="HARD_ATP", order=order, bom_item=line_b, reserved_at=old)
    await add_movement(db, tenant, item, store, "100", movement_type="OUT", reference_type="MFG_ISSUE", order=order, bom_line=line_a)
    await db.flush()
    by_line = {h.bom_item_id: h for h in await load_effective_holds(db, tenant.id, [item.id])}
    assert by_line[line_a.id].effective_qty == Decimal("0")  # issue of 100 > hold 40: floored at 0
    assert by_line[line_b.id].effective_qty == Decimal("40")  # a different BOM line is not netted


@pytest.mark.asyncio
async def test_other_tenant_holds_are_invisible(db_session_integration):
    db = db_session_integration
    tenant, fx, store, item, order = await _setup(db)
    other, ofx, ostore, oitem, oorder = await _setup(db)
    await add_reservation(db, other, oitem, "77", status="ACTIVE", kind="HARD_ATP", order=oorder)
    await add_reservation(db, tenant, item, "5", status="ACTIVE", kind="HARD_ATP", order=order)
    await db.flush()
    # even when asking this tenant for the other tenant's item id, nothing leaks
    got = await hard_reserved_by_item(db, tenant.id, [item.id, oitem.id])
    assert got == {item.id: Decimal("5.0000"), oitem.id: Decimal("0.0000")}


@pytest.mark.asyncio
async def test_availability_v1_nets_issued_stock_once(db_session_integration):
    db = db_session_integration
    tenant, fx, store, item, order = await _setup(db, flags={ALLOC_FLAG: True})
    old = datetime.utcnow() - timedelta(days=1)
    await add_movement(db, tenant, item, store, "100")
    await add_reservation(db, tenant, item, "60", status="ACTIVE", kind="HARD_ATP", order=order, reserved_at=old)
    await add_movement(db, tenant, item, store, "20", movement_type="OUT", reference_type="MFG_ISSUE", order=order)
    await db.commit()
    slot = (await compute_items_availability_v1(db, tenant.id, [item.id]))[item.id]
    # on hand 80 after the issue; hold 60 - 20 issued = 40 still held; available 40 (not 20: no double count)
    assert (slot.on_hand, slot.reserved, slot.available) == (80.0, 40.0, 40.0)
    own = (await compute_items_availability_v1(db, tenant.id, [item.id], own_order_id=order.id))[item.id]
    assert (own.reserved, own.available) == (0.0, 80.0)  # own holds added back for the order's own check


@pytest.mark.asyncio
async def test_database_rejects_active_rows_without_kind_and_duplicate_active_holds(db_session_integration):
    db = db_session_integration
    tenant, fx, store, item, order = await _setup(db)
    with pytest.raises(IntegrityError):
        async with db.begin_nested():
            await add_reservation(db, tenant, item, "1", status="ACTIVE", kind=None, order=order)
    with pytest.raises(IntegrityError):
        async with db.begin_nested():
            await add_reservation(db, tenant, item, "1", status="ACTIVE", kind="NOT_A_KIND", order=order)
    await add_reservation(db, tenant, item, "1", status="ACTIVE", kind="HARD_ATP", order=order)
    with pytest.raises(IntegrityError):
        async with db.begin_nested():
            await add_reservation(db, tenant, item, "2", status="ACTIVE", kind="HARD_ATP", order=order)
    # a different kind, a released duplicate and a legacy row are all fine
    await add_reservation(db, tenant, item, "2", status="ACTIVE", kind="TENTATIVE", order=order)
    await add_reservation(db, tenant, item, "2", status="RELEASED", kind="HARD_ATP", order=order)
    await add_reservation(db, tenant, item, "2", status="HARD", order=order)

