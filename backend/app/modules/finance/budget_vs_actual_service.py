"""Budget vs actual: compare each budget line with posted actuals for that line's own period.

Period of a budget line (``budget_lines.period_month``):
    "YYYY-MM"   -> that calendar month (what the Budgets screen saves)
    "YYYY-Qn"   -> quarter n of the financial year that starts in YYYY (Q1 = first 3 months of that FY)
    anything else ("", "2026", "2025-26", "ANNUAL", ...) -> the budget's whole financial year

Actual = net movement of POSTED, in-books voucher lines (base currency), signed by account nature.
The nature comes from the account's group (``account_groups.nature``); when the group nature is
missing or unknown we fall back to the account's ``normal_balance``:
    Expense, Asset              -> debit - credit
    Income, Liability, Equity   -> credit - debit
A budget line with no account ("Any account") signs every voucher line by that line's own account.
"""

from __future__ import annotations

import re
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.finance import AccountGroup, Budget, BudgetLine, ChartOfAccount, Voucher, VoucherLine
from app.modules.finance.advanced_voucher_service import (
    voucher_counts_in_books_status_clause,
    voucher_in_books_clause,
)
from app.modules.finance.fiscal_year import fiscal_year_bounds_from_label, fy_start_month
from app.modules.finance.posting_core import line_base_amount_sql

ZERO = Decimal("0")

DEBIT_NATURES = frozenset({"expense", "asset"})
CREDIT_NATURES = frozenset({"income", "liability", "equity"})

RULE_DEBIT_MINUS_CREDIT = "debit_minus_credit"
RULE_CREDIT_MINUS_DEBIT = "credit_minus_debit"
RULE_PER_ACCOUNT = "per_account"

_MONTH_RE = re.compile(r"^(\d{4})-(\d{1,2})$")
_QUARTER_RE = re.compile(r"^(\d{4})-?Q([1-4])$", re.IGNORECASE)


def net_rule(nature: str | None, normal_balance: str | None) -> str:
    """Which way to net an account: ``debit_minus_credit`` or ``credit_minus_debit``."""
    n = (nature or "").strip().lower()
    if n in DEBIT_NATURES:
        return RULE_DEBIT_MINUS_CREDIT
    if n in CREDIT_NATURES:
        return RULE_CREDIT_MINUS_DEBIT
    if (normal_balance or "").strip().lower() == "credit":
        return RULE_CREDIT_MINUS_DEBIT
    return RULE_DEBIT_MINUS_CREDIT


def net_amount(rule: str, debit: Decimal, credit: Decimal) -> Decimal:
    return credit - debit if rule == RULE_CREDIT_MINUS_DEBIT else debit - credit


def _add_months(d: date, months: int) -> date:
    total = d.year * 12 + (d.month - 1) + months
    return date(total // 12, total % 12 + 1, 1)


def budget_line_period(
    period_month: str | None,
    fy_bounds: tuple[date, date] | None,
    start_month: int = 1,
) -> tuple[str, date | None, date | None]:
    """Return ``(period_type, start, end)`` for a budget line.

    ``period_type`` is "month", "quarter", "year" (the budget's financial year) or "all"
    (old free-text budgets with no usable year: no date limit, same as before).
    """
    text = str(period_month or "").strip()
    m = _MONTH_RE.match(text)
    if m:
        year, month = int(m.group(1)), int(m.group(2))
        if 1900 <= year <= 9998 and 1 <= month <= 12:
            start = date(year, month, 1)
            return "month", start, _add_months(start, 1) - timedelta(days=1)
    q = _QUARTER_RE.match(text)
    if q:
        year, quarter = int(q.group(1)), int(q.group(2))
        if 1900 <= year <= 9998:
            start = _add_months(date(year, start_month, 1), 3 * (quarter - 1))
            return "quarter", start, _add_months(start, 3) - timedelta(days=1)
    if fy_bounds is not None:
        return "year", fy_bounds[0], fy_bounds[1]
    return "all", None, None


def _money(v: Decimal) -> float:
    return round(float(v), 2)


async def compute_budget_vs_actual(db: AsyncSession, tenant: Any, budget: Budget) -> dict[str, Any]:
    start_month = fy_start_month(tenant.feature_flags)
    fy_bounds = fiscal_year_bounds_from_label(budget.fiscal_year, start_month)
    lines = list(
        (await db.execute(select(BudgetLine).where(BudgetLine.budget_id == budget.id).order_by(BudgetLine.id)))
        .scalars()
        .all()
    )
    periods = {line.id: budget_line_period(line.period_month, fy_bounds, start_month) for line in lines}

    # One grouped query: debit/credit totals per (account, cost centre, side, calendar month).
    # Every period type is whole months, so month buckets are enough to rebuild any line period.
    movement: list[tuple[int, int | None, str, date, Decimal]] = []
    if lines:
        year_col = func.extract("year", Voucher.voucher_date)
        month_col = func.extract("month", Voucher.voucher_date)
        query = (
            select(
                VoucherLine.account_id,
                VoucherLine.cost_center_id,
                VoucherLine.entry_type,
                year_col,
                month_col,
                func.coalesce(func.sum(line_base_amount_sql()), 0),
            )
            .join(Voucher, VoucherLine.voucher_id == Voucher.id)
            .where(VoucherLine.tenant_id == tenant.id, voucher_counts_in_books_status_clause(), voucher_in_books_clause())
            .group_by(VoucherLine.account_id, VoucherLine.cost_center_id, VoucherLine.entry_type, year_col, month_col)
        )
        if all(start is not None for _, start, _ in periods.values()):
            query = query.where(
                Voucher.voucher_date >= min(p[1] for p in periods.values()),
                Voucher.voucher_date <= max(p[2] for p in periods.values()),
            )
        if all(line.account_id is not None for line in lines):
            query = query.where(VoucherLine.account_id.in_({line.account_id for line in lines}))
        if all(line.cost_center_id is not None for line in lines):
            query = query.where(VoucherLine.cost_center_id.in_({line.cost_center_id for line in lines}))
        for account_id, cost_center_id, entry_type, year, month, total in (await db.execute(query)).all():
            side = "DEBIT" if (entry_type or "").upper() == "DEBIT" else "CREDIT"
            movement.append((account_id, cost_center_id, side, date(int(year), int(month), 1), Decimal(str(total or 0))))

    # Nature of every account we need (budget-line accounts + accounts that moved).
    account_ids = {line.account_id for line in lines if line.account_id is not None}
    account_ids |= {row[0] for row in movement if row[0] is not None}
    nature_by_account: dict[int, tuple[str | None, str]] = {}
    if account_ids:
        nature_rows = await db.execute(
            select(ChartOfAccount.id, AccountGroup.nature, ChartOfAccount.normal_balance)
            .join(AccountGroup, ChartOfAccount.group_id == AccountGroup.id)
            .where(ChartOfAccount.tenant_id == tenant.id, ChartOfAccount.id.in_(account_ids))
        )
        for acct_id, nature, normal_balance in nature_rows.all():
            nature_by_account[acct_id] = (nature, net_rule(nature, normal_balance))

    rows = []
    total_budget = ZERO
    total_actual = ZERO
    for line in lines:
        period_type, start, end = periods[line.id]
        debit = ZERO
        credit = ZERO
        actual = ZERO
        for account_id, cost_center_id, side, month_start, amount in movement:
            if line.account_id is not None and account_id != line.account_id:
                continue
            if line.cost_center_id is not None and cost_center_id != line.cost_center_id:
                continue
            if start is not None and not (start <= month_start <= end):
                continue
            rule = nature_by_account.get(account_id, (None, RULE_DEBIT_MINUS_CREDIT))[1]
            if side == "DEBIT":
                debit += amount
                actual += net_amount(rule, amount, ZERO)
            else:
                credit += amount
                actual += net_amount(rule, ZERO, amount)
        if line.account_id is not None:
            nature, rule = nature_by_account.get(line.account_id, (None, RULE_DEBIT_MINUS_CREDIT))
        else:
            nature, rule = None, RULE_PER_ACCOUNT
        budget_amount = Decimal(str(line.amount or 0))
        total_budget += budget_amount
        total_actual += actual
        budget_f = float(budget_amount)
        actual_f = float(actual)
        rows.append(
            {
                "line_id": line.id,
                "period_month": line.period_month,
                "account_id": line.account_id,
                "cost_center_id": line.cost_center_id,
                "budget_amount": round(budget_f, 2),
                "actual_amount": round(actual_f, 2),
                "variance": round(actual_f - budget_f, 2),
                "variance_pct": round(((actual_f - budget_f) / budget_f * 100) if budget_f > 0 else 0, 2),
                "period_type": period_type,
                "period_start": start.isoformat() if start else None,
                "period_end": end.isoformat() if end else None,
                "nature": nature,
                "net_rule": rule,
                "actual_debit": _money(debit),
                "actual_credit": _money(credit),
            }
        )
    return {
        "budget_id": budget.id,
        "budget_name": budget.budget_name,
        "fiscal_year": budget.fiscal_year,
        "period_start": fy_bounds[0].isoformat() if fy_bounds else None,
        "period_end": fy_bounds[1].isoformat() if fy_bounds else None,
        "rows": rows,
        "total_budget": _money(total_budget),
        "total_actual": _money(total_actual),
        "total_variance": _money(total_actual - total_budget),
    }
