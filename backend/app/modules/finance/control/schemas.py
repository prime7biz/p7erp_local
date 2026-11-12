"""Response contracts of the Control Tower and GL profitability. Money = Decimal in Python, 4-decimal string in JSON."""

from __future__ import annotations

from datetime import date, datetime
from datetime import date as DateType  # ExceptionRow has a field called `date`, which would shadow the type
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.modules.finance.statements.schemas import Money, OptMoney

_ZERO = Decimal("0")


# ---- Control Tower ---------------------------------------------------------------------------------------
class ControlCard(BaseModel):
    code: str
    label: str
    severity: Literal["high", "medium", "low"]
    count: int
    amount: Money = _ZERO
    oldest_date: date | None = None
    href: str
    source: str | None = None  # where the numbers come from, when it matters (e.g. outstanding_bills)
    note: str | None = None  # plain-language caveat (e.g. foreign-currency rows left out of the amount)


class ControlTowerResponse(BaseModel):
    report: str = "finance_control_tower"
    as_of_date: date
    base_currency: str
    severity: str
    cards: list[ControlCard]
    data_as_of: datetime


class ExceptionRow(BaseModel):
    id: int | None = None
    reference: str | None = None
    date: DateType | None = None
    party: str | None = None
    amount: Money = _ZERO
    details: dict[str, Any] = Field(default_factory=dict)


class ExceptionListResponse(BaseModel):
    code: str
    label: str
    severity: Literal["high", "medium", "low"]
    as_of_date: date
    base_currency: str
    total: int
    amount: Money = _ZERO
    oldest_date: date | None = None
    limit: int
    offset: int
    source: str | None = None
    note: str | None = None
    rows: list[ExceptionRow]


# ---- Profitability ---------------------------------------------------------------------------------------
class ProfitEntity(BaseModel):
    type: Literal["order", "style", "master_contract", "buyer"]
    id: int
    code: str | None = None
    name: str | None = None


class ProfitPeriod(BaseModel):
    from_date: date | None = None
    to_date: date | None = None


class ProfitBudget(BaseModel):
    revenue: Money = _ZERO
    material: Money = _ZERO
    cm: Money = _ZERO
    other: Money = _ZERO


class ProfitActual(BaseModel):
    revenue: Money = _ZERO
    material: Money = _ZERO
    cm: Money = _ZERO
    overhead: Money = _ZERO
    finance_cost: Money = _ZERO
    other: Money = _ZERO


class ProfitCoverage(BaseModel):
    direct_voucher_lines: int = 0  # P&L lines owned through a voucher order link
    cost_center_lines: int = 0  # P&L lines owned only through the master contract's cost centre
    unlinked_lines: int = 0  # tenant-wide P&L lines in the period with no order and no contract cost centre
    orders_in_scope: int = 0
    orders_without_budget: int = 0


class ProfitWarning(BaseModel):
    code: str
    count: int
    amount: Money = _ZERO


class ProfitDrill(BaseModel):
    source: Literal["ORDER", "COST_CENTER"]
    bucket: str
    account_id: int
    account_number: str | None = None
    account_name: str | None = None
    line_count: int
    amount: Money = _ZERO


class ProfitabilityResponse(BaseModel):
    entity: ProfitEntity
    period: ProfitPeriod
    base_currency: str
    budget: ProfitBudget
    actual: ProfitActual
    gross_profit: Money = _ZERO
    nett_profit: Money = _ZERO
    margin_percent: OptMoney = None
    unattributed_actual: Money = _ZERO
    coverage: ProfitCoverage
    warnings: list[ProfitWarning] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    drilldown: list[ProfitDrill] = Field(default_factory=list)
    data_as_of: datetime


class OrderProfitRow(BaseModel):
    order_id: int
    order_code: str
    order_date: date | None = None
    status: str | None = None
    customer_id: int | None = None
    style_id: int | None = None
    master_contract_id: int | None = None
    revenue: Money = _ZERO
    material: Money = _ZERO
    cm: Money = _ZERO
    overhead: Money = _ZERO
    finance_cost: Money = _ZERO
    other: Money = _ZERO
    gross_profit: Money = _ZERO
    nett_profit: Money = _ZERO
    margin_percent: OptMoney = None


class OrderProfitListResponse(BaseModel):
    period: ProfitPeriod
    base_currency: str
    total: int
    limit: int
    offset: int
    sort: str
    unattributed_actual: Money = _ZERO
    unlinked_lines: int = 0
    rows: list[OrderProfitRow]
    data_as_of: datetime
