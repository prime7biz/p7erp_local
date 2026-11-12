"""Response contracts for the monthly flows, ratios, stock-vs-GL control and drill-down (PLAN Phase 2, second half).

Same rules as `schemas.py`: money is Decimal in Python and a 4-decimal string in JSON. Signed amounts are
debit minus credit (a negative cash pool means a net overdraft). `dr_cr` is only a display hint.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from app.modules.finance.statements.schemas import Envelope, Money, OptMoney

_ZERO = Decimal("0")
DrCr = Literal["Dr", "Cr", ""]


def dr_cr_of(net: Decimal) -> DrCr:
    return "Dr" if net > _ZERO else "Cr" if net < _ZERO else ""


class FlowDrilldown(BaseModel):
    kind: Literal["month"] = "month"
    value: str  # YYYY-MM


# ---- Monthly Cash Flow ---------------------------------------------------------------------------------
class CashFlowMonth(BaseModel):
    month: str
    label: str
    from_date: date
    to_date: date
    opening_cash: Money
    inflow: Money
    outflow: Money
    nett_flow: Money
    closing_cash: Money
    drilldown: FlowDrilldown


class CashFlowTotal(BaseModel):
    inflow: Money
    outflow: Money
    nett_flow: Money
    closing_cash: Money


class CashPoolSplit(BaseModel):
    """Disclosure of the pool at year end (PLAN open question 2): Bank OD is part of the pool, shown separately too."""

    cash_in_hand: Money
    bank_accounts: Money
    bank_od: Money
    cash_without_od: Money


class CashFlowResponse(Envelope):
    fiscal_year: int
    opening_cash: Money
    opening_dr_cr: DrCr = ""
    months: list[CashFlowMonth]
    grand_total: CashFlowTotal
    gl_closing_cash: Money  # independent GL closing of the cash-pool classes at the year end
    closing_pool: CashPoolSplit
    contra_excluded: Money  # transfers between two cash-pool ledgers inside one voucher (not inflow / outflow)


# ---- Monthly Funds Flow --------------------------------------------------------------------------------
class FundsFlowMonth(BaseModel):
    month: str
    label: str
    from_date: date
    to_date: date
    working_capital_opening: Money
    working_capital_closing: Money
    funds_flow: Money
    current_assets_closing: Money
    current_liabilities_closing: Money  # credit positive


class FundsFlowTotal(BaseModel):
    working_capital_opening: Money
    working_capital_closing: Money
    funds_flow: Money


class FundsFlowResponse(Envelope):
    fiscal_year: int
    months: list[FundsFlowMonth]
    grand_total: FundsFlowTotal


# ---- Ratio Analysis ------------------------------------------------------------------------------------
class PrincipalGroup(BaseModel):
    code: str
    label: str
    amount: OptMoney = None  # absolute amount (Dr / Cr says the side); null = not available, see `reason`
    dr_cr: DrCr = ""
    value: OptMoney = None  # derived figure (turnover); `unit` explains it
    unit: str | None = None
    reason: str | None = None


class PrincipalRatio(BaseModel):
    code: str
    label: str
    numerator: OptMoney = None
    denominator: OptMoney = None
    value: OptMoney = None  # null when the denominator is zero
    unit: Literal["ratio", "percent", "days", "times"]
    display: str
    reason: str | None = None


class RatioAnalysisResponse(Envelope):
    principal_groups: list[PrincipalGroup]
    principal_ratios: list[PrincipalRatio]


# ---- Stock versus GL -----------------------------------------------------------------------------------
class StockNatureValue(BaseModel):
    nature: str  # RAW_MATERIAL / WORK_IN_PROCESS / FINISHED_GOODS / OTHER / UNCLASSIFIED
    fifo_value: Money
    line_count: int


class GlStockLedger(BaseModel):
    account_id: int
    name: str
    group_id: int
    balance: Money  # debit positive


class StockGlResponse(Envelope):
    by_nature: list[StockNatureValue]
    fifo_total: Money
    gl_total: Money
    difference: Money  # gl_total - fifo_total; never forced to zero
    unclassified_stock: Money
    gl_ledgers: list[GlStockLedger]


# ---- Drill-down ----------------------------------------------------------------------------------------
class DrillAmounts(BaseModel):
    opening: Money
    debit: Money
    credit: Money
    closing: Money  # all four are debit-positive nets for opening / closing
    opening_dr_cr: DrCr = ""
    closing_dr_cr: DrCr = ""


class DrillRow(DrillAmounts):
    row_type: Literal["group", "ledger"]
    id: int
    name: str
    statement_class: str | None = None


class DrillGroupResponse(Envelope):
    group_id: int
    group_name: str
    parent_group_id: int | None = None
    rows: list[DrillRow]
    total: DrillAmounts


class DrillVoucherRow(BaseModel):
    voucher_id: int
    voucher_number: str
    voucher_type: str
    voucher_date: date
    description: str | None = None
    debit: Money
    credit: Money
    running_balance: Money  # debit positive


class DrillLedgerResponse(Envelope):
    account_id: int
    account_name: str
    group_id: int
    opening: Money
    period_debit: Money
    period_credit: Money
    closing: Money
    total_vouchers: int
    limit: int
    offset: int
    rows: list[DrillVoucherRow]


class DrillCashLedger(BaseModel):
    account_id: int
    name: str
    statement_class: str | None = None
    debit: Money  # gross debit in the month
    credit: Money


class DrillCashFlowResponse(Envelope):
    month: str
    inflow: Money
    outflow: Money
    nett_flow: Money
    contra_excluded: Money
    ledgers: list[DrillCashLedger] = Field(default_factory=list)
    total_debit: Money
    total_credit: Money  # inflow = total_debit - contra, outflow = total_credit - contra
