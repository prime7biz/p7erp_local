"""A4-A8: corrected capacity, UNKNOWN handling, closed days, legacy reproduction.

Run: docker compose exec backend pytest tests/test_mfg_intelligence_capacity.py -q
"""

from __future__ import annotations

from datetime import date, time
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.modules.mfg_intelligence.calendar_helpers import CalendarContext
from app.modules.mfg_intelligence.capacity_service import compute_day_capacity
from app.modules.mfg_intelligence.line_loading_service import DayLoad
from app.modules.production.planning_advisory_service import build_capacity_and_sequencing_advisory
from tests.mfg_intel_fixtures import (
    API,
    FLAGS_ON,
    MONDAY,
    add_holiday,
    add_line,
    add_order,
    add_plan,
    add_settings,
    add_shift,
    add_style_with_ob,
    client_for,
    new_tenant,
    seed_basic_factory,
)

FRIDAY = date(2030, 3, 8)
SATURDAY = date(2030, 3, 9)
SUNDAY = date(2030, 3, 10)
ONE_DAY = {"date_from": "2030-03-04", "date_to": "2030-03-04"}
WEEK = {"date_from": "2030-03-04", "date_to": "2030-03-08"}


def _line(ops=30, machines=30):
    return SimpleNamespace(default_operator_count=ops, running_machine_count=machines, default_machine_count=machines)


def _row(**kw):
    base = dict(
        id=1, start_date=MONDAY, planned_end_date=MONDAY, operator_count=30, target_efficiency_pct=Decimal("60"),
        reservation_status="FIRM_BOOKED", shift_id=1,
    )
    base.update(kw)
    return SimpleNamespace(**base)


def _shift(sid=1, start=time(8, 0), end=time(17, 0), brk=60):
    return SimpleNamespace(id=sid, start_time=start, end_time=end, break_minutes=brk)


ONE_SHIFT = {1: _shift()}  # 08:00-17:00, 60 break = 480 net
SIX_TO_TWO = _shift(1, time(6, 0), time(14, 0), 0)  # 480 net
TWO_TO_TEN = _shift(2, time(14, 0), time(22, 0), 0)  # 480 net, does not overlap SIX_TO_TWO


def _day(day=MONDAY, **kw):
    args = dict(
        day=day, calendar=CalendarContext(weekend_days=["saturday", "sunday"]), line=_line(),
        shifts_by_id=ONE_SHIFT, line_rows=[_row()], history_rows=[],
        smv_by_row={1: Decimal("12.5")}, load=DayLoad(),
    )
    args.update(kw)
    return compute_day_capacity(**args)


# ------------------------------------------------------------------ pure formula tests


def test_worked_example_from_the_design_doc():
    d = _day()
    assert d.theoretical_minutes == Decimal("14400.0000")
    assert d.practical_minutes == Decimal("8640.0000")
    assert d.practical_units == Decimal("691.2")
    assert d.status == "IDLE"


def test_machines_never_multiply_operators():
    assert _day(line=_line(machines=1)).practical_minutes == _day(line=_line(machines=500)).practical_minutes
    # 30 machines x 30 operators x 480 would be the legacy 432,000 - the corrected value is 30x smaller.
    assert _day().practical_minutes < Decimal("432000") / 30


def test_two_shifts_are_summed_not_averaged():
    shifts = {1: SIX_TO_TWO, 2: TWO_TO_TEN}
    d = _day(shifts_by_id=shifts, line_rows=[_row(id=1, shift_id=1), _row(id=2, shift_id=2)])
    assert d.theoretical_minutes == Decimal("28800.0000")  # 30 operators x 480 + 30 operators x 480
    assert d.operators == 60 and "OPERATORS_FROM_PLAN_ROW" in d.reason_codes


def test_each_shift_uses_its_own_operator_count():
    shifts = {1: SIX_TO_TWO, 2: TWO_TO_TEN}
    rows = [_row(id=1, shift_id=1, operator_count=30), _row(id=2, shift_id=2, operator_count=10)]
    d = _day(shifts_by_id=shifts, line_rows=rows)
    assert d.theoretical_minutes == Decimal("19200.0000")  # 30 x 480 + 10 x 480
    # A shift whose row has no operators uses the line default (30).
    rows[1].operator_count = 0
    d2 = _day(shifts_by_id=shifts, line_rows=rows)
    assert d2.theoretical_minutes == Decimal("28800.0000")
    assert "OPERATORS_FROM_LINE_DEFAULT" in d2.reason_codes and "OPERATORS_FROM_PLAN_ROW" in d2.reason_codes


def test_overlapping_shifts_of_one_pool_are_counted_once():
    # DAY 08:00-17:00 (break 60) fully inside LATE 08:00-18:00 (break 60): union 600 min - longest break 60 = 540.
    shifts = {1: _shift(1), 2: _shift(2, time(8, 0), time(18, 0), 60)}
    d = _day(shifts_by_id=shifts, line_rows=[], history_rows=[_row(id=50)])  # no row names a shift -> one shared pool
    assert d.theoretical_minutes == Decimal("16200.0000")  # 30 x 540, NOT 30 x (480 + 540)
    assert "SHIFTS_OVERLAP_MERGED" in d.reason_codes and "SHIFT_ASSUMED_ALL_ACTIVE" in d.reason_codes


def test_overlap_merge_handles_midnight_and_distinct_breaks():
    night = _shift(1, time(22, 0), time(6, 0), 30)  # crosses midnight
    early = _shift(2, time(4, 0), time(12, 0), 60)  # overlaps 04:00-06:00 with the night shift
    d = _day(shifts_by_id={1: night, 2: early}, line_rows=[], history_rows=[_row(id=50)])
    # union 22:00-12:00 = 840 min, longest break 60 -> 780 min x 30 operators
    assert d.theoretical_minutes == Decimal("23400.0000")
    apart = _day(shifts_by_id={1: SIX_TO_TWO, 2: TWO_TO_TEN}, line_rows=[], history_rows=[_row(id=50)])
    assert apart.theoretical_minutes == Decimal("28800.0000") and "SHIFTS_OVERLAP_MERGED" not in apart.reason_codes


def test_shift_set_comes_from_the_rows_active_that_day():
    shifts = {1: SIX_TO_TWO, 2: TWO_TO_TEN}
    rows = [
        _row(id=1, shift_id=1, start_date=MONDAY, planned_end_date=MONDAY),
        _row(id=2, shift_id=2, start_date=date(2030, 3, 5), planned_end_date=date(2030, 3, 5)),
    ]
    mon = _day(day=MONDAY, shifts_by_id=shifts, line_rows=rows)
    tue = _day(day=date(2030, 3, 5), shifts_by_id=shifts, line_rows=rows)
    wed = _day(  # no row covers the day -> all active shifts, efficiency from history
        day=date(2030, 3, 6), shifts_by_id=shifts, line_rows=rows, history_rows=[rows[0]]
    )
    assert mon.theoretical_minutes == Decimal("14400.0000")
    assert tue.theoretical_minutes == Decimal("14400.0000")
    assert wed.theoretical_minutes == Decimal("28800.0000") and "SHIFT_ASSUMED_ALL_ACTIVE" in wed.reason_codes


def test_shift_without_times_is_reported():
    broken = SimpleNamespace(id=1, start_time=None, end_time=None, break_minutes=0)
    d = _day(shifts_by_id={1: broken})
    assert d.status == "UNKNOWN" and d.missing_inputs == ["shift_times"]
    assert "SHIFT_TIMES_MISSING" in d.reason_codes
    both = _day(shifts_by_id={1: broken, 2: _shift(2)}, line_rows=[], history_rows=[_row(id=50)])
    assert both.theoretical_minutes == Decimal("14400.0000") and "SHIFT_TIMES_MISSING" in both.reason_codes


def test_unresolved_firm_load_never_looks_idle():
    d = _day(load=DayLoad(unresolved_firm=1))
    assert d.status == "UNKNOWN" and "UNRESOLVED_FIRM_LOAD" in d.reason_codes
    assert d.firm_available is None and d.utilization_pct is None and d.practical_minutes is not None
    # Known firm load already above practical stays OVERLOADED.
    over = _day(load=DayLoad(firm=Decimal("9000"), unresolved_firm=2))
    assert over.status == "OVERLOADED" and over.firm_available is None
    soft = _day(load=DayLoad(unresolved_soft=1))
    assert soft.status == "IDLE" and "UNRESOLVED_SOFT_LOAD" in soft.reason_codes


def test_efficiency_fallback_is_the_latest_row_starting_on_or_before_the_day():
    older = _row(id=7, start_date=date(2030, 2, 1), target_efficiency_pct=Decimal("40"))
    newer = _row(id=8, start_date=date(2030, 3, 1), target_efficiency_pct=Decimal("50"))
    future = _row(id=9, start_date=date(2030, 3, 20), target_efficiency_pct=Decimal("90"))
    d = _day(line_rows=[], history_rows=[older, newer, future])
    assert d.practical_minutes == Decimal("7200.0000") and "EFFICIENCY_FROM_LATEST_PLAN" in d.reason_codes


def test_unknown_when_inputs_are_missing_never_a_number():
    assert _day(shifts_by_id={}).missing_inputs == ["shift"]
    assert _day(shifts_by_id={}).practical_minutes is None
    no_ops = _day(line=_line(ops=0), line_rows=[_row(operator_count=0)])
    assert no_ops.status == "UNKNOWN" and no_ops.missing_inputs == ["operators"]
    no_eff = _day(line_rows=[], history_rows=[])
    assert no_eff.status == "UNKNOWN" and no_eff.missing_inputs == ["efficiency"]
    everything = _day(shifts_by_id={}, line=_line(ops=0), line_rows=[], history_rows=[])
    assert everything.missing_inputs == ["shift", "operators", "efficiency"]


def test_efficiency_and_operators_fall_back_with_reason_codes():
    latest = _row(id=9, target_efficiency_pct=Decimal("50"))
    d = _day(line_rows=[], history_rows=[latest])
    assert d.practical_minutes == Decimal("7200.0000")  # 30 default operators x 480 x 50 %
    assert "EFFICIENCY_FROM_LATEST_PLAN" in d.reason_codes
    assert "OPERATORS_FROM_LINE_DEFAULT" in d.reason_codes


def test_closed_day_is_zero_with_reason():
    d = _day(day=SATURDAY)
    assert d.status == "CLOSED" and d.practical_minutes == Decimal("0") and d.reason_codes == ["CLOSED_DAY"]
    # A closed day wins even when inputs are missing.
    assert _day(day=SUNDAY, shifts_by_id={}).status == "CLOSED"


def test_units_only_with_exactly_one_smv():
    two = _day(line_rows=[_row(id=1), _row(id=2, reservation_status="SOFT_BOOKED")], smv_by_row={1: Decimal("10"), 2: Decimal("12")})
    assert two.practical_units is None and "UNITS_NOT_COMPUTED_MULTIPLE_SMV" in two.reason_codes
    none = _day(smv_by_row={1: None})
    assert none.practical_units is None and "UNITS_NOT_COMPUTED_NO_SMV" in none.reason_codes
    assert none.practical_minutes == Decimal("8640.0000")  # minutes do not need an SMV


def test_overloaded_and_loaded_status():
    assert _day(load=DayLoad(firm=Decimal("9000"))).status == "OVERLOADED"
    assert _day(load=DayLoad(firm=Decimal("100"))).status == "LOADED"
    # Soft / draft load never changes the firm status or availability.
    soft = _day(load=DayLoad(soft=Decimal("99999")))
    assert soft.status == "IDLE" and soft.firm_available == soft.practical_minutes


# ------------------------------------------------------------------ HTTP tests


@pytest.mark.asyncio
async def test_capacity_worked_example_legacy_vs_corrected(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags=FLAGS_ON)
    fx = await seed_basic_factory(db, tenant)
    order = await add_order(db, tenant, fx.customer, fx.style)
    await add_plan(db, tenant, fx.line, start=MONDAY, end=MONDAY, qty="100", order=order, ob=fx.ob, shift=fx.shift)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        r = await c.get(f"{API}/capacity", params=ONE_DAY)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["formula_version"] == "mi-capacity-1"
    ln = body["lines"][0]
    day = ln["days"][0]
    assert day["theoretical_minutes"] == "14400.00"
    assert day["practical_smv_minutes"] == "8640.00"
    assert day["practical_units"] == "691.20"
    assert day["firm_smv_minutes"] == "1250.00"  # 100 pieces x 12.5
    assert day["firm_available_smv_minutes"] == "7390.00"
    assert day["utilization_pct"] == "14.47"
    assert day["status"] == "LOADED"
    assert ln["legacy_value"] == "432000.00"  # 30 machines x 30 operators x 480 x 1 day
    assert ln["corrected_value"] == "8640.00"
    assert ln["difference"] == "423360.00"
    assert "MACHINE_PROFILE_NOT_EVALUATED" in ln["reason_codes"]
    assert any("L = C = 1" in a or "L = 1" in a for a in body["assumptions"])


@pytest.mark.asyncio
async def test_two_shifts_sum_operator_minutes_over_http(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags=FLAGS_ON)
    fx = await seed_basic_factory(db, tenant, shifts=2)  # DAY 06-14 and LATE 14-22, 480 net each
    await add_plan(db, tenant, fx.line, start=MONDAY, end=MONDAY, qty="10", ob=fx.ob, shift=fx.shift)
    await add_plan(db, tenant, fx.line, start=MONDAY, end=MONDAY, qty="10", ob=fx.ob, shift=fx.shift2)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        body = (await c.get(f"{API}/capacity", params=ONE_DAY)).json()
    day = body["lines"][0]["days"][0]
    assert day["theoretical_minutes"] == "28800.00"  # 30 x 480 + 30 x 480
    assert day["practical_smv_minutes"] == "17280.00"
    # The legacy formula averages the two shifts: 30 x 30 x 480 x 1.
    assert body["lines"][0]["legacy_value"] == "432000.00"


@pytest.mark.asyncio
async def test_unknown_with_missing_inputs_over_http(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags=FLAGS_ON)
    await add_settings(db, tenant)
    await add_shift(db, tenant)
    await add_line(db, tenant, "NO-EFF")  # operators yes, no plan row so no efficiency
    await add_line(db, tenant, "NO-OPS", operators=0)  # neither operators nor efficiency
    await db.commit()
    async with client_for(db, tenant, user) as c:
        body = (await c.get(f"{API}/capacity", params=ONE_DAY)).json()
    by_code = {ln["line_code"]: ln for ln in body["lines"]}
    d1 = by_code["NO-EFF"]["days"][0]
    assert d1["status"] == "UNKNOWN" and d1["missing_inputs"] == ["efficiency"]
    assert d1["practical_smv_minutes"] is None and d1["theoretical_minutes"] is None
    d2 = by_code["NO-OPS"]["days"][0]
    assert d2["missing_inputs"] == ["operators", "efficiency"]
    assert by_code["NO-EFF"]["corrected_value"] is None and by_code["NO-EFF"]["difference"] is None
    assert by_code["NO-EFF"]["totals"]["working_days_unknown"] == 1


@pytest.mark.asyncio
async def test_no_active_shift_is_unknown_not_480(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags=FLAGS_ON)
    await add_settings(db, tenant)
    line = await add_line(db, tenant)
    _c, style, ob = await add_style_with_ob(db, tenant)
    await add_plan(db, tenant, line, start=MONDAY, end=MONDAY, qty="10", ob=ob)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        body = (await c.get(f"{API}/capacity", params=ONE_DAY)).json()
    ln = body["lines"][0]
    assert ln["days"][0]["status"] == "UNKNOWN" and ln["days"][0]["missing_inputs"] == ["shift"]
    # The legacy figure still uses its 480 fallback; the corrected one refuses to guess.
    assert ln["legacy_value"] == "432000.00"
    assert ln["corrected_value"] is None


@pytest.mark.asyncio
async def test_assumed_all_active_shifts_reason(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags=FLAGS_ON)
    fx = await seed_basic_factory(db, tenant)
    await add_plan(db, tenant, fx.line, start=MONDAY, end=MONDAY, qty="10", ob=fx.ob)  # row without a shift
    await db.commit()
    async with client_for(db, tenant, user) as c:
        day = (await c.get(f"{API}/capacity", params=ONE_DAY)).json()["lines"][0]["days"][0]
    assert "SHIFT_ASSUMED_ALL_ACTIVE" in day["reason_codes"]
    assert day["theoretical_minutes"] == "14400.00"


@pytest.mark.asyncio
async def test_closed_days_have_zero_capacity(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags=FLAGS_ON)
    fx = await seed_basic_factory(db, tenant)
    await add_plan(db, tenant, fx.line, start=MONDAY, end=date(2030, 3, 11), qty="10", ob=fx.ob, shift=fx.shift)
    await add_holiday(db, tenant, date(2030, 3, 6))  # Wednesday holiday
    await db.commit()
    async with client_for(db, tenant, user) as c:
        body = (await c.get(f"{API}/capacity", params={"date_from": "2030-03-04", "date_to": "2030-03-11"})).json()
    days = {d["date"]: d for d in body["lines"][0]["days"]}
    for closed in ("2030-03-06", "2030-03-09", "2030-03-10"):
        assert days[closed]["status"] == "CLOSED", closed
        assert days[closed]["is_working_day"] is False
        assert days[closed]["practical_smv_minutes"] == "0.00"
        assert days[closed]["reason_codes"] == ["CLOSED_DAY"]
    assert days["2030-03-05"]["practical_smv_minutes"] == "8640.00"
    assert body["lines"][0]["totals"]["closed_days"] == 3


@pytest.mark.asyncio
async def test_legacy_value_reproduces_the_advisory_formula(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags=FLAGS_ON)
    fx = await seed_basic_factory(db, tenant, shifts=2)
    await add_line(db, tenant, "L2", operators=12, machines=0)  # machines 0 -> legacy uses 1
    await add_holiday(db, tenant, date(2030, 3, 6))
    await db.commit()
    advisory = await build_capacity_and_sequencing_advisory(
        db, tenant_id=tenant.id, from_date=MONDAY, to_date=FRIDAY
    )
    legacy = {ln["line_code"]: Decimal(str(ln["rough_capacity_units"])) for ln in advisory["lines"]}
    async with client_for(db, tenant, user) as c:
        body = (await c.get(f"{API}/capacity", params=WEEK)).json()
    mine = {ln["line_code"]: Decimal(ln["legacy_value"]) for ln in body["lines"]}
    assert mine == legacy
    assert body["legacy_working_days"] == advisory["window"]["working_days"] == 4
    assert mine["L1"] == Decimal("30") * 30 * Decimal("480") * 4  # average of 480 and 480, 4 working days


@pytest.mark.asyncio
async def test_corrected_values_only_with_planning_math_v2(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags={"manufacturing_intelligence_v1": True})
    fx = await seed_basic_factory(db, tenant)
    await add_plan(db, tenant, fx.line, start=MONDAY, end=MONDAY, qty="100", ob=fx.ob, shift=fx.shift)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        off = (await c.get(f"{API}/capacity", params=ONE_DAY)).json()
        tenant.feature_flags = {"manufacturing_intelligence_v1": True, "planning_math_v2": True}
        await db.commit()
        on = (await c.get(f"{API}/capacity", params=ONE_DAY)).json()
    ln = off["lines"][0]
    assert off["planning_math_v2"] is False and "planning_math_v2 off" in off["notices"]
    assert ln["legacy_value"] == "432000.00"
    assert ln["corrected_value"] is None and ln["difference"] is None and ln["notice"] == "planning_math_v2 off"
    assert ln["days"][0]["practical_smv_minutes"] is None and ln["days"][0]["practical_units"] is None
    assert ln["days"][0]["firm_smv_minutes"] == "1250.00"  # load facts stay visible
    assert on["planning_math_v2"] is True and on["lines"][0]["corrected_value"] == "8640.00"


@pytest.mark.asyncio
async def test_factory_unit_and_line_filters_and_inactive_lines(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags=FLAGS_ON)
    fx = await seed_basic_factory(db, tenant)
    await add_line(db, tenant, "U2-A", unit="Unit 2")
    await add_line(db, tenant, "OFF", active=False)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        allr = (await c.get(f"{API}/capacity", params=ONE_DAY)).json()
        unit = (await c.get(f"{API}/capacity", params={**ONE_DAY, "factory_unit": "Unit 2"})).json()
        one = (await c.get(f"{API}/capacity", params={**ONE_DAY, "line_id": fx.line.id})).json()
    assert sorted(x["line_code"] for x in allr["lines"]) == ["L1", "U2-A"]  # inactive line never listed
    assert [x["line_code"] for x in unit["lines"]] == ["U2-A"]
    assert [x["line_code"] for x in one["lines"]] == ["L1"]


# ------------------------------------------------------------------ correction round 2


def test_default_operator_shifts_share_one_pool_and_do_not_double_count():
    # Both named shifts overlap and both use the line default (30): one merged pool of 540 minutes.
    shifts = {1: _shift(1), 2: _shift(2, time(8, 0), time(18, 0), 60)}
    rows = [_row(id=1, shift_id=1, operator_count=0), _row(id=2, shift_id=2, operator_count=0)]
    d = _day(shifts_by_id=shifts, line_rows=rows)
    assert d.theoretical_minutes == Decimal("16200.0000")  # 30 x 540, not 30 x (480 + 540)
    assert "SHIFTS_OVERLAP_MERGED" in d.reason_codes and "OPERATORS_FROM_LINE_DEFAULT" in d.reason_codes
    # A shift with an explicit operator count stays its own pool next to the merged default pool.
    rows[1].operator_count = 10
    mixed = _day(shifts_by_id=shifts, line_rows=rows)
    assert mixed.theoretical_minutes == Decimal("19800.0000")  # 30 x 480 (default pool) + 10 x 540
    assert mixed.operators == 40


def test_shift_without_any_operator_source_is_reported():
    shifts = {1: SIX_TO_TWO, 2: TWO_TO_TEN}
    rows = [_row(id=1, shift_id=1, operator_count=20), _row(id=2, shift_id=2, operator_count=0)]
    d = _day(shifts_by_id=shifts, line=_line(ops=0), line_rows=rows)
    assert d.theoretical_minutes == Decimal("9600.0000") and "SHIFT_OPERATORS_MISSING" in d.reason_codes
    none = _day(shifts_by_id=shifts, line=_line(ops=0), line_rows=[_row(id=1, shift_id=1, operator_count=0)])
    assert none.status == "UNKNOWN" and none.missing_inputs == ["operators"]
    assert "SHIFT_OPERATORS_MISSING" in none.reason_codes


def test_pool_minutes_is_computed_once_per_distinct_shift_set(monkeypatch):
    from app.modules.mfg_intelligence import capacity_service as cs

    calls = []
    original = cs._pool_minutes_uncached
    monkeypatch.setattr(cs, "_pool_minutes_uncached", lambda shifts: calls.append(len(shifts)) or original(shifts))
    cs._pool_minutes_cached.cache_clear()
    shifts = {1: _shift(1), 2: _shift(2, time(8, 0), time(18, 0), 60)}
    for offset in range(25):  # many line-days with the same shift set
        day = date(2030, 3, 4 + offset % 5)
        _day(day=day, shifts_by_id=shifts, line_rows=[], history_rows=[_row(id=50)])
        _day(day=day, shifts_by_id=shifts, line_rows=[_row(id=1, shift_id=1), _row(id=2, shift_id=2)])
    assert calls == [2, 1, 1]  # {both}, {shift 1}, {shift 2}: once each, however many days
