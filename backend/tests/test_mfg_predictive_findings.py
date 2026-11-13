"""Phase 4 findings: builder rules (D17-D19, 17.13) and the writer (upsert / clear / episodes / eligibility, 17.17).

Run: docker compose exec -T backend pytest tests/test_mfg_predictive_findings.py -q
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal as D
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from app.models.ai_agents import AiAgentDecision
from app.models.mfg_predictive import MfgPredictiveFinding
from app.modules.mfg_intelligence import bottleneck_service as bs
from app.modules.mfg_planning import predictive_writer as w
from tests.mfg_intel_fixtures import add_line, add_order, add_plan
from tests.mfg_predictive_fixtures import TODAY, built_finding, new_predictive_tenant


def test_severity_rules():
    assert bs.severity_for(7) == "critical"
    assert bs.severity_for(1, due_in_days=14, probability=D("0.29")) == "critical"
    assert bs.severity_for(1, due_in_days=15, probability=D("0.29")) == "high"  # p < 0.5
    assert bs.severity_for(3) == "high"
    assert bs.severity_for(2, probability=D("0.6")) == "medium"
    assert bs.severity_for(0) == "medium"


def test_priority_has_no_value_weight():
    assert bs.priority_for("critical", 5, 2, "HIGH") == D("40.0000")
    assert bs.priority_for("medium", 0, 0, "LOW") == D("1.0000")  # days / orders floor at 1
    assert bs.priority_for("high", 2, 1, "MEDIUM") == D("4.5000")


def test_rank_and_cap_dedupes_and_bounds():
    items = [built_finding("LINE_IDLE", f"LINE_IDLE:line:{i}", priority=str(i)) for i in range(600)]
    items.append(built_finding("LINE_IDLE", "LINE_IDLE:line:599", priority="1"))
    out = bs.rank_and_cap(items)
    assert len(out) == 500 and out[0]["finding_key"] == "LINE_IDLE:line:599" and out[0]["priority"] == D(599)


def test_eligibility_top_20_and_5_per_department():
    rows = []
    for i in range(30):
        rows.append(SimpleNamespace(id=i, priority=D(100 - i), department=f"D{i % 3}", decision_status=None,
                                    finding_key=f"K{i}"))
    rows[0].decision_status = "ACCEPTED"
    picked = w.choose_eligible(rows, {"K1"})
    assert 0 not in picked and 1 not in picked  # decided / suppressed never eligible
    assert len(picked) == 15  # 3 departments x 5
    rows += [SimpleNamespace(id=100 + i, priority=D(1), department=f"E{i}", decision_status=None, finding_key=f"E{i}")
             for i in range(10)]
    assert len(w.choose_eligible(rows, set())) == 20


def test_delivery_and_capacity_builders():
    forecasts = [
        {"order_id": 1, "order_code": "O-1", "band": "LATE", "target_date": TODAY + timedelta(days=5), "delay_days": 8,
         "on_time_probability": "0.0250", "confidence": "MEDIUM", "reason_codes": [], "remaining_qty": "100.000",
         "working_days_needed": 9},
        {"order_id": 2, "order_code": "O-2", "band": "ON_TRACK", "target_date": TODAY, "delay_days": 0},
    ]
    out = bs.delivery_findings(forecasts, today=TODAY, integrated=False)
    assert [f["finding_key"] for f in out] == ["DELIVERY_RISK:order:1"]
    f = out[0]
    assert f["severity"] == "critical" and f["deadline_date"] == TODAY + timedelta(days=5)
    assert f["payload"]["recommendation"]["screen"]["href"] == "/app/production/line-plan?order=1"
    assert all(set(x) == {"id", "label", "value", "unit"} for x in f["payload"]["facts"])
    assert not any(ch.isdigit() for x in f["payload"]["facts"] for ch in x["label"])  # 17.6 labels without digits

    day = SimpleNamespace
    lines = [
        SimpleNamespace(
            line=SimpleNamespace(id=7, line_code="L7"),
            days=[day(day=TODAY, status="OVERLOADED", utilization_pct=D("130")),
                  day(day=TODAY + timedelta(days=1), status="IDLE", utilization_pct=D("0"))],
        )
    ]
    found = bs.capacity_findings(lines, SimpleNamespace(rows=[]), today=TODAY)
    assert {f["finding_key"] for f in found} == {"CAPACITY_OVERLOAD:line:7", "LINE_IDLE:line:7"}
    assert all(f["deadline_date"] in (TODAY, TODAY + timedelta(days=1)) for f in found)


@pytest.mark.asyncio
async def test_build_findings_end_to_end(db_session_integration):
    db = db_session_integration
    tenant, _u, fx = await new_predictive_tenant(db)
    idle_line = await add_line(db, tenant, "IDLE1")
    # an old finished booking gives the idle line its planned efficiency (no row at all = UNKNOWN capacity, never idle)
    await add_plan(db, tenant, idle_line, start=TODAY - timedelta(days=20), end=TODAY - timedelta(days=10), qty="10",
                   ob=fx.ob, rs="COMPLETED")
    order = await add_order(db, tenant, fx.customer, fx.style, qty=50000, delivery=TODAY + timedelta(days=3))
    await add_plan(db, tenant, fx.line, start=TODAY, end=TODAY + timedelta(days=1), qty="50000", order=order, ob=fx.ob)
    from app.modules.mfg_intelligence.delivery_forecast_service import forecast_deliveries

    forecasts = await forecast_deliveries(db, tenant, [order], today=TODAY)
    found = await bs.build_findings(db, tenant, today=TODAY, forecasts=forecasts)
    keys = {f["finding_key"] for f in found}
    assert f"DELIVERY_RISK:order:{order.id}" in keys
    assert f"CAPACITY_OVERLOAD:line:{fx.line.id}" in keys
    assert f"LINE_IDLE:line:{idle_line.id}" in keys
    assert found == sorted(found, key=lambda x: (-x["priority"], x["finding_key"]))


@pytest.mark.asyncio
async def test_writer_upsert_clear_and_new_episode(db_session_integration):
    db = db_session_integration
    tenant, user, fx = await new_predictive_tenant(db)
    tid = tenant.id
    a = built_finding("LINE_IDLE", f"LINE_IDLE:line:{fx.line.id}", line_id=fx.line.id, deadline=TODAY)
    b = built_finding("CAPACITY_OVERLOAD", f"CAPACITY_OVERLOAD:line:{fx.line.id}", line_id=fx.line.id,
                      deadline=TODAY + timedelta(days=2), priority="9")
    first = await w.sync_findings(db, tid, [a, b], today=TODAY)
    assert (first["created"], first["eligible"]) == (2, 2)
    rows = {r.finding_key: r for r in (await db.execute(select(MfgPredictiveFinding).where(
        MfgPredictiveFinding.tenant_id == tid))).scalars()}
    idle_id = rows[a["finding_key"]].id
    # next day: overload deadline moves in the build but the first deadline is kept (17.15)
    b2 = {**b, "deadline_date": TODAY + timedelta(days=5)}
    second = await w.sync_findings(db, tid, [b2], today=TODAY + timedelta(days=1))
    assert (second["updated"], second["cleared"]) == (1, 1)
    await db.refresh(rows[b["finding_key"]])
    assert rows[b["finding_key"]].deadline_date == TODAY + timedelta(days=2)
    cleared = await db.get(MfgPredictiveFinding, idle_id)
    assert cleared.status == "CLEARED" and cleared.cleared_on == TODAY + timedelta(days=1)
    assert cleared.alert_eligible is False
    # the idle condition comes back: a NEW finding row (new alert episode, 17.4)
    third = await w.sync_findings(db, tid, [a, b2], today=TODAY + timedelta(days=2))
    assert third["created"] == 1
    new_row = (await db.execute(select(MfgPredictiveFinding).where(
        MfgPredictiveFinding.tenant_id == tid, MfgPredictiveFinding.finding_key == a["finding_key"],
        MfgPredictiveFinding.status == "OPEN"))).scalar_one()
    assert new_row.id != idle_id
    assert w.natural_key_for(new_row) == f"mfg_line_idle:{new_row.id}"


@pytest.mark.asyncio
async def test_recently_decided_key_is_suppressed(db_session_integration):
    db = db_session_integration
    tenant, user, fx = await new_predictive_tenant(db)
    tid = tenant.id
    a = built_finding("LINE_IDLE", f"LINE_IDLE:line:{fx.line.id}", line_id=fx.line.id, deadline=TODAY)
    await w.sync_findings(db, tid, [a], today=TODAY)
    row = (await db.execute(select(MfgPredictiveFinding).where(MfgPredictiveFinding.tenant_id == tid))).scalar_one()
    db.add(AiAgentDecision(tenant_id=tid, agent="mfg_bottleneck", exception_key=w.natural_key_for(row),
                           decision="REJECTED", decided_by=user.id, finding_id=row.id))
    await db.flush()
    await w.sync_findings(db, tid, [], today=TODAY + timedelta(days=1))  # cleared
    again = await w.sync_findings(db, tid, [a], today=TODAY + timedelta(days=2))
    assert again["created"] == 1 and again["eligible"] == 0  # same key decided within 7 days: no alert


@pytest.mark.asyncio
async def test_open_findings_bounded_to_500(db_session_integration):
    db = db_session_integration
    tenant, _u, _fx = await new_predictive_tenant(db)
    many = [built_finding("LINE_IDLE", f"LINE_IDLE:line:x{i}", priority=str(1000 - i)) for i in range(520)]
    out = await w.sync_findings(db, tenant.id, many, today=TODAY)
    assert out["open"] == 500 and await w.open_finding_count(db, tenant.id) == 500
    assert date.fromisoformat(TODAY.isoformat()) == TODAY
