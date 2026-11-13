"""A17: delivery prediction bands (on track, at risk, late, unknown, complete) against `delivery_date`.

"Today" is pinned to Monday 2030-03-04. One firm line: 30 operators, 480 min, 60 % efficiency, SMV 12.5
-> 691.20 pieces per working day. An order of 6,912 pieces needs exactly 10 working days:
likely finish = 10th working day from Monday 4 March = Friday 15 March 2030.
Optimistic (x1.10) also needs 10 days (15 March); pessimistic (x0.85) needs 12 days = Tuesday 19 March.

Run: docker compose exec backend pytest tests/test_mfg_intelligence_delivery.py -q
"""

from __future__ import annotations

from datetime import date

import pytest

from app.models import HourlyProductionEntry
from app.modules.mfg_intelligence import router as mfg_router
from tests.mfg_intel_fixtures import (
    API,
    FLAGS_ON,
    MONDAY,
    add_order,
    add_plan,
    client_for,
    new_tenant,
    seed_basic_factory,
)
from tests.test_mfg_intelligence_readiness import _bom, _bom_item, _item, _stock_setup


@pytest.fixture(autouse=True)
def _pin_today(monkeypatch):
    monkeypatch.setattr(mfg_router, "today_local", lambda tenant=None: MONDAY)


async def _setup(db, *, flags=FLAGS_ON, qty=6912, delivery=date(2030, 3, 20), done="0", rs="FIRM_BOOKED", plan=True, status="CONFIRMED"):
    tenant, user, _ = await new_tenant(db, flags=flags)
    fx = await seed_basic_factory(db, tenant)
    order = await add_order(db, tenant, fx.customer, fx.style, qty=qty, delivery=delivery, status=status)
    row = None
    if plan:
        row = await add_plan(
            db, tenant, fx.line, start=MONDAY, end=date(2030, 3, 29), qty=str(qty), done=done, order=order,
            ob=fx.ob, shift=fx.shift, rs=rs,
        )
    await db.commit()
    return tenant, user, fx, order, row


async def _predict(db, tenant, user, order):
    async with client_for(db, tenant, user) as c:
        r = await c.get(f"{API}/orders/{order.id}/delivery-prediction")
    assert r.status_code == 200, r.text
    return r.json()


@pytest.mark.asyncio
async def test_on_track(db_session_integration):
    db = db_session_integration
    tenant, user, _fx, order, _row = await _setup(db, delivery=date(2030, 3, 20))
    body = await _predict(db, tenant, user, order)
    assert body["band"] == "ON_TRACK"
    assert body["daily_rate_likely"] == "691.20"
    assert body["daily_rate_optimistic"] == "760.32" and body["daily_rate_pessimistic"] == "587.52"
    assert body["working_days_needed"] == 10
    assert body["start_date"] == "2030-03-04"
    assert body["likely_complete_date"] == "2030-03-15"
    assert body["optimistic_complete_date"] == "2030-03-15"
    assert body["pessimistic_complete_date"] == "2030-03-19"
    assert body["delay_days"] == 0 and body["early_days"] == 5
    assert body["order_qty"] == "6912.000" and body["remaining_qty"] == "6912.000"
    assert body["target_basis"] == "EX_FACTORY" and body["target_date"] == "2030-03-20"
    assert body["lines"][0]["practical_units_per_day"] == "691.20"
    assert any("ex-factory" in a for a in body["assumptions"])


@pytest.mark.asyncio
async def test_at_risk_when_only_the_pessimistic_case_misses_the_date(db_session_integration):
    db = db_session_integration
    tenant, user, _fx, order, _row = await _setup(db, delivery=date(2030, 3, 18))
    body = await _predict(db, tenant, user, order)
    assert body["band"] == "AT_RISK"
    assert body["likely_complete_date"] == "2030-03-15" and body["delay_days"] == 0


@pytest.mark.asyncio
async def test_late_reports_delay_days(db_session_integration):
    db = db_session_integration
    tenant, user, _fx, order, _row = await _setup(db, delivery=date(2030, 3, 13))
    body = await _predict(db, tenant, user, order)
    assert body["band"] == "LATE"
    assert body["delay_days"] == 2 and body["early_days"] == 0


@pytest.mark.asyncio
async def test_produced_quantity_shortens_the_forecast(db_session_integration):
    db = db_session_integration
    tenant, user, _fx, order, _row = await _setup(db, delivery=date(2030, 3, 20), done="912")
    body = await _predict(db, tenant, user, order)
    assert body["produced_qty"] == "912.000" and body["remaining_qty"] == "6000.000"
    assert body["working_days_needed"] == 9  # 6000 / 691.2 = 8.68 -> 9 days
    assert body["likely_complete_date"] == "2030-03-14"


@pytest.mark.asyncio
async def test_hourly_good_qty_is_information_only(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order, _row = await _setup(db, delivery=date(2030, 3, 20))
    db.add(HourlyProductionEntry(
        tenant_id=tenant.id, department_type="sewing", line_id=fx.line.id, order_id=order.id,
        production_date=MONDAY, hour_slot=9, good_qty=50,
    ))
    await db.commit()
    body = await _predict(db, tenant, user, order)
    assert body["hourly_good_qty"] == "50.000"
    assert body["produced_qty"] == "0.000" and body["remaining_qty"] == "6912.000"  # not used in the calculation


@pytest.mark.asyncio
async def test_nothing_remaining_is_complete(db_session_integration):
    db = db_session_integration
    tenant, user, _fx, order, _row = await _setup(db, done="6912")
    body = await _predict(db, tenant, user, order)
    assert body["band"] == "COMPLETE" and body["remaining_qty"] == "0.000"
    assert body["likely_complete_date"] is None


@pytest.mark.asyncio
async def test_unknown_cases_never_invent_a_date(db_session_integration):
    db = db_session_integration

    # 1. unconfirmed order
    tenant, user, _fx, order, _ = await _setup(db, status="DRAFT")
    body = await _predict(db, tenant, user, order)
    assert body["band"] == "UNKNOWN" and body["reason_codes"] == ["ORDER_NOT_CONFIRMED"]
    assert body["likely_complete_date"] is None

    # 2. no line plan at all
    tenant, user, _fx, order, _ = await _setup(db, plan=False)
    body = await _predict(db, tenant, user, order)
    assert body["band"] == "UNKNOWN" and body["missing_inputs"] == ["line_plan"]

    # 3. only a soft booking: no firm rate
    tenant, user, _fx, order, _ = await _setup(db, rs="SOFT_BOOKED")
    body = await _predict(db, tenant, user, order)
    assert body["band"] == "UNKNOWN" and body["reason_codes"] == ["NO_FIRM_LINE_PLAN"]

    # 4. no SMV anywhere
    tenant, user, fx, order, row = await _setup(db)
    row.ob_id = None
    row.style_id = None
    await db.commit()
    body = await _predict(db, tenant, user, order)
    assert body["band"] == "UNKNOWN" and "smv" in body["missing_inputs"] and body["likely_complete_date"] is None

    # 5. no delivery date: dates are computed but the band stays UNKNOWN
    tenant, user, _fx, order, _ = await _setup(db, delivery=None)
    body = await _predict(db, tenant, user, order)
    assert body["band"] == "UNKNOWN" and body["reason_codes"] == ["NO_DELIVERY_DATE"]
    assert body["likely_complete_date"] == "2030-03-15"

    # 6. no order quantity
    tenant, user, _fx, order, _ = await _setup(db)
    order.quantity = None
    await db.commit()
    body = await _predict(db, tenant, user, order)
    assert body["band"] == "UNKNOWN" and body["missing_inputs"] == ["order_quantity"]


@pytest.mark.asyncio
async def test_unknown_when_the_line_has_no_shift_or_operators(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order, row = await _setup(db)
    row.operator_count = 0
    fx.line.default_operator_count = 0
    await db.commit()
    body = await _predict(db, tenant, user, order)
    assert body["band"] == "UNKNOWN" and "operators" in body["missing_inputs"]
    assert body["daily_rate_likely"] is None and body["likely_complete_date"] is None


@pytest.mark.asyncio
async def test_planning_math_v2_off_gives_unknown_not_a_legacy_guess(db_session_integration):
    db = db_session_integration
    tenant, user, _fx, order, _row = await _setup(db, flags={"manufacturing_intelligence_v1": True})
    body = await _predict(db, tenant, user, order)
    assert body["band"] == "UNKNOWN" and body["reason_codes"] == ["PLANNING_MATH_V2_OFF"]
    assert body["remaining_qty"] == "6912.000"


@pytest.mark.asyncio
async def test_material_not_ready_under_order_bom_makes_start_unknown(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order, _row = await _setup(db, delivery=date(2030, 3, 20))
    cat, unit, wh = await _stock_setup(db, tenant)
    item = await _item(db, tenant, cat, unit, wh, "Jersey", "10")
    bom = await _bom(db, tenant, fx.style, order=order, status="APPROVED")
    line = await _bom_item(db, tenant, bom, item, gross="5000")  # far more than the 10 in stock
    await db.commit()
    body = await _predict(db, tenant, user, order)
    assert body["band"] == "UNKNOWN" and body["reason_codes"] == ["MATERIAL_NOT_READY"]
    assert body["start_date"] is None and body["likely_complete_date"] is None
    assert body["material"]["authority"] == "ORDER_BOM"

    # Once the requirement is covered by stock the forecast is produced again.
    line.required_gross_qty = 5
    await db.commit()
    body = await _predict(db, tenant, user, order)
    assert body["band"] == "ON_TRACK" and body["material"]["status"] == "READY"


@pytest.mark.asyncio
async def test_style_estimate_materials_do_not_block_the_forecast(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order, _row = await _setup(db, delivery=date(2030, 3, 20))
    cat, unit, wh = await _stock_setup(db, tenant)
    item = await _item(db, tenant, cat, unit, wh, "Jersey", "0")
    style_bom = await _bom(db, tenant, fx.style, order=None, status="APPROVED")
    await _bom_item(db, tenant, style_bom, item, gross="5000")
    await db.commit()
    body = await _predict(db, tenant, user, order)
    assert body["band"] == "ON_TRACK"
    assert body["material"]["authority"] == "STYLE_ESTIMATE"


@pytest.mark.asyncio
async def test_two_firm_lines_add_their_rates(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order, _row = await _setup(db, delivery=date(2030, 3, 20), qty=6912)
    from tests.mfg_intel_fixtures import add_line

    line2 = await add_line(db, tenant, "L2", operators=15)
    await add_plan(
        db, tenant, line2, start=MONDAY, end=date(2030, 3, 29), qty="100", order=order, ob=fx.ob, shift=fx.shift,
        operators=15,
    )
    await db.commit()
    body = await _predict(db, tenant, user, order)
    # 691.20 (L1) + 345.60 (L2: 15 operators) = 1036.80 per day -> 6912 / 1036.8 = 6.67 -> 7 days
    assert body["daily_rate_likely"] == "1036.80"
    assert body["working_days_needed"] == 7 and body["likely_complete_date"] == "2030-03-12"
