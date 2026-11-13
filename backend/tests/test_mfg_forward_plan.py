"""Phase 5 forward plan: buckets, capacity reconciliation, UNKNOWN / CLOSED days, limits, timeouts, query count, speed.

Run: docker compose exec -T backend sh -c "pytest tests/test_mfg_forward_plan.py -q -p no:warnings"
"""

from __future__ import annotations

import statistics
import time
from datetime import timedelta
from decimal import Decimal

import pytest
from sqlalchemy import event

from app.modules.mfg_intelligence import forward_plan_service as fps
from app.modules.mfg_intelligence.capacity_service import compute_capacity
from tests.mfg_alloc_fixtures import add_user_with_role
from tests.mfg_forward_fixtures import (
    ADV_FLAGS,
    FP,
    PRACTICAL,
    TODAY,
    add_order,
    add_plan,
    adv_tenant,
    base_row,
    dec,
    layer_total,
    pinned_today,  # noqa: F401 - autouse fixture
)
from tests.mfg_intel_fixtures import add_holiday, add_line, client_for
from tests.query_counting import is_rls_housekeeping

PLAN = {"efficiency_basis": "PLAN"}


async def test_base_plan_capacity_equals_sum_of_practical_minutes(db_session_integration):
    db = db_session_integration
    tenant, user, _role, fx = await adv_tenant(db)
    await base_row(db, tenant, fx)
    await add_holiday(db, tenant, TODAY + timedelta(days=2))
    await db.commit()
    cap = await compute_capacity(db, tenant.id, window_start=TODAY, window_end=TODAY + timedelta(days=89))
    expected = sum((d.practical_minutes for lc in cap.lines for d in lc.days if d.practical_minutes is not None), Decimal("0"))
    async with client_for(db, tenant, user) as c:
        r = await c.get(FP, params={"horizon_days": 90, **PLAN})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["date_from"] == TODAY.isoformat() and body["date_to"] == (TODAY + timedelta(days=89)).isoformat()
    assert dec(body["totals"]["capacity_minutes"]) == expected
    assert sum((dec(b["capacity_minutes"]) for b in body["buckets"]), Decimal("0")) == expected
    first = body["buckets"][0]
    # week 1: Mon..Sun, Wednesday holiday -> 4 working days of 8,640
    assert first["working_days"] == 4 and dec(first["capacity_minutes"]) == PRACTICAL * 4
    assert first["capacity_status"] == "COMPLETE" and first["unknown_line_days"] == 0
    assert body["efficiency"]["mode"] == "PLAN" and body["scenario"] == "BASE"


@pytest.mark.parametrize("horizon", [90, 120, 150, 180])
async def test_week_and_month_buckets_reconcile(db_session_integration, horizon):
    db = db_session_integration
    tenant, user, _role, fx = await adv_tenant(db)
    await base_row(db, tenant, fx)
    order = await add_order(db, tenant, fx.customer, fx.style, qty=3000, delivery=TODAY + timedelta(days=60))
    await add_plan(db, tenant, fx.line, start=TODAY + timedelta(days=7), end=TODAY + timedelta(days=20), qty="1000",
                   order=order, ob=fx.ob, style=fx.style)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        week = (await c.get(FP, params={"horizon_days": horizon, "bucket": "week", **PLAN})).json()
        month = (await c.get(FP, params={"horizon_days": horizon, "bucket": "month", **PLAN})).json()
    assert len(week["buckets"]) == (horizon - 1) // 7 + 1
    for key in ("capacity_minutes", "load_minutes"):
        w = sum((dec(b[key]) for b in week["buckets"]), Decimal("0"))
        m = sum((dec(b[key]) for b in month["buckets"]), Decimal("0"))
        assert w == m == dec(week["totals"][key]), key
    for layer in week["totals"]["layers"]:
        assert layer_total(week, layer) == layer_total(month, layer), layer
    assert month["buckets"][0]["start"] == TODAY.isoformat()
    assert month["buckets"][-1]["partial_month"] is True or month["buckets"][-1]["end"].endswith(("-30", "-31", "-28", "-29"))
    assert any("PARTIAL_MONTH" in b["reason_codes"] for b in month["buckets"])


async def test_horizon_bucket_and_scenario_validation(db_session_integration):
    db = db_session_integration
    tenant, user, _role, fx = await adv_tenant(db)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        r = await c.get(FP, params={"horizon_days": 100})
        assert r.status_code == 422 and r.json()["detail"]["code"] == "HORIZON_NOT_ALLOWED"
        assert (await c.get(FP, params={"bucket": "day"})).status_code == 422
        r = await c.get(FP, params={"scenario": "WILD"})
        assert r.status_code == 422 and r.json()["detail"]["code"] == "SCENARIO_UNKNOWN"
        r = await c.get(FP, params={"scenario": "FINANCE_CONSTRAINED"})
        assert r.status_code == 422 and r.json()["detail"]["code"] == "USE_FINANCE_ROUTE"


async def test_closed_days_zero_and_unknown_days_reported_not_counted(db_session_integration):
    db = db_session_integration
    tenant, user, _role, fx = await adv_tenant(db)
    await base_row(db, tenant, fx)
    await add_line(db, tenant, "L2")  # no plan row, no history: efficiency unknown -> UNKNOWN every working day
    await db.commit()
    async with client_for(db, tenant, user) as c:
        body = (await c.get(FP, params={"horizon_days": 90, **PLAN})).json()
    first = body["buckets"][0]
    assert first["capacity_status"] == "PARTIAL" and first["unknown_line_days"] == 5
    assert first["unknown_reasons"] == {"efficiency": 5}
    assert dec(first["capacity_minutes"]) == PRACTICAL * 5  # L2 never filled
    assert first["utilization_pct"] is None
    assert "CAPACITY_PARTIAL" in body["reason_codes"]


async def test_too_many_lines_is_422(db_session_integration, monkeypatch):
    db = db_session_integration
    tenant, user, _role, fx = await adv_tenant(db)
    await add_line(db, tenant, "L2", unit="B")
    await db.commit()
    monkeypatch.setattr(fps, "MAX_LINES", 1)
    async with client_for(db, tenant, user) as c:
        r = await c.get(FP)
        assert r.status_code == 422 and r.json()["detail"]["code"] == "TOO_MANY_LINES"
        assert (await c.get(FP, params={"factory_unit": "B"})).status_code == 200


async def test_forced_timeout_returns_503_and_session_stays_usable(db_session_integration, monkeypatch):
    from sqlalchemy import text

    from app.modules.mfg_intelligence import advanced_planning_router as apr

    db = db_session_integration
    tenant, user, _role, _fx = await adv_tenant(db)
    await db.commit()

    async def slow(db_, *_a, **_k):
        await db_.execute(text("SELECT pg_sleep(0.5)"))

    monkeypatch.setattr(apr, "STATEMENT_TIMEOUT_MS", "50")
    monkeypatch.setattr(apr, "load_inputs", slow)
    async with client_for(db, tenant, user) as c:
        r = await c.get(FP, params=PLAN)
    assert r.status_code == 503 and r.json()["detail"]["code"] == "FORWARD_PLAN_TIMEOUT"
    assert (await db.execute(text("SELECT 1"))).scalar() == 1


async def test_tenant_mismatch_and_permission_denied(db_session_integration):
    db = db_session_integration
    tenant, user, _role, _fx = await adv_tenant(db)
    other, _u, _r, _f = await adv_tenant(db)
    no_read = await add_user_with_role(db, tenant, "viewer", {"production.planning.read": False})
    tenant.feature_flags = {**ADV_FLAGS, "rbac_enforcement": "enforce"}
    await db.commit()
    async with client_for(db, other, user) as c:
        assert (await c.get(FP)).status_code == 403
    async with client_for(db, tenant, no_read) as c:
        for url in (FP, f"{FP}/compare?scenarios=BASE", f"{FP}/forecast-demand", f"{FP}/finance-constrained"):
            assert (await c.get(url)).status_code == 403, url


async def _count_queries(db, tenant, user) -> int:
    statements: list[str] = []
    conn = db.sync_session.get_bind()

    def _record(_conn, _cursor, statement, _parameters, _context, _executemany):
        if not is_rls_housekeeping(statement):
            statements.append(statement)

    event.listen(conn, "before_cursor_execute", _record)
    try:
        async with client_for(db, tenant, user) as c:
            r = await c.get(FP, params={"horizon_days": 90})
            assert r.status_code == 200, r.text
    finally:
        event.remove(conn, "before_cursor_execute", _record)
    return len(statements)


@pytest.mark.parametrize("flags_extra", [{}, {"mfg_integrated_planning_v1": True, "mfg_predictive_intelligence_v1": True}])
async def test_query_count_is_independent_of_order_count(db_session_integration, flags_extra):
    db = db_session_integration
    counts = []
    for n in (5, 40):
        tenant, user, _role, fx = await adv_tenant(db, flags={**ADV_FLAGS, **flags_extra})
        await base_row(db, tenant, fx)
        for i in range(n):
            order = await add_order(db, tenant, fx.customer, fx.style, qty=500, delivery=TODAY + timedelta(days=30 + i))
            await add_plan(db, tenant, fx.line, start=TODAY + timedelta(days=i % 20), end=TODAY + timedelta(days=i % 20 + 5),
                           qty="200", order=order, ob=fx.ob, style=fx.style, rs="SOFT_BOOKED")
        await db.commit()
        counts.append(await _count_queries(db, tenant, user))
    assert counts[0] == counts[1], counts


async def test_performance_180_days_120_lines(db_session_integration):
    """15.13: 180 days x 120 lines, p95 < 8 s on local Docker (numbers printed for the build report)."""
    from app.models import SewingLineStyleConfig

    db = db_session_integration
    tenant, user, _role, fx = await adv_tenant(db, flags={**ADV_FLAGS, "mfg_integrated_planning_v1": True})
    lines = [fx.line] + [await add_line(db, tenant, f"P{i:03d}") for i in range(119)]
    orders = [await add_order(db, tenant, fx.customer, fx.style, qty=2000, delivery=TODAY + timedelta(days=20 + i))
              for i in range(150)]
    rows = []
    for i, ln in enumerate(lines):
        rows.append(SewingLineStyleConfig(
            tenant_id=tenant.id, line_id=ln.id, ob_id=fx.ob.id, style_id=fx.style.id, operator_count=30,
            target_efficiency_pct=Decimal("60"), start_date=TODAY - timedelta(days=3), planned_end_date=TODAY + timedelta(days=200),
            reservation_status="FIRM_BOOKED", planned_qty=Decimal("0"), completed_qty=Decimal("0")))
        for k in range(3):
            o = orders[(i * 3 + k) % len(orders)]
            rows.append(SewingLineStyleConfig(
                tenant_id=tenant.id, line_id=ln.id, order_id=o.id, ob_id=fx.ob.id, style_id=fx.style.id, operator_count=30,
                target_efficiency_pct=Decimal("60"), start_date=TODAY + timedelta(days=k * 40), planned_end_date=TODAY + timedelta(days=k * 40 + 30),
                reservation_status="SOFT_BOOKED" if k else "FIRM_BOOKED", planned_qty=Decimal("600"), completed_qty=Decimal("0")))
    db.add_all(rows)
    await db.commit()
    timings = []
    async with client_for(db, tenant, user) as c:
        for scenario in ("BASE", "CAPACITY_CONSTRAINED", "CONSERVATIVE", "BASE", "OPTIMISTIC", "BASE"):
            started = time.perf_counter()
            r = await c.get(FP, params={"horizon_days": 180, "scenario": scenario})
            timings.append(time.perf_counter() - started)
            assert r.status_code == 200, r.text
            assert r.json()["lines"] == 120
    timings.sort()
    p95 = timings[min(len(timings) - 1, int(round(0.95 * len(timings))) - 1)]
    print(f"\nFORWARD_PLAN_PERF lines=120 days=180 runs={len(timings)} median_s={statistics.median(timings):.3f} "
          f"p95_s={p95:.3f} max_s={max(timings):.3f}")
    assert p95 < 8.0, timings
