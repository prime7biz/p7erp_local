"""Post-extract heuristics for HR documents (Sprint H1)."""

from __future__ import annotations

from datetime import date
from typing import Any

from app.modules.ai_extract.schemas import ExtractedField
from app.modules.hr_compliance.age_utils import calculate_age, classify_worker_age


def _field_val(fields: dict[str, ExtractedField], key: str) -> Any:
    f = fields.get(key)
    return f.value if f else None


def analyze_hr_cv_fields(fields: dict[str, ExtractedField]) -> list[dict[str, str]]:
    alerts: list[dict[str, str]] = []
    dob = _field_val(fields, "date_of_birth")
    if dob:
        try:
            d = date.fromisoformat(str(dob)[:10])
            age = calculate_age(d)
            status, _, reason = classify_worker_age(age)
            if status == "REJECTED" and reason:
                alerts.append({"severity": "critical", "code": "CHILD_LABOR", "message": reason})
            elif status == "YOUNG_WORKER":
                alerts.append(
                    {
                        "severity": "high",
                        "code": "YOUNG_WORKER",
                        "message": f"Age {age}: young worker — light work only.",
                    }
                )
        except ValueError:
            pass
    if not _field_val(fields, "national_id") and not _field_val(fields, "phone"):
        alerts.append(
            {
                "severity": "medium",
                "code": "MISSING_CONTACT",
                "message": "National ID and phone not found — enter manually.",
            }
        )
    return alerts


def analyze_hr_id_fields(fields: dict[str, ExtractedField]) -> list[dict[str, str]]:
    alerts: list[dict[str, str]] = []
    if not _field_val(fields, "national_id"):
        alerts.append({"severity": "high", "code": "MISSING_NID", "message": "National ID number not found."})
    dob = _field_val(fields, "date_of_birth")
    if dob:
        try:
            d = date.fromisoformat(str(dob)[:10])
            age = calculate_age(d)
            status, _, reason = classify_worker_age(age)
            if status == "REJECTED" and reason:
                alerts.append({"severity": "critical", "code": "CHILD_LABOR", "message": reason})
        except ValueError:
            pass
    return alerts


def analyze_hr_medical_fields(fields: dict[str, ExtractedField]) -> list[dict[str, str]]:
    alerts: list[dict[str, str]] = []
    status = str(_field_val(fields, "fitness_status") or "").upper()
    if status == "UNFIT":
        alerts.append(
            {"severity": "critical", "code": "UNFIT", "message": "Medical status UNFIT — review before assignment."}
        )
    elif status == "FIT_WITH_RESTRICTIONS":
        alerts.append(
            {
                "severity": "high",
                "code": "RESTRICTIONS",
                "message": "Fit with restrictions — capture restrictions before shop-floor assignment.",
            }
        )
    exp = _field_val(fields, "expiry_date")
    if exp:
        try:
            d = date.fromisoformat(str(exp)[:10])
            if d < date.today():
                alerts.append(
                    {"severity": "high", "code": "MEDICAL_EXPIRED", "message": f"Medical certificate expired on {d}."}
                )
        except ValueError:
            pass
    return alerts


def analyze_hr_birth_fields(fields: dict[str, ExtractedField]) -> list[dict[str, str]]:
    return analyze_hr_id_fields(fields)
