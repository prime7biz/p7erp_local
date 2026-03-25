"""Public holiday preview and import using the `holidays` library (offline, no API key)."""
from __future__ import annotations

from datetime import date
from typing import Any

import holidays as holidays_lib

# Map ISO country code -> holidays.* subclass (extend as needed).
COUNTRY_MAP: dict[str, type[Any]] = {
    "BD": holidays_lib.Bangladesh,
    "US": holidays_lib.UnitedStates,
    "GB": holidays_lib.UnitedKingdom,
    "IN": holidays_lib.India,
    "CN": holidays_lib.China,
    "VN": holidays_lib.Vietnam,
    "KH": holidays_lib.Cambodia,
    "LK": holidays_lib.SriLanka,
    "NP": holidays_lib.Nepal,
    "PK": holidays_lib.Pakistan,
    "MY": holidays_lib.Malaysia,
    "ID": holidays_lib.Indonesia,
    "TH": holidays_lib.Thailand,
    "PH": holidays_lib.Philippines,
}

# Bangladesh garment industry: phrases in holiday names that usually imply full factory closure.
BD_GARMENT_MUST_CLOSE_SUBSTR = (
    "eid",
    "eid-ul",
    "eid ul",
    "language movement",
    "international mother language",
    "independence day",
    "victory day",
    "sheikh mujib",
    "mujib",
    "pohela",
    "boishakh",
    "pahela",
    "ashura",
    "shab-e",
    "shabe",
    "jumu",
    "juma",
)

BD_GARMENT_OPTIONAL_SUBSTR = (
    "christmas",
    "buddha",
    "may day",
    "new year",
    "hindu",
    "durga",
)


def _bd_garment_recommendation(name: str) -> str | None:
    n = (name or "").lower()
    if any(s in n for s in BD_GARMENT_MUST_CLOSE_SUBSTR):
        return "must_close"
    if any(s in n for s in BD_GARMENT_OPTIONAL_SUBSTR):
        return "optional"
    return None


def garment_recommendation_for_country(country_code: str, holiday_name: str) -> str | None:
    cc = (country_code or "").upper()
    if cc == "BD":
        return _bd_garment_recommendation(holiday_name)
    return None


def get_country_holidays_for_year(country_code: str, year: int) -> list[dict[str, Any]]:
    """Return sorted list of {date, name, category, garment_recommendation}."""
    cc = (country_code or "").strip().upper()
    cls = COUNTRY_MAP.get(cc)
    if not cls:
        return []
    cal = cls(years=year)
    out: list[dict[str, Any]] = []
    for d, name in sorted(cal.items()):
        rec = garment_recommendation_for_country(cc, str(name))
        out.append(
            {
                "date": d.isoformat(),
                "name": str(name),
                "category": "government",
                "garment_recommendation": rec,
            }
        )
    return out


def filter_holidays_by_dates(items: list[dict[str, Any]], selected_dates: list[str]) -> list[dict[str, Any]]:
    if not selected_dates:
        return list(items)
    want = {d.strip() for d in selected_dates}
    return [x for x in items if x.get("date") in want]
