"""Material allocation API (Manufacturing Intelligence Phase 2, run R2).

Run: docker compose exec -T backend sh -c "pytest tests/test_mfg_material_allocation_api.py -q -p no:warnings"
"""

from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.models import MfgMaterialSupplyPegging, StockMovement, StockReservation
from tests.mfg_alloc_fixtures import (
    PHASE1_FLAGS,
    add_competing_order,
    add_grn_line,
    add_po,
    add_reservation,
    add_vendor,
    seed_alloc,
)
from tests.mfg_intel_fixtures import API, client_for, new_tenant

pytestmark = pytest.mark.asyncio


async def _hard(c, order_id, **extra):
    pv = await c.post(f"{API}/orders/{order_id}/materials/allocate-preview", json={"kind": "HARD_ATP", **extra})
    assert pv.status_code == 200, pv.text
    token = pv.json()["state_token"]
    cf = await c.post(
        f"{API}/orders/{order_id}/materials/allocate-confirm", json={"kind": "HARD_ATP", "state_token": token, **extra}
    )
    return pv, cf


async def test_flag_off_is_404(db_session_integration):
    db = db_session_integration
    ns = await seed_alloc(db, flags=dict(PHASE1_FLAGS))
    async with client_for(db, ns.tenant, ns.user) as c:
        assert (await c.get(f"{API}/orders/{ns.order.id}/materials/allocation")).status_code == 404
        r = await c.post(f"{API}/orders/{ns.order.id}/materials/allocate-preview", json={"kind": "HARD_ATP"})
        assert r.status_code == 404
        assert (await c.get(f"{API}/items/{ns.fab.id}/allocation-availability")).status_code == 404
        assert (await c.get(f"{API}/materials/conflicts")).status_code == 404


async def test_hard_on_draft_order_is_409(db_session_integration):
    db = db_session_integration
    ns = await seed_alloc(db, status="DRAFT")
    async with client_for(db, ns.tenant, ns.user) as c:
        r = await c.post(f"{API}/orders/{ns.order.id}/materials/allocate-preview", json={"kind": "HARD_ATP"})
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "ORDER_NOT_CONFIRMED"


async def test_no_order_bom_is_409(db_session_integration):
    db = db_session_integration
    ns = await seed_alloc(db, bom_status=None)
    async with client_for(db, ns.tenant, ns.user) as c:
        r = await c.post(f"{API}/orders/{ns.order.id}/materials/allocate-preview", json={"kind": "HARD_ATP"})
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "NO_ORDER_BOM"


async def test_draft_bom_is_409(db_session_integration):
    db = db_session_integration
    ns = await seed_alloc(db, bom_status="DRAFT")
    async with client_for(db, ns.tenant, ns.user) as c:
        r = await c.post(f"{API}/orders/{ns.order.id}/materials/allocate-preview", json={"kind": "HARD_ATP"})
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "ORDER_BOM_NOT_APPROVED"


async def test_tentative_needs_expiry_and_a_draft_order(db_session_integration):
    db = db_session_integration
    ns = await seed_alloc(db, status="DRAFT")
    async with client_for(db, ns.tenant, ns.user) as c:
        r = await c.post(f"{API}/orders/{ns.order.id}/materials/allocate-preview", json={"kind": "TENTATIVE"})
        assert r.status_code == 422
        past = (datetime.utcnow() - timedelta(days=1)).isoformat()
        r = await c.post(
            f"{API}/orders/{ns.order.id}/materials/allocate-preview", json={"kind": "TENTATIVE", "expires_at": past}
        )
        assert r.status_code == 422
        far = (datetime.utcnow() + timedelta(days=400)).isoformat()
        r = await c.post(
            f"{API}/orders/{ns.order.id}/materials/allocate-preview", json={"kind": "TENTATIVE", "expires_at": far}
        )
        assert r.status_code == 422
        ok = (datetime.utcnow() + timedelta(days=10)).isoformat()
        r = await c.post(
            f"{API}/orders/{ns.order.id}/materials/allocate-preview", json={"kind": "TENTATIVE", "expires_at": ok}
        )
        assert r.status_code == 200
    # a confirmed order cannot take a tentative allocation
    ns2 = await seed_alloc(db, status="CONFIRMED")
    async with client_for(db, ns2.tenant, ns2.user) as c:
        ok = (datetime.utcnow() + timedelta(days=10)).isoformat()
        r = await c.post(
            f"{API}/orders/{ns2.order.id}/materials/allocate-preview", json={"kind": "TENTATIVE", "expires_at": ok}
        )
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "TENTATIVE_ONLY_FOR_DRAFT_ORDERS"


async def test_preview_writes_nothing_and_confirm_creates_one_hold_and_no_stock_movement(db_session_integration):
    db = db_session_integration
    ns = await seed_alloc(db, stock="100", qty=60)
    moves_before = (await db.execute(select(func.count()).select_from(StockMovement))).scalar_one()
    async with client_for(db, ns.tenant, ns.user) as c:
        pv = await c.post(f"{API}/orders/{ns.order.id}/materials/allocate-preview", json={"kind": "HARD_ATP"})
        assert pv.status_code == 200
        assert pv.json()["creates_anything"] is True
        n = (await db.execute(select(func.count()).select_from(StockReservation).where(StockReservation.tenant_id == ns.tenant.id))).scalar_one()
        assert n == 0
        pv, cf = await _hard(c, ns.order.id)
        assert cf.status_code == 200, cf.text
        body = cf.json()
        assert body["status"] == "ALLOCATED" and body["replayed"] is False
        assert [h["quantity"] for h in body["holds"]] == ["60.0000"]
        # double submit with the same token is a no-op replay
        cf2 = await c.post(
            f"{API}/orders/{ns.order.id}/materials/allocate-confirm",
            json={"kind": "HARD_ATP", "state_token": pv.json()["state_token"]},
        )
        assert cf2.status_code == 200, cf2.text
        assert cf2.json()["status"] == "NOOP" and cf2.json()["holds"] == []
    rows = (await db.execute(select(StockReservation).where(StockReservation.tenant_id == ns.tenant.id))).scalars().all()
    assert len(rows) == 1 and rows[0].status == "ACTIVE" and rows[0].reservation_kind == "HARD_ATP"
    assert Decimal(rows[0].reserved_qty) == Decimal("60")
    assert (await db.execute(select(func.count()).select_from(StockMovement))).scalar_one() == moves_before


async def test_stale_token_is_409(db_session_integration):
    db = db_session_integration
    ns = await seed_alloc(db, stock="100", qty=60)
    async with client_for(db, ns.tenant, ns.user) as c:
        pv = await c.post(f"{API}/orders/{ns.order.id}/materials/allocate-preview", json={"kind": "HARD_ATP"})
        token = pv.json()["state_token"]
        # somebody else's hold changes the picture between preview and confirm
        other, _, _ = await add_competing_order(db, ns, qty=30)
        await add_reservation(db, ns.tenant, ns.fab, "30", status="ACTIVE", kind="HARD_ATP", order=other)
        cf = await c.post(
            f"{API}/orders/{ns.order.id}/materials/allocate-confirm", json={"kind": "HARD_ATP", "state_token": token}
        )
    assert cf.status_code == 409


async def test_priority_earlier_delivery_wins_the_shared_stock(db_session_integration):
    """Stock 100, two firm orders needing 80 each: the earlier delivery date is served first and the later one is
    held back to what is left (never above stock)."""
    db = db_session_integration
    ns = await seed_alloc(db, stock="100", qty=80, delivery=__import__("datetime").date(2030, 4, 30))  # later
    early, _, _ = await add_competing_order(db, ns, qty=80, delivery=__import__("datetime").date(2030, 4, 1))
    async with client_for(db, ns.tenant, ns.user) as c:
        # the later order previews: the earlier one's unmet shortfall is protected, so it can only take 20
        pv = await c.post(f"{API}/orders/{ns.order.id}/materials/allocate-preview", json={"kind": "HARD_ATP"})
        assert pv.status_code == 200, pv.text
        line = pv.json()["lines"][0]
        assert line["hold_qty"] == "20.0000"
        assert pv.json()["priority_rank"] == 2
        pv2 = await c.post(f"{API}/orders/{early.id}/materials/allocate-preview", json={"kind": "HARD_ATP"})
        assert pv2.json()["lines"][0]["hold_qty"] == "80.0000"


async def test_readers_see_hard_holds_only_and_own_order_is_added_back(db_session_integration):
    db = db_session_integration
    ns = await seed_alloc(db, stock="100", qty=60)
    async with client_for(db, ns.tenant, ns.user) as c:
        _, cf = await _hard(c, ns.order.id)
        assert cf.status_code == 200
        other, _, _ = await add_competing_order(db, ns, qty=10)
        # a tentative hold of another order is information only
        await add_reservation(
            db, ns.tenant, ns.fab, "25", status="ACTIVE", kind="TENTATIVE", order=other,
            expires_at=datetime.utcnow() + timedelta(days=5),
        )
        r = await c.get(f"{API}/items/{ns.fab.id}/allocation-availability")
        assert r.status_code == 200, r.text
        a = r.json()
        assert a["on_hand_qty"] == "100.0000"
        assert a["hard_reserved_qty"] == "60.0000"
        assert a["tentative_reserved_qty"] == "25.0000"
        assert a["atp_hard_qty"] == "40.0000"  # tentative never reduces the hard view
        assert a["atp_stressed_qty"] == "15.0000"
        r2 = await c.get(f"{API}/items/{ns.fab.id}/allocation-availability", params={"own_order_id": ns.order.id})
        assert r2.json()["atp_hard_qty"] == "100.0000"  # own hold added back


async def test_cross_tenant_ids_look_missing(db_session_integration):
    db = db_session_integration
    a = await seed_alloc(db)
    b = await seed_alloc(db)
    async with client_for(db, a.tenant, a.user) as c:
        assert (await c.get(f"{API}/orders/{b.order.id}/materials/allocation")).status_code == 404
        r = await c.post(f"{API}/orders/{b.order.id}/materials/allocate-preview", json={"kind": "HARD_ATP"})
        assert r.status_code == 404
        assert (await c.get(f"{API}/items/{b.fab.id}/allocation-availability")).status_code == 404
        res = await add_reservation(db, b.tenant, b.fab, "5", status="ACTIVE", kind="HARD_ATP", order=b.order)
        r = await c.post(f"{API}/materials/reservations/{res.id}/release", json={})
        assert r.status_code == 404
        r = await c.post(f"{API}/materials/allocation-run/preview", json={"order_ids": [b.order.id]})
        assert r.status_code in (400, 404)
        r = await c.post(
            f"{API}/materials/reassign",
            json={"from_reservation_id": res.id, "to_order_id": a.order.id, "quantity": "1", "reason": "move for test"},
        )
        assert r.status_code in (403, 404)


async def test_permission_denied_under_rbac_enforce(db_session_integration):
    db = db_session_integration
    flags = {**PHASE1_FLAGS, "mfg_material_allocation_v1": True, "rbac_enforcement": "enforce"}
    # may read planning but nothing about stock: the endpoint keys deny
    tenant, user, _ = await new_tenant(
        db, flags=flags, permissions={"production.planning.read": True, "inventory.items.read": False}
    )
    ns = await seed_alloc(db, flags=flags)
    async with client_for(db, ns.tenant, ns.user) as c:  # full-permission user: reaches the endpoint (200)
        assert (await c.get(f"{API}/orders/{ns.order.id}/materials/allocation")).status_code == 200
    from tests.mfg_alloc_fixtures import add_user_with_role

    limited = await add_user_with_role(
        db, ns.tenant, "limited", {"production.planning.read": True, "inventory.items.read": False, "inventory.items.approve": False}
    )
    async with client_for(db, ns.tenant, limited) as c:
        assert (await c.get(f"{API}/orders/{ns.order.id}/materials/allocation")).status_code == 403
        r = await c.post(f"{API}/orders/{ns.order.id}/materials/allocate-confirm", json={"kind": "HARD_ATP", "state_token": "x" * 20})
        assert r.status_code == 403
    _ = (tenant, user)


async def test_run_preview_and_confirm_cover_several_orders(db_session_integration):
    db = db_session_integration
    ns = await seed_alloc(db, stock="150", qty=100)
    other, _, _ = await add_competing_order(db, ns, qty=100)
    async with client_for(db, ns.tenant, ns.user) as c:
        pv = await c.post(f"{API}/materials/allocation-run/preview", json={"kind": "HARD_ATP"})
        assert pv.status_code == 200, pv.text
        assert len(pv.json()["orders"]) == 2
        cf = await c.post(
            f"{API}/materials/allocation-run/confirm", json={"kind": "HARD_ATP", "state_token": pv.json()["state_token"]}
        )
        assert cf.status_code == 200, cf.text
        assert {r["status"] for r in cf.json()["results"]} <= {"ALLOCATED", "NOOP", "SKIPPED"}
    total = (
        await db.execute(
            select(func.coalesce(func.sum(StockReservation.reserved_qty), 0)).where(
                StockReservation.tenant_id == ns.tenant.id, StockReservation.status == "ACTIVE"
            )
        )
    ).scalar_one()
    assert Decimal(total) <= Decimal("150")  # never above stock
    _ = other


async def test_hard_peg_against_open_po_and_availability_view(db_session_integration):
    """Short on stock, the rest is pegged to an open PO line; the item view then shows it as hard pegged."""
    db = db_session_integration
    ns = await seed_alloc(db, stock="40", qty=100)
    vendor = await add_vendor(db, ns.tenant)
    po, line = await add_po(db, ns.tenant, vendor, ns.fab, "1000", status="APPROVED", expected_date=__import__("datetime").date(2030, 5, 1))
    await add_grn_line(db, ns.tenant, po, line, ns.store, received="300", accepted="300")
    async with client_for(db, ns.tenant, ns.user) as c:
        pv, cf = await _hard(c, ns.order.id)
        assert cf.status_code == 200, cf.text
        body = cf.json()
        assert [h["quantity"] for h in body["holds"]] == ["40.0000"]
        assert [p["quantity"] for p in body["pegs"]] == ["60.0000"]
        r = await c.get(f"{API}/items/{ns.fab.id}/allocation-availability")
        a = r.json()
        assert a["on_order_net_qty"] == "700.0000"
        assert a["hard_pegged_qty"] == "60.0000"
        assert a["free_inbound_qty"] == "640.0000"
    n = (await db.execute(select(func.count()).select_from(MfgMaterialSupplyPegging).where(MfgMaterialSupplyPegging.tenant_id == ns.tenant.id))).scalar_one()
    assert n == 1
