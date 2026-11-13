"""Empirical line efficiency (plan 15 sections 5.1-5.2, D3-D6, 17.1, 17.13).

Run: docker compose exec -T backend pytest tests/test_mfg_empirical_efficiency.py -q
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal as D

import pytest

from app.modules.mfg_intelligence.empirical_efficiency_service import load_efficiency_history
from tests.mfg_intel_fixtures import add_line, client_for
from tests.mfg_predictive_fixtures import (
    PRED,
    TODAY,
    add_hourly,
    freeze_today,
    new_predictive_tenant,
    pieces_for,
    seed_history,
    working_days_before,
)

YESTERDAY = TODAY - timedelta(days=1)
PLANNED = D("0.6000")  # add_plan default target efficiency 60 %


async def _history(db, tenant, **kw):
    return await load_efficiency_history(db, tenant.id, date_to=YESTERDAY, **kw)


@pytest.mark.asyncio
async def test_efficiency_is_earned_over_available_minutes(db_session_integration):
    db = db_session_integration
    tenant, _user, fx = await new_predictive_tenant(db)
    await seed_history(db, tenant, fx, [D("0.5")] * 3)
    hist = await _history(db, tenant)
    samples = hist.lines[fx.line.id].samples
    assert [s.efficiency for s in samples] == [D("0.5000")] * 3
    assert samples[0].available == D("14400.0000")  # 480 net minutes x 30 operators (plan basis)
    assert samples[0].earned == D("7200.0000")  # 576 pieces x 12.5 SMV


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "n, source, weight, confidence",
    [
        (9, "PLANNED", D("0"), "LOW"),
        (10, "BLENDED", D("0.2500"), "MEDIUM"),
        (20, "BLENDED", D("0.5000"), "MEDIUM"),
        (28, "BLENDED", D("0.7000"), "HIGH"),
    ],
)
async def test_minimum_sample_and_continuous_weight(db_session_integration, n, source, weight, confidence):
    db = db_session_integration
    tenant, _user, fx = await new_predictive_tenant(db)
    await seed_history(db, tenant, fx, [D("0.5")] * n)
    hist = await _history(db, tenant)
    est = hist.estimate(fx.line.id, None, PLANNED)
    assert (est.source, est.weight, est.confidence, est.n) == (source, weight, confidence, n)
    if source == "PLANNED":
        assert est.value == PLANNED and "INSUFFICIENT_HISTORY" in est.reason_codes and est.series == []
    else:
        assert est.empirical == D("0.5000")
        assert est.value == (weight * D("0.5") + (1 - weight) * PLANNED).quantize(D("0.0001"))


@pytest.mark.asyncio
async def test_no_plan_and_no_history_is_unknown(db_session_integration):
    db = db_session_integration
    tenant, _user, fx = await new_predictive_tenant(db)
    hist = await _history(db, tenant)
    est = hist.estimate(fx.line.id, None, None)
    assert est.source == "UNKNOWN" and est.value is None


@pytest.mark.asyncio
async def test_family_fallback_to_line_all(db_session_integration):
    db = db_session_integration
    tenant, _user, fx = await new_predictive_tenant(db)
    fx.style.product_type = "  shirt "
    await db.flush()
    await seed_history(db, tenant, fx, [D("0.5")] * 30)
    hist = await _history(db, tenant)
    own = hist.estimate(fx.line.id, "SHIRT", PLANNED)
    assert own.group == "SHIRT" and own.confidence == "HIGH" and own.source == "BLENDED"
    other = hist.estimate(fx.line.id, "PANT", PLANNED)
    assert other.group == "ALL" and "FAMILY_FALLBACK_LINE_ALL" in other.reason_codes
    assert other.confidence == "MEDIUM"  # line-all fallback never HIGH


@pytest.mark.asyncio
async def test_dispersion_caps_weight(db_session_integration):
    db = db_session_integration
    tenant, _user, fx = await new_predictive_tenant(db)
    await seed_history(db, tenant, fx, [D("0.3"), D("0.8")] * 15)
    est = (await _history(db, tenant)).estimate(fx.line.id, None, PLANNED)
    assert est.robust_cv is not None and est.robust_cv > D("0.25")
    assert est.weight == D("0.3000") and "HIGH_DISPERSION_WEIGHT_CAPPED" in est.reason_codes


@pytest.mark.asyncio
async def test_sewing_only_and_excluded_days(db_session_integration):
    db = db_session_integration
    tenant, _user, fx = await new_predictive_tenant(db)
    # day 0: data error (efficiency above 150 %)
    cfg, days = await seed_history(db, tenant, fx, [D("1.6")] + [D("0.5")] * 5)
    # cutting output on a sewing day never counts
    await add_hourly(db, tenant, fx.line, days[2], "99999", cfg=cfg, dept="cutting", slot=2)
    # day 1: an entry without a plan row (integrated planning off) -> SMV unknown, the whole day is excluded
    await add_hourly(db, tenant, fx.line, days[1], "100", style=fx.style, slot=3)
    # a day before any plan row: no planned efficiency anywhere -> capacity unknown
    before = working_days_before(days[0], 1)[0]
    await add_hourly(db, tenant, fx.line, before, "100", cfg=cfg, style=fx.style)
    hist = await _history(db, tenant)
    line = hist.lines[fx.line.id]
    assert [s.efficiency for s in line.samples] == [D("0.5000")] * 4
    assert line.excluded == {"CAPACITY_UNKNOWN": 1, "EFFICIENCY_ABOVE_150_PCT": 1, "SMV_UNKNOWN": 1}
    assert line.excluded_days == 3


@pytest.mark.asyncio
async def test_history_never_mixes_lines(db_session_integration):
    db = db_session_integration
    tenant, _user, fx = await new_predictive_tenant(db)
    line2 = await add_line(db, tenant, "L2")
    await seed_history(db, tenant, fx, [D("0.5")] * 12)
    hist = await _history(db, tenant)
    assert hist.estimate(line2.id, None, PLANNED).source == "PLANNED"
    assert hist.lines[line2.id].samples == []


@pytest.mark.asyncio
async def test_line_efficiency_endpoint(db_session_integration, monkeypatch):
    db = db_session_integration
    freeze_today(monkeypatch)
    tenant, user, fx = await new_predictive_tenant(db)
    await seed_history(db, tenant, fx, [D("0.5")] * 12)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        r = await c.get(f"{PRED}/line-efficiency")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["metric_label"] == "plan-basis efficiency (includes absence and balancing loss)"
        assert body["date_to"] == YESTERDAY.isoformat()
        line = next(x for x in body["lines"] if x["line_id"] == fx.line.id)
        assert line["production_days"] == 12
        assert line["overall"]["empirical_pct"] == "50.00"
        assert line["overall"]["planned_pct"] == "60.00"
        assert line["overall"]["weight"] == "0.3000"
        assert line["overall"]["blended_pct"] == "57.00"
        r = await c.get(f"{PRED}/line-efficiency", params={"date_to": (TODAY + timedelta(days=1)).isoformat()})
        assert r.status_code == 422
