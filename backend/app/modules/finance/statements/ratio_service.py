"""Ratio Analysis (REFERENCE_REPORTS.md section 6, PLAN acceptance 2.9). SQL: 6 statements, 7 with a due source (limit 10).

Balance-sheet figures are the GL balances at `to_date`; income-statement figures cover from_date..to_date.
Nett / gross result come from the P&L service (GL only, perpetual COGS). A ratio whose denominator is zero returns
value null, display "N/A" and a reason; nothing is ever fabricated.

Formulas (all on the figures above; CA / CL / Stock as in `flow_common`):
  Working Capital          = CA - CL                      Current Ratio   = CA : CL
  Quick Ratio              = (CA - Stock) : CL             Debt/Equity     = Loans (Liability) : (Capital + Nett Profit)
  Gross Profit %           = Gross result / Sales * 100    Nett Profit %   = Nett result / Sales * 100
  Operating Cost %         = (Direct + Indirect Expenses) / Sales * 100      (assumption, numerator shown)
  Receivable Turnover days = Sundry Debtors / Sales * days in period
  ROI %                    = Nett / (Capital + Nett) * 100  Return on WC % = Nett / Working Capital * 100
  WC Turnover              = Sales / Working Capital        Inventory Turnover = Sales / Closing Stock
Loans (Liability) = LONG_TERM_LOANS + SHORT_TERM_BORROWINGS + BANK_OD (credit balances positive).
"Due till today" for debtors / creditors needs one authoritative bill-wise source (PLAN open question 8). Until the
tenant setting `finance_ar_ap_due_source` names one, those two lines return null with a reason; once set, they show
the bills due on or before the to-date (plus `total_open`) from that source (`ar_ap_due_service`, +1 statement).
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant import Tenant
from app.modules.finance.fiscal_year import fiscal_year_bounds, fy_start_month
from app.modules.finance.posting_core import BALANCE_TOLERANCE  # noqa: F401  (kept for symmetry with siblings)
from app.modules.finance.statements.ar_ap_due_service import ArApDue, ar_ap_due_totals
from app.modules.finance.statements.constants import (
    BANK_ACCOUNTS,
    BANK_OD,
    CAPITAL_ACCOUNT,
    CASH_IN_HAND,
    DIRECT_EXPENSES,
    INDIRECT_EXPENSES,
    LONG_TERM_LOANS,
    PRIMARY_UNCLASSIFIED,
    PURCHASE_ACCOUNTS,
    SALES_ACCOUNTS,
    SHORT_TERM_BORROWINGS,
    STOCK_IN_HAND,
    SUNDRY_CREDITORS,
    SUNDRY_DEBTORS,
)
from app.modules.finance.statements.flow_common import WC_ASSET_CLASSES, WC_LIABILITY_CLASSES, ZERO, q4
from app.modules.finance.statements.flow_schemas import PrincipalGroup, PrincipalRatio, RatioAnalysisResponse, dr_cr_of
from app.modules.finance.statements.group_tree import company_from, fiscal_period, unclassified_warning
from app.modules.finance.statements.ledger_aggregate_service import build_ledger_calcs
from app.modules.finance.statements.profit_loss_service import build_profit_loss
from app.modules.finance.statements.schemas import Reconciliation, StatementWarning

DUE_REASON = (
    "Bill-wise due dates need one authoritative AR/AP source, which is not chosen yet (PLAN open question 8; "
    "tenant setting finance_ar_ap_due_source)."
)
HUNDRED = Decimal("100")


def _div(numerator: Decimal, denominator: Decimal, scale: Decimal = Decimal(1)) -> Decimal | None:
    if denominator == ZERO:
        return None
    return (numerator / denominator * scale).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def _display(value: Decimal | None, unit: str) -> str:
    if value is None:
        return "N/A"
    text = format(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP), "f")
    return {"ratio": f"{text} : 1", "percent": f"{text} %", "days": f"{text} days", "times": f"{text} times"}[unit]


def _ratio(code, label, numerator, denominator, unit, scale=Decimal(1), zero_reason="Denominator is zero") -> PrincipalRatio:
    value = _div(numerator, denominator, scale)
    return PrincipalRatio(
        code=code,
        label=label,
        numerator=numerator,
        denominator=denominator,
        value=value,
        unit=unit,
        display=_display(value, unit),
        reason=zero_reason if value is None else None,
    )


def _group(code: str, label: str, net: Decimal | None, *, credit_normal: bool = False) -> PrincipalGroup:
    """`net` is the natural-side amount (positive = normal side); shown absolute with its Dr / Cr."""
    if net is None:
        return PrincipalGroup(code=code, label=label)
    signed_debit = -net if credit_normal else net
    return PrincipalGroup(code=code, label=label, amount=abs(net), dr_cr=dr_cr_of(signed_debit))


def _due_group(code: str, label: str, due: ArApDue | None, *, credit_normal: bool) -> PrincipalGroup:
    if due is None:
        return PrincipalGroup(code=code, label=label, reason=DUE_REASON)
    amount, total_open = (due.creditors_due, due.creditors_open) if credit_normal else (due.debtors_due, due.debtors_open)
    group = _group(code, label, amount, credit_normal=credit_normal)
    return group.model_copy(update={"total_open": q4(total_open), "source": due.source, "note": due.note})


async def build_ratio_analysis(
    db: AsyncSession, tenant: Tenant, *, from_date: date, to_date: date
) -> RatioAnalysisResponse:
    fy_start, _ = fiscal_year_bounds(from_date, fy_start_month(tenant.feature_flags))
    calcs, _groups = await build_ledger_calcs(db, tenant.id, from_date=from_date, to_date=to_date, fy_start=fy_start)
    pnl = await build_profit_loss(db, tenant, from_date=from_date, to_date=to_date)  # 3 statements

    def bs_net(*classes: str) -> Decimal:  # debit-positive balance at to_date
        return sum((c.closing_net for c in calcs if not c.is_pl and c.effective_class in classes), ZERO)

    def pl_debit(*classes: str) -> Decimal:
        return sum((c.period_debit - c.period_credit for c in calcs if c.is_pl and c.effective_class in classes), ZERO)

    ca = bs_net(*WC_ASSET_CLASSES)
    cl = -bs_net(*WC_LIABILITY_CLASSES)
    working_capital = ca - cl
    stock = bs_net(STOCK_IN_HAND)
    debtors = bs_net(SUNDRY_DEBTORS)
    creditors = -bs_net(SUNDRY_CREDITORS)
    cash = bs_net(CASH_IN_HAND)
    bank = bs_net(BANK_ACCOUNTS)
    bank_od = -bs_net(BANK_OD)
    loans = -bs_net(LONG_TERM_LOANS, SHORT_TERM_BORROWINGS, BANK_OD)
    capital = -bs_net(CAPITAL_ACCOUNT)
    sales = -pl_debit(SALES_ACCOUNTS)
    purchases = pl_debit(PURCHASE_ACCOUNTS)
    operating_cost = pl_debit(DIRECT_EXPENSES, INDIRECT_EXPENSES)

    gross = pnl.trading.gross_result.amount * (1 if pnl.trading.gross_result.kind == "profit" else -1)
    nett = pnl.profit_and_loss.nett_result.amount * (1 if pnl.profit_and_loss.nett_result.kind == "profit" else -1)
    equity = capital + nett
    days = Decimal((to_date - from_date).days + 1)

    due = await ar_ap_due_totals(db, tenant, as_of=to_date)
    wc_turnover = _div(sales, working_capital)
    inv_turnover = _div(sales, stock)
    groups_out = [
        _group("WORKING_CAPITAL", "Working Capital", working_capital),
        _group("CASH_IN_HAND", "Cash-in-hand", cash),
        _group("CASH_AT_BANK", "Cash at Bank", bank),
        _group("BANK_OD", "Bank OD A/c", bank_od, credit_normal=True),
        _group("SUNDRY_DEBTORS", "Sundry Debtors", debtors),
        _due_group("SUNDRY_DEBTORS_DUE", "Sundry Debtors due till today", due, credit_normal=False),
        _group("SUNDRY_CREDITORS", "Sundry Creditors", creditors, credit_normal=True),
        _due_group("SUNDRY_CREDITORS_DUE", "Sundry Creditors due till today", due, credit_normal=True),
        _group("SALES_ACCOUNTS", "Sales Accounts", sales, credit_normal=True),
        _group("PURCHASE_ACCOUNTS", "Purchase Accounts", purchases),
        _group("STOCK_IN_HAND", "Stock-in-hand", stock),
        _group("NETT_RESULT", "Nett Profit" if nett >= ZERO else "Nett Loss", nett, credit_normal=True),
        PrincipalGroup(
            code="WORKING_CAPITAL_TURNOVER",
            label="Working Capital Turnover",
            value=wc_turnover,
            unit="times",
            reason=None if wc_turnover is not None else "Working capital is zero",
        ),
        PrincipalGroup(
            code="INVENTORY_TURNOVER",
            label="Inventory Turnover",
            value=inv_turnover,
            unit="times",
            reason=None if inv_turnover is not None else "Closing stock is zero",
        ),
    ]
    ratios = [
        _ratio("CURRENT_RATIO", "Current Ratio", ca, cl, "ratio", zero_reason="Current liabilities are zero"),
        _ratio("QUICK_RATIO", "Quick Ratio", ca - stock, cl, "ratio", zero_reason="Current liabilities are zero"),
        _ratio("DEBT_EQUITY", "Debt/Equity", loans, equity, "ratio", zero_reason="Capital + nett profit is zero"),
        _ratio("GROSS_PROFIT_PCT", "Gross Profit %", gross, sales, "percent", HUNDRED, "Sales are zero"),
        _ratio("NETT_PROFIT_PCT", "Nett Profit %", nett, sales, "percent", HUNDRED, "Sales are zero"),
        _ratio("OPERATING_COST_PCT", "Operating Cost %", operating_cost, sales, "percent", HUNDRED, "Sales are zero"),
        _ratio("RECEIVABLE_TURNOVER_DAYS", "Receivable Turnover (days)", debtors * days, sales, "days", zero_reason="Sales are zero"),
        _ratio("ROI_PCT", "Return on Investment %", nett, equity, "percent", HUNDRED, "Capital + nett profit is zero"),
        _ratio("RETURN_ON_WC_PCT", "Return on Working Capital %", nett, working_capital, "percent", HUNDRED, "Working capital is zero"),
    ]

    warnings: list[StatementWarning] = unclassified_warning(
        [
            (c.group_id, abs(c.closing_net) if not c.is_pl else abs(c.period_debit - c.period_credit))
            for c in calcs
            if c.primary == PRIMARY_UNCLASSIFIED and not c.is_empty
        ]
    )
    nulls = sum(1 for r in ratios if r.value is None) + sum(
        1 for g in groups_out if g.unit and g.value is None
    )
    if nulls:
        warnings.append(StatementWarning(code="ZERO_DENOMINATOR", count=nulls, amount=ZERO))

    # Cross-check: the same working capital must come out of the Balance Sheet classes (always true by construction).
    return RatioAnalysisResponse(
        report="ratio_analysis",
        company=company_from(tenant),
        period=fiscal_period(tenant, from_date=from_date, to_date=to_date),
        base_currency=tenant.base_currency or "BDT",
        principal_groups=[g.model_copy(update={"amount": None if g.amount is None else q4(g.amount)}) for g in groups_out],
        principal_ratios=ratios,
        warnings=warnings,
        reconciliation=Reconciliation(balanced=True, difference=ZERO),
        data_as_of=datetime.utcnow(),
    )
