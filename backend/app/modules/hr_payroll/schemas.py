from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

PayrollComponentType = Literal["EARNING", "DEDUCTION"]


class PayrollComponentCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=24)
    name: str = Field(..., min_length=1, max_length=128)
    component_type: PayrollComponentType = "EARNING"
    calculation_type: str = Field(default="FIXED", min_length=1, max_length=24)
    default_amount: str = "0"
    gl_account_id: int | None = None
    formula: str | None = None
    applies_to: str = Field(default="ALL", max_length=16)
    is_active: bool = True


class PayrollComponentUpdate(BaseModel):
    code: str | None = Field(None, min_length=1, max_length=24)
    name: str | None = Field(None, min_length=1, max_length=128)
    component_type: PayrollComponentType | None = None
    calculation_type: str | None = Field(None, min_length=1, max_length=24)
    default_amount: str | None = None
    gl_account_id: int | None = None
    formula: str | None = None
    applies_to: str | None = Field(None, max_length=16)
    is_active: bool | None = None


class PayrollComponentOut(BaseModel):
    id: int
    tenant_id: int
    code: str
    name: str
    component_type: str
    calculation_type: str
    default_amount: str
    gl_account_id: int | None
    formula: str | None
    applies_to: str
    is_active: bool
    created_at: str
    updated_at: str


class PayrollStructureCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=24)
    name: str = Field(..., min_length=1, max_length=128)
    description: str | None = None
    is_active: bool = True


class PayrollStructureOut(BaseModel):
    id: int
    tenant_id: int
    code: str
    name: str
    description: str | None
    is_active: bool
    created_at: str
    updated_at: str


class PayrollStructureLineBody(BaseModel):
    component_id: int
    amount: str = "0"
    formula: str | None = None
    sort_order: int = 0
    is_pf_component: bool = False
    is_esi_component: bool = False
    is_pt_component: bool = False
    is_gratuity_component: bool = False


class PayrollStructureLineOut(BaseModel):
    id: int
    tenant_id: int
    structure_id: int
    component_id: int
    amount: str
    formula: str | None
    sort_order: int
    is_pf_component: bool = False
    is_esi_component: bool = False
    is_pt_component: bool = False
    is_gratuity_component: bool = False
    created_at: str


class PayrollPeriodCreate(BaseModel):
    period_code: str = Field(..., min_length=1, max_length=16)
    start_date: date
    end_date: date
    payment_date: date


class PayrollPeriodOut(BaseModel):
    id: int
    tenant_id: int
    period_code: str
    start_date: date
    end_date: date
    payment_date: date
    status: str
    is_locked: bool
    finalized_by: int | None
    finalized_at: str | None
    created_at: str
    updated_at: str


class PayrollRunCreate(BaseModel):
    period_id: int
    run_code: str | None = Field(default=None, max_length=24)
    run_date: date


class PayrollRunOut(BaseModel):
    id: int
    tenant_id: int
    period_id: int
    run_code: str
    run_date: date
    status: str
    gross_total: str
    deduction_total: str
    net_total: str
    finalized_by: int | None
    finalized_at: str | None
    created_by: int | None
    created_at: str
    updated_at: str


class PayrollRunLineUpsert(BaseModel):
    employee_id: int
    structure_id: int | None = None
    gross_pay: str = "0"
    deductions: str = "0"
    net_pay: str = "0"
    remarks: str | None = None


class PayrollRunLineOut(BaseModel):
    id: int
    tenant_id: int
    run_id: int
    employee_id: int
    structure_id: int | None
    gross_pay: str
    deductions: str
    net_pay: str
    overtime_amount: str = "0"
    remarks: str | None
    calculation_source: str = "MANUAL"
    created_at: str
    updated_at: str


class PayrollApproveBody(BaseModel):
    note: str | None = None


class PayrollPostBody(BaseModel):
    note: str | None = None
    payroll_expense_account_id: int | None = None
    payroll_payable_account_id: int | None = None


class PayrollPostingOut(BaseModel):
    id: int
    tenant_id: int
    payroll_run_id: int
    voucher_id: int | None
    status: str
    posted_at: str
    posted_by: int | None
    note: str | None


# --- Phase 1.4: structure assignments + auto-calculate ---


class PayrollAssignmentCreate(BaseModel):
    employee_id: int
    structure_id: int
    effective_from: date
    effective_to: date | None = None
    base_salary: str | None = None
    component_overrides: dict | None = None


class PayrollAssignmentOut(BaseModel):
    id: int
    tenant_id: int
    employee_id: int
    structure_id: int
    effective_from: date
    effective_to: date | None
    base_salary: str | None
    component_overrides: dict | None
    created_by: int | None
    created_at: str
    updated_at: str


class PayrollAssignmentEndBody(BaseModel):
    effective_to: date | None = None


class PayrollAutoCalculateApplyBody(BaseModel):
    employee_ids: list[int] | None = None  # None = all ready employees
    force: bool = False  # overwrite MANUAL lines
    overwrite_confirm: bool = False  # alias for force (backward compatible)


class PayrollComponentCalcOut(BaseModel):
    component_id: int
    component_code: str
    component_name: str
    component_type: str
    calculation_type: str
    amount: str
    source_amount: str


class PayrollEmployeeCalcPreviewOut(BaseModel):
    employee_id: int
    employee_code: str
    employee_name: str = ""
    structure_id: int | None
    assignment_id: int | None
    base_salary: str
    days_present: str
    absent_days: str = "0.0000"
    late_days: str = "0.0000"
    ot_hours: str
    paid_leave_days: str
    unpaid_leave_days: str
    gross_pay: str
    deductions: str
    net_pay: str
    overtime_amount: str
    components: list[PayrollComponentCalcOut] = []
    warnings: list[str] = []
    skipped: bool = False
    skip_reason: str | None = None
    status: str = "Ready"
    has_manual_override: bool = False
    calculation_source: str = "AUTO"


class PayrollAutoCalculatePreviewOut(BaseModel):
    run_id: int
    period_id: int
    as_of: date
    existing_line_count: int
    requires_overwrite_confirm: bool
    employees: list[PayrollEmployeeCalcPreviewOut]
    missing_assignment_employee_ids: list[int]
    warnings: list[str] = []


class PayrollAutoCalculateApplyOut(BaseModel):
    run_id: int
    applied: int
    skipped: int
    gross_total: str
    deduction_total: str
    net_total: str
    preview_warnings: list[str] = []
    missing_assignment_employee_ids: list[int] = []
