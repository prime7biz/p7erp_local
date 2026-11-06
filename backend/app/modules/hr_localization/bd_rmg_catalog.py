"""Official Bangladesh RMG source manifest (machine-readable).

Every number here was transcribed from an official source listed in
``docs/hr-compliance/BD_RMG_SOURCE_MANIFEST_2026.md``. Do not edit a value without updating that
manifest and its reviewer sign-off. A new Gazette or Act amendment is added as a new catalog
version; a previously effective version is never rewritten.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

CATALOG_VERSION = "BD-RMG-2026.1"

WAGE_GAZETTE = {
    "title": "Garments sector minimum wage (Bangladesh Gazette, Extraordinary)",
    "notification_no": "40.00.0000.016.32.021.13.30",
    "notification_date": "2023-12-18",
    "published": "2023-12-20",
    "effective_from": "2023-12-01",
    "gazette_pages": "28201-28211",
    "url": "https://www.dpp.gov.bd/upload_file/gazettes/51593_44441.pdf",
    "pdf_sha256": "5CE08DA8E846D3EABD1D93318D91B47BA05DFC51A1A3CBDAF9990957C77012FD",
    "retrieved": "2026-11-07",
}

LABOUR_ACT = {
    "title": "Bangladesh Labour Act 2006 (Act 42 of 2006) as amended by Act 43 of 2026",
    "amendment": "Bangladesh Labour (Amendment) Act 2026, Act 43 of 2026, 10 April 2026",
    "url": "https://bdlaws.minlaw.gov.bd/act-952.html",
    "retrieved": "2026-11-07",
}

PRIVACY_ACT = {
    "title": "Personal Data Protection Act 2026 (Act 63 of 2026), 10 April 2026",
    "url": "https://bdlaws.minlaw.gov.bd/act-1692.html",
    "retrieved": "2026-11-07",
}

WAGE_EFFECTIVE_FROM = date(2023, 12, 1)

# Fixed allowances, identical in every schedule row (Gazette Schedule Ka and Kha).
MEDICAL = Decimal("750")
TRANSPORT = Decimal("450")
FOOD = Decimal("1250")
HOUSE_RENT_PCT_OF_BASIC = Decimal("50")
ANNUAL_INCREMENT_PCT_OF_BASIC = Decimal("5")


@dataclass(frozen=True)
class WageRate:
    rate_code: str
    schedule_class: str  # WORKER | EMPLOYEE
    employment_stage: str  # REGULAR | APPRENTICE
    grade_code: str | None
    basic: Decimal
    house_rent: Decimal
    gross: Decimal
    source_page: str
    apprentice_months: int | None = None
    designations: tuple[str, ...] = field(default_factory=tuple)

    @property
    def medical(self) -> Decimal:
        return MEDICAL

    @property
    def transport(self) -> Decimal:
        return TRANSPORT

    @property
    def food(self) -> Decimal:
        return FOOD

    def component_sum(self) -> Decimal:
        return self.basic + self.house_rent + MEDICAL + TRANSPORT + FOOD


WAGE_RATES: tuple[WageRate, ...] = (
    WageRate(
        "W-G1", "WORKER", "REGULAR", "1", Decimal("8390"), Decimal("4195"), Decimal("15035"), "28201-28202",
        designations=(
            "Senior Operator (all machines)", "Senior Cutter", "Senior Quality Inspector",
            "Senior Marker / Senior Drawingman", "Senior Screen Exposer", "Senior Ironman",
            "Senior Sampleman / Sample Machinist", "Junior Mechanic", "Junior Electrician", "Senior Line Leader",
        ),
    ),
    WageRate(
        "W-G2", "WORKER", "REGULAR", "2", Decimal("7882"), Decimal("3941"), Decimal("14273"), "28202-28203",
        designations=(
            "Operator (all machines)", "Cutterman / Needleman / Scissorman", "Quality Inspector",
            "Marker / Drawingman", "Issueman / Inputman", "Bundle Man / Numbering Man",
            "Auto Spreader / Lay-man", "Polyman / Packingman / Foldingman", "Tagman / Spotman / Receiveman",
            "Printer / Painter / Dyerman", "Screen Exposer", "Ironman / Pressingman",
            "Welder / Fitter / Plumber", "Sampleman", "Distributor", "General Mechanic",
            "General Electrician", "Line Leader",
        ),
    ),
    WageRate(
        "W-G3", "WORKER", "REGULAR", "3", Decimal("7400"), Decimal("3700"), Decimal("13550"), "28203-28204",
        designations=(
            "Junior Operator (all machines)", "Junior Cutterman / Needleman / Scissorman",
            "Junior Quality Inspector", "Junior Marker / Drawingman", "Junior Issueman / Inputman",
            "Junior Bundle Man / Numbering Man", "Junior Auto Spreader / Lay-man",
            "Junior Polyman / Packingman / Foldingman", "Junior Tagman / Spotman / Receiveman",
            "Junior Printer / Painter / Dyerman", "Junior Screen Exposer", "Junior Ironman / Pressingman",
            "Junior Welder / Fitter / Plumber", "Junior Sampleman", "Junior Distributor",
            "Assistant Mechanic", "Assistant Electrician",
        ),
    ),
    WageRate(
        "W-G4", "WORKER", "REGULAR", "4", Decimal("6700"), Decimal("3350"), Decimal("12500"), "28204-28205",
        designations=(
            "Assistant Operator (all machines)", "Assistant Cutterman / Needleman / Scissorman",
            "Assistant Quality Inspector", "Assistant Marker / Drawingman", "Assistant Issueman / Inputman",
            "Assistant Bundle Man / Numbering Man", "Assistant Auto Spreader / Lay-man",
            "Assistant Polyman / Packingman / Foldingman", "Assistant Tagman / Spotman / Receiveman",
            "Assistant Printer / Painter / Dyerman", "Assistant Screen Exposer",
            "Assistant Welder / Fitter / Plumber", "Assistant Sampleman", "Assistant Distributor",
            "Finishing Assistant", "Thread Trimming Assistant", "Line Ironman",
        ),
    ),
    WageRate(
        "W-APP", "WORKER", "APPRENTICE", None, Decimal("4950"), Decimal("2475"), Decimal("9875"), "28205",
        apprentice_months=3, designations=("Apprentice Worker",),
    ),
    WageRate(
        "E-G1", "EMPLOYEE", "REGULAR", "1", Decimal("10900"), Decimal("5450"), Decimal("18800"), "28206",
        designations=("Store Keeper", "Senior Assistant", "Senior Fireman"),
    ),
    WageRate(
        "E-G2", "EMPLOYEE", "REGULAR", "2", Decimal("9000"), Decimal("4500"), Decimal("15950"), "28206",
        designations=(
            "Accounts Assistant", "Store Assistant", "Cashier", "Nurse / Medical Assistant",
            "Computer Operator", "Driver (heavy licence)", "Import / Export Assistant", "Fireman",
            "Senior Boiler Operator", "Senior ETP Operator", "Senior WTP Operator",
            "Senior Generator Operator", "Senior Lift Operator", "Senior AC Operator",
        ),
    ),
    WageRate(
        "E-G3", "EMPLOYEE", "REGULAR", "3", Decimal("8500"), Decimal("4250"), Decimal("15200"), "28207",
        designations=(
            "Clerk / Office Assistant / Cash Assistant",
            "Telephone Operator / Data Entry Operator / Junior Computer Operator", "Time Keeper",
            "Caretaker", "Security Guard", "Driver (light and medium licence)", "Baby Sitter / Child Carer",
            "Photocopy Machine Operator", "Boiler Operator / Pump Operator", "ETP Operator", "WTP Operator",
            "Generator Operator / Compressor Operator", "Lift Operator", "AC Operator", "Production Reporter",
        ),
    ),
    WageRate(
        "E-G4", "EMPLOYEE", "REGULAR", "4", Decimal("6900"), Decimal("3450"), Decimal("12800"), "28207-28208",
        designations=(
            "Peon", "Cook", "Darwan / Checker / Loader", "Sweeper / Cleaner", "Gardener / Tea Boy / Canteen Boy",
            "Aya / Bua", "Driver's Assistant", "Junior Security Guard",
            "Assistant Boiler Operator / Assistant Pump Operator", "Assistant ETP Operator",
            "Assistant WTP Operator", "Assistant Generator Operator / Assistant Compressor Operator",
            "Assistant Lift Operator", "Assistant AC Operator", "Assistant Production Reporter",
        ),
    ),
    WageRate(
        "E-APP", "EMPLOYEE", "APPRENTICE", None, Decimal("5000"), Decimal("2500"), Decimal("9950"), "28208",
        apprentice_months=6, designations=("Apprentice Employee",),
    ),
)


@dataclass(frozen=True)
class LegalRule:
    key: str
    value: object
    source: str
    note: str = ""


# Current law (Labour Act 2006 as amended by Act 43 of 2026). Keys are stable; values are data.
LEGAL_RULES: tuple[LegalRule, ...] = (
    LegalRule("casual_leave_days", 10, "s.115", "Full wages; does not accumulate."),
    LegalRule("sick_leave_days", 14, "s.116(1)", "Full wages; registered physician certificate; no carry-forward."),
    LegalRule("earned_leave_worked_days_per_day", 18, "s.117(1)(a)", "Adult factory worker, after one year continuous service."),
    LegalRule("earned_leave_carry_cap_days", 40, "s.117(5)(a)", "Adult factory worker accumulation stops at 40 days."),
    LegalRule("festival_holiday_days", 13, "s.118(1) as amended 2026", "Paid; employer fixes dates."),
    LegalRule("festival_work_alternative_days", 1, "s.118(3)", "One alternative holiday."),
    LegalRule("festival_work_compensatory_wage_days", 2, "s.118(3)", "Two days' compensatory wages."),
    LegalRule("maternity_days_before", 60, "s.46(1) as amended 2026", ""),
    LegalRule("maternity_days_after", 60, "s.46(1) as amended 2026", ""),
    LegalRule("maternity_total_days", 120, "s.47(3) as amended 2026", "Calendar days."),
    LegalRule("maternity_min_service_months", 6, "s.46(1) proviso", "Before delivery."),
    LegalRule("maternity_ineligible_surviving_children", 2, "s.46(2)", "Two or more surviving children at delivery."),
    LegalRule("maternity_daily_wage_divisor", 26, "s.48(2) as amended 2026", "Last monthly gross wage / 26."),
    LegalRule("ot_multiplier_of_basic", 2, "s.108(1)", "Basic + dearness/ad-hoc; not piece-rate (s.108(2))."),
    LegalRule("daily_hours", 8, "s.100", ""),
    LegalRule("weekly_hours", 48, "s.102(1)", ""),
    LegalRule("weekly_hours_max_with_ot", 60, "s.102(2)", "Annual average at most 56."),
    LegalRule("gratuity_days_per_year", 30, "s.2(10)", "Per completed year or service beyond six months."),
    LegalRule("gratuity_days_per_year_over_10y", 45, "s.2(10)", "Service exceeding ten years."),
    LegalRule("resignation_notice_days_permanent", 60, "s.27(1)", ""),
    LegalRule("resignation_notice_days_temporary_monthly", 30, "s.27(2)(a)", ""),
    LegalRule("resignation_notice_days_temporary_other", 14, "s.27(2)(b)", ""),
    LegalRule(
        "resignation_benefit_days_by_service",
        ({"max_years": 3, "days": 7}, {"max_years_exclusive": 10, "days": 15}, {"min_years": 10, "days": 30}),
        "s.27(4) as amended 2026",
        "Per completed year; or gratuity if payable, whichever is higher.",
    ),
    LegalRule("absence_trigger_days", 10, "s.27(3A)", "More than 10 days without notice/permission."),
    LegalRule("absence_explain_notice_days", 10, "s.27(3A)", "Explain and rejoin."),
    LegalRule("absence_defence_days", 7, "s.27(3A)", "Further opportunity to defend."),
    LegalRule("termination_notice_days_permanent_monthly", 120, "s.26(1)(a)", ""),
    LegalRule("termination_notice_days_permanent_other", 60, "s.26(1)(b)", ""),
    LegalRule("termination_benefit_days_per_year", 30, "s.26(4)", "Or gratuity, whichever is higher."),
    LegalRule("retrenchment_benefit_days_per_year", 30, "s.20(2)(c)", "Or gratuity, whichever is higher."),
    LegalRule("dismissal_benefit_days_per_year", 15, "s.23(3)", "Only with >=1 year; none for s.23(4)(b)/(g)."),
    LegalRule("death_benefit_days_per_year", 30, "s.19 as amended 2026", "45 if death at work/work accident; >1 year service."),
    LegalRule("death_benefit_days_per_year_at_work", 45, "s.19", ""),
    LegalRule("retirement_age", 60, "s.28(1)", "Dues per s.26(4) or approved service rules."),
    LegalRule("final_dues_working_days", 30, "s.30 / s.123(2)", "All dues within 30 working days."),
    LegalRule("wage_payment_working_days", 7, "s.123(1)", "After the wage period."),
    LegalRule("continuous_year_min_worked_days", 240, "s.14(1)", "Worked >=240 days in previous 12 months = one year."),
    LegalRule("continuous_six_months_min_worked_days", 120, "s.14(1)", "Worked >=120 days in previous 6 months = six months."),
    LegalRule("compensation_wage_basis", "BASIC", "s.14(3)", "Last monthly basic + dearness + ad-hoc (no DA/ad-hoc in RMG schedules)."),
    LegalRule("unused_earned_leave_paid_on_separation", True, "s.11", "Any separation reason."),
    LegalRule("leave_wage_basis", "GROSS_EXCL_OT_BONUS", "s.119(1)", "Daily average of full-time wages for days worked in the previous month."),
)


@dataclass(frozen=True)
class ConfigDefault:
    key: str
    value: object
    minimum: object
    maximum: object
    note: str


# Prime7 defaults where the Act does not fix a number. Tenants may change them in a DRAFT rule set
# within the bounds; they are never labelled statutory.
CONFIG_DEFAULTS: tuple[ConfigDefault, ...] = (
    ConfigDefault("benefit_daily_divisor", 30, 26, 30, "N days' wages = monthly basic / divisor (calendar month)."),
    ConfigDefault("leave_wage_daily_divisor", 26, 26, 31, "s.119 average approximated as monthly gross / working days."),
    ConfigDefault("ot_hours_per_month", 208, 200, 240, "Hourly basic = monthly basic / hours (8 h x 26 days)."),
    ConfigDefault("gratuity_scheme_enabled", False, False, True, "Gratuity is compared only when the company has a gratuity scheme."),
)

# Direction in which a tenant may change a statutory value ("up" = only larger, "down" = only smaller).
MORE_FAVOURABLE_DIRECTION: dict[str, str] = {
    "casual_leave_days": "up",
    "sick_leave_days": "up",
    "earned_leave_worked_days_per_day": "down",
    "earned_leave_carry_cap_days": "up",
    "festival_holiday_days": "up",
    "festival_work_alternative_days": "up",
    "festival_work_compensatory_wage_days": "up",
    "maternity_total_days": "up",
    "maternity_daily_wage_divisor": "down",
    "ot_multiplier_of_basic": "up",
    "gratuity_days_per_year": "up",
    "gratuity_days_per_year_over_10y": "up",
    "termination_benefit_days_per_year": "up",
    "retrenchment_benefit_days_per_year": "up",
    "death_benefit_days_per_year": "up",
    "death_benefit_days_per_year_at_work": "up",
}


def config_default(key: str) -> object:
    for d in CONFIG_DEFAULTS:
        if d.key == key:
            return d.value
    raise KeyError(key)


def default_rules_json() -> dict[str, object]:
    out: dict[str, object] = {}
    for r in LEGAL_RULES:
        out[r.key] = list(r.value) if isinstance(r.value, tuple) else r.value
    for d in CONFIG_DEFAULTS:
        out[d.key] = d.value
    return out

# Items listed in the manifest as PENDING official-PDF verification; features depending on them
# stay configuration/preview only (never labelled statutory enforcement) until signed PASS.
PENDING_SOURCES: tuple[str, ...] = (
    "Labour Rules 2015 (as amended) Rule 111(5) festival allowance text",
    "Labour Rules 2015 Forms 6/6A, 8, 9, 19, 34 and 38 exact column layouts",
    "Revenue-stamp signature requirement by payment method (Rule 111(1) proviso)",
)


def wage_rate(rate_code: str) -> WageRate:
    for row in WAGE_RATES:
        if row.rate_code == rate_code:
            return row
    raise KeyError(rate_code)


def legal_rule(key: str) -> object:
    for rule in LEGAL_RULES:
        if rule.key == key:
            return rule.value
    raise KeyError(key)


def legal_rules_dict() -> dict[str, object]:
    return {r.key: r.value for r in LEGAL_RULES}
