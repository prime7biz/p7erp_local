"""Phase 5 scenarios and parameters (doc 16 D10-D13, 4.1, 4.5, 15.6, 15.16).

Run: docker compose exec -T backend sh -c "pytest tests/test_mfg_forward_plan_scenarios.py -q -p no:warnings"
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

import pytest

from app.models import HourlyProductionEntry
from app.modules.mfg_intelligence import forward_plan_service as fps
from app.modules.mfg_intelligence.decimals import quant
from tests.mfg_forward_fixtures import (
    ADV_FLAGS,
    FP,
    INTEGRATED,
    PRACTICAL,
    PREDICTIVE,
    TODAY,
    add_booking,
    add_inquiry,
    add_order,
    add_plan,
    adv_tenant,
    base_row,
    dec,
    pinned_today,  # noqa: F401 - autouse fixture
)
from tests.mfg_intel_fixtures import client_for

THEORETICAL = Decimal("14400")  # 480 min x 30 operators
WEEK1 = 5


async def _week1(c, **params) -> Decimal:
    r = await c.get(FP, params={"horizon_days": 90, **params})
    assert r.status_code == 200, r.text
    return dec(r.json()["buckets"][0]["capacity_minutes"])


async def test_each_capacity_parameter(db_session_integration):
    db = db_session_integration
    tenant, user, _role, fx = await adv_tenant(db)
    await base_row(db, tenant, fx)
    await db.commit()
    plan = {"efficiency_basis": "PLAN"}
    async with client_for(db, tenant, user) as c:
        assert await _week1(c, **plan) == PRACTICAL * WEEK1
        # overtime 10 %: min(1,440, 30 x (600 - 480) = 3,600) = 1,440 operator-minutes x 60 %
        assert await _week1(c, **plan, overtime_pct="10") == (PRACTICAL + Decimal("864")) * WEEK1
        # overtime 25 %: min(3,600, 3,600) = 3,600 -> capped at 10 h per operator-day
        assert await _week1(c, **plan, overtime_pct="25") == (PRACTICAL + Decimal("2160")) * WEEK1
        assert await _week1(c, **plan, extra_operator_pct="10") == PRACTICAL * Decimal("1.1") * WEEK1
        assert await _week1(c, **plan, extra_operator_pct="-30") == PRACTICAL * Decimal("0.7") * WEEK1
        assert await _week1(c, **plan, absence_pct="5") == PRACTICAL * Decimal("0.95") * WEEK1
        assert await _week1(c, **plan, virtual_lines="2") == PRACTICAL * 3 * WEEK1
        r = await c.get(FP, params={**plan, "overtime_pct": "10"})
        assert dec(r.json()["buckets"][0]["overtime_minutes"]) == Decimal("1440") * WEEK1
        assert "VIRTUAL" in (await c.get(FP, params={**plan, "virtual_lines": 1})).json()["reason_codes"]


@pytest.mark.parametrize(
    "params,code",
    [
        ({"overtime_pct": "26"}, "PARAMETER_OUT_OF_RANGE"),
        ({"overtime_pct": "-1"}, "PARAMETER_OUT_OF_RANGE"),
        ({"absence_pct": "31", "efficiency_basis": "PLAN"}, "PARAMETER_OUT_OF_RANGE"),
        ({"extra_operator_pct": "31"}, "PARAMETER_OUT_OF_RANGE"),
        ({"virtual_lines": 6}, "PARAMETER_OUT_OF_RANGE"),
        ({"efficiency_basis": "P99"}, "EFFICIENCY_BASIS_UNKNOWN"),
        ({"absence_pct": "5"}, "ABSENCE_ALREADY_IN_EMPIRICAL"),  # BASE preset = P50
        ({"absence_pct": "5", "efficiency_basis": "P80"}, "ABSENCE_ALREADY_IN_EMPIRICAL"),
    ],
)
async def test_parameter_bounds_are_422(db_session_integration, params, code):
    db = db_session_integration
    tenant, user, _role, _fx = await adv_tenant(db)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        r = await c.get(FP, params=params)
    assert r.status_code == 422 and r.json()["detail"]["code"] == code, r.text


async def test_absence_defaults_to_zero_in_every_preset(db_session_integration):
    db = db_session_integration
    tenant, user, _role, fx = await adv_tenant(db)
    await base_row(db, tenant, fx)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        for scenario in ("BASE", "OPTIMISTIC", "CONSERVATIVE", "CAPACITY_CONSTRAINED"):
            body = (await c.get(FP, params={"scenario": scenario})).json()
            assert body["parameters"]["absence_pct"] == "0", scenario


async def test_fixed_bands_when_predictive_off(db_session_integration):
    db = db_session_integration
    tenant, user, _role, fx = await adv_tenant(db)
    await base_row(db, tenant, fx)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        r = (await c.get(FP, params={"scenario": "CONSERVATIVE"})).json()
        assert r["efficiency"] == {"basis": "P80", "mode": "FIXED_BANDS", "lines_by_mode": {"FIXED_BANDS": 1},
                                   "predictive": False}
        assert dec(r["buckets"][0]["capacity_minutes"]) == PRACTICAL * Decimal("0.85") * WEEK1
        assert await _week1(c, scenario="OPTIMISTIC") == PRACTICAL * Decimal("1.10") * WEEK1
        assert await _week1(c, scenario="BASE") == PRACTICAL * WEEK1  # P50 fixed band = plan


async def test_p50_p80_use_phase4_estimates_with_enough_history(db_session_integration):
    from app.modules.mfg_intelligence import predictive_stats as st
    from app.modules.mfg_intelligence.delivery_forecast_service import spread_ratios
    from app.modules.mfg_intelligence.empirical_efficiency_service import estimate_from_samples, load_efficiency_history

    db = db_session_integration
    tenant, user, _role, fx = await adv_tenant(db, flags={**ADV_FLAGS, PREDICTIVE: True})
    hist = await add_plan(db, tenant, fx.line, start=TODAY - timedelta(days=80), end=TODAY + timedelta(days=200),
                          qty="999999", ob=fx.ob, style=fx.style)
    day = TODAY - timedelta(days=1)
    added = 0
    while added < 40:  # 40 production days, efficiency 40-55 %
        if day.weekday() < 5:
            good = Decimal(460 + (added * 37) % 170)  # x 12.5 / 14,400
            db.add(HourlyProductionEntry(tenant_id=tenant.id, department_type="sewing", line_id=fx.line.id,
                                         line_style_config_id=hist.id, style_id=fx.style.id, production_date=day,
                                         hour_slot=1, good_qty=good, reject_qty=Decimal("0")))
            added += 1
        day -= timedelta(days=1)
    await db.commit()
    history = await load_efficiency_history(db, tenant.id, date_to=TODAY - timedelta(days=1))
    samples = history.lines[fx.line.id].samples
    assert len(samples) >= 29
    ratios = spread_ratios([s.efficiency for s in samples], 20)
    est = estimate_from_samples(samples, None, Decimal("1"))
    planned = Decimal("0.6")
    expected = {}
    for basis, q in (("P50", st.Q50), ("P80", st.Q80)):
        eff = (est.weight * est.empirical + (1 - est.weight) * planned) * ratios[q]
        expected[basis] = quant(quant(THEORETICAL * eff, 4) * WEEK1, 2)  # payload minutes are 2-dp strings
    async with client_for(db, tenant, user) as c:
        p50 = (await c.get(FP, params={"efficiency_basis": "P50"})).json()
        p80 = await _week1(c, efficiency_basis="P80")
    assert p50["efficiency"]["mode"] == "EMPIRICAL_SPREAD"
    assert dec(p50["buckets"][0]["capacity_minutes"]) == expected["P50"]
    assert p80 == expected["P80"] and p80 <= expected["P50"]


async def test_compare_limits_and_single_load(db_session_integration, monkeypatch):
    db = db_session_integration
    tenant, user, _role, fx = await adv_tenant(db, flags={**ADV_FLAGS, INTEGRATED: True})
    await base_row(db, tenant, fx)
    await db.commit()
    calls = {"n": 0}
    real = fps.compute_capacity

    async def counting(*a, **k):
        calls["n"] += 1
        return await real(*a, **k)

    monkeypatch.setattr(fps, "compute_capacity", counting)
    url = f"{FP}/compare"
    async with client_for(db, tenant, user) as c:
        r = await c.get(url, params={"scenarios": "BASE,OPTIMISTIC,CONSERVATIVE,CAPACITY_CONSTRAINED", "efficiency_basis": "PLAN"})
        assert r.status_code == 200, r.text
        assert [s["scenario"] for s in r.json()["scenarios"]] == ["BASE", "OPTIMISTIC", "CONSERVATIVE", "CAPACITY_CONSTRAINED"]
        assert calls["n"] == 1
        calls["n"] = 0
        assert (await c.get(url, params={"scenarios": "BASE,CONSERVATIVE"})).status_code == 200
        assert calls["n"] == 2  # integrated (PLAN / demand) + plan basis (P-bases): never more
        for bad, code in (("BASE,OPTIMISTIC,CONSERVATIVE,CAPACITY_CONSTRAINED,BASE", "TOO_MANY_SCENARIOS"),
                          ("BASE,FINANCE_CONSTRAINED", "SCENARIO_NOT_COMPARABLE"), ("BASE,BASE", "DUPLICATE_SCENARIO"), ("", "SCENARIOS_REQUIRED")):
            r = await c.get(url, params={"scenarios": bad})
            assert r.status_code == 422 and r.json()["detail"]["code"] == code, (bad, r.text)


async def test_capacity_constrained_admits_confirmed_before_tentative_and_carries_forward(db_session_integration):
    db = db_session_integration
    tenant, user, _role, fx = await adv_tenant(db, flags={**ADV_FLAGS, INTEGRATED: True})
    await base_row(db, tenant, fx)
    week_cap = PRACTICAL * WEEK1  # 43,200 per week on one line
    # booked: 2,000 pcs (25,000 min) in week 2
    await add_plan(db, tenant, fx.line, start=TODAY + timedelta(days=7), end=TODAY + timedelta(days=11), qty="2000",
                   ob=fx.ob, style=fx.style)
    # unplanned confirmed: 3,000 pcs = 37,500 min, need-by in week 2 (lumped into week 1/2 by the RCCP offset)
    await add_order(db, tenant, fx.customer, fx.style, qty=3000, delivery=TODAY + timedelta(days=11))
    # tentative 100 % confidence: 2,000 pcs = 25,000 min in week 2
    inq = await add_inquiry(db, tenant, fx.customer)
    await add_booking(db, tenant, fx, start=TODAY + timedelta(days=7), end=TODAY + timedelta(days=11), qty="2000",
                      conf="100", inquiry=inq)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        r = await c.get(FP, params={"scenario": "CAPACITY_CONSTRAINED", "efficiency_basis": "PLAN", "horizon_days": 90})
    assert r.status_code == 200, r.text
    body = r.json()
    items = {i["kind"]: i for i in body["constrained"]["items"]}
    unplanned, tentative = items["UNPLANNED"], items["TENTATIVE"]
    # week index 1: free 43,200 - 25,000 = 18,200 -> unplanned takes it, 19,300 carried to week 2 (never pre-built)
    assert dec(unplanned["deferred_minutes"]) == 0 and dec(unplanned["admitted_minutes"]) == Decimal("37500")
    assert unplanned["buckets_pushed"] == 1
    # tentative comes after confirmed: week 2 rest 23,900, then 1,100 in week 3
    assert dec(tentative["admitted_minutes"]) == Decimal("25000") and tentative["buckets_pushed"] == 2
    weeks = body["buckets"]
    assert dec(weeks[0]["load_minutes"]) == 0
    assert dec(weeks[1]["load_minutes"]) == week_cap and dec(weeks[2]["load_minutes"]) == week_cap
    assert dec(weeks[1]["layers"]["CONFIRMED_UNPLANNED"]) == Decimal("18200")
    assert dec(weeks[2]["layers"]["CONFIRMED_UNPLANNED"]) == Decimal("19300")
    assert dec(weeks[3]["layers"]["TENTATIVE_WEIGHTED"]) == Decimal("1100")
    for b in weeks:
        assert dec(b["load_minutes"]) <= dec(b["capacity_minutes"])
    month = (await _month(db, tenant, user))
    assert sum((dec(b["load_minutes"]) for b in month["buckets"]), Decimal("0")) == sum(
        (dec(b["load_minutes"]) for b in weeks), Decimal("0"))


async def _month(db, tenant, user):
    async with client_for(db, tenant, user) as c:
        return (await c.get(FP, params={"scenario": "CAPACITY_CONSTRAINED", "efficiency_basis": "PLAN", "bucket": "month",
                                        "horizon_days": 90})).json()


async def test_capacity_constrained_reports_booked_overload_and_deferral(db_session_integration):
    db = db_session_integration
    tenant, user, _role, fx = await adv_tenant(db)
    await base_row(db, tenant, fx)
    # booked 5,000 pcs in week 1 alone (62,500 > 43,200)
    await add_plan(db, tenant, fx.line, start=TODAY, end=TODAY + timedelta(days=4), qty="5000", ob=fx.ob, style=fx.style)
    # unplanned 60,000 pcs (750,000 min) > all free capacity of the horizon (12 weeks x 43,200)
    await add_order(db, tenant, fx.customer, fx.style, qty=60000, delivery=TODAY + timedelta(days=25))
    await db.commit()
    async with client_for(db, tenant, user) as c:
        body = (await c.get(FP, params={"scenario": "CAPACITY_CONSTRAINED", "efficiency_basis": "PLAN"})).json()
    assert 0 in body["constrained"]["booked_overload_weeks"]
    assert "BOOKED_OVERLOAD" in body["buckets"][0]["reason_codes"]
    item = body["constrained"]["items"][0]
    assert dec(item["deferred_minutes"]) > 0 and "DEFERRED_BEYOND_HORIZON" in item["reason_codes"]
    assert dec(body["constrained"]["deferred_beyond_horizon_minutes"]["CONFIRMED_UNPLANNED"]) > 0
