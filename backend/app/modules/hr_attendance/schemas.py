from datetime import date, time

from pydantic import BaseModel, Field


class ShiftCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=32)
    name: str = Field(..., min_length=1, max_length=128)
    start_time: time
    end_time: time
    grace_in_minutes: int = Field(default=0, ge=0)
    break_minutes: int = Field(default=0, ge=0)
    is_night_shift: bool = False
    is_active: bool = True


class ShiftUpdate(BaseModel):
    code: str | None = Field(None, min_length=1, max_length=32)
    name: str | None = Field(None, min_length=1, max_length=128)
    start_time: time | None = None
    end_time: time | None = None
    grace_in_minutes: int | None = Field(default=None, ge=0)
    break_minutes: int | None = Field(default=None, ge=0)
    is_night_shift: bool | None = None
    is_active: bool | None = None


class ShiftOut(BaseModel):
    id: int
    tenant_id: int
    code: str
    name: str
    start_time: time
    end_time: time
    grace_in_minutes: int
    break_minutes: int
    is_night_shift: bool
    is_active: bool
    created_at: str
    updated_at: str


class RosterCreate(BaseModel):
    employee_id: int
    roster_date: date
    shift_id: int
    is_week_off: bool = False
    note: str | None = None


class RosterUpdate(BaseModel):
    shift_id: int | None = None
    is_week_off: bool | None = None
    note: str | None = None


class RosterOut(BaseModel):
    id: int
    tenant_id: int
    employee_id: int
    roster_date: date
    shift_id: int
    is_week_off: bool
    note: str | None
    created_by: int | None
    created_at: str
    updated_at: str


class HolidayCreate(BaseModel):
    holiday_date: date
    name: str = Field(..., min_length=1, max_length=128)
    is_optional: bool = False
    note: str | None = None


class HolidayUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=128)
    is_optional: bool | None = None
    note: str | None = None


class HolidayOut(BaseModel):
    id: int
    tenant_id: int
    holiday_date: date
    name: str
    is_optional: bool
    note: str | None
    created_at: str
    updated_at: str


class AttendanceEntryCreate(BaseModel):
    employee_id: int
    attendance_date: date
    in_time: time | None = None
    out_time: time | None = None
    status: str = Field(default="PRESENT", min_length=1, max_length=24)
    source: str = Field(default="MANUAL", min_length=1, max_length=24)
    late_minutes: int = Field(default=0, ge=0)
    early_out_minutes: int = Field(default=0, ge=0)
    overtime_minutes: int = Field(default=0, ge=0)
    remarks: str | None = None


class AttendanceEntryUpdate(BaseModel):
    in_time: time | None = None
    out_time: time | None = None
    status: str | None = Field(default=None, min_length=1, max_length=24)
    source: str | None = Field(default=None, min_length=1, max_length=24)
    late_minutes: int | None = Field(default=None, ge=0)
    early_out_minutes: int | None = Field(default=None, ge=0)
    overtime_minutes: int | None = Field(default=None, ge=0)
    remarks: str | None = None


class AttendanceEntryOut(BaseModel):
    id: int
    tenant_id: int
    employee_id: int
    attendance_date: date
    in_time: time | None
    out_time: time | None
    status: str
    source: str
    late_minutes: int
    early_out_minutes: int
    overtime_minutes: int
    remarks: str | None
    created_by: int | None
    created_at: str
    updated_at: str


class AttendanceSummaryRow(BaseModel):
    employee_id: int
    employee_code: str
    employee_name: str
    present_days: int
    absent_days: int
    late_days: int
    leave_days: int


class RegularizationCreate(BaseModel):
    attendance_entry_id: int
    requested_in_time: time | None = None
    requested_out_time: time | None = None
    reason: str = Field(..., min_length=1)


class RegularizationDecision(BaseModel):
    decision_note: str | None = None


class RegularizationOut(BaseModel):
    id: int
    tenant_id: int
    attendance_entry_id: int
    requested_in_time: time | None
    requested_out_time: time | None
    reason: str
    status: str
    requested_by: int
    approved_by: int | None
    decision_note: str | None
    decided_at: str | None
    created_at: str
    updated_at: str
