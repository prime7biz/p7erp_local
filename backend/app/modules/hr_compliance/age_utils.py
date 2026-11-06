"""Age helpers and hire-gate logic (Sprint H1)."""

from __future__ import annotations

from datetime import date

from app.common.business_date import today_local


def calculate_age(dob: date, as_of: date | None = None) -> int:
    today = as_of or today_local()
    years = today.year - dob.year
    if (today.month, today.day) < (dob.month, dob.day):
        years -= 1
    return years


def classify_worker_age(age: int) -> tuple[str, bool, str | None]:
    """
    Returns (status, is_bsci_compliant, reject_reason).
    status: REJECTED | YOUNG_WORKER | ADULT | VERIFIED
    """
    if age < 15:
        return (
            "REJECTED",
            False,
            f"Employee age {age} — REJECTED. Child labor risk (minimum age 15).",
        )
    if age < 18:
        # Young worker: compliant only with light-work notes (caller sets notes)
        return ("YOUNG_WORKER", False, None)
    return ("ADULT", True, None)
