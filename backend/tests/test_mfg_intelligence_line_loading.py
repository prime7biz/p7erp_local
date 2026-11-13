"""A10-A12: line loading spread, soft/firm separation, window limit.

Run: docker compose exec backend pytest tests/test_mfg_intelligence_line_loading.py -q
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.modules.mfg_intelligence.line_loading_service import _spread, demand_class
from tests.mfg_intel_fixtures import (
    API,
    FLAGS_ON,
    MONDAY,
    add_holiday,
    add_order,
    add_plan,
    client_for,
    new_tenant,
    seed_basic_factory,
)

FRIDAY = date(2030, 3, 8)
WEEK = {"date_from": "2030-03-04", "date_to": "2030-03-15"}


def test_spread_is_exact_and_even():
    out = _spread(Decimal("100"), [date(2030, 3, 4), date(2030, 3, 5), date(2030, 3, 6)])
    assert sum(out.values()) == Decimal("100")
    assert list(out.values())[0] == Decimal("33.3333")


def test_demand_classes():
    assert [demand_class(s) for s in ("FIRM_BOOKED", "in_progress", "SOFT_BOOKED", "DRAFT", "COMPLETED", "CANCELLED", None)] == [
        "FIRM", "FIRM", "SOFT", "DRAFT", None, None, None,
    ]


@pytest.mark.asyncio
async def test_load_is_spread_over_working_days_between_start_and_end(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags=FLAGS_ON)
    fx = await seed_basic_factory(db, tenant)
    order = await add_order(db, tenant, fx.customer, fx.style)
    # Mon..Fri = 5 working days, 400 pieces x 12.5 = 5000 minutes -> 1000 per day.
    await add_plan(db, tenant, fx.line, start=MONDAY, end=FRIDAY, qty="400", order=order, ob=fx.ob, shift=fx.shift)
    # Friday..next Tuesday: Fri + Mon + Tue = 3 working days (weekend skipped), 120 x 12.5 = 1500 -> 500 per day.
    await add_plan(db, tenant, fx.line, start=FRIDAY, end=date(2030, 3, 12), qty="120", ob=fx.ob, shift=fx.shift)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        body = (await c.get(f"{API}/line-loading", params=WEEK)).json()
    rows = {r["total_load_minutes"]: r for r in body["rows"]}
    first = rows["5000.00"]
    assert [(a["date"], a["smv_minutes"]) for a in first["daily_allocation"]] == [
        ("2030-03-04", "1000.00"), ("2030-03-05", "1000.00"), ("2030-03-06", "1000.00"),
        ("2030-03-07", "1000.00"), ("2030-03-08", "1000.00"),
    ]
    second = rows["1500.00"]
    assert [(a["date"], a["smv_minutes"]) for a in second["daily_allocation"]] == [
        ("2030-03-08", "500.00"), ("2030-03-11", "500.00"), ("2030-03-12", "500.00"),
    ]
    by_day = {d["date"]: d for d in body["line_days"]}
    assert by_day["2030-03-08"]["firm_smv_minutes"] == "1500.00"  # 1000 + 500 on the shared Friday
    assert "2030-03-09" not in by_day and "2030-03-10" not in by_day  # nothing lands on the weekend
    assert all(d["is_working_day"] for d in body["line_days"])
    assert first["demand_class"] == "FIRM" and first["order_code"] == order.order_code


@pytest.mark.asyncio
async def test_only_the_part_inside_the_window_is_returned(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags=FLAGS_ON)
    fx = await seed_basic_factory(db, tenant)
    await add_plan(db, tenant, fx.line, start=MONDAY, end=FRIDAY, qty="400", ob=fx.ob, shift=fx.shift)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        body = (await c.get(f"{API}/line-loading", params={"date_from": "2030-03-07", "date_to": "2030-03-08"})).json()
    row = body["rows"][0]
    assert row["total_load_minutes"] == "5000.00"  # the whole row load, spread over its full span
    assert [a["date"] for a in row["daily_allocation"]] == ["2030-03-07", "2030-03-08"]
    assert {d["date"] for d in body["line_days"]} == {"2030-03-07", "2030-03-08"}


@pytest.mark.asyncio
async def test_row_without_working_day_goes_on_first_working_day(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags=FLAGS_ON)
    fx = await seed_basic_factory(db, tenant)
    await add_holiday(db, tenant, date(2030, 3, 11))
    # Saturday..Monday(holiday): no working day in the span -> Tuesday the 12th.
    await add_plan(db, tenant, fx.line, start=date(2030, 3, 9), end=date(2030, 3, 11), qty="40", ob=fx.ob)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        body = (await c.get(f"{API}/line-loading", params=WEEK)).json()
    row = body["rows"][0]
    assert "NO_WORKING_DAY_IN_WINDOW" in row["reason_codes"]
    assert [(a["date"], a["smv_minutes"]) for a in row["daily_allocation"]] == [("2030-03-12", "500.00")]


@pytest.mark.asyncio
async def test_soft_load_never_reduces_firm_availability_and_closed_rows_consume_nothing(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags=FLAGS_ON)
    fx = await seed_basic_factory(db, tenant)
    one = {"date_from": "2030-03-04", "date_to": "2030-03-04"}
    await add_plan(db, tenant, fx.line, start=MONDAY, end=MONDAY, qty="100", ob=fx.ob, shift=fx.shift, rs="FIRM_BOOKED")
    await add_plan(db, tenant, fx.line, start=MONDAY, end=MONDAY, qty="200", ob=fx.ob, shift=fx.shift, rs="IN_PROGRESS")
    await add_plan(db, tenant, fx.line, start=MONDAY, end=MONDAY, qty="1000", ob=fx.ob, shift=fx.shift, rs="SOFT_BOOKED")
    await add_plan(db, tenant, fx.line, start=MONDAY, end=MONDAY, qty="50", ob=fx.ob, shift=fx.shift, rs="DRAFT")
    await add_plan(db, tenant, fx.line, start=MONDAY, end=MONDAY, qty="9999", ob=fx.ob, shift=fx.shift, rs="CANCELLED")
    await add_plan(db, tenant, fx.line, start=MONDAY, end=MONDAY, qty="8888", ob=fx.ob, shift=fx.shift, rs="COMPLETED")
    await db.commit()
    async with client_for(db, tenant, user) as c:
        cap = (await c.get(f"{API}/capacity", params=one)).json()
        loading = (await c.get(f"{API}/line-loading", params=one)).json()
    day = cap["lines"][0]["days"][0]
    assert day["firm_smv_minutes"] == "3750.00"  # (100 + 200) x 12.5
    assert day["soft_smv_minutes"] == "12500.00"
    assert day["draft_smv_minutes"] == "625.00"
    assert day["firm_available_smv_minutes"] == "4890.00"  # 8640 - 3750: soft load is NOT subtracted
    assert day["status"] == "LOADED"
    assert {r["reservation_status"] for r in loading["rows"]} == {"FIRM_BOOKED", "IN_PROGRESS", "SOFT_BOOKED", "DRAFT"}
    assert loading["line_days"][0]["soft_smv_minutes"] == "12500.00"


@pytest.mark.asyncio
async def test_firm_confirmed_versus_unconfirmed_order_load(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags=FLAGS_ON)
    fx = await seed_basic_factory(db, tenant)
    confirmed = await add_order(db, tenant, fx.customer, fx.style, status="CONFIRMED")
    draft = await add_order(db, tenant, fx.customer, fx.style, status="DRAFT")
    await add_plan(db, tenant, fx.line, start=MONDAY, end=MONDAY, qty="100", order=confirmed, ob=fx.ob)
    await add_plan(db, tenant, fx.line, start=MONDAY, end=MONDAY, qty="40", order=draft, ob=fx.ob)
    await add_plan(db, tenant, fx.line, start=MONDAY, end=MONDAY, qty="8", ob=fx.ob)  # no order: firm-unconfirmed
    await db.commit()
    async with client_for(db, tenant, user) as c:
        body = (await c.get(f"{API}/line-loading", params={"date_from": "2030-03-04", "date_to": "2030-03-04"})).json()
    d = body["line_days"][0]
    assert d["firm_confirmed_smv_minutes"] == "1250.00"
    assert d["firm_unconfirmed_smv_minutes"] == "600.00"  # (40 + 8) x 12.5
    assert d["firm_smv_minutes"] == "1850.00"


@pytest.mark.asyncio
async def test_rows_with_unknown_smv_are_unresolved_not_added(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags=FLAGS_ON)
    fx = await seed_basic_factory(db, tenant)
    bad = await add_plan(db, tenant, fx.line, start=MONDAY, end=MONDAY, qty="500")  # no OB, no style, no plan SMV
    await db.commit()
    async with client_for(db, tenant, user) as c:
        body = (await c.get(f"{API}/line-loading", params={"date_from": "2030-03-04", "date_to": "2030-03-04"})).json()
    assert body["rows"] == [] and body["line_days"] == []
    assert body["unresolved_rows"][0]["config_id"] == bad.id
    assert body["unresolved_rows"][0]["missing_inputs"] == ["smv"]
    assert "SMV_UNKNOWN" in body["unresolved_rows"][0]["reason_codes"]


@pytest.mark.asyncio
async def test_remaining_qty_uses_completed_qty(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags=FLAGS_ON)
    fx = await seed_basic_factory(db, tenant)
    await add_plan(db, tenant, fx.line, start=MONDAY, end=MONDAY, qty="100", done="60", ob=fx.ob)
    await add_plan(db, tenant, fx.line, start=MONDAY, end=MONDAY, qty="100", done="150", ob=fx.ob)  # over-delivered
    await db.commit()
    async with client_for(db, tenant, user) as c:
        body = (await c.get(f"{API}/line-loading", params={"date_from": "2030-03-04", "date_to": "2030-03-04"})).json()
    assert sorted(r["remaining_qty"] for r in body["rows"]) == ["0.000", "40.000"]
    assert body["line_days"][0]["firm_smv_minutes"] == "500.00"


@pytest.mark.asyncio
async def test_window_longer_than_180_days_is_422(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags=FLAGS_ON)
    await seed_basic_factory(db, tenant)
    await db.commit()
    start = MONDAY
    async with client_for(db, tenant, user) as c:
        for path in ("line-loading", "capacity", "summary"):
            ok = await c.get(f"{API}/{path}", params={"date_from": str(start), "date_to": str(start + timedelta(days=179))})
            assert ok.status_code == 200, (path, ok.text)  # exactly 180 days inclusive is allowed
            too_long = await c.get(f"{API}/{path}", params={"date_from": str(start), "date_to": str(start + timedelta(days=180))})
            assert too_long.status_code == 422, path
            backwards = await c.get(f"{API}/{path}", params={"date_from": "2030-03-08", "date_to": "2030-03-04"})
            assert backwards.status_code == 422, path
            missing = await c.get(f"{API}/{path}", params={"date_from": "2030-03-08"})
            assert missing.status_code == 422, path
