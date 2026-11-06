"""Leave request input rules: positive half-day steps, date order, days within the date span."""

from __future__ import annotations

from datetime import date

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.modules.hr_ess.schemas import LeaveRequestCreate as EssLeaveRequestCreate
from app.modules.hr_leave.schemas import LeaveRequestCreate, LeaveRequestUpdate
from app.modules.hr_leave.validation import assert_leave_dates_and_days, normalize_leave_days


@pytest.mark.parametrize("raw,expected", [("1", "1"), ("0.5", "0.5"), ("2.50", "2.5"), (3, "3"), ("10", "10")])
def test_normalize_leave_days_accepts_half_day_steps(raw, expected):
    assert normalize_leave_days(raw) == expected


@pytest.mark.parametrize("raw", ["-5", "0", "abc", "0.3", "NaN", ""])
def test_normalize_leave_days_rejects_bad_values(raw):
    with pytest.raises(ValueError):
        normalize_leave_days(raw)


def test_negative_days_rejected_by_hr_and_ess_schemas():
    base = {"leave_type_id": 1, "from_date": date(2026, 1, 5), "to_date": date(2026, 1, 5)}
    with pytest.raises(ValidationError):
        LeaveRequestCreate(employee_id=1, days_requested="-5", **base)
    with pytest.raises(ValidationError):
        EssLeaveRequestCreate(days_requested="-5", **base)
    with pytest.raises(ValidationError):
        LeaveRequestUpdate(days_requested="-1")
    assert LeaveRequestUpdate().days_requested is None


def test_dates_and_days_span():
    assert_leave_dates_and_days(date(2026, 1, 5), date(2026, 1, 7), "3")
    assert_leave_dates_and_days(date(2026, 1, 5), date(2026, 1, 5), "0.5")
    with pytest.raises(HTTPException):
        assert_leave_dates_and_days(date(2026, 1, 7), date(2026, 1, 5), "1")
    with pytest.raises(HTTPException):
        assert_leave_dates_and_days(date(2026, 1, 5), date(2026, 1, 6), "5")
