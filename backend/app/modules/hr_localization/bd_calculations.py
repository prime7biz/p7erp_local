"""Pure Bangladesh labour-law calculations (no database access).

Every function takes a ``rules`` dict (an approved rule set's ``rules_json`` or the catalog default)
and returns plain values plus a ``trace`` that names the section used. Money is Decimal, rounded
half-up to 2 places at the end of each calculation.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import ROUND_FLOOR, ROUND_HALF_UP, Decimal
from typing import Any

from app.modules.hr_localization import bd_rmg_catalog as cat

TWO = Decimal("0.01")


def money(value: Decimal | int | str) -> Decimal:
    return Decimal(str(value)).quantize(TWO, rounding=ROUND_HALF_UP)


def rule(rules: dict[str, Any] | None, key: str) -> Any:
    if rules and key in rules:
        return rules[key]
    try:
        return cat.legal_rule(key)
    except KeyError:
        return cat.config_default(key)


def add_months(d: date, months: int) -> date:
    y, m = divmod(d.month - 1 + months, 12)
    year, month = d.year + y, m + 1
    for day in (d.day, 30, 29, 28):
        try:
            return date(year, month, day)
        except ValueError:
            continue
    raise ValueError("invalid date")


def service_span(start: date, end: date) -> tuple[int, int, int]:
    """(completed years, extra completed months, extra days) between start and end inclusive of start."""
    years = end.year - start.year
    if add_months(start, 12 * years) > end:
        years -= 1
    anchor = add_months(start, 12 * years)
    months = 0
    while add_months(anchor, months + 1) <= end:
        months += 1
    days = (end - add_months(anchor, months)).days
    return years, months, days


@dataclass
class Result:
    amount: Decimal = Decimal("0.00")
    eligible: bool = True
    trace: dict[str, Any] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "amount": str(self.amount),
            "eligible": self.eligible,
            "trace": {k: (str(v) if isinstance(v, (Decimal, date)) else v) for k, v in self.trace.items()},
            "warnings": self.warnings,
        }


# --- Overtime (s.108) ---------------------------------------------------------------------------


def overtime(monthly_basic: Decimal, ot_hours: Decimal, rules: dict | None = None, *, piece_rate: bool = False) -> Result:
    hours_per_month = Decimal(str(rule(rules, "ot_hours_per_month")))
    multiplier = Decimal(str(rule(rules, "ot_multiplier_of_basic")))
    if piece_rate:
        return Result(Decimal("0.00"), False, {"section": "s.108(2)"}, ["Piece-rate workers: s.108(1) does not apply"])
    hourly = Decimal(monthly_basic) / hours_per_month
    amount = money(hourly * multiplier * Decimal(ot_hours))
    return Result(amount, True, {"section": "s.108(1)", "hourly_basic": money(hourly), "multiplier": multiplier, "hours": ot_hours})


# --- Annual increment (Gazette conditions 3 and 14) -----------------------------------------------


def basic_after_increments(start_basic: Decimal, completed_years: int) -> Decimal:
    pct = cat.ANNUAL_INCREMENT_PCT_OF_BASIC / Decimal("100")
    value = Decimal(start_basic)
    for _ in range(max(0, completed_years)):
        value = value * (1 + pct)
    return money(value)


# --- Maternity (s.45-48) --------------------------------------------------------------------------


def maternity(
    *,
    service_start: date,
    expected_delivery: date,
    surviving_children: int,
    monthly_gross: Decimal,
    actual_delivery: date | None = None,
    rules: dict | None = None,
) -> Result:
    before = int(rule(rules, "maternity_days_before"))
    after = int(rule(rules, "maternity_days_after"))
    total = int(rule(rules, "maternity_total_days"))
    divisor = Decimal(str(rule(rules, "maternity_daily_wage_divisor")))
    min_months = int(rule(rules, "maternity_min_service_months"))
    child_cap = int(rule(rules, "maternity_ineligible_surviving_children"))

    delivery = actual_delivery or expected_delivery
    leave_start = expected_delivery - timedelta(days=before)
    leave_end = delivery + timedelta(days=after - 1)
    calendar_days = (leave_end - leave_start).days + 1
    warnings: list[str] = []
    eligible = True
    if add_months(service_start, min_months) > delivery:
        eligible = False
        warnings.append(f"Less than {min_months} months' service before delivery (s.46(1) proviso)")
    if surviving_children >= child_cap:
        eligible = False
        warnings.append(f"{surviving_children} surviving children at delivery: benefit not payable; other leave allowed (s.46(2))")
    daily = money(Decimal(monthly_gross) / divisor)
    paid_days = min(total, calendar_days) if eligible else 0
    amount = money(daily * paid_days) if eligible else Decimal("0.00")
    return Result(
        amount,
        eligible,
        {
            "section": "s.46-48 (Act 43/2026)",
            "leave_start": leave_start,
            "leave_end": leave_end,
            "calendar_days": calendar_days,
            "paid_days": paid_days,
            "daily_rate": daily,
            "divisor": divisor,
        },
        warnings,
    )


# --- Earned leave (s.117) -------------------------------------------------------------------------


def earned_leave_accrual(
    *, worked_days: int, opening_balance: Decimal, continuous_year_completed: bool, rules: dict | None = None
) -> Result:
    per = Decimal(str(rule(rules, "earned_leave_worked_days_per_day")))
    cap = Decimal(str(rule(rules, "earned_leave_carry_cap_days")))
    if not continuous_year_completed:
        return Result(Decimal("0.00"), False, {"section": "s.117(1)", "accrued_days": "0"}, ["Earned leave starts after one year of continuous service"])
    raw = (Decimal(worked_days) / per).to_integral_value(rounding=ROUND_FLOOR)
    room = max(Decimal("0"), cap - Decimal(opening_balance))
    accrued = min(raw, room)
    warnings = [] if accrued == raw else [f"Balance reached the {cap}-day cap (s.117(5)); {raw - accrued} day(s) not accrued"]
    return Result(
        Decimal("0.00"),
        True,
        {"section": "s.117(1)(a),(5)(a)", "worked_days": worked_days, "accrued_days": str(accrued), "cap": str(cap)},
        warnings,
    )


def leave_daily_wage(monthly_gross_excl_ot_bonus: Decimal, rules: dict | None = None) -> Decimal:
    return money(Decimal(monthly_gross_excl_ot_bonus) / Decimal(str(rule(rules, "leave_wage_daily_divisor"))))


def leave_encashment(days: Decimal, monthly_gross_excl_ot_bonus: Decimal, rules: dict | None = None) -> Result:
    daily = leave_daily_wage(monthly_gross_excl_ot_bonus, rules)
    return Result(money(daily * Decimal(days)), True, {"section": "s.11, s.119(1)", "days": str(days), "daily_wage": daily})


# --- Festival holiday work (s.118(3)) -------------------------------------------------------------


def festival_work_compensation(monthly_gross_excl_ot_bonus: Decimal, rules: dict | None = None) -> Result:
    daily = leave_daily_wage(monthly_gross_excl_ot_bonus, rules)
    wage_days = Decimal(str(rule(rules, "festival_work_compensatory_wage_days")))
    alt_days = int(rule(rules, "festival_work_alternative_days"))
    return Result(
        money(daily * wage_days),
        True,
        {"section": "s.118(3)", "alternative_holidays": alt_days, "compensatory_wage_days": str(wage_days), "daily_wage": daily},
    )


# --- Service benefits (s.19, 20, 23, 26, 27, 28) --------------------------------------------------

SEPARATION_TYPES = ("RESIGNATION", "DEEMED_RESIGNATION", "TERMINATION", "RETRENCHMENT", "DISMISSAL", "RETIREMENT", "DEATH")


def _resignation_days(years: int, rules: dict | None) -> int:
    tiers = rule(rules, "resignation_benefit_days_by_service")
    for tier in tiers:
        if "max_years" in tier and years <= tier["max_years"]:
            return int(tier["days"])
        if "max_years_exclusive" in tier and years < tier["max_years_exclusive"]:
            return int(tier["days"])
        if "min_years" in tier and years >= tier["min_years"]:
            return int(tier["days"])
    return 0


def gratuity(years_for_gratuity: int, over_ten_years: bool, daily_basic: Decimal, rules: dict | None = None) -> Decimal:
    """s.2(10): 30 days' wages per counted year, or 45 days when service is above 10 years."""
    per_year = int(rule(rules, "gratuity_days_per_year_over_10y" if over_ten_years else "gratuity_days_per_year"))
    return money(daily_basic * per_year * years_for_gratuity)


def service_benefit(
    *,
    separation_type: str,
    service_start: date,
    separation_date: date,
    monthly_basic: Decimal,
    permanent: bool = True,
    death_at_work: bool = False,
    misconduct_no_compensation: bool = False,
    rules: dict | None = None,
) -> Result:
    if separation_type not in SEPARATION_TYPES:
        raise ValueError(f"Unknown separation type {separation_type}")
    years, months, days = service_span(service_start, separation_date)
    # Gratuity and death benefit count service beyond six months as a further year.
    years_rounded = years + (1 if months >= 6 else 0)
    over_ten_years = years > 10 or (years == 10 and (months > 0 or days > 0))
    daily = money(Decimal(monthly_basic) / Decimal(str(rule(rules, "benefit_daily_divisor"))))
    scheme = bool(rule(rules, "gratuity_scheme_enabled"))
    grat = gratuity(years_rounded, over_ten_years, daily, rules) if scheme else Decimal("0.00")
    trace: dict[str, Any] = {
        "completed_years": years,
        "extra_months": months,
        "daily_basic": daily,
        "wage_basis": "last monthly basic (s.14(3))",
        "gratuity": grat,
        "gratuity_rate_over_10y": over_ten_years,
        "gratuity_scheme_enabled": scheme,
    }
    warnings: list[str] = []
    days_per_year, counted_years, section = 0, years, ""

    if separation_type in ("RESIGNATION", "DEEMED_RESIGNATION"):
        section = "s.27(4) (Act 43/2026)"
        if not permanent:
            warnings.append("s.27(4) compensation applies to permanent workers only")
        else:
            days_per_year = _resignation_days(years, rules)
        if separation_type == "DEEMED_RESIGNATION":
            warnings.append("Deemed resignation under s.27(3A); confirm the benefit treatment with your labour counsel")
    elif separation_type in ("TERMINATION", "RETIREMENT"):
        section = "s.26(4)" if separation_type == "TERMINATION" else "s.28(3) via s.26(4)"
        days_per_year = int(rule(rules, "termination_benefit_days_per_year")) if permanent else 0
    elif separation_type == "RETRENCHMENT":
        section = "s.20(2)(c)"
        days_per_year = int(rule(rules, "retrenchment_benefit_days_per_year")) if years >= 1 else 0
    elif separation_type == "DISMISSAL":
        section = "s.23(3)"
        if misconduct_no_compensation:
            warnings.append("Dismissed for s.23(4)(b) or (g) misconduct: no compensation; other legal dues still payable")
        elif years >= 1:
            days_per_year = int(rule(rules, "dismissal_benefit_days_per_year"))
    elif separation_type == "DEATH":
        section = "s.19 (Act 43/2026)"
        counted_years = years_rounded
        if years >= 1:
            key = "death_benefit_days_per_year_at_work" if death_at_work else "death_benefit_days_per_year"
            days_per_year = int(rule(rules, key))
        else:
            warnings.append("s.19 death benefit requires more than one year of continuous service")

    statutory = money(daily * days_per_year * counted_years)
    use_gratuity = separation_type != "DISMISSAL" and grat > statutory
    amount = grat if use_gratuity else statutory
    trace.update(
        {"section": section, "days_per_year": days_per_year, "counted_years": counted_years, "statutory": statutory, "basis": "gratuity" if use_gratuity else "statutory"}
    )
    return Result(amount, amount > 0, trace, warnings)


def notice_days(separation_type: str, *, permanent: bool, monthly_rated: bool, rules: dict | None = None) -> int:
    if separation_type == "RESIGNATION":
        if permanent:
            return int(rule(rules, "resignation_notice_days_permanent"))
        return int(rule(rules, "resignation_notice_days_temporary_monthly" if monthly_rated else "resignation_notice_days_temporary_other"))
    if separation_type == "TERMINATION" and permanent:
        return int(rule(rules, "termination_notice_days_permanent_monthly" if monthly_rated else "termination_notice_days_permanent_other"))
    return 0


def notice_pay(days_short: int, monthly_basic: Decimal, rules: dict | None = None) -> Decimal:
    daily = Decimal(monthly_basic) / Decimal(str(rule(rules, "benefit_daily_divisor")))
    return money(daily * max(0, days_short))


# --- Unauthorized absence (s.27(3A)) --------------------------------------------------------------


def absence_timeline(first_absent_day: date, explain_notice_issued: date, defence_notice_issued: date | None = None, rules: dict | None = None) -> dict[str, Any]:
    trigger = int(rule(rules, "absence_trigger_days"))
    explain = int(rule(rules, "absence_explain_notice_days"))
    defence = int(rule(rules, "absence_defence_days"))
    earliest_explain_notice = first_absent_day + timedelta(days=trigger)
    out: dict[str, Any] = {
        "section": "s.27(3A)",
        "earliest_explain_notice": earliest_explain_notice,
        "explain_deadline": explain_notice_issued + timedelta(days=explain),
        "explain_notice_valid": explain_notice_issued >= earliest_explain_notice,
    }
    if defence_notice_issued is not None:
        out["defence_notice_valid"] = defence_notice_issued >= out["explain_deadline"]
        out["defence_deadline"] = defence_notice_issued + timedelta(days=defence)
        out["deemed_resignation_effective"] = first_absent_day
    return out
