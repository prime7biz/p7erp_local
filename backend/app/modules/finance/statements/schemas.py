"""Pydantic contracts for the statements API (PLAN "New additive API contracts").

Money is Decimal inside Python and a 4-decimal string in JSON (never float).
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, field_validator

from app.modules.finance.statements.constants import (
    STATEMENT_CLASS_SET,
    STATEMENT_CLASSES,
    STOCK_NATURE_SET,
    STOCK_NATURES,
)

_Q = Decimal("0.0001")


def _money_str(value: Decimal) -> str:
    return format(Decimal(value).quantize(_Q, rounding=ROUND_HALF_UP), "f")


Money = Annotated[Decimal, PlainSerializer(_money_str, return_type=str, when_used="json")]
OptMoney = Annotated[Decimal | None, PlainSerializer(lambda v: None if v is None else _money_str(v), return_type=str | None, when_used="json")]

_ZERO = Decimal("0")


class Company(BaseModel):
    name: str
    address: str | None = None
    email: str | None = None


class Period(BaseModel):
    from_date: date | None = None
    to_date: date | None = None
    as_of_date: date | None = None
    fiscal_year: str
    fiscal_year_start: date
    fiscal_year_end: date


class StatementWarning(BaseModel):
    code: str
    count: int
    # UNCLASSIFIED_GROUPS: absolute amount. OPENING_BALANCE_DIFFERENCE: debit minus credit (positive = Dr-heavy).
    amount: Money = _ZERO


class Reconciliation(BaseModel):
    balanced: bool
    difference: Money = _ZERO


class SheetReconciliation(Reconciliation):
    """Trial Balance / Balance Sheet: `difference` is what is left AFTER the disclosed opening difference line.

    opening_difference = stored debit-side opening balances - stored credit-side opening balances (all ledgers).
    """

    opening_difference: Money = _ZERO


class Envelope(BaseModel):
    """Common response envelope."""

    report: str
    company: Company
    period: Period
    base_currency: str
    warnings: list[StatementWarning] = Field(default_factory=list)
    reconciliation: Reconciliation
    data_as_of: datetime


# ---- Trial Balance -------------------------------------------------------------------------------------
class Drilldown(BaseModel):
    kind: Literal["primary", "group", "ledger", "unclassified", "profit_and_loss", "opening_difference"]
    id: int | None = None


class TrialBalanceRow(BaseModel):
    row_type: Literal["primary", "group", "ledger", "profit_and_loss", "opening_difference"]
    code: str | None = None  # DIFFERENCE_IN_OPENING_BALANCES on the synthetic opening-difference row
    id: int | None = None
    parent_id: int | None = None
    name: str
    depth: int = 0
    statement_class: str | None = None
    opening_debit: Money = _ZERO
    opening_credit: Money = _ZERO
    period_debit: Money = _ZERO
    period_credit: Money = _ZERO
    closing_debit: Money = _ZERO
    closing_credit: Money = _ZERO
    dr_cr: Literal["Dr", "Cr", ""] = ""
    drilldown: Drilldown


class TrialBalanceTotals(BaseModel):
    opening_debit: Money = _ZERO
    opening_credit: Money = _ZERO
    period_debit: Money = _ZERO
    period_credit: Money = _ZERO
    closing_debit: Money = _ZERO
    closing_credit: Money = _ZERO


class TrialBalanceResponse(Envelope):
    rows: list[TrialBalanceRow]
    totals: TrialBalanceTotals
    reconciliation: SheetReconciliation


# ---- Balance Sheet -------------------------------------------------------------------------------------
class SheetNode(BaseModel):
    """One line of a two-sided statement: ledgers carry inner_amount, groups carry outer_amount."""

    name: str
    row_type: Literal["primary", "group", "ledger", "result", "opening_difference"]
    code: str | None = None  # DIFFERENCE_IN_OPENING_BALANCES on the synthetic opening-difference line
    id: int | None = None
    inner_amount: OptMoney = None
    outer_amount: OptMoney = None
    children: list["SheetNode"] = Field(default_factory=list)


SheetNode.model_rebuild()


class BalanceSheetProfitLoss(BaseModel):
    opening: Money  # accumulated result before the fiscal year (profit positive)
    current_period: Money  # result from fiscal-year start to as-of date (profit positive)
    amount: Money  # absolute total shown on `side`
    side: Literal["liabilities", "assets"]


class BalanceSheetTotals(BaseModel):
    liabilities: Money
    assets: Money
    difference: Money


class BalanceSheetResponse(Envelope):
    liabilities: list[SheetNode]
    assets: list[SheetNode]
    profit_and_loss: BalanceSheetProfitLoss
    totals: BalanceSheetTotals
    reconciliation: SheetReconciliation


# ---- Trading + Profit & Loss ---------------------------------------------------------------------------
class Result(BaseModel):
    kind: Literal["profit", "loss"]
    amount: Money = _ZERO


class StockMemo(BaseModel):
    raw_material: OptMoney = None
    work_in_process: OptMoney = None
    finished_goods: OptMoney = None


class StockAdjustment(BaseModel):
    """Periodic-vs-GL comparison (PLAN section 5). Disclosure only; never enters gross_result."""

    gl_gross_result: Money
    periodic_gross_result: Money
    stock_adjustment: Money


class TradingAccount(BaseModel):
    debit_rows: list[SheetNode]
    credit_rows: list[SheetNode]
    opening_stock: StockMemo
    closing_stock: StockMemo
    memo_stock_status: Literal["NOT_COMPUTED", "FIFO_MEMO"] = "NOT_COMPUTED"
    gross_result: Result
    debit_total: Money
    credit_total: Money


class ProfitLossAccount(BaseModel):
    debit_rows: list[SheetNode]
    credit_rows: list[SheetNode]
    gross_brought_forward: Result
    nett_result: Result
    debit_total: Money
    credit_total: Money


class ProfitLossResponse(Envelope):
    trading: TradingAccount
    profit_and_loss: ProfitLossAccount
    stock_adjustment: StockAdjustment | None = None
    # Income/expense movement for the period (credit minus debit); equals nett_result (profit positive).
    income_expense_movement: Money


# ---- Setup (classification) ---------------------------------------------------------------------------
class AffectedGroup(BaseModel):
    id: int
    name: str
    current_effective_class: str | None = None


class StatementClassState(BaseModel):
    group_id: int
    name: str
    parent_group_id: int | None = None
    statement_class: str | None = None  # explicit value on this group
    effective_class: str | None = None  # after inheritance
    inherited_from_group_id: int | None = None
    allowed_classes: list[str] = Field(default_factory=lambda: list(STATEMENT_CLASSES))
    # preview of what a (proposed) value would change for this group and its inheriting descendants
    proposed_class: str | None = None
    affected_group_count: int = 0
    affected_ledger_count: int = 0
    affected_groups: list[AffectedGroup] = Field(default_factory=list)
    reports: list[str] = Field(default_factory=lambda: ["trial_balance", "balance_sheet", "profit_loss"])


def validate_statement_class(value: str | None) -> str | None:
    """Allowlist check shared by every request body that accepts a statement class (422 on failure)."""
    if value is not None and value not in STATEMENT_CLASS_SET:
        raise ValueError(f"statement_class must be one of: {', '.join(STATEMENT_CLASSES)} (or null)")
    return value


class StatementClassUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    statement_class: str | None = None  # null clears (back to Unclassified)

    @field_validator("statement_class")
    @classmethod
    def _check(cls, v: str | None) -> str | None:
        return validate_statement_class(v)


class StockNatureState(BaseModel):
    group_id: int
    name: str
    parent_id: int | None = None
    stock_nature: str | None = None
    effective_nature: str | None = None
    inherited_from_group_id: int | None = None
    allowed_natures: list[str] = Field(default_factory=lambda: list(STOCK_NATURES))


class StockNatureUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    stock_nature: str | None = None

    @field_validator("stock_nature")
    @classmethod
    def _check(cls, v: str | None) -> str | None:
        if v is not None and v not in STOCK_NATURE_SET:
            raise ValueError(f"stock_nature must be one of: {', '.join(STOCK_NATURES)} (or null)")
        return v


def to_json(model: BaseModel) -> dict[str, Any]:
    return model.model_dump(mode="json")
