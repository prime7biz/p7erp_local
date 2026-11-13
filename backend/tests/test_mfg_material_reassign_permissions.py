"""Only admin / manager roles move held material or release a hard hold of a confirmed order (R2).

The check lives in the handler (`assert_manager_role_only`), so it applies with RBAC off and with RBAC enforced.

Run: docker compose exec -T backend sh -c "pytest tests/test_mfg_material_reassign_permissions.py -q -p no:warnings"
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models import AuditLog, StockReservation
from tests.mfg_alloc_fixtures import (
    ALLOC_FLAGS,
    add_competing_order,
    add_reservation,
    add_user_with_role,
    seed_alloc,
)
from tests.mfg_intel_fixtures import API, client_for

pytestmark = pytest.mark.asyncio

RBAC_MODES = [None, "enforce"]


async def _setup(db, rbac):
    flags = dict(ALLOC_FLAGS)
    if rbac:
        flags["rbac_enforcement"] = rbac
    ns = await seed_alloc(db, flags=flags, stock="100", qty=60)
    hold = await add_reservation(db, ns.tenant, ns.fab, "60", status="ACTIVE", kind="HARD_ATP", order=ns.order, bom_item=ns.bi)
    other, _, _ = await add_competing_order(db, ns, qty=60)
    return ns, hold, other


def _body(hold, other, reason="move to the earlier delivery"):
    return {"from_reservation_id": hold.id, "to_order_id": other.id, "quantity": "20", "reason": reason}


@pytest.mark.parametrize("rbac", RBAC_MODES)
async def test_non_manager_cannot_reassign(db_session_integration, rbac):
    db = db_session_integration
    ns, hold, other = await _setup(db, rbac)
    # the default test user has every permission key but is NOT an admin / manager role
    async with client_for(db, ns.tenant, ns.user) as c:
        r = await c.post(f"{API}/materials/reassign", json=_body(hold, other))
    assert r.status_code == 403
    await db.refresh(hold)
    assert Decimal(hold.reserved_qty) == Decimal("60")


@pytest.mark.parametrize("rbac", RBAC_MODES)
async def test_non_manager_cannot_release_hard_hold_of_confirmed_order(db_session_integration, rbac):
    db = db_session_integration
    ns, hold, _ = await _setup(db, rbac)
    async with client_for(db, ns.tenant, ns.user) as c:
        r = await c.post(f"{API}/materials/reservations/{hold.id}/release", json={"reason": "a long enough reason"})
    assert r.status_code == 403
    await db.refresh(hold)
    assert hold.status == "ACTIVE"


@pytest.mark.parametrize("rbac", RBAC_MODES)
async def test_manager_reassigns_with_audit(db_session_integration, rbac):
    db = db_session_integration
    ns, hold, other = await _setup(db, rbac)
    manager = await add_user_with_role(db, ns.tenant, "manager")
    async with client_for(db, ns.tenant, manager) as c:
        r = await c.post(f"{API}/materials/reassign", json=_body(hold, other))
        assert r.status_code == 200, r.text
        out = r.json()
        assert out["quantity"] == "20.0000" and out["source_remaining_qty"] == "40.0000"
        assert out["from_order_id"] == ns.order.id and out["to_order_id"] == other.id
    rows = (
        await db.execute(
            select(StockReservation).where(StockReservation.tenant_id == ns.tenant.id, StockReservation.status == "ACTIVE")
        )
    ).scalars().all()
    total = sum((Decimal(x.reserved_qty) for x in rows), Decimal(0))
    assert total == Decimal("60")  # held quantity is conserved
    assert {x.order_id for x in rows} == {ns.order.id, other.id}
    audit = (
        await db.execute(select(AuditLog).where(AuditLog.tenant_id == ns.tenant.id, AuditLog.action.like("mfg_allocation.%")))
    ).scalars().all()
    assert audit and any(a.user_id == manager.id for a in audit)


async def test_admin_role_also_allowed_and_short_reason_is_422(db_session_integration):
    db = db_session_integration
    ns, hold, other = await _setup(db, None)
    admin = await add_user_with_role(db, ns.tenant, "admin")
    async with client_for(db, ns.tenant, admin) as c:
        r = await c.post(f"{API}/materials/reassign", json=_body(hold, other, reason="too short"))
        assert r.status_code == 422
        r = await c.post(f"{API}/materials/reservations/{hold.id}/release", json={"reason": "short"})
        assert r.status_code == 422
        r = await c.post(f"{API}/materials/reservations/{hold.id}/release", json={})
        assert r.status_code == 422
        r = await c.post(f"{API}/materials/reservations/{hold.id}/release", json={"reason": "order was re-planned"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "RELEASED" and r.json()["changed"] is True
        # releasing again is a harmless no-op
        r2 = await c.post(f"{API}/materials/reservations/{hold.id}/release", json={"reason": "order was re-planned"})
        assert r2.status_code == 200 and r2.json()["changed"] is False


async def test_planning_approve_alone_releases_only_tentative_rows(db_session_integration):
    db = db_session_integration
    from datetime import datetime, timedelta

    ns, hold, _ = await _setup(db, None)
    draft_ns = await seed_alloc(db, flags=dict(ALLOC_FLAGS), status="DRAFT")
    tent = await add_reservation(
        db, draft_ns.tenant, draft_ns.fab, "10", status="ACTIVE", kind="TENTATIVE", order=draft_ns.order,
        expires_at=datetime.utcnow() + timedelta(days=3),
    )
    async with client_for(db, draft_ns.tenant, draft_ns.user) as c:
        r = await c.post(f"{API}/materials/reservations/{tent.id}/release", json={})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "RELEASED"
    async with client_for(db, ns.tenant, ns.user) as c:
        r = await c.post(f"{API}/materials/reservations/{hold.id}/release", json={"reason": "a long enough reason"})
        assert r.status_code == 403


async def test_hard_peg_release_needs_manager(db_session_integration):
    from datetime import date

    from app.models import MfgMaterialSupplyPegging
    from tests.mfg_alloc_fixtures import add_po, add_vendor

    db = db_session_integration
    ns, _, _ = await _setup(db, None)
    vendor = await add_vendor(db, ns.tenant)
    po, line = await add_po(db, ns.tenant, vendor, ns.fab, "500", status="APPROVED", expected_date=date(2030, 5, 1))
    peg = MfgMaterialSupplyPegging(
        tenant_id=ns.tenant.id, purchase_order_item_id=line.id, purchase_order_id=po.id, item_id=ns.fab.id,
        order_id=ns.order.id, bom_item_id=ns.bi.id, peg_kind="HARD", pegged_qty=Decimal("50"), status="ACTIVE",
    )
    db.add(peg)
    await db.flush()
    manager = await add_user_with_role(db, ns.tenant, "manager")
    async with client_for(db, ns.tenant, ns.user) as c:
        r = await c.post(f"{API}/materials/peggings/{peg.id}/release", json={"reason": "supplier delayed the lot"})
        assert r.status_code == 403
    async with client_for(db, ns.tenant, manager) as c:
        r = await c.post(f"{API}/materials/peggings/{peg.id}/release", json={"reason": "supplier delayed the lot"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "RELEASED"
