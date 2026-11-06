"""The machine-readable Bangladesh catalog matches the signed source manifest.

Run: docker compose exec backend pytest tests/test_hr_bd_source_manifest.py -q
"""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path

import pytest

from app.modules.hr_localization import bd_rmg_catalog as cat

MANIFEST = Path(__file__).resolve().parents[2] / "docs" / "hr-compliance" / "BD_RMG_SOURCE_MANIFEST_2026.md"

EXPECTED = {
    # rate_code: (basic, house_rent, gross)
    "W-G1": ("8390", "4195", "15035"),
    "W-G2": ("7882", "3941", "14273"),
    "W-G3": ("7400", "3700", "13550"),
    "W-G4": ("6700", "3350", "12500"),
    "W-APP": ("4950", "2475", "9875"),
    "E-G1": ("10900", "5450", "18800"),
    "E-G2": ("9000", "4500", "15950"),
    "E-G3": ("8500", "4250", "15200"),
    "E-G4": ("6900", "3450", "12800"),
    "E-APP": ("5000", "2500", "9950"),
}


def test_all_official_rows_present_with_gazette_amounts():
    assert {r.rate_code for r in cat.WAGE_RATES} == set(EXPECTED)
    for row in cat.WAGE_RATES:
        basic, house_rent, gross = (Decimal(x) for x in EXPECTED[row.rate_code])
        assert (row.basic, row.house_rent, row.gross) == (basic, house_rent, gross), row.rate_code


def test_every_row_total_equals_its_components():
    for row in cat.WAGE_RATES:
        assert row.component_sum() == row.gross, row.rate_code
        assert row.house_rent == row.basic * cat.HOUSE_RENT_PCT_OF_BASIC / 100, row.rate_code
    assert (cat.MEDICAL, cat.TRANSPORT, cat.FOOD) == (Decimal("750"), Decimal("450"), Decimal("1250"))


def test_grade_shape_four_worker_four_employee_two_apprentice():
    regular = [r for r in cat.WAGE_RATES if r.employment_stage == "REGULAR"]
    assert sorted((r.schedule_class, r.grade_code) for r in regular) == sorted(
        [("WORKER", g) for g in "1234"] + [("EMPLOYEE", g) for g in "1234"]
    )
    apprentices = {r.rate_code: r.apprentice_months for r in cat.WAGE_RATES if r.employment_stage == "APPRENTICE"}
    assert apprentices == {"W-APP": 3, "E-APP": 6}
    assert min(r.gross for r in regular if r.schedule_class == "WORKER") == Decimal("12500")


def test_designations_present_and_unique():
    titles = [t for r in cat.WAGE_RATES for t in r.designations]
    assert len(titles) == len(set(titles))
    counts = {r.rate_code: len(r.designations) for r in cat.WAGE_RATES}
    assert counts["W-G1"] == 10 and counts["W-G2"] == 18 and counts["W-G3"] == 17 and counts["W-G4"] == 17
    assert counts["E-G1"] == 3 and counts["E-G2"] == 14 and counts["E-G3"] == 15 and counts["E-G4"] == 15


def test_current_2026_law_values():
    assert cat.legal_rule("maternity_total_days") == 120
    assert cat.legal_rule("maternity_days_before") + cat.legal_rule("maternity_days_after") == 120
    assert cat.legal_rule("festival_holiday_days") == 13
    assert cat.legal_rule("maternity_daily_wage_divisor") == 26
    assert cat.legal_rule("casual_leave_days") == 10 and cat.legal_rule("sick_leave_days") == 14
    assert cat.legal_rule("earned_leave_worked_days_per_day") == 18 and cat.legal_rule("earned_leave_carry_cap_days") == 40
    assert cat.legal_rule("absence_explain_notice_days") == 10 and cat.legal_rule("absence_defence_days") == 7
    assert cat.legal_rule("gratuity_days_per_year_over_10y") == 45


def test_source_identity_and_manifest_in_sync():
    assert cat.WAGE_EFFECTIVE_FROM.isoformat() == cat.WAGE_GAZETTE["effective_from"] == "2023-12-01"
    assert len(cat.WAGE_GAZETTE["pdf_sha256"]) == 64
    if not MANIFEST.exists():
        pytest.skip("docs/ is not mounted in this container; CI runs this check from the repo checkout")
    text = MANIFEST.read_text(encoding="utf-8")
    assert cat.CATALOG_VERSION in text
    assert cat.WAGE_GAZETTE["pdf_sha256"] in text
    assert cat.WAGE_GAZETTE["notification_no"] in text
    for code, (_basic, _hr, gross) in EXPECTED.items():
        assert code in text and f"{int(gross):,}" in text, code
