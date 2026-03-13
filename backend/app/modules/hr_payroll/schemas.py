from datetime import date

from pydantic import BaseModel, Field


class PayrollComponentCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=24)
    name: str = Field(..., min_length=1, max_length=128)
    component_type: str = Field(default="EARNING", min_length=1, max_length=16)
    calculation_type: str = Field(default="FIXED", min_length=1, max_length=24)
    default_amount: str = "0"
    gl_account_id: int | None = None
    is_active: bool = True


class PayrollComponentUpdate(BaseModel):
    code: str | None = Field(None, min_length=1, max_length=24)
    name: str | None = Field(None, min_length=1, max_length=128)
    component_type: str | None = Field(None, min_length=1, max_length=16)
    calculation_type: str | None = Field(None, min_length=1, max_length=24)
    default_amount: str | None = None
    gl_account_id: int | None = None
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


class PayrollStructureLineOut(BaseModel):
    id: int
    tenant_id: int
    structure_id: int
    component_id: int
    amount: str
    formula: str | None
    sort_order: int
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
    remarks: str | None
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
