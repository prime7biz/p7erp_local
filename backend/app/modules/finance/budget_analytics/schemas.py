"""Response contracts of budget analytics, expense analysis and expense controls (money = 4-decimal string in JSON)."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.modules.finance.statements.schemas import Money, OptMoney

_ZERO = Decimal("0")
Status = Literal["within", "warning", "over", "critical"]


# ---- budget analytics ----------------------------------------------------------------------------------------------
class BudgetRef(BaseModel):
    id: int
    budget_name: str
    status: str


class AnalyticsRow(BaseModel):
    id: int | str | None = None  # cost centre / account id, "YYYY-MM" month, or department text; null = "none"
    label: str
    budget: Money = _ZERO
    actual: Money = _ZERO
    variance: Money = _ZERO  # budget - actual (positive = under budget)
    variance_percent: OptMoney = None  # variance / budget x 100; null when budget is 0
    used_percent: OptMoney = None  # actual / budget x 100; null when budget is 0
    status: Status = "within"


class AnalyticsTotals(BaseModel):
    budget: Money = _ZERO
    actual: Money = _ZERO
    variance: Money = _ZERO
    variance_percent: OptMoney = None
    used_percent: OptMoney = None
    status: Status = "within"


class BudgetAnalyticsResponse(BaseModel):
    report: str = "finance_budget_analytics"
    fiscal_year: str
    fiscal_year_start: date
    fiscal_year_end: date
    dimension: str
    base_currency: str
    enforcement_mode: str
    budgets: list[BudgetRef]
    rows: list[AnalyticsRow]
    totals: AnalyticsTotals
    notes: list[str] = Field(default_factory=list)
    data_as_of: datetime


class DrillLine(BaseModel):
    voucher_line_id: int
    voucher_id: int
    voucher_number: str
    voucher_date: date
    voucher_status: str
    account_id: int
    account_number: str | None = None
    account_name: str | None = None
    cost_center_id: int | None = None
    cost_center_name: str | None = None
    narration: str | None = None
    entry_type: str
    base_amount: Money = _ZERO  # the line's base-currency amount as posted (always positive)
    signed_amount: Money = _ZERO  # contribution to "actual" (credit lines and reversals are negative)


class DrilldownResponse(BaseModel):
    report: str = "finance_budget_analytics_drilldown"
    fiscal_year: str
    base_currency: str
    filters: dict[str, Any]
    total: Money = _ZERO  # signed actual of ALL matching lines (equals the cell it was opened from)
    line_count: int
    limit: int
    offset: int
    lines: list[DrillLine]
    data_as_of: datetime


# ---- expense analysis ----------------------------------------------------------------------------------------------
class ExpenseRow(BaseModel):
    id: int | str | None = None
    label: str
    current: Money = _ZERO
    previous: Money = _ZERO
    change: Money = _ZERO
    change_percent: OptMoney = None


class ExpenseClassTotal(BaseModel):
    statement_class: str
    current: Money = _ZERO
    previous: Money = _ZERO


class ExpenseWarning(BaseModel):
    code: str
    message: str
    current: Money = _ZERO
    previous: Money = _ZERO
    account_count: int = 0


class ExpenseAnalysisResponse(BaseModel):
    report: str = "finance_expense_analysis"
    from_date: date
    to_date: date
    previous_from_date: date
    previous_to_date: date
    group_by: str
    base_currency: str
    expense_classes: list[str]
    rows: list[ExpenseRow]
    by_class: list[ExpenseClassTotal]
    total_current: Money = _ZERO
    total_previous: Money = _ZERO
    change: Money = _ZERO
    change_percent: OptMoney = None
    warnings: list[ExpenseWarning] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    data_as_of: datetime


# ---- expense controls ----------------------------------------------------------------------------------------------
class ControlItem(BaseModel):
    code: str
    severity: Literal["high", "medium", "low"]
    title: str
    amount: Money = _ZERO
    account_id: int | None = None
    cost_center_id: int | None = None
    budget_id: int | None = None
    budget_line_id: int | None = None
    voucher_ids: list[int] = Field(default_factory=list)
    evidence: dict[str, Any] = Field(default_factory=dict)


class ControlRule(BaseModel):
    code: str
    label: str
    severity: Literal["high", "medium", "low"]
    count: int  # exact number of exceptions for this rule
    amount: Money = _ZERO
    items: list[ControlItem]  # at most MAX_ITEMS_PER_RULE, worst first
    note: str | None = None


class ExpenseControlsResponse(BaseModel):
    report: str = "finance_expense_controls"
    as_of_date: date
    fiscal_year: str
    base_currency: str
    enforcement_mode: str
    rules: list[ControlRule]
    data_as_of: datetime
