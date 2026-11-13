"""Daily planning lifecycle job `mfg.planning_lifecycle_daily` (Manufacturing Intelligence Phase 2, run R4).

Calls the async body directly (no Celery broker). Covers: due tentative bookings expire, ordered ones convert,
allocation lifecycle runs only with mfg_material_allocation_v1, flags-off tenants are skipped, one failing tenant is
rolled back and the job continues.

Run: docker compose exec -T backend sh -c "pytest tests/test_mfg_planning_worker.py -q -p no:warnings"
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from decimal import Decimal

import pytest

from app.common.celery_app import celery_app
from app.models import Inquiry, Quotation
from app.models.mfg_planning import MfgTentativeLineBooking
from app.workers import mfg_planning_worker as worker
from tests.mfg_intel_fixtures import FLAGS_ON, MONDAY, add_order, new_tenant, seed_basic_factory

pytestmark = pytest.mark.asyncio

INTEGRATED = {**FLAGS_ON, "mfg_integrated_planning_v1": True}


async def _tenant_with_bookings(db, flags):
    tenant, user, _ = await new_tenant(db, flags=flags)
    fx = await seed_basic_factory(db, tenant)
    due_inq = Inquiry(tenant_id=tenant.id, customer_id=fx.customer.id, inquiry_code=f"INQ-{uuid.uuid4().hex[:6]}", status="OPEN")
    ordered_inq = Inquiry(tenant_id=tenant.id, customer_id=fx.customer.id, inquiry_code=f"INQ-{uuid.uuid4().hex[:6]}", status="OPEN")
    db.add_all([due_inq, ordered_inq])
    await db.flush()
    now = datetime.utcnow()

    def booking(inq, expires):
        return MfgTentativeLineBooking(
            tenant_id=tenant.id, line_id=fx.line.id, inquiry_id=inq.id, style_id=fx.style.id, start_date=MONDAY,
            planned_qty=Decimal("100"), confidence_pct=Decimal("50"), expires_at=expires, status="ACTIVE",
        )

    due = booking(due_inq, now - timedelta(hours=1))
    ordered = booking(ordered_inq, now + timedelta(days=10))
    db.add_all([due, ordered])
    quotation = Quotation(
        tenant_id=tenant.id, customer_id=fx.customer.id, inquiry_id=ordered_inq.id,
        quotation_code=f"Q-{uuid.uuid4().hex[:8]}", style_id=fx.style.id, status="NEW",
    )
    db.add(quotation)
    await db.flush()
    order = await add_order(db, tenant, fx.customer, fx.style, status="CONFIRMED")
    order.quotation_id = quotation.id
    await db.commit()
    return tenant, due, ordered, order


async def _run(db, monkeypatch, tenants):
    async def rows(_db):
        return [(t.id, dict(t.feature_flags or {})) for t in tenants]

    monkeypatch.setattr(worker, "active_tenant_rows", rows)
    return await worker.run_lifecycle_all_tenants(db)


async def test_task_is_registered_and_scheduled_daily():
    assert "mfg.planning_lifecycle_daily" in celery_app.tasks
    entry = celery_app.conf.beat_schedule["mfg-planning-lifecycle-daily"]
    assert entry["task"] == "mfg.planning_lifecycle_daily" and entry["schedule"] == 60 * 60 * 24


async def test_expires_and_converts_and_skips_flags_off_tenants(db_session_integration, monkeypatch):
    db = db_session_integration
    on_tenant, due, ordered, order = await _tenant_with_bookings(db, INTEGRATED)
    off_tenant, off_due, off_ordered, _o = await _tenant_with_bookings(db, dict(FLAGS_ON))
    mi_off, mi_due, _x, _y = await _tenant_with_bookings(db, {"mfg_integrated_planning_v1": True})

    out = await _run(db, monkeypatch, [on_tenant, off_tenant, mi_off])
    by_tenant = {r["tenant_id"]: r for r in out["results"]}
    assert by_tenant[on_tenant.id]["tentative_expired"] == 1
    assert by_tenant[on_tenant.id]["tentative_converted"] == 1
    assert by_tenant[off_tenant.id] == {"tenant_id": off_tenant.id, "skipped": True}
    assert by_tenant[mi_off.id]["skipped"] is True  # integrated flag without manufacturing_intelligence_v1

    for row in (due, ordered, off_due, off_ordered, mi_due):
        await db.refresh(row)
    assert due.status == "EXPIRED"
    assert ordered.status == "CONVERTED" and ordered.converted_order_id == order.id
    assert off_due.status == "ACTIVE" and off_ordered.status == "ACTIVE" and mi_due.status == "ACTIVE"

    # a second run finds nothing more to do
    again = await _run(db, monkeypatch, [on_tenant])
    assert again["results"][0]["tentative_expired"] == 0 and again["results"][0]["tentative_converted"] == 0


async def test_allocation_lifecycle_runs_only_with_its_flag(db_session_integration, monkeypatch):
    db = db_session_integration
    alloc_tenant, *_ = await _tenant_with_bookings(db, {**FLAGS_ON, "mfg_material_allocation_v1": True})
    plan_tenant, *_ = await _tenant_with_bookings(db, INTEGRATED)
    calls: list[int] = []

    async def fake_lifecycle(_db, tenant_id, *, now=None):
        calls.append(tenant_id)
        return {"holds_released": 0, "pegs_released": 0}

    import app.modules.inventory.allocation_reconcile_service as recon

    monkeypatch.setattr(recon, "apply_lifecycle", fake_lifecycle)
    out = await _run(db, monkeypatch, [alloc_tenant, plan_tenant])
    assert calls == [alloc_tenant.id]
    by_tenant = {r["tenant_id"]: r for r in out["results"]}
    assert by_tenant[alloc_tenant.id]["holds_released"] == 0 and "tentative_expired" not in by_tenant[alloc_tenant.id]
    assert "holds_released" not in by_tenant[plan_tenant.id]


async def test_one_failing_tenant_is_rolled_back_and_the_job_continues(db_session_integration, monkeypatch):
    db = db_session_integration
    bad, bad_due, _o1, _x = await _tenant_with_bookings(db, INTEGRATED)
    good, good_due, _o2, _y = await _tenant_with_bookings(db, INTEGRATED)

    import app.modules.production.tentative_booking_service as tbs

    real_convert = tbs.convert_ordered_bookings

    bad_id, good_id = bad.id, good.id  # the rollback expires ORM objects; keep plain ids

    async def flaky_convert(_db, tenant_id, **kw):
        if tenant_id == bad_id:
            raise RuntimeError("boom")
        return await real_convert(_db, tenant_id, **kw)

    monkeypatch.setattr(tbs, "convert_ordered_bookings", flaky_convert)
    out = await _run(db, monkeypatch, [bad, good])
    by_tenant = {r["tenant_id"]: r for r in out["results"]}
    assert by_tenant[bad_id] == {"tenant_id": bad_id, "error": True}
    assert by_tenant[good_id]["tentative_expired"] == 1 and by_tenant[good_id]["tentative_converted"] == 1
    await db.refresh(bad_due)
    await db.refresh(good_due)
    assert bad_due.status == "ACTIVE"  # the bad tenant's expiry was rolled back with the failure
    assert good_due.status == "EXPIRED"
