"""Bangladesh salary income tax (TDS, Income Tax Act 2023 s.86) - pure calculation, no database.

Everything here is ``Decimal`` only. The schedule below is keyed by the INCOME YEAR (1 July to 30 June) in
which the salary is earned, with the ASSESSMENT YEAR it belongs to. A year that is not listed fails
closed (``UnsupportedTaxYear``): never guess a schedule.

LEGAL GATE: these numbers come from the NBR circular for 2026-27 (see
docs/hr-compliance/BD_RMG_SOURCE_MANIFEST_2026.md). The company switch ``hr_bd_salary_tds_enabled``
can only be turned on when ``data/bd_salary_tds_approval.json`` is signed (status PASS) for exactly
this schedule (``SCHEDULE_VERSION`` + ``schedule_checksum()``). Estimates in the UI are informational.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

TAX_QUANT = Decimal("0.01")
ZERO = Decimal("0")

SCHEDULE_VERSION = "BD-SALARY-TDS-2026-27-v1"

CATEGORIES = ("GENERAL", "FEMALE", "SENIOR_65", "DISABLED", "THIRD_GENDER", "FREEDOM_FIGHTER")
CATEGORY_LABELS = {
    "GENERAL": "General taxpayer",
    "FEMALE": "Female taxpayer",
    "SENIOR_65": "Senior citizen (65+)",
    "DISABLED": "Person with disability",
    "THIRD_GENDER": "Third gender",
    "FREEDOM_FIGHTER": "Gazetted war-wounded freedom fighter / July fighter",
}
# Categories that need a payroll-authorized override with an evidence reference.
EVIDENCE_CATEGORIES = ("DISABLED", "THIRD_GENDER", "FREEDOM_FIGHTER")


class UnsupportedTaxYear(ValueError):
    """No signed-off tax schedule exists for this income year."""


@dataclass(frozen=True)
class Schedule:
    income_year_start: int
    assessment_year: str
    thresholds: dict[str, Decimal]
    disabled_child_addition: Decimal
    slabs: tuple[tuple[Decimal | None, Decimal], ...]  # (slab width, rate); None = remainder
    exemption_fraction_divisor: Decimal
    exemption_cap: Decimal
    minimum_tax: Decimal
    minimum_tax_first_time: Decimal
    rebate_rate_of_taxable: Decimal
    rebate_rate_of_investment: Decimal
    rebate_cap: Decimal
    senior_age: int


SCHEDULES: dict[int, Schedule] = {
    2026: Schedule(
        income_year_start=2026,
        assessment_year="2027-2028",
        thresholds={
            "GENERAL": Decimal("400000"),
            "FEMALE": Decimal("450000"),
            "SENIOR_65": Decimal("450000"),
            "DISABLED": Decimal("525000"),
            "THIRD_GENDER": Decimal("525000"),
            "FREEDOM_FIGHTER": Decimal("550000"),
        },
        disabled_child_addition=Decimal("50000"),
        slabs=(
            (Decimal("300000"), Decimal("0.10")),
            (Decimal("400000"), Decimal("0.15")),
            (Decimal("500000"), Decimal("0.20")),
            (Decimal("2000000"), Decimal("0.25")),
            (None, Decimal("0.30")),
        ),
        exemption_fraction_divisor=Decimal("3"),
        exemption_cap=Decimal("500000"),
        minimum_tax=Decimal("5000"),
        minimum_tax_first_time=Decimal("1000"),
        rebate_rate_of_taxable=Decimal("0.03"),
        rebate_rate_of_investment=Decimal("0.10"),
        rebate_cap=Decimal("750000"),
        senior_age=65,
    ),
}


def schedule_checksum() -> str:
    """Stable fingerprint of every number above; the signed approval record must carry the same value."""
    data: list[Any] = []
    for key in sorted(SCHEDULES):
        s = SCHEDULES[key]
        data.append(
            {
                "iy": s.income_year_start,
                "ay": s.assessment_year,
                "thresholds": {k: str(v) for k, v in sorted(s.thresholds.items())},
                "child": str(s.disabled_child_addition),
                "slabs": [[None if w is None else str(w), str(r)] for w, r in s.slabs],
                "ex": [str(s.exemption_fraction_divisor), str(s.exemption_cap)],
                "min": [str(s.minimum_tax), str(s.minimum_tax_first_time)],
                "rebate": [str(s.rebate_rate_of_taxable), str(s.rebate_rate_of_investment), str(s.rebate_cap)],
                "age": s.senior_age,
            }
        )
    raw = json.dumps({"version": SCHEDULE_VERSION, "schedules": data}, sort_keys=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


# Settlement earnings (salary, overtime, allowances, leave encashment, service benefit, notice pay) need a
# source-backed taxable/exempt classification before final-settlement TDS can run. None = not approved yet.
SETTLEMENT_CLASSIFICATION_VERSION: str | None = None


def money(value: Decimal) -> Decimal:
    return value.quantize(TAX_QUANT, rounding=ROUND_HALF_UP)


def _dec(value: Any, default: Decimal = ZERO) -> Decimal:
    if value is None or value == "":
        return default
    try:
        return Decimal(str(value))
    except Exception:  # noqa: BLE001
        return default


# --- Income year -----------------------------------------------------------------------------------


def income_year_start_year(as_of: date) -> int:
    return as_of.year if as_of.month >= 7 else as_of.year - 1


def income_year_window(as_of: date) -> tuple[date, date, str]:
    """(1 July, 30 June, assessment-year label) of the income year that contains ``as_of``."""
    start_year = income_year_start_year(as_of)
    assessment = f"{start_year + 1}-{start_year + 2}"
    return date(start_year, 7, 1), date(start_year + 1, 6, 30), assessment


def get_schedule(as_of: date) -> Schedule:
    start_year = income_year_start_year(as_of)
    schedule = SCHEDULES.get(start_year)
    if schedule is None:
        raise UnsupportedTaxYear(
            f"No approved Bangladesh salary tax schedule for the income year starting 1 July {start_year}"
        )
    return schedule


def remaining_months_after(period_end: date, employed_to: date | None, income_year_end: date) -> int:
    """Whole calendar months after ``period_end``'s month that fall in the income year while employed."""
    last = income_year_end if employed_to is None else min(employed_to, income_year_end)
    months = (last.year * 12 + last.month) - (period_end.year * 12 + period_end.month)
    return max(months, 0)


# --- Category --------------------------------------------------------------------------------------


def _is_female(gender: str | None) -> bool:
    return (gender or "").strip().lower() in {"female", "f", "woman", "মহিলা", "নারী"}


def _is_known_gender(gender: str | None) -> bool:
    return (gender or "").strip().lower() in {"female", "f", "male", "m", "woman", "man", "মহিলা", "নারী", "পুরুষ"}


def age_on(date_of_birth: date, on: date) -> int:
    years = on.year - date_of_birth.year
    if (on.month, on.day) < (date_of_birth.month, date_of_birth.day):
        years -= 1
    return years


def resolve_taxpayer_category(
    gender: str | None,
    date_of_birth: date | None,
    income_year_end: date,
    override: str | None,
    schedule: Schedule,
) -> tuple[str, list[str]]:
    """Return (category, warnings). Unknown gender / missing birth date use the GENERAL threshold and warn.

    Age is measured on the last day of the income year (30 June).
    """
    warnings: list[str] = []
    chosen = (override or "AUTO").strip().upper()
    if chosen != "AUTO":
        if chosen not in CATEGORIES:
            raise ValueError(f"Unknown tax category {chosen}")
        return chosen, warnings
    if not _is_known_gender(gender):
        warnings.append("Gender is missing or not recognised: the general tax-free limit is used")
    if date_of_birth is None:
        warnings.append("Date of birth is missing: senior-citizen (65+) status cannot be checked")
    if _is_female(gender):
        return "FEMALE", warnings
    if date_of_birth is not None and age_on(date_of_birth, income_year_end) >= schedule.senior_age:
        return "SENIOR_65", warnings
    return "GENERAL", warnings


# --- Annual tax ------------------------------------------------------------------------------------


def calculate_annual_salary_tax(
    *,
    annual_gross: Decimal,
    schedule: Schedule,
    category: str,
    disabled_children: int = 0,
    rebate_mode: str = "NONE",
    declared_investment: Decimal | None = None,
    first_time_taxpayer: bool = False,
) -> dict[str, Any]:
    """Annual tax on salary income for one income year (all amounts ``Decimal`` in the result)."""
    gross = max(_dec(annual_gross), ZERO)
    exempt = min(gross / schedule.exemption_fraction_divisor, schedule.exemption_cap)
    taxable = max(gross - exempt, ZERO)
    base_threshold = schedule.thresholds[category]
    child_add = schedule.disabled_child_addition * max(int(disabled_children or 0), 0)
    threshold = base_threshold + child_add

    slab_rows: list[dict[str, Any]] = []
    slab_tax = ZERO
    remaining = max(taxable - threshold, ZERO)
    for width, rate in schedule.slabs:
        if remaining <= 0:
            break
        part = remaining if width is None else min(remaining, width)
        tax_part = part * rate
        slab_rows.append({"amount": part, "rate": rate, "tax": tax_part})
        slab_tax += tax_part
        remaining -= part
    slab_tax = money(slab_tax)

    rebate = ZERO
    mode = (rebate_mode or "NONE").upper()
    investment = _dec(declared_investment)
    if mode == "DECLARED_INVESTMENT" and investment > 0 and slab_tax > 0:
        rebate = min(
            taxable * schedule.rebate_rate_of_taxable,
            investment * schedule.rebate_rate_of_investment,
            schedule.rebate_cap,
        )
        rebate = min(money(rebate), slab_tax)

    after_rebate = slab_tax - rebate
    minimum = schedule.minimum_tax_first_time if first_time_taxpayer else schedule.minimum_tax
    minimum_applied = False
    net_tax = after_rebate
    if taxable > threshold and after_rebate < minimum:
        net_tax = minimum
        minimum_applied = True
    net_tax = money(net_tax)

    return {
        "schedule_version": SCHEDULE_VERSION,
        "income_year_start": schedule.income_year_start,
        "assessment_year": schedule.assessment_year,
        "category": category,
        "category_label": CATEGORY_LABELS[category],
        "base_threshold": base_threshold,
        "disabled_child_allowance": child_add,
        "threshold": threshold,
        "annual_gross": money(gross),
        "exempt_income": money(exempt),
        "taxable_income": money(taxable),
        "slab_breakdown": slab_rows,
        "slab_tax": slab_tax,
        "rebate_mode": mode,
        "investment_rebate": rebate,
        "minimum_tax": minimum,
        "minimum_tax_applied": minimum_applied,
        "net_annual_tax": net_tax,
    }


def estimate_monthly_tds(
    *,
    monthly_gross: Decimal,
    as_of: date,
    gender: str | None,
    date_of_birth: date | None,
    category_override: str | None = None,
    disabled_children: int = 0,
    rebate_mode: str = "NONE",
    declared_investment: Decimal | None = None,
    first_time_taxpayer: bool = False,
) -> dict[str, Any]:
    """Salary-only estimate: 12 x recurring monthly pay, spread evenly. Bonuses / overtime / YTD are ignored."""
    schedule = get_schedule(as_of)
    _start, end, _ay = income_year_window(as_of)
    category, warnings = resolve_taxpayer_category(gender, date_of_birth, end, category_override, schedule)
    annual = calculate_annual_salary_tax(
        annual_gross=_dec(monthly_gross) * 12,
        schedule=schedule,
        category=category,
        disabled_children=disabled_children,
        rebate_mode=rebate_mode,
        declared_investment=declared_investment,
        first_time_taxpayer=first_time_taxpayer,
    )
    annual["monthly_tds"] = money(annual["net_annual_tax"] / 12)
    annual["estimate_basis"] = "SALARY_ONLY"
    annual["warnings"] = warnings
    return annual


# --- Payroll period installment --------------------------------------------------------------------


def payroll_installment(
    *,
    ytd_gross: Decimal,
    prior_tds: Decimal,
    current_gross: Decimal,
    recurring_monthly: Decimal,
    remaining_months: int,
    schedule: Schedule,
    category: str,
    disabled_children: int = 0,
    rebate_mode: str = "NONE",
    declared_investment: Decimal | None = None,
    first_time_taxpayer: bool = False,
    fixed_override: Decimal | None = None,
) -> dict[str, Any]:
    """TDS to deduct in the current payroll period.

    projected annual gross = ytd_gross + current_gross + remaining_months x recurring_monthly
    remaining liability    = max(annual tax - prior_tds, 0); over-withheld = max(prior_tds - annual tax, 0)
    ordinary period        = ROUND_HALF_UP(remaining liability / (1 + remaining_months)), or the fixed
                             override capped at the remaining liability
    final period (June or last employed month) = the exact residual (override ignored)
    """
    remaining_months = max(int(remaining_months), 0)
    projected = _dec(ytd_gross) + _dec(current_gross) + _dec(recurring_monthly) * remaining_months
    annual = calculate_annual_salary_tax(
        annual_gross=projected,
        schedule=schedule,
        category=category,
        disabled_children=disabled_children,
        rebate_mode=rebate_mode,
        declared_investment=declared_investment,
        first_time_taxpayer=first_time_taxpayer,
    )
    annual_tax = annual["net_annual_tax"]
    prior = max(_dec(prior_tds), ZERO)
    remaining_liability = max(annual_tax - prior, ZERO)
    over_withheld = max(prior - annual_tax, ZERO)
    is_final = remaining_months == 0
    periods = 1 + remaining_months
    override = None if fixed_override is None else max(_dec(fixed_override), ZERO)

    if is_final:
        deduction = remaining_liability
        method = "FINAL_RESIDUAL"
    elif override is not None:
        deduction = min(override, remaining_liability)
        method = "FIXED_OVERRIDE"
    else:
        deduction = min(money(remaining_liability / periods), remaining_liability)
        method = "EVEN_SPREAD"
    deduction = money(deduction)

    return {
        **annual,
        "projected_annual_gross": money(projected),
        "ytd_gross": money(_dec(ytd_gross)),
        "current_gross": money(_dec(current_gross)),
        "recurring_monthly": money(_dec(recurring_monthly)),
        "remaining_months": remaining_months,
        "prior_tds": money(prior),
        "remaining_liability": money(remaining_liability),
        "over_withheld": money(over_withheld),
        "fixed_override": None if override is None else money(override),
        "method": method,
        "is_final_period": is_final,
        "monthly_tds": deduction,
    }


def jsonable(value: Any) -> Any:
    """Convert Decimals (to 2-decimal / plain strings) so a result can go into JSON traces and responses."""
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, dict):
        return {k: jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [jsonable(v) for v in value]
    return value
