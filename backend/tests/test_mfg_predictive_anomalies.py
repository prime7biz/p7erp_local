"""Production anomalies (plan 15 sections 5.8, D16): modified z >= 3.5, baseline 30 production days, min 10.

Run: docker compose exec -T backend pytest tests/test_mfg_predictive_anomalies.py -q
"""

from __future__ import annotations

from decimal import Decimal as D

import pytest

from tests.mfg_intel_fixtures import add_plan, client_for
from tests.mfg_predictive_fixtures import (
    PRED,
    TODAY,
    add_hourly,
    freeze_today,
    new_predictive_tenant,
    pieces_for,
    working_days_before,
)

BASE = [D(x) for x in ("0.45", "0.55", "0.60", "0.50", "0.65", "0.58", "0.52", "0.62", "0.48", "0.57")] * 3


async def _seed(db, tenant, fx, efficiencies, rejects=None):
    days = working_days_before(TODAY, len(efficiencies))
    cfg = await add_plan(db, tenant, fx.line, start=days[0], end=days[-1], qty="100000", style=fx.style, ob=fx.ob,
                         rs="COMPLETED")
    for i, (day, e) in enumerate(zip(days, efficiencies)):
        await add_hourly(db, tenant, fx.line, day, pieces_for(e), cfg=cfg, style=fx.style,
                         reject=(rejects[i] if rejects else "0"))
    return days


async def _get(c, days, first: int, last: int):
    r = await c.get(f"{PRED}/anomalies", params={"date_from": days[first].isoformat(), "date_to": days[last].isoformat()})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.mark.asyncio
async def test_efficiency_drop_is_flagged_low(db_session_integration, monkeypatch):
    db = db_session_integration
    freeze_today(monkeypatch)
    tenant, user, fx = await new_predictive_tenant(db)
    days = await _seed(db, tenant, fx, BASE + [D("0.55"), D("0.10"), D("0.57")])
    await db.commit()
    async with client_for(db, tenant, user) as c:
        body = await _get(c, days, 30, 32)
    flagged = {(a["metric"], a["date"]) for a in body["anomalies"]}
    assert ("EFFICIENCY", days[31].isoformat()) in flagged
    assert ("HOURLY_OUTPUT", days[31].isoformat()) in flagged
    assert all(a["date"] == days[31].isoformat() for a in body["anomalies"])
    eff = next(a for a in body["anomalies"] if a["metric"] == "EFFICIENCY")
    assert eff["direction"] == "LOW" and D(eff["robust_z"]) <= D("-3.5") and eff["baseline_n"] == 30
    assert eff["value"] == "10.00"
    assert body["threshold"] == "3.5"


@pytest.mark.asyncio
async def test_rejection_spike_needs_five_pieces(db_session_integration, monkeypatch):
    db = db_session_integration
    freeze_today(monkeypatch)
    tenant, user, fx = await new_predictive_tenant(db)
    # baseline 1-2 rejected pieces a day; day 30 = 60 rejected (spike), day 31 = 4 rejected (high rate, low volume)
    rejects = ["1", "2"] * 15 + ["60", "4"]
    effs = BASE + [D("0.55"), D("0.30")]
    days = await _seed(db, tenant, fx, effs, rejects)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        body = await _get(c, days, 30, 31)
    spikes = [a for a in body["anomalies"] if a["metric"] == "REJECTION_RATE"]
    assert [(a["date"], a["direction"]) for a in spikes] == [(days[30].isoformat(), "HIGH")]
    assert body["series_skipped"]["LOW_VOLUME"] == 1


@pytest.mark.asyncio
async def test_short_baseline_and_flat_series_are_skipped(db_session_integration, monkeypatch):
    db = db_session_integration
    freeze_today(monkeypatch)
    tenant, user, fx = await new_predictive_tenant(db)
    days = await _seed(db, tenant, fx, [D("0.5")] * 14)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        flat = await _get(c, days, 12, 13)  # 12 / 13 earlier points, all equal: MAD = MeanAD = 0
        short = await _get(c, days, 0, 3)  # fewer than 10 earlier points
    assert flat["anomalies"] == [] and flat["series_skipped"]["NO_DISPERSION"] >= 2
    assert short["anomalies"] == [] and short["series_skipped"]["INSUFFICIENT_BASELINE"] >= 4


@pytest.mark.asyncio
async def test_window_limit(db_session_integration, monkeypatch):
    db = db_session_integration
    freeze_today(monkeypatch)
    tenant, user, _fx = await new_predictive_tenant(db)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        r = await c.get(f"{PRED}/anomalies", params={"date_from": "2030-01-01", "date_to": "2030-02-01"})
        assert r.status_code == 422
        r = await c.get(f"{PRED}/anomalies", params={"date_from": "2030-02-01", "date_to": "2030-01-31"})
        assert r.status_code == 422
