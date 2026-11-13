"""Material readiness v3 (flag mfg_material_allocation_v1): ready = issued + own hard holds; POs only give a date.

Run: docker compose exec -T backend sh -c "pytest tests/test_mfg_readiness_v3.py -q -p no:warnings"
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest

from app.models import MfgMaterialSupplyPegging
from tests.mfg_alloc_fixtures import (
    ALLOC_FLAGS,
    PHASE1_FLAGS,
    add_movement,
    add_po,
    add_reservation,
    add_vendor,
    seed_alloc,
)
from tests.mfg_intel_fixtures import API, MONDAY, add_plan, client_for

pytestmark = pytest.mark.asyncio


def _materials(body):
    return next(d for d in body["dimensions"] if d["key"] == "materials_ready")


async def _get(db, ns, path="readiness"):
    async with client_for(db, ns.tenant, ns.user) as c:
        r = await c.get(f"{API}/orders/{ns.order.id}/{path}")
    assert r.status_code == 200, r.text
    return r.json()


async def test_stock_on_hand_without_a_hold_is_not_ready(db_session_integration):
    db = db_session_integration
    ns = await seed_alloc(db, stock="100", qty=100)
    body = await _get(db, ns)
    m = _materials(body)
    assert m["status"] in ("BLOCKED", "PARTIAL")
    assert "SUPPLY_NOT_PEGGED" in m["reason_codes"]
    assert "SHARED_SUPPLY_NOT_ALLOCATED" not in m["reason_codes"]
    assert not any(i["reason"] == "SHARED_SUPPLY_NOT_ALLOCATED" for i in body["info"])
    line = body["material_lines"][0]
    assert line["ready"] is False and line["short_qty"] == "100.0000"
    assert line["held_qty"] == "0.0000" and line["issued_qty"] == "0.0000"


async def test_own_hard_hold_makes_the_line_ready(db_session_integration):
    db = db_session_integration
    ns = await seed_alloc(db, stock="100", qty=100)
    await add_reservation(db, ns.tenant, ns.fab, "100", status="ACTIVE", kind="HARD_ATP", order=ns.order, bom_item=ns.bi)
    body = await _get(db, ns)
    assert _materials(body)["status"] == "READY"
    line = body["material_lines"][0]
    assert line["ready"] is True and line["held_qty"] == "100.0000" and line["short_qty"] == "0.0000"


async def test_issued_material_counts_as_ready(db_session_integration):
    db = db_session_integration
    ns = await seed_alloc(db, stock="100", qty=100)
    await add_movement(
        db, ns.tenant, ns.fab, ns.store, "100", movement_type="OUT", reference_type="MFG_ISSUE", order=ns.order, bom_line=ns.bi
    )
    body = await _get(db, ns)
    assert _materials(body)["status"] == "READY"
    assert body["material_lines"][0]["issued_qty"] == "100.0000"


async def test_tentative_hold_is_information_only(db_session_integration):
    db = db_session_integration
    ns = await seed_alloc(db, stock="100", qty=100)
    await add_reservation(
        db, ns.tenant, ns.fab, "100", status="ACTIVE", kind="TENTATIVE", order=ns.order, bom_item=ns.bi,
        expires_at=datetime.utcnow() + timedelta(days=5),
    )
    body = await _get(db, ns)
    assert _materials(body)["status"] in ("BLOCKED", "PARTIAL")
    line = body["material_lines"][0]
    assert line["ready"] is False and line["tentative_held_qty"] == "100.0000"
    assert any(i["reason"] == "TENTATIVE_HOLD_NOT_READY" for i in body["info"])


async def test_hard_peg_gives_expected_date_but_is_not_ready(db_session_integration):
    db = db_session_integration
    ns = await seed_alloc(db, stock="40", qty=100)
    await add_reservation(db, ns.tenant, ns.fab, "40", status="ACTIVE", kind="HARD_ATP", order=ns.order, bom_item=ns.bi)
    vendor = await add_vendor(db, ns.tenant)
    po, line = await add_po(db, ns.tenant, vendor, ns.fab, "500", status="APPROVED", expected_date=date(2030, 5, 1))
    db.add(
        MfgMaterialSupplyPegging(
            tenant_id=ns.tenant.id, purchase_order_item_id=line.id, purchase_order_id=po.id, item_id=ns.fab.id,
            order_id=ns.order.id, bom_item_id=ns.bi.id, peg_kind="HARD", pegged_qty=Decimal("60"), status="ACTIVE",
        )
    )
    await db.flush()
    body = await _get(db, ns)
    m = _materials(body)
    assert m["status"] in ("BLOCKED", "PARTIAL")
    assert "SUPPLY_NOT_PEGGED" not in m["reason_codes"]
    ml = body["material_lines"][0]
    assert ml["ready"] is False and ml["pegged_qty"] == "60.0000"
    assert ml["expected_material_date"] == "2030-05-01"


async def test_flag_off_keeps_phase1_output(db_session_integration):
    db = db_session_integration
    ns = await seed_alloc(db, flags=dict(PHASE1_FLAGS), stock="100", qty=100)
    body = await _get(db, ns)
    assert _materials(body)["status"] == "READY"  # Phase 1: on hand covers the requirement
    assert "SHARED_SUPPLY_NOT_ALLOCATED" in _materials(body)["reason_codes"]
    assert "held_qty" not in body["material_lines"][0]


async def test_delivery_uses_expected_material_date_when_supply_is_pegged(db_session_integration):
    db = db_session_integration
    ns = await seed_alloc(db, stock="40", qty=100)
    await add_plan(db, ns.tenant, ns.fx.line, start=MONDAY, end=MONDAY, qty="100", order=ns.order, ob=ns.fx.ob, shift=ns.fx.shift)
    await add_reservation(db, ns.tenant, ns.fab, "40", status="ACTIVE", kind="HARD_ATP", order=ns.order, bom_item=ns.bi)
    vendor = await add_vendor(db, ns.tenant)
    po, line = await add_po(db, ns.tenant, vendor, ns.fab, "500", status="APPROVED", expected_date=date(2030, 5, 1))
    db.add(
        MfgMaterialSupplyPegging(
            tenant_id=ns.tenant.id, purchase_order_item_id=line.id, purchase_order_id=po.id, item_id=ns.fab.id,
            order_id=ns.order.id, bom_item_id=ns.bi.id, peg_kind="HARD", pegged_qty=Decimal("60"), status="ACTIVE",
        )
    )
    await db.flush()
    body = await _get(db, ns, "delivery-prediction")
    text = str(body)
    assert "MATERIAL_EXPECTED_DATE_USED" in text, body
    assert body["material"]["expected_material_date"] == "2030-05-01"

    # same order, supply NOT pegged: unknown, never a date
    ns2 = await seed_alloc(db, stock="40", qty=100)
    await add_plan(db, ns2.tenant, ns2.fx.line, start=MONDAY, end=MONDAY, qty="100", order=ns2.order, ob=ns2.fx.ob, shift=ns2.fx.shift)
    body2 = await _get(db, ns2, "delivery-prediction")
    assert "MATERIAL_EXPECTED_DATE_USED" not in str(body2)
    assert "MATERIAL_NOT_READY" in str(body2)
    _ = ALLOC_FLAGS
