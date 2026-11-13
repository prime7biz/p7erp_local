"""Correction round 1: per-day shifts, unresolved firm load, SMV status, look-back rows, legacy rounding.

Run: docker compose exec backend pytest tests/test_mfg_intelligence_correction_round1.py -q
"""

from __future__ import annotations

from datetime import date, time
from decimal import Decimal

import pytest

from app.modules.mfg_intelligence import router as mfg_router
from app.modules.mfg_intelligence.smv_resolver import resolve_smv_for_rows
from app.modules.production.planning_advisory_service import build_capacity_and_sequencing_advisory
from tests.mfg_intel_fixtures import (
    API,
    FLAGS_ON,
    MONDAY,
    add_line,
    add_ob,
    add_order,
    add_plan,
    add_settings,
    add_shift,
    add_style_with_ob,
    client_for,
    new_tenant,
    seed_basic_factory,
)

TUESDAY = date(2030, 3, 5)
WEDNESDAY = date(2030, 3, 6)
FRIDAY = date(2030, 3, 8)


@pytest.mark.asyncio
async def test_day_capacity_is_the_same_for_any_window(db_session_integration):
    """Two rows with different shifts on separate days; the same day gives the same numbers in two windows."""
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags=FLAGS_ON)
    fx = await seed_basic_factory(db, tenant, shifts=2)  # DAY 06-14, LATE 14-22
    await add_plan(db, tenant, fx.line, start=MONDAY, end=MONDAY, qty="10", ob=fx.ob, shift=fx.shift, operators=30)
    await add_plan(db, tenant, fx.line, start=TUESDAY, end=TUESDAY, qty="10", ob=fx.ob, shift=fx.shift2, operators=10)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        narrow = (await c.get(f"{API}/capacity", params={"date_from": "2030-03-05", "date_to": "2030-03-05"})).json()
        wide = (await c.get(f"{API}/capacity", params={"date_from": "2030-03-04", "date_to": "2030-03-08"})).json()
    tue_narrow = narrow["lines"][0]["days"][0]
    days = {d["date"]: d for d in wide["lines"][0]["days"]}
    assert days["2030-03-04"]["theoretical_minutes"] == "14400.00"  # DAY shift only, 30 operators
    assert days["2030-03-05"]["theoretical_minutes"] == "4800.00"  # LATE shift only, 10 operators
    assert days["2030-03-06"]["theoretical_minutes"] == "28800.00"  # no row: both shifts, default 30 operators
    for key in ("theoretical_minutes", "practical_smv_minutes", "status", "operators", "reason_codes"):
        assert tue_narrow[key] == days["2030-03-05"][key], key


@pytest.mark.asyncio
async def test_unresolved_firm_row_makes_day_unknown_and_not_idle(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags=FLAGS_ON)
    fx = await seed_basic_factory(db, tenant)
    order = await add_order(db, tenant, fx.customer, fx.style, delivery=FRIDAY)
    # Firm row without OB, style or plan-row SMV -> SMV unknown.
    await add_plan(db, tenant, fx.line, start=MONDAY, end=MONDAY, qty="500", order=order, shift=fx.shift)
    await db.commit()
    params = {"date_from": "2030-03-04", "date_to": "2030-03-04"}
    async with client_for(db, tenant, user) as c:
        cap = (await c.get(f"{API}/capacity", params=params)).json()
        summary = (await c.get(f"{API}/summary", params=params)).json()
    day = cap["lines"][0]["days"][0]
    assert day["status"] == "UNKNOWN" and "UNRESOLVED_FIRM_LOAD" in day["reason_codes"]
    assert day["unresolved_firm_rows"] == 1 and day["missing_inputs"] == ["smv"]
    assert day["firm_available_smv_minutes"] is None and day["utilization_pct"] is None
    assert day["practical_smv_minutes"] == "8640.00"  # capacity itself is known
    assert summary["idle"]["count"] == 0 and summary["idle"]["top"] == []
    assert summary["capacity"]["unknown_line_days"] == 1
    assert summary["capacity"]["practical_smv_minutes"] == "0.00"  # incomplete day kept out of the totals
    assert cap["lines"][0]["totals"]["working_days_unknown"] == 1


@pytest.mark.asyncio
async def test_unapproved_ob_is_low_confidence_and_approved_style_ob_wins(db_session_integration):
    db = db_session_integration
    tenant, _user, line = await _base(db)
    _c, style, draft_ob = await add_style_with_ob(db, tenant, smv="10", status="draft")
    row = await add_plan(db, tenant, line, start=MONDAY, end=MONDAY, qty="10", ob=draft_ob, style=style)
    got = (await resolve_smv_for_rows(db, tenant.id, [row]))[row.id]
    assert got.value == Decimal("10.0000") and got.source == "OB" and got.confidence == "low"
    assert got.reason_codes == ["SMV_FROM_UNAPPROVED_OB"]

    await add_ob(db, tenant, style, smv="14", status="approved", version=2)
    better = (await resolve_smv_for_rows(db, tenant.id, [row]))[row.id]
    assert better.value == Decimal("14.0000") and better.source == "STYLE_APPROVED_OB" and better.confidence == "high"

    approved_row_ob = await add_ob(db, tenant, style, smv="9", status="approved", version=3)
    row2 = await add_plan(db, tenant, line, start=MONDAY, end=MONDAY, qty="10", ob=approved_row_ob, style=style)
    top = (await resolve_smv_for_rows(db, tenant.id, [row2]))[row2.id]
    assert top.value == Decimal("9.0000") and top.source == "OB" and top.confidence == "high"


async def _base(db):
    tenant, user, _ = await new_tenant(db, flags=FLAGS_ON)
    await add_settings(db, tenant)
    await add_shift(db, tenant)
    line = await add_line(db, tenant)
    return tenant, user, line


@pytest.mark.asyncio
async def test_row_ending_before_the_window_still_loads_its_fallback_day(db_session_integration):
    """A weekend-only row (Sat-Sun) has no working day; its load lands on Monday, which may be the window start."""
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags=FLAGS_ON)
    fx = await seed_basic_factory(db, tenant)
    order = await add_order(db, tenant, fx.customer, fx.style, delivery=FRIDAY)
    await add_plan(
        db, tenant, fx.line, start=date(2030, 3, 2), end=date(2030, 3, 3), qty="10", order=order, ob=fx.ob, shift=fx.shift
    )
    await db.commit()
    async with client_for(db, tenant, user) as c:
        monday = (await c.get(f"{API}/line-loading", params={"date_from": "2030-03-04", "date_to": "2030-03-08"})).json()
        later = (await c.get(f"{API}/line-loading", params={"date_from": "2030-03-05", "date_to": "2030-03-08"})).json()
        cap = (await c.get(f"{API}/capacity", params={"date_from": "2030-03-04", "date_to": "2030-03-04"})).json()
    assert len(monday["rows"]) == 1
    assert monday["rows"][0]["daily_allocation"] == [{"date": "2030-03-04", "smv_minutes": "125.00"}]
    assert "NO_WORKING_DAY_IN_WINDOW" in monday["rows"][0]["reason_codes"]
    assert later["rows"] == [] and later["line_days"] == []  # the load is on Monday, outside this window
    assert cap["lines"][0]["days"][0]["firm_smv_minutes"] == "125.00"


@pytest.mark.asyncio
async def test_closed_days_stay_closed_when_planning_math_v2_is_off(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags={"manufacturing_intelligence_v1": True})
    fx = await seed_basic_factory(db, tenant)
    await add_plan(db, tenant, fx.line, start=FRIDAY, end=date(2030, 3, 11), qty="10", ob=fx.ob, shift=fx.shift)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        body = (await c.get(f"{API}/capacity", params={"date_from": "2030-03-08", "date_to": "2030-03-10"})).json()
    days = {d["date"]: d for d in body["lines"][0]["days"]}
    assert days["2030-03-08"]["status"] == "UNKNOWN"
    assert days["2030-03-09"]["status"] == "CLOSED" and days["2030-03-10"]["status"] == "CLOSED"
    assert days["2030-03-09"]["practical_smv_minutes"] is None


@pytest.mark.asyncio
async def test_legacy_value_matches_the_advisory_exactly_with_a_fractional_average(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags=FLAGS_ON)
    await add_settings(db, tenant)
    await add_shift(db, tenant, "A", time(6, 0), time(14, 0), 0)  # 480
    await add_shift(db, tenant, "B", time(14, 0), time(22, 0), 0)  # 480
    await add_shift(db, tenant, "C", time(22, 0), time(6, 7), 0)  # 487 -> average 482.3333...
    await add_line(db, tenant, "L7", operators=7, machines=13)
    await add_line(db, tenant, "L9", operators=9, machines=11)
    await db.commit()
    advisory = await build_capacity_and_sequencing_advisory(db, tenant_id=tenant.id, from_date=MONDAY, to_date=FRIDAY)
    legacy = {ln["line_code"]: str(ln["rough_capacity_units"]) for ln in advisory["lines"]}
    async with client_for(db, tenant, user) as c:
        body = (await c.get(f"{API}/capacity", params={"date_from": "2030-03-04", "date_to": "2030-03-08"})).json()
    mine = {ln["line_code"]: ln["legacy_value"] for ln in body["lines"]}
    assert {k: Decimal(v) for k, v in mine.items()} == {k: Decimal(v) for k, v in legacy.items()}


@pytest.mark.asyncio
async def test_delivery_starts_at_the_earliest_live_plan_row(db_session_integration, monkeypatch):
    monkeypatch.setattr(mfg_router, "today_local", lambda tenant=None: MONDAY)
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags=FLAGS_ON)
    fx = await seed_basic_factory(db, tenant)
    order = await add_order(db, tenant, fx.customer, fx.style, qty=6912, delivery=date(2030, 3, 29))
    # A soft row starts Monday, the firm row only on Wednesday: the order starts on the earliest live row.
    await add_plan(db, tenant, fx.line, start=MONDAY, end=TUESDAY, qty="100", order=order, ob=fx.ob, shift=fx.shift, rs="SOFT_BOOKED")
    await add_plan(db, tenant, fx.line, start=WEDNESDAY, end=date(2030, 3, 29), qty="6912", order=order, ob=fx.ob, shift=fx.shift)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        r = await c.get(f"{API}/orders/{order.id}/delivery-prediction")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["start_date"] == "2030-03-04", body


async def _two_orders_on_one_line(db, *, with_unknown_smv_order: bool):
    tenant, user, _ = await new_tenant(db, flags=FLAGS_ON)
    fx = await seed_basic_factory(db, tenant)
    a = await add_order(db, tenant, fx.customer, fx.style, qty=6912, delivery=date(2030, 3, 29))
    await add_plan(db, tenant, fx.line, start=MONDAY, end=date(2030, 3, 29), qty="6912", order=a, ob=fx.ob, shift=fx.shift)
    b = None
    if with_unknown_smv_order:
        b = await add_order(db, tenant, fx.customer, fx.style, qty=500, delivery=date(2030, 3, 29))
        # Firm row with no OB, style or plan-row SMV on the same line and days.
        await add_plan(db, tenant, fx.line, start=MONDAY, end=date(2030, 3, 29), qty="500", order=b, shift=fx.shift)
    await db.commit()
    return tenant, user, fx, a, b


@pytest.mark.asyncio
async def test_other_orders_unresolved_row_does_not_make_this_delivery_unknown(db_session_integration, monkeypatch):
    monkeypatch.setattr(mfg_router, "today_local", lambda tenant=None: MONDAY)
    db = db_session_integration
    tenant, user, _fx, a, b = await _two_orders_on_one_line(db, with_unknown_smv_order=True)
    async with client_for(db, tenant, user) as c:
        body_a = (await c.get(f"{API}/orders/{a.id}/delivery-prediction")).json()
        body_b = (await c.get(f"{API}/orders/{b.id}/delivery-prediction")).json()
    assert body_a["band"] != "UNKNOWN", body_a
    assert body_a["daily_rate_likely"] == "691.20"  # the single-line rate
    assert body_b["band"] == "UNKNOWN" and "smv" in body_b["missing_inputs"]  # its own SMV is still checked


@pytest.mark.asyncio
async def test_draft_rows_never_pull_the_delivery_start_earlier(db_session_integration, monkeypatch):
    monkeypatch.setattr(mfg_router, "today_local", lambda tenant=None: MONDAY)
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags=FLAGS_ON)
    fx = await seed_basic_factory(db, tenant)
    order = await add_order(db, tenant, fx.customer, fx.style, qty=6912, delivery=date(2030, 3, 29))
    await add_plan(db, tenant, fx.line, start=MONDAY, end=TUESDAY, qty="100", order=order, ob=fx.ob, shift=fx.shift, rs="DRAFT")
    await add_plan(db, tenant, fx.line, start=WEDNESDAY, end=date(2030, 3, 29), qty="6912", order=order, ob=fx.ob, shift=fx.shift)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        body = (await c.get(f"{API}/orders/{order.id}/delivery-prediction")).json()
    assert body["start_date"] == "2030-03-06", body
    assert "DRAFT_ROWS_IGNORED" in body["reason_codes"]
