"""Phase 5 scheduler convert + approval fence (doc 16 sections 10.6, 15.1, 15.10-15.12, 15.19).

Run: docker compose exec -T backend sh -c "pytest tests/test_mfg_scheduler_convert.py -q -p no:warnings"
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from sqlalchemy import select

from app.models import AuditLog, SewingLineStyleConfig
from app.models.mfg_planning import MfgPlanRevision
from app.modules.mfg_intelligence.capacity_service import compute_capacity
from tests.mfg_alloc_fixtures import add_user_with_role
from tests.mfg_finance_fixtures import set_planning_config
from tests.mfg_forward_fixtures import (
    ADV_FLAGS,
    INTEGRATED,
    TODAY,
    add_order,
    add_plan,
    adv_tenant,
    base_row,
    pinned_today,  # noqa: F401 - autouse fixture
)
from tests.mfg_intel_fixtures import API, add_line, client_for

PREVIEW = f"{API}/scheduler/preview"
CONVERT = f"{API}/scheduler/convert"
SCHED_FLAGS = {**ADV_FLAGS, INTEGRATED: True}
FIRST = TODAY + timedelta(days=14)
PARAMS = {"horizon_days": 90}


async def _setup(db, flags=None):
    tenant, user, _role, fx = await adv_tenant(db, flags=SCHED_FLAGS if flags is None else flags)
    await base_row(db, tenant, fx)
    line2 = await add_line(db, tenant, "L2")
    await add_plan(db, tenant, line2, start=TODAY - timedelta(days=1), end=TODAY + timedelta(days=200), qty="0",
                   ob=fx.ob, style=fx.style)
    soft_order = await add_order(db, tenant, fx.customer, fx.style, qty=400, delivery=TODAY + timedelta(days=24))
    soft = await add_plan(db, tenant, fx.line, start=TODAY + timedelta(days=40), end=TODAY + timedelta(days=44), qty="400",
                          order=soft_order, ob=fx.ob, style=fx.style, rs="SOFT_BOOKED")  # late -> pulled in
    new_order = await add_order(db, tenant, fx.customer, fx.style, qty=1500, delivery=TODAY + timedelta(days=30))
    approver = await add_user_with_role(db, tenant, "manager", {"*": True})
    await db.commit()
    return tenant, user, fx, soft, new_order, approver


async def _rows(db, tenant):
    rows = (await db.execute(select(SewingLineStyleConfig).where(SewingLineStyleConfig.tenant_id == tenant.id)
                             .order_by(SewingLineStyleConfig.id).execution_options(populate_existing=True))).scalars().all()
    return [(r.id, r.line_id, r.start_date, r.planned_end_date, Decimal(str(r.planned_qty)).normalize(),
             r.reservation_status, int(r.lock_version or 0)) for r in rows]


async def _preview(c, **params):
    r = await c.get(PREVIEW, params={**PARAMS, **params})
    assert r.status_code == 200, r.text
    return r.json()


def _body(preview, *, request_id="req-00000001", note="Pull late orders in", **params):
    return {"params": {**PARAMS, **params}, "proposal_hash": preview["proposal_hash"], "note": note, "request_id": request_id}


async def test_convert_creates_proposed_revision_and_approve_applies_with_even_spread(db_session_integration):
    db = db_session_integration
    tenant, user, fx, soft, new_order, approver = await _setup(db)
    before = await _rows(db, tenant)
    async with client_for(db, tenant, user) as c:
        preview = await _preview(c)
        assert {i["job_id"] for i in preview["items"]} == {f"row:{soft.id}", f"order:{new_order.id}"}
        r = await c.post(CONVERT, json=_body(preview))
    assert r.status_code == 201, r.text
    rev = r.json()
    assert rev["status"] == "PROPOSED" and rev["title"] == f"Scheduler proposal {preview['proposal_hash'][:12]}"
    assert rev["request_id"] == f"sch-{preview['proposal_hash'][:24]}-req-00000001"
    assert rev["scheduler"] == {"proposal_hash": preview["proposal_hash"], "replay": False, "items": 2}
    assert len(rev["items"]) == 2 and await _rows(db, tenant) == before  # nothing changed on the plan
    actions = (await db.execute(select(AuditLog.action).where(AuditLog.tenant_id == tenant.id))).scalars().all()
    assert "mfg_plan_revision.propose" in actions and "mfg_scheduler.convert" in actions
    update = next(i for i in rev["items"] if i["action"] == "UPDATE")
    assert set(update["after"]) >= {"line_id", "start_date", "planned_end_date"}
    assert update["after"]["target_efficiency_pct"] == update["before"]["target_efficiency_pct"]  # never changed
    async with client_for(db, tenant, approver) as c:
        r = await c.post(f"{API}/plan-revisions/{rev['id']}/approve", json={"expected_lock_version": rev["lock_version"]})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "APPLIED"
    # Phase 1 view after applying: no line-day carries more load than its practical capacity
    placed = [i for i in preview["items"]]
    cap = await compute_capacity(db, tenant.id, window_start=FIRST, window_end=TODAY + timedelta(days=89))
    for lc in cap.lines:
        for d in lc.days:
            if d.practical_minutes is None:
                continue
            assert d.load.firm + d.load.soft <= d.practical_minutes + Decimal("0.01"), (lc.line.line_code, d.day)
            assert d.status != "OVERLOADED", (lc.line.line_code, d.day)
    moved = (await db.execute(select(SewingLineStyleConfig).where(SewingLineStyleConfig.id == soft.id))).scalar_one()
    item = next(i for i in placed if i["job_id"] == f"row:{soft.id}")
    assert moved.start_date.isoformat() == item["start_date"] and moved.reservation_status == "SOFT_BOOKED"


async def test_replay_before_rerun_and_request_id_rules(db_session_integration, monkeypatch):
    from app.modules.mfg_planning import scheduler_convert

    db = db_session_integration
    tenant, user, _fx, _soft, _order, _approver = await _setup(db)
    async with client_for(db, tenant, user) as c:
        preview = await _preview(c)
        first = await c.post(CONVERT, json=_body(preview))
        assert first.status_code == 201, first.text

        async def boom(*_a, **_k):
            raise AssertionError("replay must not re-run the engine")

        monkeypatch.setattr(scheduler_convert, "load_scheduler_inputs", boom)
        again = await c.post(CONVERT, json=_body(preview))
        assert again.status_code == 200 and again.json()["id"] == first.json()["id"]
        assert again.json()["scheduler"]["replay"] is True
        other = await c.post(CONVERT, json=_body(preview, note="Another note here"))
        assert other.status_code == 409 and other.json()["detail"]["code"] == "REQUEST_ID_REUSED"
        for bad in ("short", "has space 123", "x" * 33, "bad/char!!"):
            r = await c.post(CONVERT, json=_body(preview, request_id=bad))
            assert r.status_code == 422, bad
        r = await c.post(CONVERT, json={**_body(preview), "note": "tiny"})
        assert r.status_code == 422
    count = (await db.execute(select(MfgPlanRevision).where(MfgPlanRevision.tenant_id == tenant.id))).scalars().all()
    assert len(count) == 1


async def test_stale_proposal_is_409_and_nothing_written(db_session_integration):
    db = db_session_integration
    tenant, user, fx, _soft, _order, _approver = await _setup(db)
    async with client_for(db, tenant, user) as c:
        preview = await _preview(c)
        await add_order(db, tenant, fx.customer, fx.style, qty=300, delivery=TODAY + timedelta(days=28))
        await db.commit()
        r = await c.post(CONVERT, json=_body(preview))
    assert r.status_code == 409 and r.json()["detail"]["code"] == "PROPOSAL_STALE"
    assert (await db.execute(select(MfgPlanRevision).where(MfgPlanRevision.tenant_id == tenant.id))).first() is None


async def test_lock_version_change_before_approve_is_409(db_session_integration):
    db = db_session_integration
    tenant, user, _fx, soft, _order, approver = await _setup(db)
    async with client_for(db, tenant, user) as c:
        rev = (await c.post(CONVERT, json=_body(await _preview(c)))).json()
    row = (await db.execute(select(SewingLineStyleConfig).where(SewingLineStyleConfig.id == soft.id))).scalar_one()
    row.planned_qty = Decimal("450")  # a legacy planning change bumps lock_version
    await db.commit()
    before = await _rows(db, tenant)
    async with client_for(db, tenant, approver) as c:
        r = await c.post(f"{API}/plan-revisions/{rev['id']}/approve", json={"expected_lock_version": rev["lock_version"]})
    assert r.status_code == 409, r.text
    assert await _rows(db, tenant) == before


async def test_frozen_fence_at_approval_and_manual_revision_unaffected(db_session_integration):
    db = db_session_integration
    tenant, user, fx, _soft, new_order, approver = await _setup(db)
    async with client_for(db, tenant, user) as c:
        rev = (await c.post(CONVERT, json=_body(await _preview(c)))).json()
    await set_planning_config(db, tenant, frozen_horizon_days=60)  # the fence moved after the proposal
    await db.commit()
    before = await _rows(db, tenant)
    async with client_for(db, tenant, approver) as c:
        r = await c.post(f"{API}/plan-revisions/{rev['id']}/approve", json={"expected_lock_version": rev["lock_version"]})
        assert r.status_code == 409 and r.json()["detail"].startswith("PROPOSAL_ENTERED_FROZEN_ZONE"), r.text
        assert await _rows(db, tenant) == before
        # a manual revision inside the (wider) frozen zone is still approved as before
        manual = await c.post(f"{API}/plan-revisions", json={
            "reason": "Manual move inside the frozen zone",
            "items": [{"action": "CREATE", "line_id": fx.line.id, "order_id": new_order.id, "start_date": FIRST.isoformat(),
                       "planned_end_date": (FIRST + timedelta(days=1)).isoformat(), "planned_qty": "10",
                       "reservation_status": "SOFT_BOOKED", "target_efficiency_pct": "60"}],
        })
        assert manual.status_code == 201, manual.text
    async with client_for(db, tenant, user) as c:
        ok = await c.post(f"{API}/plan-revisions/{manual.json()['id']}/approve",
                          json={"expected_lock_version": manual.json()["lock_version"]})
    assert ok.status_code == 200 and ok.json()["status"] == "APPLIED", ok.text


async def test_four_eyes_still_blocks_the_proposer(db_session_integration):
    db = db_session_integration
    tenant, user, _fx, _soft, _order, approver = await _setup(db, flags={**SCHED_FLAGS, "mfg_plan_four_eyes": True})
    async with client_for(db, tenant, user) as c:
        rev = (await c.post(CONVERT, json=_body(await _preview(c)))).json()
        r = await c.post(f"{API}/plan-revisions/{rev['id']}/approve", json={"expected_lock_version": rev["lock_version"]})
    assert r.status_code == 403
    async with client_for(db, tenant, approver) as c:
        r = await c.post(f"{API}/plan-revisions/{rev['id']}/approve", json={"expected_lock_version": rev["lock_version"]})
    assert r.status_code == 200, r.text


async def test_cross_tenant_ids_are_ignored_or_not_found(db_session_integration):
    db = db_session_integration
    tenant, user, _fx, soft, _order, _approver = await _setup(db)
    other, other_user, other_fx, other_soft, _o, _a = await _setup(db)
    async with client_for(db, tenant, user) as c:
        plain = await _preview(c)
        # another tenant's job keys pin nothing: same proposal, only the echoed parameter differs
        foreign = await _preview(c, exclude_job_ids=f"row:{other_soft.id}")
        assert [j["status"] for j in foreign["jobs"]] == [j["status"] for j in plain["jobs"]]
        assert foreign["items"] == plain["items"]
        r = await c.post(CONVERT, json=_body(foreign, exclude_job_ids=[f"row:{other_soft.id}"]))
        assert r.status_code == 201, r.text
        assert all(i["config_id"] != other_soft.id for i in r.json()["items"])
    async with client_for(db, other, other_user) as c:
        r = await c.post(f"{API}/plan-revisions/{r.json()['id']}/approve", json={"expected_lock_version": 0})
        assert r.status_code == 404
    async with client_for(db, other, user) as c:  # a user of tenant A on tenant B
        assert (await c.post(CONVERT, json=_body(plain))).status_code == 403
    assert soft.id != other_soft.id


async def test_permissions_flags_and_limits(db_session_integration):
    db = db_session_integration
    tenant, user, _fx, _soft, _order, _approver = await _setup(db)
    reader = await add_user_with_role(db, tenant, "reader", {"production.planning.read": True, "production.planning.write": False})
    async with client_for(db, tenant, user) as c:
        preview = await _preview(c)
        too_many = await c.post(CONVERT, json=_body(preview, exclude_job_ids=[f"order:{i}" for i in range(1, 102)]))
        assert too_many.status_code == 422
    tenant.feature_flags = {**SCHED_FLAGS, "rbac_enforcement": "enforce"}
    await db.commit()
    async with client_for(db, tenant, reader) as c:
        assert (await c.post(CONVERT, json=_body(preview))).status_code == 403
        assert (await c.get(PREVIEW)).status_code == 200  # reading a proposal needs only planning read
    tenant.feature_flags = dict(ADV_FLAGS)  # integrated planning off
    await db.commit()
    async with client_for(db, tenant, user) as c:
        assert (await c.post(CONVERT, json=_body(preview))).status_code == 404


async def test_convert_rejects_items_inside_frozen_zone_and_empty_proposals(db_session_integration, monkeypatch):
    from app.modules.mfg_planning import scheduler_convert

    db = db_session_integration
    tenant, user, _fx, _soft, _order, _approver = await _setup(db)
    async with client_for(db, tenant, user) as c:
        preview = await _preview(c)
        real = scheduler_convert.run_scheduler

        def inside(inputs):
            out = real(inputs)
            out["items"] = [dict(out["items"][0], start_date=TODAY + timedelta(days=2))]
            return out

        monkeypatch.setattr(scheduler_convert, "run_scheduler", inside)
        r = await c.post(CONVERT, json=_body(preview))
        assert r.status_code == 422 and r.json()["detail"]["code"] == "FROZEN_ZONE"

        def empty(inputs):
            return dict(real(inputs), items=[])

        monkeypatch.setattr(scheduler_convert, "run_scheduler", empty)
        r = await c.post(CONVERT, json=_body(preview, request_id="req-00000002"))
        assert r.status_code == 422 and r.json()["detail"]["code"] == "NOTHING_TO_CONVERT"


async def test_convert_timeout_is_503(db_session_integration, monkeypatch):
    from sqlalchemy import text

    from app.modules.mfg_planning import scheduler_convert

    db = db_session_integration
    tenant, user, _fx, _soft, _order, _approver = await _setup(db)
    async with client_for(db, tenant, user) as c:
        preview = await _preview(c)

        async def slow(db_, *_a, **_k):
            await db_.execute(text("SELECT pg_sleep(0.5)"))

        monkeypatch.setattr(scheduler_convert, "STATEMENT_TIMEOUT_MS", "50")
        monkeypatch.setattr(scheduler_convert, "load_scheduler_inputs", slow)
        r = await c.post(CONVERT, json=_body(preview))
    assert r.status_code == 503 and r.json()["detail"]["code"] == "SCHEDULER_TIMEOUT"
    assert (await db.execute(text("SELECT 1"))).scalar() == 1
