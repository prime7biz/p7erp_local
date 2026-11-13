"""Calibration read (plan 15 sections 5.7, D14, 17.2): POSTED challans, censoring, lead buckets, N < 30.

Snapshots are inserted directly here (the daily writer is build run B2).
Run: docker compose exec -T backend pytest tests/test_mfg_predictive_calibration.py -q
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal as D

import pytest

from app.models.inventory import DeliveryChallan, DeliveryChallanOrder
from app.models.mfg_predictive import MfgPredictionSnapshot
from app.modules.mfg_intelligence import predictive_stats as st
from app.modules.mfg_intelligence.delivery_forecast_service import MODEL_VERSION
from app.modules.mfg_intelligence.predictive_read_service import load_order_outcomes
from tests.mfg_intel_fixtures import add_order, client_for
from tests.mfg_predictive_fixtures import PRED, TODAY, freeze_today, new_predictive_tenant


async def _challan(db, tenant, order, day: date | None, status="POSTED"):
    dc = DeliveryChallan(tenant_id=tenant.id, challan_code=f"DC-{uuid.uuid4().hex[:8]}", customer_name="Buyer",
                         delivery_date=day, status=status)
    db.add(dc)
    await db.flush()
    db.add(DeliveryChallanOrder(tenant_id=tenant.id, delivery_challan_id=dc.id, order_id=order.id))
    await db.flush()


async def _snap(db, tenant, order, *, lead: int, p: str | None = "0.8000", p80: date | None = None, p90: date | None = None):
    target = order.delivery_date
    row = MfgPredictionSnapshot(
        tenant_id=tenant.id, order_id=order.id, as_of_date=target - timedelta(days=lead), target_date=target,
        model_version=MODEL_VERSION, band="AT_RISK", p50_date=target, p80_date=p80, p90_date=p90,
        on_time_probability=D(p) if p is not None else None, confidence="MEDIUM", reason_codes=[],
    )
    db.add(row)
    await db.flush()
    return row


@pytest.mark.asyncio
async def test_outcome_rules_posted_challans_and_censoring(db_session_integration):
    db = db_session_integration
    tenant, _u, fx = await new_predictive_tenant(db)
    target = TODAY - timedelta(days=5)

    async def order(status="CONFIRMED", delivery=target, pipeline=None):
        o = await add_order(db, tenant, fx.customer, fx.style, status=status, delivery=delivery)
        if pipeline:
            o.pipeline_status = pipeline
        return o

    late_no_challan = await order()
    late_draft_only = await order()
    await _challan(db, tenant, late_draft_only, target - timedelta(days=1), status="DRAFT")
    shipped_not_final = await order()
    await _challan(db, tenant, shipped_not_final, target - timedelta(days=2))
    shipped_final = await order(status="COMPLETED")
    await _challan(db, tenant, shipped_final, target - timedelta(days=2))
    final_late = await order(pipeline="PAYMENT_RECEIVED")
    await _challan(db, tenant, final_late, target - timedelta(days=3))
    await _challan(db, tenant, final_late, target + timedelta(days=2))  # latest POSTED date counts
    old_challan = await order()
    await _challan(db, tenant, old_challan, TODAY - timedelta(days=40))  # final 30 days after the last challan
    future = await order(delivery=TODAY + timedelta(days=5))
    cancelled = await order(status="CANCELLED")
    ids = [o.id for o in (late_no_challan, late_draft_only, shipped_not_final, shipped_final, final_late, old_challan,
                          future, cancelled)]
    out = await load_order_outcomes(db, tenant.id, ids, today=TODAY)
    assert out[late_no_challan.id].resolve_by(target, TODAY) is False  # censored: late is known
    assert out[late_draft_only.id].resolve_by(target, TODAY) is False  # only POSTED challans count
    assert out[shipped_not_final.id].resolve_by(target, TODAY) is None  # more shipments may follow
    assert out[shipped_final.id].resolve_by(target, TODAY) is True
    assert out[final_late.id].actual_date == target + timedelta(days=2)
    assert out[final_late.id].resolve_by(target, TODAY) is False
    assert out[old_challan.id].final is True
    assert out[future.id].resolve_by(future.delivery_date, TODAY) is None
    assert out[cancelled.id].cancelled is True and out[cancelled.id].resolve_by(target, TODAY) is None


@pytest.mark.asyncio
async def test_lead_buckets_pick_one_snapshot_per_order(db_session_integration, monkeypatch):
    db = db_session_integration
    freeze_today(monkeypatch)
    tenant, user, fx = await new_predictive_tenant(db)
    o = await add_order(db, tenant, fx.customer, fx.style, delivery=TODAY - timedelta(days=1))
    for lead in (28, 27, 20, 14, 8, 7, 2):
        await _snap(db, tenant, o, lead=lead)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        r = await c.get(f"{PRED}/calibration")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["n_snapshots_considered"] == 3  # 28, 14 and 7 (20 and 2 are outside +/- 3)
    assert body["n"] == 3  # censored late outcomes
    assert body["status"] == "INSUFFICIENT_OUTCOMES" and body["calibrated"] is False
    assert body["brier"] is None and body["bins"] == []
    assert [b["n"] for b in body["lead_buckets"]] == [1, 1, 1]


@pytest.mark.asyncio
async def test_brier_bins_and_coverage_with_30_outcomes(db_session_integration, monkeypatch):
    db = db_session_integration
    freeze_today(monkeypatch)
    tenant, user, fx = await new_predictive_tenant(db)
    target = TODAY - timedelta(days=10)
    pairs = []
    for i in range(30):
        o = await add_order(db, tenant, fx.customer, fx.style, status="COMPLETED", delivery=target)
        on_time = i % 3 != 0
        await _challan(db, tenant, o, target - timedelta(days=1) if on_time else target + timedelta(days=4))
        p = "0.9000" if on_time else "0.3000"
        await _snap(db, tenant, o, lead=14, p=p, p80=target + timedelta(days=2), p90=target + timedelta(days=6))
        pairs.append((D(p), on_time))
    fallback = await add_order(db, tenant, fx.customer, fx.style, status="COMPLETED", delivery=target)
    await _challan(db, tenant, fallback, target)
    await _snap(db, tenant, fallback, lead=7, p=None)  # fixed-band forecast: no probability
    await db.commit()
    async with client_for(db, tenant, user) as c:
        body = (await c.get(f"{PRED}/calibration")).json()
    assert body["status"] == "OK" and body["calibrated"] is True and body["n"] == 30
    assert body["brier"] == format(st.brier(pairs).quantize(D("0.0001")), "f")
    assert body["n_excluded"] == 1
    assert sum(b["n"] for b in body["bins"]) == 30
    assert body["coverage"]["p80"] == {"n": 30, "share": "0.6667"}  # late orders shipped after P80
    assert body["coverage"]["p90"] == {"n": 30, "share": "1.0000"}


@pytest.mark.asyncio
async def test_coverage_censoring_and_other_tenant_snapshots_ignored(db_session_integration, monkeypatch):
    db = db_session_integration
    freeze_today(monkeypatch)
    tenant, user, fx = await new_predictive_tenant(db)
    o = await add_order(db, tenant, fx.customer, fx.style, delivery=TODAY + timedelta(days=10))
    await _snap(db, tenant, o, lead=14, p80=TODAY - timedelta(days=1), p90=TODAY + timedelta(days=12))
    other, _u2, fx2 = await new_predictive_tenant(db)
    o2 = await add_order(db, other, fx2.customer, fx2.style, delivery=TODAY - timedelta(days=3))
    await _snap(db, other, o2, lead=7)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        body = (await c.get(f"{PRED}/calibration")).json()
    assert body["n_snapshots_considered"] == 1  # the other company's snapshot is never read
    assert body["n_pending"] == 1
    assert body["coverage"]["p80"]["n"] == 1  # P80 date passed without shipment: resolved (miss)
    assert body["coverage"]["p90"]["n"] == 0
