"""Pure Bangladesh labour-law calculations (no database).

Run: docker compose exec backend pytest tests/test_hr_bd_calculations.py -q
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from app.modules.hr_localization import bd_calculations as calc
from app.modules.hr_localization import bd_rmg_catalog as cat


def test_overtime_two_times_basic_per_208_hours():
    res = calc.overtime(Decimal("6700"), Decimal("10"))
    assert res.amount == calc.money(Decimal("6700") / 208 * 2 * 10) == Decimal("644.23")
    assert calc.overtime(Decimal("6700"), Decimal("10"), piece_rate=True).amount == 0


def test_increment_example_from_gazette_page_28211():
    assert calc.basic_after_increments(Decimal("6700"), 1) == Decimal("7035.00")
    assert calc.basic_after_increments(Decimal("6700"), 2) == Decimal("7386.75")


def test_maternity_120_calendar_days_across_weekends_and_year_end():
    res = calc.maternity(
        service_start=date(2024, 1, 1),
        expected_delivery=date(2027, 1, 15),
        surviving_children=1,
        monthly_gross=Decimal("12500"),
    )
    assert res.eligible
    assert res.trace["leave_start"] == date(2026, 11, 16)  # 60 days before, crosses year end
    assert res.trace["leave_end"] == date(2027, 3, 15)
    assert res.trace["calendar_days"] == 120 and res.trace["paid_days"] == 120
    assert res.trace["daily_rate"] == Decimal("480.77")  # 12,500 / 26
    assert res.amount == Decimal("57692.40")


def test_maternity_eligibility_service_and_children():
    short = calc.maternity(
        service_start=date(2026, 9, 1), expected_delivery=date(2027, 1, 10), surviving_children=0, monthly_gross=Decimal("12500")
    )
    assert not short.eligible and short.amount == 0
    two = calc.maternity(
        service_start=date(2020, 1, 1), expected_delivery=date(2027, 1, 10), surviving_children=2, monthly_gross=Decimal("12500")
    )
    assert not two.eligible and "s.46(2)" in two.warnings[0]


def test_earned_leave_1_per_18_and_40_day_cap():
    res = calc.earned_leave_accrual(worked_days=270, opening_balance=Decimal("0"), continuous_year_completed=True)
    assert res.trace["accrued_days"] == "15"
    capped = calc.earned_leave_accrual(worked_days=270, opening_balance=Decimal("35"), continuous_year_completed=True)
    assert capped.trace["accrued_days"] == "5" and capped.warnings
    first_year = calc.earned_leave_accrual(worked_days=200, opening_balance=Decimal("0"), continuous_year_completed=False)
    assert not first_year.eligible and first_year.trace["accrued_days"] == "0"


def test_festival_work_one_alternative_day_and_two_days_wages():
    res = calc.festival_work_compensation(Decimal("13000"))
    assert res.trace["alternative_holidays"] == 1
    assert res.amount == calc.money(Decimal("13000") / 26 * 2) == Decimal("1000.00")


@pytest.mark.parametrize(
    "years,days",
    [(2, 7), (3, 7), (4, 15), (9, 15), (10, 30), (12, 30)],
)
def test_resignation_benefit_tiers_2026(years, days):
    res = calc.service_benefit(
        separation_type="RESIGNATION",
        service_start=date(2010, 1, 1),
        separation_date=date(2010 + years, 1, 1),
        monthly_basic=Decimal("9000"),
    )
    assert res.trace["days_per_year"] == days
    assert res.amount == calc.money(Decimal("9000") / 30 * days * years)


def test_gratuity_compared_only_with_scheme_and_45_days_over_10_years():
    rules = cat.default_rules_json() | {"gratuity_scheme_enabled": True}
    res = calc.service_benefit(
        separation_type="RESIGNATION",
        service_start=date(2014, 1, 1),
        separation_date=date(2026, 3, 1),  # 12 years 2 months
        monthly_basic=Decimal("9000"),
        rules=rules,
    )
    assert res.trace["basis"] == "gratuity"
    assert res.amount == calc.money(Decimal("300") * 45 * 12)


@pytest.mark.parametrize(
    ("end", "rate", "counted"),
    [
        (date(2024, 1, 1), 30, 10),  # exactly 10 years: not above 10
        (date(2024, 6, 1), 45, 10),  # 10y5m: above 10 years, 5 months do not count as a year
        (date(2024, 7, 1), 45, 11),  # 10y6m: counted as 11 years at the 45-day rate
        (date(2024, 8, 1), 45, 11),  # 10y7m
        (date(2025, 1, 1), 45, 11),  # 11y
    ],
)
def test_gratuity_rate_boundary_around_ten_years(end, rate, counted):
    rules = cat.default_rules_json() | {"gratuity_scheme_enabled": True}
    res = calc.service_benefit(
        separation_type="RESIGNATION", service_start=date(2014, 1, 1), separation_date=end,
        monthly_basic=Decimal("9000"), rules=rules,
    )
    assert res.trace["gratuity_rate_over_10y"] is (rate == 45)
    assert Decimal(str(res.trace["gratuity"])) == calc.money(Decimal("300") * rate * counted)


def test_termination_dismissal_death_and_temporary():
    common = dict(service_start=date(2020, 1, 1), separation_date=date(2025, 8, 1), monthly_basic=Decimal("7400"))
    assert calc.service_benefit(separation_type="TERMINATION", **common).trace["days_per_year"] == 30
    assert calc.service_benefit(separation_type="DISMISSAL", **common).trace["days_per_year"] == 15
    none = calc.service_benefit(separation_type="DISMISSAL", misconduct_no_compensation=True, **common)
    assert none.amount == 0 and none.warnings
    death = calc.service_benefit(separation_type="DEATH", death_at_work=True, **common)
    assert death.trace["days_per_year"] == 45 and death.trace["counted_years"] == 6  # 5 y 7 m rounds up
    temp = calc.service_benefit(separation_type="RESIGNATION", permanent=False, **common)
    assert temp.amount == 0


def test_notice_days_and_pay():
    assert calc.notice_days("RESIGNATION", permanent=True, monthly_rated=True) == 60
    assert calc.notice_days("RESIGNATION", permanent=False, monthly_rated=False) == 14
    assert calc.notice_days("TERMINATION", permanent=True, monthly_rated=True) == 120
    assert calc.notice_pay(10, Decimal("9000")) == Decimal("3000.00")


def test_absence_timeline_s27_3a():
    tl = calc.absence_timeline(date(2026, 10, 1), date(2026, 10, 11), date(2026, 10, 21))
    assert tl["explain_notice_valid"] is True
    assert tl["explain_deadline"] == date(2026, 10, 21)
    assert tl["defence_notice_valid"] is True and tl["defence_deadline"] == date(2026, 10, 28)
    assert calc.absence_timeline(date(2026, 10, 1), date(2026, 10, 9))["explain_notice_valid"] is False
