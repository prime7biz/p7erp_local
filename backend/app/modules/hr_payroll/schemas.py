from datetime import date
from decimal import Decimal
from typing import Annotated, Any, Literal

from pydantic import BaseModel, BeforeValidator, Field, model_validator

from app.common.money import format_money, parse_money
from app.common.money_schema import MoneyStrNonNeg, MoneyStrNonNegOpt

PayrollComponentType = Literal["EARNING", "DEDUCTION"]


def _reject_non_finite_money(value: Any) -> Any:
    """Runs before MoneyStrNonNeg: refuse NaN / Infinity and true/false instead of reading them as 0."""
    if isinstance(value, bool):
        raise ValueError("Invalid monetary amount")
    parsed = parse_money(value) if isinstance(value, (str, int, float, Decimal)) else None
    if parsed is not None and not parsed.is_finite():
        raise ValueError("Invalid monetary amount")
    return value


PayrollMoney = Annotated[MoneyStrNonNeg, BeforeValidator(_reject_non_finite_money)]
PayrollMoneyOpt = Annotated[MoneyStrNonNegOpt, BeforeValidator(_reject_non_finite_money)]
NET_PAY_TOLERANCE = Decimal("0.01")


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


class PayrollAccountingConfigUpdate(BaseModel):
    """Partial update: only fields present in the request body are changed."""

    salary_expense_account_id: int | None = None
    salary_payable_account_id: int | None = None
    bank_account_id: int | None = None
    cash_account_id: int | None = None
    tax_payable_account_id: int | None = None
    pf_payable_account_id: int | None = None
    esi_payable_account_id: int | None = None
    pt_payable_account_id: int | None = None
    advance_receivable_account_id: int | None = None


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
    """Manual payroll line. Amounts may be sent as numbers or strings; they must be valid and >= 0.

    ``net_pay`` must equal ``gross_pay - deductions`` (0.01 rounding allowed); when it is left out
    the server calculates it.
    """

    employee_id: int
    structure_id: int | None = None
    gross_pay: PayrollMoney = "0"
    deductions: PayrollMoney = "0"
    net_pay: PayrollMoneyOpt = None
    remarks: str | None = None

    @model_validator(mode="after")
    def _net_matches_gross_minus_deductions(self) -> "PayrollRunLineUpsert":
        expected = Decimal(self.gross_pay) - Decimal(self.deductions)
        if expected < 0:
            raise ValueError("deductions cannot be more than gross_pay")
        if self.net_pay is None:
            self.net_pay = format_money(expected) or "0.0000"
        elif abs(Decimal(self.net_pay) - expected) > NET_PAY_TOLERANCE:
            raise ValueError(
                f"net_pay {self.net_pay} must equal gross_pay - deductions ({format_money(expected)})"
            )
        return self


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
    statutory_remittance_voucher_id: int | None = None


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
    pay_basis: str = "SALARY"
    pieces: str = "0.0000"
    earned_minutes: str = "0.0000"
    lop_applied: bool = False
    period_days: str = "0.0000"
    employed_days: str = "0.0000"
    payable_days: str = "0.0000"
    lop_days: str = "0.0000"
    lop_absent_days: str = "0.0000"
    lop_unpaid_leave_days: str = "0.0000"
    lop_amount: str = "0.0000"


class PayrollAutoCalculatePreviewOut(BaseModel):
    run_id: int
    period_id: int
    as_of: date
    existing_line_count: int
    requires_overwrite_confirm: bool
    employees: list[PayrollEmployeeCalcPreviewOut]
    missing_assignment_employee_ids: list[int]
    warnings: list[str] = []
    lop_applied: bool = False


class PayrollAutoCalculateApplyOut(BaseModel):
    run_id: int
    applied: int
    skipped: int
    gross_total: str
    deduction_total: str
    net_total: str
    preview_warnings: list[str] = []
    missing_assignment_employee_ids: list[int] = []
