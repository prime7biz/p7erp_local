"""Plan revisions (Manufacturing Intelligence Phase 2, run R3; flag mfg_integrated_planning_v1).

Covers: propose -> approve applies in one transaction, stale lock_version (also from a legacy plan-board move, thanks to
the database trigger), four-eyes, reject / cancel, idempotent request_id, FIRM rules, SMV on new rows, RBAC denial,
cross-tenant ids, follow-up sync failure, flag off.

Run: docker compose exec -T backend sh -c "pytest tests/test_mfg_plan_revisions.py -q -p no:warnings"
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import func, select, text

from app.models import AuditLog, SewingLineStyleConfig
from app.models.mfg_planning import MfgPlanRevision
from tests.mfg_alloc_fixtures import add_user_with_role, set_flags
from tests.mfg_intel_fixtures import (
    API,
    FLAGS_ON,
    MONDAY,
    add_line,
    add_order,
    add_plan,
    client_for,
    new_tenant,
    seed_basic_factory,
)

pytestmark = pytest.mark.asyncio

FLAGS = {**FLAGS_ON, "mfg_integrated_planning_v1": True}
FRIDAY = MONDAY + timedelta(days=4)
REASON = "customer moved the ex-factory date"


async def _setup(db, *, flags=None, permissions=None, status="CONFIRMED", rs="SOFT_BOOKED"):
    tenant, user, _ = await new_tenant(db, flags=flags if flags is not None else FLAGS, permissions=permissions)
    fx = await seed_basic_factory(db, tenant)
    order = await add_order(db, tenant, fx.customer, fx.style, status=status, qty=1000, delivery=date(2030, 4, 30))
    cfg = await add_plan(
        db, tenant, fx.line, start=MONDAY, end=FRIDAY, qty="1000", order=order, style=fx.style, ob=fx.ob,
        shift=fx.shift, rs=rs,
    )
    await db.commit()
    return tenant, user, fx, order, cfg


def _body(items, *, request_id=None, reason=REASON):
    body = {"items": items, "reason": reason}
    if request_id:
        body["request_id"] = request_id
    return body


async def _propose(c, items, **kw):
    return await c.post(f"{API}/plan-revisions", json=_body(items, **kw))


async def _approve(c, rev):
    return await c.post(
        f"{API}/plan-revisions/{rev['id']}/approve",
        json={"expected_lock_version": rev["lock_version"], "decision_note": "ok"},
    )


# ------------------------------------------------------------------ happy path


async def test_propose_then_approve_applies_everything_in_one_transaction(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order, cfg = await _setup(db)
    other = await add_plan(db, tenant, fx.line, start=MONDAY, end=FRIDAY, qty="200", order=order, style=fx.style,
                           ob=fx.ob, rs="DRAFT")
    line2 = await add_line(db, tenant, "L2")
    await db.commit()
    items = [
        {"action": "UPDATE", "config_id": cfg.id, "reservation_status": "FIRM_BOOKED", "planned_qty": "800"},
        {"action": "CANCEL", "config_id": other.id},
        {"action": "CREATE", "line_id": line2.id, "order_id": order.id, "start_date": "2030-03-11",
         "planned_end_date": "2030-03-13", "planned_qty": "200", "reservation_status": "DRAFT"},
    ]
    async with client_for(db, tenant, user) as c:
        r = await _propose(c, items, request_id="req-propose-0001")
        assert r.status_code == 201, r.text
        rev = r.json()
        assert rev["status"] == "PROPOSED" and rev["revision_no"] == 1 and len(rev["items"]) == 3
        assert rev["impact"] is not None and "deliveries" in rev["impact"]
        # nothing changed yet
        await db.refresh(cfg)
        assert cfg.reservation_status == "SOFT_BOOKED" and Decimal(cfg.planned_qty) == Decimal("1000")

        before_lv = cfg.lock_version
        r = await _approve(c, rev)
        assert r.status_code == 200, r.text
        out = r.json()
        assert out["status"] == "APPLIED" and out["applied_now"] is True
        assert all(i["applied_config_id"] for i in out["items"])

    await db.refresh(cfg)
    await db.refresh(other)
    assert cfg.reservation_status == "FIRM_BOOKED" and Decimal(cfg.planned_qty) == Decimal("800")
    assert cfg.firm_booked_at is not None
    assert cfg.lock_version > before_lv  # the trigger bumped it
    # SMV: the approved OB total (12.5) per piece, total = qty x smv, source OB
    assert Decimal(cfg.smv_per_piece) == Decimal("12.5")
    assert Decimal(cfg.total_smv_minutes) == Decimal("10000.00")
    assert cfg.source_smv_type == "OB"
    assert other.reservation_status == "CANCELLED"
    created = (
        await db.execute(
            select(SewingLineStyleConfig).where(
                SewingLineStyleConfig.tenant_id == tenant.id, SewingLineStyleConfig.line_id == line2.id
            )
        )
    ).scalar_one()
    assert created.order_id == order.id and created.reservation_status == "DRAFT"
    assert Decimal(created.smv_per_piece) == Decimal("12.5") and Decimal(created.total_smv_minutes) == Decimal("2500.00")
    assert created.style_id == fx.style.id  # defaulted from the order
    actions = (
        await db.execute(select(AuditLog.action).where(AuditLog.tenant_id == tenant.id, AuditLog.action.like("%plan_revision%")))
    ).scalars().all()
    assert "mfg_plan_revision.propose" in actions and "mfg_plan_revision.approve" in actions


async def test_approving_twice_is_a_noop_and_creates_no_duplicates(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order, cfg = await _setup(db)
    items = [{"action": "CREATE", "line_id": fx.line.id, "order_id": order.id, "start_date": "2030-03-18",
              "planned_qty": "100", "reservation_status": "DRAFT"}]
    async with client_for(db, tenant, user) as c:
        rev = (await _propose(c, items)).json()
        first = await _approve(c, rev)
        second = await c.post(f"{API}/plan-revisions/{rev['id']}/approve", json={"expected_lock_version": 0})
    assert first.status_code == 200 and second.status_code == 200
    assert second.json()["status"] == "APPLIED" and second.json()["applied_now"] is False
    count = (
        await db.execute(select(func.count()).select_from(SewingLineStyleConfig).where(
            SewingLineStyleConfig.tenant_id == tenant.id, SewingLineStyleConfig.start_date == date(2030, 3, 18)))
    ).scalar_one()
    assert count == 1


# ------------------------------------------------------------------ stale data


async def test_stale_row_version_gives_409_and_writes_nothing(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order, cfg = await _setup(db)
    second = await add_plan(db, tenant, fx.line, start=MONDAY, end=FRIDAY, qty="50", order=order, rs="DRAFT")
    await db.commit()
    items = [
        {"action": "UPDATE", "config_id": cfg.id, "planned_qty": "700"},
        {"action": "UPDATE", "config_id": second.id, "planned_qty": "60"},
    ]
    async with client_for(db, tenant, user) as c:
        rev = (await _propose(c, items)).json()
        # someone else changes the second row's planning field (the trigger bumps lock_version)
        await db.execute(text("UPDATE sewing_line_style_configs SET planned_qty = 55 WHERE id = :i"), {"i": second.id})
        await db.commit()
        r = await _approve(c, rev)
        assert r.status_code == 409, r.text
    await db.refresh(cfg)
    await db.refresh(second)
    assert Decimal(cfg.planned_qty) == Decimal("1000")  # the first item was NOT applied
    assert Decimal(second.planned_qty) == Decimal("55")
    status_ = (await db.execute(select(MfgPlanRevision.status).where(MfgPlanRevision.id == rev["id"]))).scalar_one()
    assert status_ == "PROPOSED"


async def test_legacy_plan_board_move_between_propose_and_approve_gives_409(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order, cfg = await _setup(db)
    items = [{"action": "UPDATE", "config_id": cfg.id, "planned_qty": "900"}]
    async with client_for(db, tenant, user) as c:
        rev = (await _propose(c, items)).json()
        moved = await c.put(
            f"/api/v1/production/plan-board/{cfg.id}/move", json={"start_date": "2030-03-11"}
        )
        assert moved.status_code == 200, moved.text
        r = await _approve(c, rev)
        assert r.status_code == 409, r.text
    await db.refresh(cfg)
    assert Decimal(cfg.planned_qty) == Decimal("1000") and cfg.start_date == date(2030, 3, 11)


async def test_stale_revision_lock_version_gives_409(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order, cfg = await _setup(db)
    async with client_for(db, tenant, user) as c:
        rev = (await _propose(c, [{"action": "UPDATE", "config_id": cfg.id, "planned_qty": "900"}])).json()
        r = await c.post(f"{API}/plan-revisions/{rev['id']}/approve", json={"expected_lock_version": 7})
        assert r.status_code == 409


async def test_trigger_bumps_lock_version_only_for_planning_fields(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order, cfg = await _setup(db)
    line2 = await add_line(db, tenant, "L9")
    await db.commit()

    async def lv():
        return (await db.execute(text("SELECT lock_version FROM sewing_line_style_configs WHERE id = :i"), {"i": cfg.id})).scalar_one()

    v0 = await lv()
    await db.execute(text("UPDATE sewing_line_style_configs SET completed_qty = 10, sort_order = 3 WHERE id = :i"), {"i": cfg.id})
    assert await lv() == v0  # not a planning field
    await db.execute(text("UPDATE sewing_line_style_configs SET planned_qty = planned_qty + 1 WHERE id = :i"), {"i": cfg.id})
    assert await lv() == v0 + 1
    await db.execute(text("UPDATE sewing_line_style_configs SET reservation_status = 'FIRM_BOOKED' WHERE id = :i"), {"i": cfg.id})
    assert await lv() == v0 + 2
    await db.execute(text("UPDATE sewing_line_style_configs SET line_id = :l WHERE id = :i"), {"i": cfg.id, "l": line2.id})
    assert await lv() == v0 + 3
    # same value written again: no bump
    await db.execute(text("UPDATE sewing_line_style_configs SET planned_qty = planned_qty WHERE id = :i"), {"i": cfg.id})
    assert await lv() == v0 + 3


# ------------------------------------------------------------------ four eyes


async def test_four_eyes_blocks_the_proposer_and_allows_another_user(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order, cfg = await _setup(db, flags={**FLAGS, "mfg_plan_four_eyes": True})
    approver = await add_user_with_role(db, tenant, "manager")
    await db.commit()
    items = [{"action": "UPDATE", "config_id": cfg.id, "planned_qty": "900"}]
    async with client_for(db, tenant, user) as c:
        rev = (await _propose(c, items)).json()
        assert rev["can_approve"] is False  # the proposer
        r = await _approve(c, rev)
        assert r.status_code == 403
    await db.refresh(cfg)
    assert Decimal(cfg.planned_qty) == Decimal("1000")
    async with client_for(db, tenant, approver) as c:
        seen = (await c.get(f"{API}/plan-revisions/{rev['id']}")).json()
        assert seen["can_approve"] is True
        r = await _approve(c, rev)
        assert r.status_code == 200, r.text
        assert r.json()["decided_by_user_id"] == approver.id
    await db.refresh(cfg)
    assert Decimal(cfg.planned_qty) == Decimal("900")


async def test_four_eyes_off_lets_the_proposer_approve(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order, cfg = await _setup(db)
    async with client_for(db, tenant, user) as c:
        rev = (await _propose(c, [{"action": "UPDATE", "config_id": cfg.id, "planned_qty": "900"}])).json()
        assert rev["can_approve"] is True
        assert (await _approve(c, rev)).status_code == 200


# ------------------------------------------------------------------ reject / cancel


async def test_reject_needs_a_note_and_is_idempotent(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order, cfg = await _setup(db)
    async with client_for(db, tenant, user) as c:
        rev = (await _propose(c, [{"action": "UPDATE", "config_id": cfg.id, "planned_qty": "900"}])).json()
        assert (await c.post(f"{API}/plan-revisions/{rev['id']}/reject", json={})).status_code == 422
        assert (await c.post(f"{API}/plan-revisions/{rev['id']}/reject", json={"decision_note": "  "})).status_code == 422
        r = await c.post(f"{API}/plan-revisions/{rev['id']}/reject", json={"decision_note": "not now"})
        assert r.status_code == 200 and r.json()["status"] == "REJECTED" and r.json()["changed"] is True
        r2 = await c.post(f"{API}/plan-revisions/{rev['id']}/reject", json={"decision_note": "not now"})
        assert r2.status_code == 200 and r2.json()["changed"] is False
        # a rejected revision can no longer be approved or cancelled
        assert (await _approve(c, rev)).status_code == 409
        assert (await c.post(f"{API}/plan-revisions/{rev['id']}/cancel")).status_code == 409
    await db.refresh(cfg)
    assert Decimal(cfg.planned_qty) == Decimal("1000")


async def test_cancel_by_proposer_is_idempotent_and_blocks_approval(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order, cfg = await _setup(db)
    async with client_for(db, tenant, user) as c:
        rev = (await _propose(c, [{"action": "UPDATE", "config_id": cfg.id, "planned_qty": "900"}])).json()
        r = await c.post(f"{API}/plan-revisions/{rev['id']}/cancel")
        assert r.status_code == 200 and r.json()["status"] == "CANCELLED" and r.json()["changed"] is True
        again = await c.post(f"{API}/plan-revisions/{rev['id']}/cancel")
        assert again.status_code == 200 and again.json()["changed"] is False
        assert (await _approve(c, rev)).status_code == 409


async def test_cancel_by_a_stranger_without_approve_right_is_403(db_session_integration):
    db = db_session_integration
    flags = {**FLAGS, "rbac_enforcement": "enforce"}
    tenant, user, fx, order, cfg = await _setup(db, flags=flags)
    stranger = await add_user_with_role(
        db, tenant, "planner", {"production.planning.read": True, "production.planning.write": True}
    )
    await db.commit()
    async with client_for(db, tenant, user) as c:
        rev = (await _propose(c, [{"action": "UPDATE", "config_id": cfg.id, "planned_qty": "900"}])).json()
    async with client_for(db, tenant, stranger) as c:
        assert (await c.post(f"{API}/plan-revisions/{rev['id']}/cancel")).status_code == 403


# ------------------------------------------------------------------ idempotent propose


async def test_request_id_replays_the_same_revision_and_rejects_other_content(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order, cfg = await _setup(db)
    items = [{"action": "UPDATE", "config_id": cfg.id, "planned_qty": "900"}]
    async with client_for(db, tenant, user) as c:
        first = await _propose(c, items, request_id="same-request-01")
        again = await _propose(c, items, request_id="same-request-01")
        assert first.status_code == 201 and again.status_code == 200
        assert first.json()["id"] == again.json()["id"]
        other = await _propose(c, [{"action": "UPDATE", "config_id": cfg.id, "planned_qty": "901"}], request_id="same-request-01")
        assert other.status_code == 409
    n = (await db.execute(select(func.count()).select_from(MfgPlanRevision).where(MfgPlanRevision.tenant_id == tenant.id))).scalar_one()
    assert n == 1


async def test_reason_is_required(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order, cfg = await _setup(db)
    async with client_for(db, tenant, user) as c:
        items = [{"action": "UPDATE", "config_id": cfg.id, "planned_qty": "900"}]
        assert (await c.post(f"{API}/plan-revisions", json={"items": items})).status_code == 422
        assert (await c.post(f"{API}/plan-revisions", json={"items": items, "reason": "  x "})).status_code == 422


async def test_manual_revision_cannot_use_the_scheduler_request_prefix(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order, cfg = await _setup(db)
    items = [{"action": "UPDATE", "config_id": cfg.id, "planned_qty": "900"}]
    async with client_for(db, tenant, user) as c:
        r = await c.post(f"{API}/plan-revisions", json=_body(items, request_id="sch-0123456789abcdef"))
        assert r.status_code == 422, r.text
        assert (await _propose(c, items, request_id="manual-req-01")).status_code == 201


# ------------------------------------------------------------------ business rules


async def test_firm_on_confirmed_order_applies_even_when_material_is_not_ready_with_a_warning(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order, cfg = await _setup(db)  # the order has no BOM, so materials are not ready
    items = [{"action": "UPDATE", "config_id": cfg.id, "reservation_status": "FIRM_BOOKED"}]
    async with client_for(db, tenant, user) as c:
        pv = await c.post(f"{API}/plan-revisions/preview", json={"items": items})
        assert pv.status_code == 200, pv.text
        impact = pv.json()["impact"]
        assert [m["order_id"] for m in impact["material"]] == [order.id]
        assert impact["material"][0]["materials_ready"] is False
        assert impact["material_warnings"] and "still allowed" in impact["material_warnings"][0]["warning"]
        rev = (await _propose(c, items)).json()
        r = await _approve(c, rev)
        assert r.status_code == 200, r.text
        assert r.json()["impact"]["material_warnings"]
    await db.refresh(cfg)
    assert cfg.reservation_status == "FIRM_BOOKED"


async def test_firm_on_a_draft_order_is_rejected(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order, cfg = await _setup(db, status="DRAFT")
    async with client_for(db, tenant, user) as c:
        items = [{"action": "UPDATE", "config_id": cfg.id, "reservation_status": "FIRM_BOOKED"}]
        assert (await c.post(f"{API}/plan-revisions/preview", json={"items": items})).status_code == 422
        assert (await _propose(c, items)).status_code == 422
        create = [{"action": "CREATE", "line_id": fx.line.id, "order_id": order.id, "start_date": "2030-03-18",
                   "planned_qty": "10", "reservation_status": "FIRM_BOOKED"}]
        assert (await _propose(c, create)).status_code == 422
        # a SOFT / DRAFT change on a draft order is fine
        ok = [{"action": "UPDATE", "config_id": cfg.id, "reservation_status": "DRAFT"}]
        assert (await _propose(c, ok)).status_code == 201


async def test_completed_and_cancelled_rows_are_immutable_and_in_progress_cannot_be_cancelled(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order, cfg = await _setup(db)
    done = await add_plan(db, tenant, fx.line, start=MONDAY, end=FRIDAY, qty="10", order=order, rs="COMPLETED")
    gone = await add_plan(db, tenant, fx.line, start=MONDAY, end=FRIDAY, qty="10", order=order, rs="CANCELLED")
    running = await add_plan(db, tenant, fx.line, start=MONDAY, end=FRIDAY, qty="10", order=order, rs="IN_PROGRESS")
    no_order = await add_plan(db, tenant, fx.line, start=MONDAY, end=FRIDAY, qty="10", rs="DRAFT")
    await db.commit()
    async with client_for(db, tenant, user) as c:
        for row in (done, gone):
            for action in ("UPDATE", "CANCEL"):
                r = await _propose(c, [{"action": action, "config_id": row.id, "planned_qty": "5"} if action == "UPDATE" else {"action": action, "config_id": row.id}])
                assert r.status_code == 409, (row.reservation_status, action, r.text)
        assert (await _propose(c, [{"action": "CANCEL", "config_id": running.id}])).status_code == 409
        # IN_PROGRESS keeps its status but can be re-planned
        assert (await _propose(c, [{"action": "UPDATE", "config_id": running.id, "reservation_status": "DRAFT"}])).status_code == 422
        assert (await _propose(c, [{"action": "UPDATE", "config_id": running.id, "planned_qty": "12"}])).status_code == 201
        # rows without an order are not revisable here
        assert (await _propose(c, [{"action": "UPDATE", "config_id": no_order.id, "planned_qty": "5"}])).status_code == 422


async def test_item_validation_errors(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order, cfg = await _setup(db)
    async with client_for(db, tenant, user) as c:
        bad = [
            [],  # no items
            [{"action": "CREATE", "line_id": fx.line.id, "order_id": order.id}],  # missing dates / qty
            [{"action": "UPDATE", "planned_qty": "5"}],  # no config id
            [{"action": "UPDATE", "config_id": cfg.id, "planned_qty": "5"}, {"action": "CANCEL", "config_id": cfg.id}],
            [{"action": "UPDATE", "config_id": cfg.id, "start_date": "2030-03-20", "planned_end_date": "2030-03-10"}],
            [{"action": "UPDATE", "config_id": cfg.id, "order_id": order.id + 1}],
            [{"action": "CREATE", "config_id": cfg.id, "line_id": fx.line.id, "order_id": order.id,
              "start_date": "2030-03-18", "planned_qty": "5"}],
            [{"action": "UPDATE", "config_id": cfg.id, "planned_qty": "-1"}],
        ]
        for items in bad:
            r = await c.post(f"{API}/plan-revisions/preview", json={"items": items})
            assert r.status_code in (404, 422), (items, r.status_code, r.text)
        r = await c.post(f"{API}/plan-revisions/preview", json={"items": [{"action": "UPDATE", "config_id": cfg.id, "bogus": 1}]})
        assert r.status_code == 422


# ------------------------------------------------------------------ impact


async def test_preview_impact_shows_delivery_and_overload_change_and_writes_nothing(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order, cfg = await _setup(db)
    items = [{"action": "UPDATE", "config_id": cfg.id, "reservation_status": "FIRM_BOOKED",
              "planned_end_date": "2030-03-04"}]  # 1000 pcs x 12.5 SMV on one day: above the 8,640 minute capacity
    revisions_before = (await db.execute(select(func.count()).select_from(MfgPlanRevision))).scalar_one()
    async with client_for(db, tenant, user) as c:
        r = await c.post(f"{API}/plan-revisions/preview", json={"items": items})
    assert r.status_code == 200, r.text
    impact = r.json()["impact"]
    d = impact["deliveries"][0]
    assert d["order_id"] == order.id and d["before"]["band"] == "UNKNOWN" and d["after"]["band"] != "UNKNOWN"
    line = impact["overload"][0]
    assert line["line_id"] == fx.line.id
    assert line["overload_days_before"] == 0 and line["overload_days_after"] == 1
    assert line["newly_overloaded_dates"] == ["2030-03-04"]
    await db.refresh(cfg)
    assert cfg.reservation_status == "SOFT_BOOKED"
    assert (await db.execute(select(func.count()).select_from(MfgPlanRevision))).scalar_one() == revisions_before


# ------------------------------------------------------------------ follow-up sync


async def test_followup_sync_failure_does_not_abort_the_approval(db_session_integration, monkeypatch):
    db = db_session_integration
    tenant, user, fx, order, cfg = await _setup(
        db, flags={**FLAGS, "line_allocation_confirm_enabled": True, "tna_event_sync": True}
    )
    calls: list[int] = []

    async def boom(*args, **kwargs):
        calls.append(1)
        raise RuntimeError("follow-up sync is down")

    monkeypatch.setattr("app.modules.merch.followup_sync_service.maybe_sync_followup", boom)
    items = [{"action": "UPDATE", "config_id": cfg.id, "reservation_status": "FIRM_BOOKED"}]
    async with client_for(db, tenant, user) as c:
        rev = (await _propose(c, items)).json()
        r = await _approve(c, rev)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "APPLIED"
    assert calls == [1]
    await db.refresh(cfg)
    assert cfg.reservation_status == "FIRM_BOOKED"


async def test_followup_sync_is_not_called_when_the_gate_flag_is_off(db_session_integration, monkeypatch):
    db = db_session_integration
    tenant, user, fx, order, cfg = await _setup(db)
    calls: list[int] = []

    async def spy(*args, **kwargs):
        calls.append(1)
        return []

    monkeypatch.setattr("app.modules.merch.followup_sync_service.maybe_sync_followup", spy)
    async with client_for(db, tenant, user) as c:
        rev = (await _propose(c, [{"action": "UPDATE", "config_id": cfg.id, "reservation_status": "FIRM_BOOKED"}])).json()
        assert (await _approve(c, rev)).status_code == 200
    assert calls == []


# ------------------------------------------------------------------ security


async def test_permission_denial_under_rbac_enforce(db_session_integration):
    db = db_session_integration
    flags = {**FLAGS, "rbac_enforcement": "enforce"}
    tenant, user, fx, order, cfg = await _setup(db, flags=flags)
    reader = await add_user_with_role(db, tenant, "reader", {"production.planning.read": True})
    writer = await add_user_with_role(
        db, tenant, "writer", {"production.planning.read": True, "production.planning.write": True}
    )
    await db.commit()
    items = [{"action": "UPDATE", "config_id": cfg.id, "planned_qty": "900"}]
    async with client_for(db, tenant, reader) as c:
        assert (await c.get(f"{API}/plan-revisions")).status_code == 200
        assert (await c.post(f"{API}/plan-revisions/preview", json={"items": items})).status_code == 403
        assert (await _propose(c, items)).status_code == 403
        assert (await c.put(f"{API}/planning-settings", json={"receipt_buffer_days": 2})).status_code == 403
        assert (await c.post(f"{API}/plan-revisions/1/approve", json={"expected_lock_version": 0})).status_code == 403
    async with client_for(db, tenant, writer) as c:
        r = await _propose(c, items)
        assert r.status_code == 201
        rev = r.json()
        assert rev["can_approve"] is False  # no approve permission
        assert (await _approve(c, rev)).status_code == 403
        assert (await c.post(f"{API}/plan-revisions/{rev['id']}/reject", json={"decision_note": "no"})).status_code == 403
    await db.refresh(cfg)
    assert Decimal(cfg.planned_qty) == Decimal("1000")


async def test_cross_tenant_ids_look_like_not_found(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order, cfg = await _setup(db)
    t2, u2, fx2, order2, cfg2 = await _setup(db)
    foreign = [
        {"action": "UPDATE", "config_id": cfg2.id, "planned_qty": "5"},
        {"action": "CANCEL", "config_id": cfg2.id},
        {"action": "CREATE", "line_id": fx2.line.id, "order_id": order.id, "start_date": "2030-03-18", "planned_qty": "5"},
        {"action": "CREATE", "line_id": fx.line.id, "order_id": order2.id, "start_date": "2030-03-18", "planned_qty": "5"},
        {"action": "CREATE", "line_id": fx.line.id, "order_id": order.id, "start_date": "2030-03-18", "planned_qty": "5",
         "style_id": fx2.style.id},
        {"action": "CREATE", "line_id": fx.line.id, "order_id": order.id, "start_date": "2030-03-18", "planned_qty": "5",
         "ob_id": fx2.ob.id},
        {"action": "CREATE", "line_id": fx.line.id, "order_id": order.id, "start_date": "2030-03-18", "planned_qty": "5",
         "shift_id": fx2.shift.id},
    ]
    async with client_for(db, tenant, user) as c:
        for item in foreign:
            r = await c.post(f"{API}/plan-revisions/preview", json={"items": [item]})
            assert r.status_code == 404, (item, r.status_code, r.text)
            assert (await _propose(c, [item])).status_code == 404
        # another tenant's revision
    async with client_for(db, t2, u2) as c:
        rev2 = (await _propose(c, [{"action": "UPDATE", "config_id": cfg2.id, "planned_qty": "5"}])).json()
    async with client_for(db, tenant, user) as c:
        assert (await c.get(f"{API}/plan-revisions/{rev2['id']}")).status_code == 404
        assert (await c.post(f"{API}/plan-revisions/{rev2['id']}/approve", json={"expected_lock_version": 0})).status_code == 404
        assert (await c.post(f"{API}/plan-revisions/{rev2['id']}/reject", json={"decision_note": "x"})).status_code == 404
        assert (await c.post(f"{API}/plan-revisions/{rev2['id']}/cancel")).status_code == 404
        listed = (await c.get(f"{API}/plan-revisions")).json()
        assert listed["total"] == 0


async def test_user_of_another_tenant_is_refused(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order, cfg = await _setup(db)
    t2, u2, *_ = await _setup(db)
    async with client_for(db, tenant, u2) as c:  # u2 belongs to t2 but the resolved tenant is `tenant`
        assert (await c.get(f"{API}/plan-revisions")).status_code == 403


async def test_everything_is_404_when_the_integrated_flag_is_off(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order, cfg = await _setup(db, flags=dict(FLAGS_ON))
    items = [{"action": "UPDATE", "config_id": cfg.id, "planned_qty": "900"}]
    async with client_for(db, tenant, user) as c:
        window = {"date_from": "2030-03-04", "date_to": "2030-03-15"}
        assert (await c.get(f"{API}/bookings", params=window)).status_code == 404
        assert (await c.post(f"{API}/plan-revisions/preview", json={"items": items})).status_code == 404
        assert (await _propose(c, items)).status_code == 404
        assert (await c.get(f"{API}/plan-revisions")).status_code == 404
        assert (await c.get(f"{API}/plan-revisions/1")).status_code == 404
        assert (await c.post(f"{API}/plan-revisions/1/approve", json={"expected_lock_version": 0})).status_code == 404
        assert (await c.get(f"{API}/tentative-demand")).status_code == 404
        assert (await c.get(f"{API}/planning-settings")).status_code == 404
    # the master flag off hides it too
    set_flags(tenant, manufacturing_intelligence_v1=False, mfg_integrated_planning_v1=True)
    async with client_for(db, tenant, user) as c:
        assert (await c.get(f"{API}/plan-revisions")).status_code == 404


# ------------------------------------------------------------------ list / bookings


async def test_bookings_list_has_lock_versions_and_tentative_bookings_separately(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order, cfg = await _setup(db)
    window = {"date_from": "2030-03-04", "date_to": "2030-03-15"}
    async with client_for(db, tenant, user) as c:
        r = await c.get(f"{API}/bookings", params=window)
        assert r.status_code == 200, r.text
        out = r.json()
        row = next(b for b in out["bookings"] if b["id"] == cfg.id)
        assert row["lock_version"] == 0 and row["order_code"] == order.order_code and row["line_code"] == "L1"
        assert row["reservation_status"] == "SOFT_BOOKED" and "tentative_bookings" in out
        too_long = await c.get(f"{API}/bookings", params={"date_from": "2030-03-04", "date_to": "2031-03-04"})
        assert too_long.status_code == 422


async def test_revision_list_filters_and_bounds(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order, cfg = await _setup(db)
    async with client_for(db, tenant, user) as c:
        a = (await _propose(c, [{"action": "UPDATE", "config_id": cfg.id, "planned_qty": "900"}])).json()
        b = (await _propose(c, [{"action": "UPDATE", "config_id": cfg.id, "planned_qty": "800"}])).json()
        assert (b["revision_no"], a["revision_no"]) == (2, 1)
        await c.post(f"{API}/plan-revisions/{a['id']}/cancel")
        proposed = (await c.get(f"{API}/plan-revisions", params={"status": "PROPOSED"})).json()
        assert [x["id"] for x in proposed["items"]] == [b["id"]]
        assert (await c.get(f"{API}/plan-revisions", params={"limit": 101})).status_code == 422
        assert (await c.get(f"{API}/plan-revisions", params={"status": "NOPE"})).status_code == 422
        page = (await c.get(f"{API}/plan-revisions", params={"limit": 1, "offset": 1})).json()
        assert page["total"] == 2 and [x["id"] for x in page["items"]] == [a["id"]]


# ------------------------------------------------------------------ security review round 1


async def test_real_followup_sync_error_keeps_the_approval(db_session_integration, monkeypatch):
    """The error happens inside the real sync function: its own rollback must not end the approve transaction."""
    db = db_session_integration
    tenant, user, fx, order, cfg = await _setup(
        db, flags={**FLAGS, "line_allocation_confirm_enabled": True, "tna_event_sync": True}
    )

    def boom(*args, **kwargs):
        raise RuntimeError("follow-up template lookup failed")

    monkeypatch.setattr("app.modules.merch.followup_sync_service.milestones_for_event", boom)
    items = [{"action": "UPDATE", "config_id": cfg.id, "reservation_status": "FIRM_BOOKED"}]
    async with client_for(db, tenant, user) as c:
        rev = (await _propose(c, items)).json()
        r = await _approve(c, rev)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "APPLIED"
    await db.refresh(cfg)
    assert cfg.reservation_status == "FIRM_BOOKED"
    n = (
        await db.execute(
            select(func.count()).select_from(AuditLog).where(
                AuditLog.tenant_id == tenant.id, AuditLog.action == "mfg_plan_revision.approve"
            )
        )
    ).scalar_one()
    assert n == 1


async def test_planned_qty_cannot_go_below_produced_qty(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order, cfg = await _setup(db)
    cfg.completed_qty = Decimal("300")
    await db.commit()
    async with client_for(db, tenant, user) as c:
        r = await _propose(c, [{"action": "UPDATE", "config_id": cfg.id, "planned_qty": "299"}])
        assert r.status_code == 422, r.text
        rev = (await _propose(c, [{"action": "UPDATE", "config_id": cfg.id, "planned_qty": "400"}])).json()
    # output reported after the proposal overtakes the new plan: approve is stale, nothing written
    cfg.completed_qty = Decimal("450")
    await db.commit()
    async with client_for(db, tenant, user) as c:
        r = await _approve(c, rev)
        assert r.status_code == 409, r.text
    await db.refresh(cfg)
    assert Decimal(cfg.planned_qty) == Decimal("1000")


async def test_order_cancelled_after_proposal_cannot_become_firm(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order, cfg = await _setup(db)
    items = [{"action": "UPDATE", "config_id": cfg.id, "reservation_status": "FIRM_BOOKED"}]
    async with client_for(db, tenant, user) as c:
        rev = (await _propose(c, items)).json()
    order.status = "CANCELLED"
    await db.commit()
    async with client_for(db, tenant, user) as c:
        r = await _approve(c, rev)
        assert r.status_code == 422, r.text
    await db.refresh(cfg)
    assert cfg.reservation_status == "SOFT_BOOKED"
