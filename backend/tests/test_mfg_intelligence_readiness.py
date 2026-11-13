"""A13-A15: order readiness (Order BOM authority, style estimate, blockers vs information).

Run: docker compose exec backend pytest tests/test_mfg_intelligence_readiness.py -q
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.models import Bom, BomItem, Item, ItemCategory, ItemUnit, OrderFollowupAction, Warehouse
from app.models.inventory import StockMovement
from app.modules.mfg_intelligence.readiness_service import _requirement
from tests.mfg_intel_fixtures import (
    API,
    FLAGS_ON,
    MONDAY,
    add_order,
    add_plan,
    client_for,
    new_tenant,
    seed_basic_factory,
)

FLAGS_V2_OFF = {"manufacturing_intelligence_v1": True, "planning_math_v2": True}


async def _stock_setup(db, tenant):
    slug = uuid.uuid4().hex[:6]
    cat = ItemCategory(tenant_id=tenant.id, category_code=f"C{slug}", name="Fabric")
    unit = ItemUnit(tenant_id=tenant.id, unit_code=f"U{slug}"[:8], name="Mtr")
    wh = Warehouse(tenant_id=tenant.id, warehouse_code=f"W{slug}"[:10], name="Main store", is_store=True)
    db.add_all([cat, unit, wh])
    await db.flush()
    return cat, unit, wh


async def _item(db, tenant, cat, unit, wh, name, on_hand: str) -> Item:
    item = Item(tenant_id=tenant.id, item_code=f"I{uuid.uuid4().hex[:8]}", name=name, category_id=cat.id, unit_id=unit.id)
    db.add(item)
    await db.flush()
    if Decimal(on_hand) > 0:
        db.add(StockMovement(tenant_id=tenant.id, item_id=item.id, warehouse_id=wh.id, movement_type="IN", quantity=Decimal(on_hand)))
        await db.flush()
    return item


async def _bom(db, tenant, style, *, order=None, status="APPROVED", active=True, version=1) -> Bom:
    bom = Bom(
        tenant_id=tenant.id, style_id=style.id, order_id=order.id if order else None, status=status, is_active=active,
        version_no=version, bom_code=f"B{uuid.uuid4().hex[:8]}",
    )
    db.add(bom)
    await db.flush()
    return bom


async def _bom_item(db, tenant, bom, item, *, gross: str | None = None, base="1", wastage=None, loss=None) -> BomItem:
    bi = BomItem(
        tenant_id=tenant.id, bom_id=bom.id, item_id=item.id if item else None, category="FABRIC",
        base_consumption=Decimal(base), wastage_pct=Decimal(wastage) if wastage is not None else None,
        process_loss_pct=Decimal(loss) if loss is not None else None,
        required_gross_qty=Decimal(gross) if gross is not None else None,
    )
    db.add(bi)
    await db.flush()
    return bi


def _dim(body, key):
    return next(d for d in body["dimensions"] if d["key"] == key)


async def _ready_order(db, flags=FLAGS_ON, *, bom_status="APPROVED", stock="100", gross="100"):
    """A confirmed order with a firm line booking, an Order BOM and stock."""
    tenant, user, _ = await new_tenant(db, flags=flags)
    fx = await seed_basic_factory(db, tenant)
    order = await add_order(db, tenant, fx.customer, fx.style, qty=100)
    await add_plan(db, tenant, fx.line, start=MONDAY, end=MONDAY, qty="100", order=order, ob=fx.ob, shift=fx.shift)
    cat, unit, wh = await _stock_setup(db, tenant)
    item = await _item(db, tenant, cat, unit, wh, "Jersey", stock)
    bom = await _bom(db, tenant, fx.style, order=order, status=bom_status)
    await _bom_item(db, tenant, bom, item, gross=gross)
    await db.commit()
    return tenant, user, fx, order, item, bom


def test_requirement_uses_gross_when_present_else_order_qty_x_net_x_loss():
    order_qty = Decimal("100")
    item = BomItem(required_gross_qty=Decimal("55.5"), base_consumption=Decimal("9"), wastage_pct=Decimal("50"))
    assert _requirement(order_qty, item) == (Decimal("55.5"), "BOM_REQUIRED_GROSS_QTY")
    calc = BomItem(base_consumption=Decimal("2"), wastage_pct=Decimal("5"), process_loss_pct=3.0)
    assert _requirement(order_qty, calc) == (Decimal("216.0000"), "ORDER_QTY_X_NET_X_LOSS")
    net = BomItem(base_consumption=Decimal("2"), bom_net_consumption_per_unit=3.0)
    assert _requirement(order_qty, net)[0] == Decimal("300.0000")  # BOM net per unit wins over base consumption
    assert _requirement(None, calc) == (None, "ORDER_QTY_MISSING")


@pytest.mark.asyncio
async def test_active_approved_order_bom_is_the_authority_and_order_is_fully_ready(db_session_integration):
    db = db_session_integration
    tenant, user, _fx, order, item, bom = await _ready_order(db)
    async with client_for(db, tenant, user) as c:
        r = await c.get(f"{API}/orders/{order.id}/readiness")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["mode"] == "ORDER_BOM_V2" and body["material_authority"] == "ORDER_BOM"
    assert body["order_bom"] == {"bom_id": bom.id, "status": "APPROVED"}
    assert _dim(body, "commercially_confirmed")["status"] == "READY"
    assert _dim(body, "technically_approved")["status"] == "NOT_APPLICABLE"
    assert _dim(body, "capacity_allocated")["status"] == "READY"
    assert _dim(body, "financially_supported")["status"] == "NOT_EVALUATED"
    materials = _dim(body, "materials_ready")
    assert materials["status"] == "READY"
    assert "SHARED_SUPPLY_NOT_ALLOCATED" in materials["reason_codes"]  # Phase 1 limitation, always stated
    assert _dim(body, "fully_ready")["status"] == "READY"
    assert body["blockers"] == []
    assert any(i["reason"] == "SHARED_SUPPLY_NOT_ALLOCATED" for i in body["info"])
    assert any(i["dimension"] == "financially_supported" for i in body["info"])
    line = body["material_lines"][0]
    assert line["item_id"] == item.id and line["item_name"] == "Jersey"
    assert line["required_qty"] == "100.0000" and line["available_qty"] == "100.0000" and line["short_qty"] == "0.0000"
    assert line["ready"] is True and body["legacy"] is None


@pytest.mark.asyncio
async def test_frozen_order_bom_is_accepted_and_inactive_or_unapproved_is_not(db_session_integration):
    db = db_session_integration
    tenant, user, _fx, order, _item_row, bom = await _ready_order(db, bom_status="FROZEN")
    async with client_for(db, tenant, user) as c:
        assert _dim((await c.get(f"{API}/orders/{order.id}/readiness")).json(), "materials_ready")["status"] == "READY"
        bom.status = "DRAFT"
        await db.commit()
        body = (await c.get(f"{API}/orders/{order.id}/readiness")).json()
    materials = _dim(body, "materials_ready")
    assert materials["status"] == "BLOCKED" and "ORDER_BOM_NOT_APPROVED" in materials["reason_codes"]
    assert body["material_authority"] == "ORDER_BOM" and body["material_lines"] == []
    assert _dim(body, "fully_ready")["status"] == "BLOCKED"
    assert any(b["dimension"] == "materials_ready" and b["reason"] == "ORDER_BOM_NOT_APPROVED" for b in body["blockers"])


@pytest.mark.asyncio
async def test_short_material_is_a_blocker_with_department_and_info_stays_separate(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order, _item_row, bom = await _ready_order(db, stock="100")
    cat, unit, wh = await _stock_setup(db, tenant)
    short_item = await _item(db, tenant, cat, unit, wh, "Zipper", "10")
    await _bom_item(db, tenant, bom, short_item, gross="25")
    await db.commit()
    async with client_for(db, tenant, user) as c:
        body = (await c.get(f"{API}/orders/{order.id}/readiness")).json()
    assert _dim(body, "materials_ready")["status"] == "PARTIAL"
    assert _dim(body, "fully_ready")["status"] == "PARTIAL"
    mat_blocker = next(b for b in body["blockers"] if b["dimension"] == "materials_ready")
    assert mat_blocker["reason"] == "MATERIAL_SHORT"
    assert mat_blocker["department"] == "Merchandising / Procurement"
    assert mat_blocker["detail"] == "1 of 2 material line(s) short"
    zip_line = next(x for x in body["material_lines"] if x["item_name"] == "Zipper")
    assert zip_line["short_qty"] == "15.0000" and zip_line["ready"] is False
    # Informational items are never listed as blockers.
    blocker_reasons = {b["reason"] for b in body["blockers"]}
    assert "FINANCE_NOT_EVALUATED_PHASE1" not in blocker_reasons
    assert {i["dimension"] for i in body["info"]} >= {"financially_supported", "materials_ready"}


@pytest.mark.asyncio
async def test_style_bom_only_is_an_estimate_and_never_fully_ready(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags=FLAGS_ON)
    fx = await seed_basic_factory(db, tenant)
    order = await add_order(db, tenant, fx.customer, fx.style, qty=100)
    await add_plan(db, tenant, fx.line, start=MONDAY, end=MONDAY, qty="100", order=order, ob=fx.ob)
    cat, unit, wh = await _stock_setup(db, tenant)
    item = await _item(db, tenant, cat, unit, wh, "Jersey", "500")  # plenty of stock
    style_bom = await _bom(db, tenant, fx.style, order=None, status="APPROVED")
    await _bom_item(db, tenant, style_bom, item, base="2", wastage="5", loss="3")
    await db.commit()
    async with client_for(db, tenant, user) as c:
        body = (await c.get(f"{API}/orders/{order.id}/readiness")).json()
    assert body["material_authority"] == "STYLE_ESTIMATE"
    materials = _dim(body, "materials_ready")
    assert materials["informational"] is True and "STYLE_ESTIMATE_ONLY" in materials["reason_codes"]
    assert body["material_lines"][0]["required_qty"] == "216.0000"
    fully = _dim(body, "fully_ready")
    assert fully["status"] != "READY" and "ORDER_BOM_REQUIRED_FOR_FULL_READINESS" in fully["reason_codes"]
    # The estimate is informational: the material dimension is not a blocker, the missing Order BOM is.
    assert not any(b["dimension"] == "materials_ready" for b in body["blockers"])
    assert any(b["dimension"] == "fully_ready" and b["reason"] == "ORDER_BOM_MISSING" for b in body["blockers"])
    assert any(i["reason"] == "STYLE_ESTIMATE_ONLY" for i in body["info"])


@pytest.mark.asyncio
async def test_no_bom_at_all_is_unknown_and_not_fully_ready(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags=FLAGS_ON)
    fx = await seed_basic_factory(db, tenant)
    order = await add_order(db, tenant, fx.customer, fx.style)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        body = (await c.get(f"{API}/orders/{order.id}/readiness")).json()
    assert body["material_authority"] == "NONE"
    assert _dim(body, "materials_ready")["status"] == "UNKNOWN"
    assert _dim(body, "fully_ready")["status"] != "READY"
    assert _dim(body, "capacity_allocated")["status"] == "BLOCKED"
    assert any(b["dimension"] == "capacity_allocated" and b["department"] == "Production Planning" for b in body["blockers"])


@pytest.mark.asyncio
async def test_flag_off_returns_the_legacy_result_unchanged(db_session_integration):
    db = db_session_integration
    tenant, user, _fx, order, _i, _b = await _ready_order(db, flags=FLAGS_V2_OFF)
    async with client_for(db, tenant, user) as c:
        body = (await c.get(f"{API}/orders/{order.id}/readiness")).json()
    assert body["mode"] == "LEGACY_STYLE_BOM" and body["material_authority"] == "LEGACY_STYLE_BOM"
    assert body["mfg_order_bom_readiness_v2"] is False
    assert body["legacy"]["order_id"] == order.id and "chain" in body["legacy"]
    assert _dim(body, "materials_ready")["status"] == "NOT_EVALUATED"
    assert _dim(body, "fully_ready")["status"] == "NOT_EVALUATED"
    assert _dim(body, "commercially_confirmed")["status"] == "READY"  # computed without the Order BOM
    assert _dim(body, "capacity_allocated")["status"] == "READY"
    assert body["material_lines"] == []


@pytest.mark.asyncio
async def test_unconfirmed_order_is_blocked_on_commercial_confirmation(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags=FLAGS_ON)
    fx = await seed_basic_factory(db, tenant)
    order = await add_order(db, tenant, fx.customer, fx.style, status="DRAFT")
    await db.commit()
    async with client_for(db, tenant, user) as c:
        body = (await c.get(f"{API}/orders/{order.id}/readiness")).json()
    assert _dim(body, "commercially_confirmed")["status"] == "BLOCKED"
    assert any(b["reason"] == "ORDER_NOT_CONFIRMED" and b["department"] == "Merchandising" for b in body["blockers"])


@pytest.mark.asyncio
async def test_technical_approvals_ready_pending_overdue_rejected(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags=FLAGS_ON)
    fx = await seed_basic_factory(db, tenant)
    order = await add_order(db, tenant, fx.customer, fx.style)

    def action(code, **kw):
        return OrderFollowupAction(
            tenant_id=tenant.id, order_id=order.id, phase="approval", title=code, milestone_type=code, is_active=True, **kw
        )

    async def technical(c):
        return _dim((await c.get(f"{API}/orders/{order.id}/readiness")).json(), "technically_approved")

    future = date.today() + timedelta(days=30)
    past = date.today() - timedelta(days=3)
    done = action("lab_dip_approval", status="approved")
    pending = action("pp_approval", status="pending", planned_date=future)
    other = action("cutting_start", status="pending", planned_date=past)  # not a technical approval: ignored
    db.add_all([done, pending, other])
    await db.commit()
    async with client_for(db, tenant, user) as c:
        assert (await technical(c))["status"] == "PARTIAL"
        pending.planned_date = past
        await db.commit()
        t = await technical(c)
        assert t["status"] == "BLOCKED" and t["reason_codes"] == ["APPROVAL_OVERDUE"]
        pending.status, pending.planned_date, pending.is_rejected = "rejected", future, True
        await db.commit()
        t = await technical(c)
        assert t["status"] == "BLOCKED" and t["reason_codes"] == ["APPROVAL_REJECTED"]
        pending.status, pending.is_rejected, pending.approval_received_date = "approved", False, date.today()
        await db.commit()
        assert (await technical(c))["status"] == "READY"


@pytest.mark.asyncio
async def test_soft_only_booking_is_partial_capacity(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags=FLAGS_ON)
    fx = await seed_basic_factory(db, tenant)
    order = await add_order(db, tenant, fx.customer, fx.style)
    await add_plan(db, tenant, fx.line, start=MONDAY, end=MONDAY, qty="10", order=order, ob=fx.ob, rs="SOFT_BOOKED")
    await db.commit()
    async with client_for(db, tenant, user) as c:
        body = (await c.get(f"{API}/orders/{order.id}/readiness")).json()
    cap = _dim(body, "capacity_allocated")
    assert cap["status"] == "PARTIAL" and cap["reason_codes"] == ["ONLY_SOFT_BOOKED"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("extra_perms", "visible"),
    [({}, False), ({"inventory.items.read": False}, False), ({"inventory.items.read": True}, True)],
)
@pytest.mark.parametrize("v2", [True, False], ids=["order_bom_v2", "legacy"])
async def test_material_lines_need_inventory_read_under_rbac_enforce(db_session_integration, extra_perms, visible, v2):
    db = db_session_integration
    flags = {**FLAGS_ON, "rbac_enforcement": "enforce"}
    if not v2:
        flags = {**flags, "mfg_order_bom_readiness_v2": False}
    tenant, user, role = await new_tenant(db, flags=flags)
    role.permissions = {"production.planning.read": True, **extra_perms}
    fx = await seed_basic_factory(db, tenant)
    order = await add_order(db, tenant, fx.customer, fx.style, qty=100)
    await add_plan(db, tenant, fx.line, start=MONDAY, end=MONDAY, qty="100", order=order, ob=fx.ob, shift=fx.shift)
    cat, unit, wh = await _stock_setup(db, tenant)
    item = await _item(db, tenant, cat, unit, wh, "Jersey", "100")
    bom = await _bom(db, tenant, fx.style, order=order)
    await _bom_item(db, tenant, bom, item, gross="100")
    await db.commit()
    async with client_for(db, tenant, user) as c:
        r = await c.get(f"{API}/orders/{order.id}/readiness")
    assert r.status_code == 200, r.text
    body = r.json()
    hidden = any(i["reason"] == "MATERIAL_DETAIL_HIDDEN_NO_INVENTORY_ACCESS" for i in body["info"])
    if v2:
        assert _dim(body, "materials_ready")["status"] == "READY"  # status is still shown
        assert (len(body["material_lines"]) == 1) is visible
    else:
        assert body["legacy"] is not None and body["mfg_order_bom_readiness_v2"] is False
        chain_material = body["legacy"]["chain"]["material_readiness"]
        assert (len(chain_material["items"]) == 1) is visible  # per-item stock rows only with inventory read
        assert (len(body["legacy"]["lines"]) == 1) is visible
        assert chain_material["total"] == 1  # the status and counts stay visible
    assert hidden is not visible
