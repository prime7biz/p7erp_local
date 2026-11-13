"""Phase 5 scheduler preview (doc 16 sections 10.5, 15.7-15.11, 15.19). Read-only engine, proposal only.

Reference: TODAY = Monday 2030-03-04, frozen zone 14 days -> frozen_end Sunday 2030-03-17, first placeable day
Monday 2030-03-18. One line = 8,640 SMV minutes per working day (SMV 12.5 -> 691.2 pieces).

Run: docker compose exec -T backend sh -c "pytest tests/test_mfg_scheduler.py -q -p no:warnings"
"""

from __future__ import annotations

import json
import random
import statistics
import time
from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import event

from app.modules.mfg_intelligence import scheduler_service as sch
from tests.mfg_alloc_fixtures import add_user_with_role
from tests.mfg_forward_fixtures import (
    ADV_FLAGS,
    INTEGRATED,
    TODAY,
    add_booking,
    add_inquiry,
    add_order,
    add_plan,
    adv_tenant,
    base_row,
    pinned_today,  # noqa: F401 - autouse fixture
)
from tests.mfg_intel_fixtures import API, add_line, add_style_with_ob, client_for
from tests.query_counting import is_rls_housekeeping

URL = f"{API}/scheduler/preview"
SCHED_FLAGS = {**ADV_FLAGS, INTEGRATED: True}
FROZEN_END = TODAY + timedelta(days=13)
FIRST = TODAY + timedelta(days=14)
DAY_MIN = Decimal("8640")


async def sched_tenant(db, flags=None):
    tenant, user, role, fx = await adv_tenant(db, flags=SCHED_FLAGS if flags is None else flags)
    await base_row(db, tenant, fx)
    return tenant, user, role, fx


async def _preview(db, tenant, user, **params):
    async with client_for(db, tenant, user) as c:
        r = await c.get(URL, params={"horizon_days": 90, **params})
    assert r.status_code == 200, r.text
    return r.json()


def _job(body, job_id):
    return next(j for j in body["jobs"] if j["job_id"] == job_id)


def _d(text):
    return date.fromisoformat(text)


@pytest.mark.parametrize("seed", [3, 7, 11])
async def test_frozen_zone_never_loaded_or_moved(db_session_integration, seed):
    rnd = random.Random(seed)
    db = db_session_integration
    tenant, user, _role, fx = await sched_tenant(db)
    line2 = await add_line(db, tenant, "L2")
    await add_plan(db, tenant, line2, start=TODAY - timedelta(days=1), end=TODAY + timedelta(days=200), qty="0",
                   ob=fx.ob, style=fx.style)
    for i in range(6):
        order = await add_order(db, tenant, fx.customer, fx.style, qty=rnd.randint(200, 3000),
                                delivery=TODAY + timedelta(days=rnd.randint(-5, 70)))
        if i % 2:
            start = TODAY + timedelta(days=rnd.randint(15, 50))
            await add_plan(db, tenant, rnd.choice([fx.line, line2]), start=start, end=start + timedelta(days=rnd.randint(1, 6)),
                           qty=str(rnd.randint(100, 900)), order=order, ob=fx.ob, style=fx.style, rs="SOFT_BOOKED")
    # a SOFT row inside the frozen zone is fixed (never a job)
    frozen_order = await add_order(db, tenant, fx.customer, fx.style, qty=100, delivery=TODAY + timedelta(days=20))
    frozen_row = await add_plan(db, tenant, fx.line, start=TODAY + timedelta(days=3), end=TODAY + timedelta(days=4),
                                qty="100", order=frozen_order, ob=fx.ob, style=fx.style, rs="SOFT_BOOKED")
    await db.commit()
    body = await _preview(db, tenant, user)
    assert body["frozen_end"] == FROZEN_END.isoformat()
    assert all(j["job_id"] != f"row:{frozen_row.id}" for j in body["jobs"])
    assert body["items"], body["counts"]
    for it in body["items"]:
        assert _d(it["start_date"]) > FROZEN_END and _d(it["planned_end_date"]) >= _d(it["start_date"])
    for j in body["jobs"]:
        if j["placement"]:
            assert _d(j["placement"]["start_date"]) > FROZEN_END


async def test_firm_rows_never_move_and_late_firm_is_suggested(db_session_integration):
    db = db_session_integration
    tenant, user, _role, fx = await sched_tenant(db)
    order = await add_order(db, tenant, fx.customer, fx.style, qty=100, delivery=TODAY + timedelta(days=20))
    firm = await add_plan(db, tenant, fx.line, start=TODAY + timedelta(days=21), end=TODAY + timedelta(days=25), qty="100",
                          order=order, ob=fx.ob, style=fx.style)
    await db.commit()
    body = await _preview(db, tenant, user)
    assert all(j["config_id"] != firm.id for j in body["jobs"])
    assert all(it.get("config_id") != firm.id for it in body["items"])
    late = body["firm_reschedule_suggested"]
    assert late and late[0]["config_id"] == firm.id and late[0]["reason_codes"] == ["FIRM_RESCHEDULE_SUGGESTED"]
    assert "FIRM_RESCHEDULE_SUGGESTED" in body["reason_codes"]


async def test_edd_order_and_explanations(db_session_integration):
    db = db_session_integration
    tenant, user, _role, fx = await sched_tenant(db)
    later = await add_order(db, tenant, fx.customer, fx.style, qty=1000, delivery=TODAY + timedelta(days=60))
    sooner = await add_order(db, tenant, fx.customer, fx.style, qty=1000, delivery=TODAY + timedelta(days=40))
    await db.commit()
    body = await _preview(db, tenant, user)
    a, b = _job(body, f"order:{sooner.id}"), _job(body, f"order:{later.id}")
    assert a["priority_rank"] == 1 and b["priority_rank"] == 2
    assert _d(a["placement"]["start_date"]) == FIRST
    assert _d(b["placement"]["start_date"]) >= _d(a["placement"]["end_date"])
    assert a["status"] == "PLACED" and a["action"] == "CREATE" and "ON_TIME" in a["reason_codes"]
    assert a["placement"]["score"] == {"lateness_days": 0, "changeover_rank": a["placement"]["changeover_rank"],
                                       "idle_gap_days": 0, "overtime_minutes": "0.00", "line_code": "L1"}
    item = next(i for i in body["items"] if i["job_id"] == a["job_id"])
    assert item["reservation_status"] == "SOFT_BOOKED" and item["target_efficiency_pct"] == "60.00"
    assert item["planned_qty"] == "1000.000" and item["planned_end_date"]
    assert body["proposal_only"] is True and "PROPOSAL_ONLY" in body["reason_codes"]
    assert body["kpis"]["before"]["unscheduled_jobs"] == 2 and body["kpis"]["after"]["unscheduled_jobs"] == 0


async def _two_lines(db, tenant, fx, *, style2=None):
    line2 = await add_line(db, tenant, "L2")
    await add_plan(db, tenant, line2, start=TODAY - timedelta(days=1), end=TODAY + timedelta(days=200), qty="0",
                   ob=fx.ob, style=style2 or fx.style)
    return line2


async def test_lateness_beats_changeover(db_session_integration):
    db = db_session_integration
    tenant, user, _role, fx = await sched_tenant(db)
    _c, other_style, other_ob = await add_style_with_ob(db, tenant, customer=fx.customer)
    other_style.product_type = "WOVEN"
    fx.style.product_type = "KNIT"
    line2 = await _two_lines(db, tenant, fx, style2=other_style)  # L2 never ran KNIT -> rank 3
    # L1 is full until day 40 with a FIRM unlinked row (same style)
    await add_plan(db, tenant, fx.line, start=FIRST, end=TODAY + timedelta(days=40), qty="13824", ob=fx.ob, style=fx.style)
    order = await add_order(db, tenant, fx.customer, fx.style, qty=1000, delivery=TODAY + timedelta(days=25))
    await db.commit()
    body = await _preview(db, tenant, user)
    job = _job(body, f"order:{order.id}")
    assert job["placement"]["line_id"] == line2.id and job["placement"]["changeover_rank"] == 3
    assert "NEW_FAMILY_FOR_LINE" in job["reason_codes"] and "ON_TIME" in job["reason_codes"]
    alt = job["alternatives"][0]
    assert alt["line_code"] == "L1" and alt["deciding_criterion"] == "LATENESS" and alt["score"]["lateness_days"] > 0


async def test_same_style_preferred_on_ties_and_unknown_capacity_skipped(db_session_integration):
    db = db_session_integration
    tenant, user, _role, fx = await sched_tenant(db)
    _c, sibling, _ob = await add_style_with_ob(db, tenant, customer=fx.customer)  # same family (product_type None)
    line2 = await _two_lines(db, tenant, fx)
    await add_line(db, tenant, "L0")  # no efficiency anywhere -> UNKNOWN capacity, never chosen
    # previous work before the job: L1 ran the sibling style, L2 ran the job's own style
    await add_plan(db, tenant, fx.line, start=TODAY + timedelta(days=7), end=TODAY + timedelta(days=11), qty="10",
                   ob=fx.ob, style=sibling)
    await add_plan(db, tenant, line2, start=TODAY + timedelta(days=7), end=TODAY + timedelta(days=11), qty="10",
                   ob=fx.ob, style=fx.style)
    order = await add_order(db, tenant, fx.customer, fx.style, qty=500, delivery=TODAY + timedelta(days=60))
    await db.commit()
    body = await _preview(db, tenant, user)
    job = _job(body, f"order:{order.id}")
    assert job["placement"]["line_code"] == "L2" and job["placement"]["changeover_rank"] == 0
    assert "SAME_STYLE" in job["reason_codes"]
    alt = job["alternatives"][0]
    assert alt["line_code"] == "L1" and alt["score"]["changeover_rank"] == 1 and alt["deciding_criterion"] == "CHANGEOVER"
    assert all(a["line_code"] != "L0" for a in job["alternatives"])


@pytest.mark.parametrize("qty,recover", [(1300, "3290.00"), (6000, None)])
async def test_overtime_only_advisory(db_session_integration, qty, recover):
    """Need-by = 2nd placeable day. Free before need-by = 2 x 8,640 - 4,320 new-setup loss = 12,960 min;
    overtime there = 2 days x 30 operators x 120 min x 60 % = 4,320 min."""
    db = db_session_integration
    tenant, user, _role, fx = await sched_tenant(db)
    order = await add_order(db, tenant, fx.customer, fx.style, qty=qty, delivery=FIRST + timedelta(days=1))
    await db.commit()
    body = await _preview(db, tenant, user)
    job = _job(body, f"order:{order.id}")
    assert "LATE" in job["reason_codes"] and "SPLIT_NOT_EVALUATED" in job["reason_codes"]
    assert "FROZEN_LIMITED" in job["reason_codes"]
    assert job["overtime_would_recover_minutes"] == recover
    assert ("OVERTIME_WOULD_RECOVER" in job["reason_codes"]) is (recover is not None)
    assert body["kpis"]["after"]["overtime_minutes"] == "0.00"
    assert job["placement"]["score"]["overtime_minutes"] == "0.00"


async def test_even_spread_fits_free_capacity_and_draft_not_double_scheduled(db_session_integration):
    db = db_session_integration
    tenant, user, _role, fx = await sched_tenant(db)
    # fixed SOFT unlinked load 6,000 min/day on days 14-18 -> only 2,640 free there
    await add_plan(db, tenant, fx.line, start=FIRST, end=FIRST + timedelta(days=4), qty="2400", ob=fx.ob, style=fx.style,
                   rs="SOFT_BOOKED")
    order = await add_order(db, tenant, fx.customer, fx.style, qty=1000, delivery=TODAY + timedelta(days=60))
    await add_plan(db, tenant, fx.line, start=FIRST, end=FIRST + timedelta(days=4), qty="1000", order=order, ob=fx.ob,
                   style=fx.style, rs="DRAFT")
    await db.commit()
    body = await _preview(db, tenant, user)
    jobs = [j for j in body["jobs"] if j["order_id"] == order.id]
    assert [j["job_id"] for j in jobs] == [f"order:{order.id}"]  # the DRAFT row is not a second job
    assert "DRAFT_ROWS_PRESENT" in jobs[0]["reason_codes"]  # warns that the new booking may duplicate the draft
    p = jobs[0]["placement"]
    n = p["working_days"]
    share = Decimal(jobs[0]["minutes"]) / n
    start, end = _d(p["start_date"]), _d(p["end_date"])
    free_days = {FIRST + timedelta(days=k): Decimal("2640") for k in range(5)}
    d = start
    while d <= end:
        if d.weekday() < 5:
            assert share <= free_days.get(d, DAY_MIN), (d, share)
        d += timedelta(days=1)


async def test_job_limit_pins_rows_with_their_load(db_session_integration, monkeypatch):
    monkeypatch.setattr(sch, "MAX_JOBS", 1)
    db = db_session_integration
    tenant, user, _role, fx = await sched_tenant(db)
    row_order = await add_order(db, tenant, fx.customer, fx.style, qty=3456, delivery=TODAY + timedelta(days=80))
    row = await add_plan(db, tenant, fx.line, start=FIRST, end=FIRST + timedelta(days=4), qty="3456", order=row_order,
                         ob=fx.ob, style=fx.style, rs="SOFT_BOOKED")  # 43,200 min = full days 14-18
    urgent = await add_order(db, tenant, fx.customer, fx.style, qty=500, delivery=TODAY + timedelta(days=20))
    await db.commit()
    body = await _preview(db, tenant, user)
    pinned = _job(body, f"row:{row.id}")
    assert pinned["status"] == "UNSCHEDULED" and "JOB_LIMIT" in pinned["reason_codes"]
    job = _job(body, f"order:{urgent.id}")
    assert _d(job["placement"]["start_date"]) > FIRST + timedelta(days=4)  # the pinned row keeps its days
    assert body["counts"]["job_limit"] == 1 and "JOB_LIMIT" in body["reason_codes"]


async def test_revision_item_limit_and_smv_unknown(db_session_integration, monkeypatch):
    monkeypatch.setattr(sch, "MAX_ITEMS", 1)
    db = db_session_integration
    tenant, user, _role, fx = await sched_tenant(db)
    first = await add_order(db, tenant, fx.customer, fx.style, qty=100, delivery=TODAY + timedelta(days=30))
    second = await add_order(db, tenant, fx.customer, fx.style, qty=100, delivery=TODAY + timedelta(days=40))
    _c, no_ob_style, _none = await add_style_with_ob(db, tenant, customer=fx.customer, smv=None)
    unknown_order = await add_order(db, tenant, fx.customer, no_ob_style, qty=100, delivery=TODAY + timedelta(days=40))
    unknown_row = await add_plan(db, tenant, fx.line, start=TODAY + timedelta(days=30), end=TODAY + timedelta(days=31),
                                 qty="100", order=unknown_order, style=no_ob_style, rs="SOFT_BOOKED")
    await db.commit()
    body = await _preview(db, tenant, user)
    assert len(body["items"]) == 1 and body["items"][0]["job_id"] == f"order:{first.id}"
    assert "REVISION_ITEM_LIMIT" in _job(body, f"order:{second.id}")["reason_codes"]
    assert _job(body, f"row:{unknown_row.id}")["reason_codes"][:1] == ["SMV_UNKNOWN"]
    assert body["counts"]["smv_unknown"] >= 1


async def test_exclude_pins_job_and_parameter_validation(db_session_integration):
    db = db_session_integration
    tenant, user, _role, fx = await sched_tenant(db)
    order = await add_order(db, tenant, fx.customer, fx.style, qty=100, delivery=TODAY + timedelta(days=30))
    await db.commit()
    body = await _preview(db, tenant, user, exclude_job_ids=f"order:{order.id},order:999999")
    job = _job(body, f"order:{order.id}")
    assert job["status"] == "PINNED" and job["reason_codes"] == ["PINNED_BY_USER"] and body["items"] == []
    assert body["parameters"]["exclude_job_ids"] == [f"order:{order.id}", "order:999999"]
    async with client_for(db, tenant, user) as c:
        for params, code in (
            ({"efficiency_basis": "P50"}, "SCHEDULER_PLAN_BASIS_ONLY"),
            ({"material_delay_days": 61}, "PARAMETER_OUT_OF_RANGE"),
            ({"btb_delay_days": -1}, "PARAMETER_OUT_OF_RANGE"),
            ({"exclude_job_ids": "line:4"}, "JOB_ID_INVALID"),
            ({"exclude_job_ids": ",".join(f"order:{i}" for i in range(1, 102))}, "TOO_MANY_EXCLUDED_JOBS"),
            ({"horizon_days": 30}, "HORIZON_NOT_ALLOWED"),
        ):
            r = await c.get(URL, params=params)
            assert r.status_code == 422 and r.json()["detail"]["code"] == code, (params, r.text)


async def test_material_and_btb_delay_set_the_earliest_start(db_session_integration, monkeypatch):
    from app.models.commercial import BtbLc
    from app.models.inventory import PurchaseOrder, PurchaseOrderItem
    from app.modules.mfg_intelligence import delivery_forecast_service as dfs
    from tests.mfg_finance_fixtures import add_item_simple

    db = db_session_integration
    tenant, user, _role, fx = await sched_tenant(db)
    plain = await add_order(db, tenant, fx.customer, fx.style, qty=100, delivery=TODAY + timedelta(days=70))
    btb_order = await add_order(db, tenant, fx.customer, fx.style, qty=100, delivery=TODAY + timedelta(days=71))
    lc = BtbLc(tenant_id=tenant.id, reference="BTB-SCH-1", status="OPENED")
    db.add(lc)
    await db.flush()
    po = PurchaseOrder(tenant_id=tenant.id, po_code="PO-SCH-BTB", supplier_name="S", status="APPROVED",
                       source_order_id=btb_order.id, btb_lc_id=lc.id)
    db.add(po)
    await db.flush()
    item = await add_item_simple(db, tenant)
    db.add(PurchaseOrderItem(tenant_id=tenant.id, purchase_order_id=po.id, item_id=item.id, quantity=Decimal("1")))
    await db.commit()
    ready = TODAY + timedelta(days=20)

    async def fake(db_, tenant_, orders, *, today, q, apply_lateness):
        return {o.id: dfs.MaterialReadyDate(o.id, "DATED", ready, ["MATERIAL_EXPECTED_DATE_USED"], "NONE") for o in orders}

    monkeypatch.setattr(dfs, "material_ready_dates", fake)
    body = await _preview(db, tenant, user, material_delay_days=5, btb_delay_days=10)
    p, b = _job(body, f"order:{plain.id}"), _job(body, f"order:{btb_order.id}")
    assert _d(p["earliest_start"]) == ready + timedelta(days=5) and "MATERIAL_LIMITED" in p["reason_codes"]
    assert _d(b["earliest_start"]) == ready + timedelta(days=15)
    assert _d(p["placement"]["start_date"]) >= ready + timedelta(days=5)
    assert _d(b["placement"]["start_date"]) >= ready + timedelta(days=15)


async def test_tentative_overlap_reported_never_blocking(db_session_integration):
    db = db_session_integration
    tenant, user, _role, fx = await sched_tenant(db)
    inq = await add_inquiry(db, tenant, fx.customer)
    booking = await add_booking(db, tenant, fx, start=FIRST, end=FIRST + timedelta(days=4), qty="3456", conf="90", inquiry=inq)
    order = await add_order(db, tenant, fx.customer, fx.style, qty=500, delivery=TODAY + timedelta(days=30))
    await db.commit()
    job = _job(await _preview(db, tenant, user), f"order:{order.id}")
    assert _d(job["placement"]["start_date"]) == FIRST
    assert job["tentative_displaced"] == [booking.id] and "TENTATIVE_DISPLACED" in job["reason_codes"]


async def test_determinism_and_no_writes(db_session_integration):
    db = db_session_integration
    tenant, user, _role, fx = await sched_tenant(db)
    for i in range(5):
        o = await add_order(db, tenant, fx.customer, fx.style, qty=300 + i * 100, delivery=TODAY + timedelta(days=25 + i * 3))
        if i % 2:
            await add_plan(db, tenant, fx.line, start=TODAY + timedelta(days=30 + i), end=TODAY + timedelta(days=33 + i),
                           qty="100", order=o, ob=fx.ob, style=fx.style, rs="SOFT_BOOKED")
    await db.commit()
    statements: list[str] = []
    conn = db.sync_session.get_bind()

    def _record(_conn, _cursor, statement, _parameters, _context, _executemany):
        if not is_rls_housekeeping(statement):
            statements.append(statement)

    event.listen(conn, "before_cursor_execute", _record)
    try:
        first = await _preview(db, tenant, user)
        second = await _preview(db, tenant, user)
    finally:
        event.remove(conn, "before_cursor_execute", _record)
    assert json.dumps(first, sort_keys=True) == json.dumps(second, sort_keys=True)
    assert len(first["proposal_hash"]) == 64
    writes = [s for s in statements if s.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE"))]
    assert statements and writes == []
    assert not db.new and not db.dirty and not db.deleted


async def test_flags_limits_and_permissions(db_session_integration, monkeypatch):
    db = db_session_integration
    tenant, user, _role, fx = await sched_tenant(db, flags=ADV_FLAGS)  # integrated planning off
    await db.commit()
    async with client_for(db, tenant, user) as c:
        assert (await c.get(URL)).status_code == 404
    tenant.feature_flags = {**SCHED_FLAGS, "rbac_enforcement": "enforce"}
    no_read = await add_user_with_role(db, tenant, "viewer", {"production.planning.read": False})
    await add_line(db, tenant, "L2")
    await db.commit()
    async with client_for(db, tenant, no_read) as c:
        assert (await c.get(URL)).status_code == 403
    tenant.feature_flags = dict(SCHED_FLAGS)
    await db.commit()
    monkeypatch.setattr(sch, "MAX_LINES", 1)
    async with client_for(db, tenant, user) as c:
        r = await c.get(URL)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "TOO_MANY_LINES"


async def test_performance_100_jobs_60_lines_180_days(db_session_integration):
    """15.13: 100 jobs x 60 lines x 180 days with material dates, p95 < 8 s (numbers printed for the report)."""
    from app.models import SewingLineStyleConfig

    db = db_session_integration
    tenant, user, _role, fx = await sched_tenant(db, flags={**SCHED_FLAGS, "mfg_order_bom_readiness_v2": True})
    lines = [fx.line] + [await add_line(db, tenant, f"P{i:02d}") for i in range(59)]
    rows = []
    for ln in lines[1:]:
        rows.append(SewingLineStyleConfig(
            tenant_id=tenant.id, line_id=ln.id, ob_id=fx.ob.id, style_id=fx.style.id, operator_count=30,
            target_efficiency_pct=Decimal("60"), start_date=TODAY - timedelta(days=1), planned_end_date=TODAY + timedelta(days=200),
            reservation_status="FIRM_BOOKED", planned_qty=Decimal("0"), completed_qty=Decimal("0")))
    orders = []
    for i in range(110):
        o = await add_order(db, tenant, fx.customer, fx.style, qty=1500 + (i % 7) * 400, delivery=TODAY + timedelta(days=25 + i % 140))
        orders.append(o)
        if i % 3 == 0:
            ln = lines[i % len(lines)]
            rows.append(SewingLineStyleConfig(
                tenant_id=tenant.id, line_id=ln.id, order_id=o.id, ob_id=fx.ob.id, style_id=fx.style.id, operator_count=30,
                target_efficiency_pct=Decimal("60"), start_date=TODAY + timedelta(days=20 + i % 60),
                planned_end_date=TODAY + timedelta(days=24 + i % 60), reservation_status="SOFT_BOOKED",
                planned_qty=Decimal("500"), completed_qty=Decimal("0")))
    db.add_all(rows)
    await db.commit()
    timings = []
    async with client_for(db, tenant, user) as c:
        for _ in range(5):
            started = time.perf_counter()
            r = await c.get(URL, params={"horizon_days": 180})
            timings.append(time.perf_counter() - started)
            assert r.status_code == 200, r.text
    body = r.json()
    assert body["counts"]["jobs_scheduled"] == 100 and body["counts"]["candidate_lines"] == 60
    timings.sort()
    p95 = timings[-1]
    print(f"\nSCHEDULER_PERF jobs={body['counts']['jobs_scheduled']} lines=60 days=180 runs={len(timings)} "
          f"median_s={statistics.median(timings):.3f} p95_s={p95:.3f} items={len(body['items'])}")
    assert p95 < 8.0, timings
