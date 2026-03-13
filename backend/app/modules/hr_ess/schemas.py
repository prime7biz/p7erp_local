from datetime import date

from pydantic import BaseModel, Field


class EssPreferenceUpdate(BaseModel):
    preferred_language: str | None = Field(None, min_length=1, max_length=32)
    time_zone: str | None = Field(None, min_length=1, max_length=64)
    date_format: str | None = Field(None, min_length=1, max_length=32)
    email_notifications: bool | None = None
    push_notifications: bool | None = None


class EssPreferenceResponse(BaseModel):
    preferred_language: str
    time_zone: str
    date_format: str
    email_notifications: bool
    push_notifications: bool


class MyProfileResponse(BaseModel):
    employee_id: int
    employee_code: str
    full_name: str
    email: str | None
    phone: str | None
    department_id: int | None
    designation_id: int | None
    joining_date: date | None
    preference: EssPreferenceResponse


class LeaveRequestResponse(BaseModel):
    id: int
    leave_type: str
    start_date: date
    end_date: date
    days_count: float
    reason: str | None
    status: str
    approved_at: str | None
    created_at: str


class LeaveRequestCreate(BaseModel):
    leave_type_id: int
    from_date: date
    to_date: date
    reason: str | None = None
    days_requested: str = "1"


class AttendanceSummaryResponse(BaseModel):
    year: int
    month: int
    present_days: int
    absent_days: int
    late_days: int
    overtime_hours: float


class PayslipResponse(BaseModel):
    id: int
    period_year: int
    period_month: int
    gross_pay: float
    deductions: float
    net_pay: float
    currency: str
    status: str
    issued_at: str | None
    download_url: str | None
