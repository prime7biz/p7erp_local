"""Daily job `mfg.predictive_daily` (plan 15 sections 10, 17.5 (b), 17.17, 17.18, 17.19).

Run: docker compose exec -T backend pytest tests/test_mfg_predictive_worker.py -q
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from celery.schedules import crontab
from sqlalchemy import func, select

from app.common.celery_app import celery_app
from app.models.mfg_predictive import MfgPredictionSnapshot, MfgPredictiveFinding
from app.modules.mfg_intelligence.delivery_forecast_service import MODEL_VERSION
from app.workers import mfg_predictive_worker as worker
from tests.mfg_intel_fixtures import add_order, add_plan
from tests.mfg_predictive_fixtures import TODAY, new_predictive_tenant


def test_schedule_is_daily_1930_utc():
    entry = celery_app.conf.beat_schedule["mfg-predictive-daily"]
    assert entry["task"] == "mfg.predictive_daily"
    assert entry["schedule"] == crontab(minute=30, hour=19)
    assert "mfg.predictive_daily" in celery_app.tasks


async def _count(db, model, tenant_id, *where):
    return (await db.execute(select(func.count()).select_from(model).where(model.tenant_id == tenant_id, *where))).scalar()


async def _tenant_with_orders(db, n: int):
    tenant, user, fx = await new_predictive_tenant(db)
    for i in range(n):
        order = await add_order(db, tenant, fx.customer, fx.style, qty=40000, delivery=TODAY + timedelta(days=2 + i))
        await add_plan(db, tenant, fx.line, start=TODAY, end=TODAY + timedelta(days=1), qty="40000", order=order,
                       ob=fx.ob)
    return tenant, fx


@pytest.mark.asyncio
async def test_job_fail_closed_per_tenant_binds_tenant_and_caps_orders(db_session_integration, monkeypatch):
    db = db_session_integration
    bad, _fx_bad = await _tenant_with_orders(db, 1)
    ok, fx_ok = await _tenant_with_orders(db, 3)
    off, _u, _f = await new_predictive_tenant(db, flags={"manufacturing_intelligence_v1": True})
    db.add_all([
        MfgPredictionSnapshot(tenant_id=ok.id, order_id=(await add_order(db, ok, fx_ok.customer, fx_ok.style)).id,
                              as_of_date=TODAY - timedelta(days=500), model_version=MODEL_VERSION, band="UNKNOWN"),
        MfgPredictiveFinding(tenant_id=ok.id, finding_key="LINE_IDLE:old", kind="LINE_IDLE", severity="medium",
                             priority=1, status="CLEARED", first_detected_on=TODAY - timedelta(days=520),
                             last_detected_on=TODAY - timedelta(days=510), cleared_on=TODAY - timedelta(days=505)),
    ])
    await db.commit()
    ids = (bad.id, ok.id, off.id)
    flags = {bad.id: bad.feature_flags, ok.id: ok.feature_flags, off.id: off.feature_flags}

    async def rows(_db):
        return [(i, flags[i]) for i in ids]

    monkeypatch.setattr(worker, "active_tenant_rows", rows)
    monkeypatch.setattr(worker, "MAX_ORDERS", 2)
    bound: list[int] = []
    real_bind = worker.bind_session_tenant

    async def spy(session, tenant_id):
        bound.append(tenant_id)
        return await real_bind(session, tenant_id)

    monkeypatch.setattr(worker, "bind_session_tenant", spy)
    real_run = worker.run_tenant

    async def flaky(session, tenant_id, *, today=None):
        if tenant_id == ids[0]:
            raise RuntimeError("boom")
        return await real_run(session, tenant_id, today=today)

    monkeypatch.setattr(worker, "run_tenant", flaky)
    out = await worker.run_predictive_all_tenants(db, today=TODAY)
    by_id = {r["tenant_id"]: r for r in out["results"]}
    assert by_id[ids[0]] == {"tenant_id": ids[0], "error": True}
    good = by_id[ids[1]]
    assert good["orders"] == 2 and good["orders_truncated"] is True  # bounded (MAX_ORDERS)
    assert good["purged"] == 2  # one 500-day-old snapshot + one 505-day-old cleared finding
    assert by_id[ids[2]] == {"tenant_id": ids[2], "skipped": True, "alerts_resolved": 0}
    assert ids[1] in bound and ids[2] in bound
    snaps = (await db.execute(select(MfgPredictionSnapshot).where(MfgPredictionSnapshot.tenant_id == ids[1]))).scalars().all()
    assert len(snaps) == 2 and {s.model_version for s in snaps} == {MODEL_VERSION} and {s.as_of_date for s in snaps} == {TODAY}
    assert await _count(db, MfgPredictiveFinding, ids[1], MfgPredictiveFinding.status == "OPEN") >= 1
    assert await _count(db, MfgPredictionSnapshot, ids[0]) == 0  # failed tenant rolled back
    # a second run on the same day updates the same snapshot rows (unique per order / day / model)
    out2 = await worker.run_predictive_all_tenants(db, today=TODAY)
    assert {r["tenant_id"]: r for r in out2["results"]}[ids[1]]["snapshots"] == 2
    assert await _count(db, MfgPredictionSnapshot, ids[1]) == 2
    assert date.today() is not None
