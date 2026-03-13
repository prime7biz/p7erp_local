from datetime import date

from pydantic import BaseModel, Field


class LeaveTypeCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=24)
    name: str = Field(..., min_length=1, max_length=128)
    is_paid: bool = True
    requires_approval: bool = True
    is_active: bool = True


class LeaveTypeUpdate(BaseModel):
    code: str | None = Field(None, min_length=1, max_length=24)
    name: str | None = Field(None, min_length=1, max_length=128)
    is_paid: bool | None = None
    requires_approval: bool | None = None
    is_active: bool | None = None


class LeaveTypeOut(BaseModel):
    id: int
    tenant_id: int
    code: str
    name: str
    is_paid: bool
    requires_approval: bool
    is_active: bool
    created_at: str
    updated_at: str


class LeavePolicyCreate(BaseModel):
    leave_type_id: int
    employment_type: str | None = Field(None, max_length=32)
    annual_quota_days: str = "0"
    max_carry_forward_days: str = "0"
    effective_from: date
    effective_to: date | None = None
    is_active: bool = True


class LeavePolicyUpdate(BaseModel):
    employment_type: str | None = Field(None, max_length=32)
    annual_quota_days: str | None = None
    max_carry_forward_days: str | None = None
    effective_from: date | None = None
    effective_to: date | None = None
    is_active: bool | None = None


class LeavePolicyOut(BaseModel):
    id: int
    tenant_id: int
    leave_type_id: int
    employment_type: str | None
    annual_quota_days: str
    max_carry_forward_days: str
    effective_from: date
    effective_to: date | None
    is_active: bool
    created_at: str
    updated_at: str


class LeaveBalanceUpsert(BaseModel):
    employee_id: int
    leave_type_id: int
    balance_year: int = Field(..., ge=2000, le=2100)
    allocated_days: str = "0"
    used_days: str = "0"
    pending_days: str = "0"
    closing_balance_days: str = "0"


class LeaveBalanceOut(BaseModel):
    id: int
    tenant_id: int
    employee_id: int
    leave_type_id: int
    balance_year: int
    allocated_days: str
    used_days: str
    pending_days: str
    closing_balance_days: str
    created_at: str
    updated_at: str


class LeaveRequestCreate(BaseModel):
    employee_id: int
    leave_type_id: int
    from_date: date
    to_date: date
    days_requested: str
    reason: str | None = None


class LeaveRequestUpdate(BaseModel):
    from_date: date | None = None
    to_date: date | None = None
    days_requested: str | None = None
    reason: str | None = None


class LeaveDecision(BaseModel):
    note: str | None = None


class LeaveRequestOut(BaseModel):
    id: int
    tenant_id: int
    employee_id: int
    leave_type_id: int
    from_date: date
    to_date: date
    days_requested: str
    reason: str | None
    status: str
    requested_by: int
    approved_by: int | None
    approved_at: str | None
    approval_note: str | None
    created_at: str
    updated_at: str
