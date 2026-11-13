"""Allocation lifecycle (R2): MFG_RETURN netting, order delete guard, cancel hooks, conflicts and expiry.

Run: docker compose exec -T backend sh -c "pytest tests/test_mfg_material_allocation_lifecycle.py -q -p no:warnings"
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.common.delete_guards import ensure_order_deletable
from app.models import ManufacturingWorkOrder, MfgMaterialSupplyPegging, StockReservation
from app.modules.inventory import allocation_reconcile_service as reconcile
from app.modules.inventory.reservation_service import load_effective_holds
from tests.mfg_alloc_fixtures import (
    add_competing_order,
    add_movement,
    add_po,
    add_reservation,
    add_vendor,
    seed_alloc,
)
from tests.mfg_intel_fixtures import API, client_for

pytestmark = pytest.mark.asyncio


async def _hold(db, ns, qty="100", **kw) -> StockReservation:
    return await add_reservation(
        db, ns.tenant, ns.fab, qty, status="ACTIVE", kind="HARD_ATP", order=ns.order, bom_item=ns.bi, **kw
    )


async def _effective(db, ns, hold) -> Decimal:
    rows = await load_effective_holds(db, ns.tenant.id, [ns.fab.id])
    return next(h.effective_qty for h in rows if h.reservation_id == hold.id)


async def _issue(db, ns, qty):
    # created_at must be later than the hold (the database default is the transaction start time)
    return await add_movement(
        db, ns.tenant, ns.fab, ns.store, qty, movement_type="OUT", reference_type="MFG_ISSUE", order=ns.order, bom_line=ns.bi,
        created_at=datetime.utcnow() + timedelta(seconds=1),
    )


async def _work_order(db, ns) -> ManufacturingWorkOrder:
    wo = ManufacturingWorkOrder(
        tenant_id=ns.tenant.id, mo_number=f"MO-{datetime.utcnow().timestamp():.0f}"[:30], item_id=ns.fab.id,
        order_id=ns.order.id, qty_planned=Decimal("100"),
    )
    db.add(wo)
    await db.flush()
    return wo


# ------------------------------------------------------------------ MFG_RETURN netting


async def test_mfg_return_gives_consumed_quantity_back_to_the_hold(db_session_integration):
    db = db_session_integration
    ns = await seed_alloc(db, stock="200", qty=100)
    hold = await _hold(db, ns, "100")
    await _issue(db, ns, "60")
    assert await _effective(db, ns, hold) == Decimal("40")  # 100 held, 60 issued
    wo = await _work_order(db, ns)
    ret = await add_movement(db, ns.tenant, ns.fab, ns.store, "20", movement_type="IN", reference_type="MFG_RETURN")
    ret.reference_id = wo.id
    await db.flush()
    assert await _effective(db, ns, hold) == Decimal("60")  # 20 returned goes back to the order's hold


async def test_mfg_return_never_lifts_the_hold_above_the_reservation(db_session_integration):
    db = db_session_integration
    ns = await seed_alloc(db, stock="200", qty=100)
    hold = await _hold(db, ns, "100")
    await _issue(db, ns, "30")
    wo = await _work_order(db, ns)
    ret = await add_movement(db, ns.tenant, ns.fab, ns.store, "500", movement_type="IN", reference_type="MFG_RETURN")
    ret.reference_id = wo.id
    await db.flush()
    assert await _effective(db, ns, hold) == Decimal("100")


async def test_return_for_another_order_does_not_change_this_hold(db_session_integration):
    db = db_session_integration
    ns = await seed_alloc(db, stock="200", qty=100)
    hold = await _hold(db, ns, "100")
    await _issue(db, ns, "60")
    ret = await add_movement(db, ns.tenant, ns.fab, ns.store, "20", movement_type="IN", reference_type="MFG_RETURN")
    ret.reference_id = None  # no work order: cannot be tied to the order
    await db.flush()
    assert await _effective(db, ns, hold) == Decimal("40")


# ------------------------------------------------------------------ delete guard


async def test_delete_guard_blocks_order_with_active_hold_or_peg(db_session_integration):
    db = db_session_integration
    ns = await seed_alloc(db, bom_status=None)  # no BOM: the guard must still stop on the allocation
    await ensure_order_deletable(db, ns.tenant.id, ns.order.id)  # nothing yet: allowed
    hold = await add_reservation(db, ns.tenant, ns.fab, "5", status="ACTIVE", kind="HARD_ATP", order=ns.order)
    with pytest.raises(HTTPException) as exc:
        await ensure_order_deletable(db, ns.tenant.id, ns.order.id)
    assert exc.value.status_code in (400, 409) and "material allocations" in str(exc.value.detail)
    hold.status = "RELEASED"
    await db.flush()
    await ensure_order_deletable(db, ns.tenant.id, ns.order.id)  # a released hold does not block

    vendor = await add_vendor(db, ns.tenant)
    po, line = await add_po(db, ns.tenant, vendor, ns.fab, "50", status="APPROVED")
    db.add(
        MfgMaterialSupplyPegging(
            tenant_id=ns.tenant.id, purchase_order_item_id=line.id, purchase_order_id=po.id, item_id=ns.fab.id,
            order_id=ns.order.id, peg_kind="HARD", pegged_qty=Decimal("5"), status="RELEASED",
        )
    )
    await db.flush()
    with pytest.raises(HTTPException) as exc:
        await ensure_order_deletable(db, ns.tenant.id, ns.order.id)
    assert "material supply pegs" in str(exc.value.detail)


# ------------------------------------------------------------------ cancel hooks


async def _seed_hold_and_peg(db, ns):
    hold = await _hold(db, ns, "50")
    vendor = await add_vendor(db, ns.tenant)
    po, line = await add_po(db, ns.tenant, vendor, ns.fab, "500", status="APPROVED")
    peg = MfgMaterialSupplyPegging(
        tenant_id=ns.tenant.id, purchase_order_item_id=line.id, purchase_order_id=po.id, item_id=ns.fab.id,
        order_id=ns.order.id, bom_item_id=ns.bi.id, peg_kind="HARD", pegged_qty=Decimal("20"), status="ACTIVE",
    )
    db.add(peg)
    await db.flush()
    return hold, peg


async def test_cancel_via_status_endpoint_releases_holds_and_pegs(db_session_integration):
    db = db_session_integration
    ns = await seed_alloc(db, qty=100)
    hold, peg = await _seed_hold_and_peg(db, ns)
    async with client_for(db, ns.tenant, ns.user) as c:
        r = await c.patch(f"/api/v1/orders/{ns.order.id}/status", json={"status": "CANCELLED"})
    assert r.status_code == 200, r.text
    await db.refresh(hold)
    await db.refresh(peg)
    assert hold.status == "RELEASED" and peg.status == "RELEASED"


async def test_cancel_via_order_update_releases_holds_and_pegs(db_session_integration):
    db = db_session_integration
    ns = await seed_alloc(db, qty=100)
    hold, peg = await _seed_hold_and_peg(db, ns)
    async with client_for(db, ns.tenant, ns.user) as c:
        r = await c.patch(f"/api/v1/orders/{ns.order.id}", json={"status": "CANCELLED"})
    assert r.status_code == 200, r.text
    await db.refresh(hold)
    await db.refresh(peg)
    assert hold.status == "RELEASED" and peg.status == "RELEASED"


async def test_cancel_leaves_allocation_alone_when_flag_is_off(db_session_integration):
    db = db_session_integration
    ns = await seed_alloc(db, flags={"manufacturing_intelligence_v1": True}, qty=100)
    hold, _ = await _seed_hold_and_peg(db, ns)
    async with client_for(db, ns.tenant, ns.user) as c:
        r = await c.patch(f"/api/v1/orders/{ns.order.id}/status", json={"status": "CANCELLED"})
    assert r.status_code == 200, r.text
    await db.refresh(hold)
    assert hold.status == "ACTIVE"


async def test_release_for_order_is_idempotent(db_session_integration):
    db = db_session_integration
    ns = await seed_alloc(db)
    await _seed_hold_and_peg(db, ns)
    first = await reconcile.release_for_order(db, ns.tenant.id, ns.order.id, reason="test", user_id=ns.user.id)
    second = await reconcile.release_for_order(db, ns.tenant.id, ns.order.id, reason="test", user_id=ns.user.id)
    assert first == {"holds_released": 1, "pegs_released": 1}
    assert second == {"holds_released": 0, "pegs_released": 0}


# ------------------------------------------------------------------ conflicts and expiry


async def test_conflicts_report_cancelled_order_and_expired_tentative(db_session_integration):
    db = db_session_integration
    ns = await seed_alloc(db, stock="100", qty=100)
    cancelled = await seed_alloc(db)  # other tenant, must never show up
    ns.order.status = "CANCELLED"
    await db.flush()
    stale = await _hold(db, ns, "10")
    open_order, _, open_bi = await add_competing_order(db, ns, qty=10, status="DRAFT")
    tent = await add_reservation(
        db, ns.tenant, ns.fab, "5", status="ACTIVE", kind="TENTATIVE", order=open_order, bom_item=open_bi,
        expires_at=datetime.utcnow() - timedelta(days=1),
    )
    async with client_for(db, ns.tenant, ns.user) as c:
        r = await c.get(f"{API}/materials/conflicts")
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    codes = {(i["code"], i["reservation_id"]) for i in items}
    assert ("ORDER_CANCELLED", stale.id) in codes
    assert any(i["code"] == "TENTATIVE_EXPIRED" and i["reservation_id"] == tent.id for i in items)
    assert all(i["order_id"] in (None, ns.order.id, open_order.id) for i in items)  # no other tenant's rows
    stale_row = next(i for i in items if i["reservation_id"] == stale.id)
    assert stale_row["order_code"] and stale_row["item_name"] == ns.fab.name  # labels for display
    _ = cancelled


async def test_expired_tentative_hold_reports_only_tentative_expired(db_session_integration):
    db = db_session_integration
    ns = await seed_alloc(db, stock="100", qty=100)
    tent = await add_reservation(
        db, ns.tenant, ns.fab, "5", status="ACTIVE", kind="TENTATIVE", order=ns.order, bom_item=None,
        expires_at=datetime.utcnow() - timedelta(days=1),
    )
    out = await reconcile.list_conflicts(db, ns.tenant.id)
    codes = [i["code"] for i in out["items"] if i["reservation_id"] == tent.id]
    assert codes == ["TENTATIVE_EXPIRED"]


async def test_apply_lifecycle_releases_expired_tentative_only(db_session_integration):
    db = db_session_integration
    ns = await seed_alloc(db, status="DRAFT")
    expired = await add_reservation(
        db, ns.tenant, ns.fab, "5", status="ACTIVE", kind="TENTATIVE", order=ns.order, expires_at=datetime.utcnow() - timedelta(hours=1)
    )
    other, _, _ = await add_competing_order(db, ns, qty=10, status="DRAFT")
    live = await add_reservation(
        db, ns.tenant, ns.fab, "5", status="ACTIVE", kind="TENTATIVE", order=other, expires_at=datetime.utcnow() + timedelta(days=3)
    )
    hard = await add_reservation(db, ns.tenant, ns.fab, "5", status="ACTIVE", kind="HARD_ATP", order=ns.order)
    await reconcile.apply_lifecycle(db, ns.tenant.id)
    for row in (expired, live, hard):
        await db.refresh(row)
    assert expired.status == "RELEASED" and live.status == "ACTIVE" and hard.status == "ACTIVE"
    rows = (await db.execute(select(StockReservation).where(StockReservation.tenant_id == ns.tenant.id))).scalars().all()
    assert len(rows) == 3
    _ = date
