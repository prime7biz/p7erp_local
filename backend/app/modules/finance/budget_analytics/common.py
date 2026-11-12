"""Shared pieces: signed base-currency movement in SQL, fiscal-year scope, budget period months.

One SQL expression (`signed_amount_sql`) signs every voucher line exactly like `budget_vs_actual_service.net_rule`
(group nature first, else the account's normal balance), so every slice, drill-down and total adds up to the same number.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import ROUND_DOWN, ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.business_date import today_local
from app.models.finance import AccountGroup, Budget, BudgetLine, ChartOfAccount, CostCenter, Voucher, VoucherLine
from app.modules.finance.advanced_voucher_service import voucher_counts_in_books_status_clause, voucher_in_books_clause
from app.modules.finance.budget_analytics.constants import EXPENSE_NATURE, MAX_BUDGETS_SCANNED
from app.modules.finance.budget_vs_actual_service import CREDIT_NATURES, DEBIT_NATURES, budget_line_period
from app.modules.finance.fiscal_year import (
    fiscal_year_bounds,
    fiscal_year_bounds_from_label,
    fiscal_year_label,
    fiscal_year_of,
    fy_start_month,
)
from app.modules.finance.posting_core import line_base_amount_sql

ZERO = Decimal("0")
Q4 = Decimal("0.0001")
_FY_RE = re.compile(r"^\d{4}(-\d{2}(\d{2})?)?$")
_MONTH_RE = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")
MIN_YEAR, MAX_YEAR = 1900, 9990  # same bounds as the statements API fiscal_year


def check_report_date(d: date, name: str) -> None:
    """ValueError (-> 422) for a date whose year is outside MIN_YEAR..MAX_YEAR (date maths would overflow)."""
    if not (MIN_YEAR <= d.year <= MAX_YEAR):
        raise ValueError(f"{name} must be between the years {MIN_YEAR} and {MAX_YEAR}")


def q4(value: Any) -> Decimal:
    return Decimal(str(value or 0)).quantize(Q4, rounding=ROUND_HALF_UP)


def month_key(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def parse_month(text: str) -> date:
    """'YYYY-MM' -> first day of that month. ValueError (-> 422) otherwise."""
    m = _MONTH_RE.match((text or "").strip())
    if not m:
        raise ValueError("month must look like YYYY-MM (for example 2026-07)")
    return date(int(m.group(1)), int(m.group(2)), 1)


def add_months(d: date, months: int) -> date:
    total = d.year * 12 + (d.month - 1) + months
    return date(total // 12, total % 12 + 1, 1)


def month_end(d: date) -> date:
    return add_months(d.replace(day=1), 1) - timedelta(days=1)


def months_between(start: date, end: date) -> list[date]:
    out, cur = [], start.replace(day=1)
    while cur <= end:
        out.append(cur)
        cur = add_months(cur, 1)
    return out


# ---- SQL: signed movement ----------------------------------------------------------------------------------------
def signed_amount_sql():
    """Voucher line base amount signed by account nature (needs ChartOfAccount + AccountGroup in the FROM clause)."""
    nature = func.lower(func.coalesce(AccountGroup.nature, ""))
    normal = func.lower(func.coalesce(ChartOfAccount.normal_balance, ""))
    credit_rule = or_(nature.in_(tuple(CREDIT_NATURES)), and_(nature.not_in(tuple(DEBIT_NATURES)), normal == "credit"))
    is_debit = func.upper(func.coalesce(VoucherLine.entry_type, "")) == "DEBIT"
    base = line_base_amount_sql()
    return case((credit_rule, case((is_debit, -base), else_=base)), else_=case((is_debit, base), else_=-base))


def debit_minus_credit_sql():
    base = line_base_amount_sql()
    return case((func.upper(func.coalesce(VoucherLine.entry_type, "")) == "DEBIT", base), else_=-base)


def in_books_conditions(tenant_id: int) -> list:
    return [VoucherLine.tenant_id == tenant_id, Voucher.tenant_id == tenant_id, voucher_counts_in_books_status_clause(), voucher_in_books_clause()]


def join_lines(stmt, tenant_id: int):
    """Voucher line -> voucher / account / group of `tenant_id` (outer for the group so a missing group never drops money)."""
    return (
        stmt.select_from(VoucherLine)
        .join(Voucher, and_(VoucherLine.voucher_id == Voucher.id, Voucher.tenant_id == tenant_id))
        .join(ChartOfAccount, and_(ChartOfAccount.id == VoucherLine.account_id, ChartOfAccount.tenant_id == tenant_id))
        .outerjoin(AccountGroup, and_(AccountGroup.id == ChartOfAccount.group_id, AccountGroup.tenant_id == tenant_id))
    )


def universe_clause(budget_account_ids: set[int]):
    """Accounts that count as 'spend': expense-nature groups plus any account a selected budget line names."""
    expense = func.lower(func.coalesce(AccountGroup.nature, "")) == EXPENSE_NATURE
    if budget_account_ids:
        return or_(expense, ChartOfAccount.id.in_(budget_account_ids))
    return expense


# ---- scope ---------------------------------------------------------------------------------------------------------
@dataclass
class Scope:
    start_month: int
    label: str
    start: date
    end: date
    budgets: list[Budget] = field(default_factory=list)
    lines: list[BudgetLine] = field(default_factory=list)
    account_ids: set[int] = field(default_factory=set)

    @property
    def fy_months(self) -> list[date]:
        return months_between(self.start, self.end)


async def resolve_scope(db: AsyncSession, tenant: Any, fiscal_year: str | None, budget_id: int | None) -> Scope:
    """Fiscal year window + the budgets and lines it covers. ValueError -> 422, LookupError -> 404."""
    sm = fy_start_month(tenant.feature_flags)
    if fiscal_year is not None and not _FY_RE.match(fiscal_year.strip()):
        raise ValueError("fiscal_year must look like 2026 or 2026-27")
    if fiscal_year is not None and not (MIN_YEAR <= int(fiscal_year.strip()[:4]) <= MAX_YEAR):
        raise ValueError(f"fiscal_year must be between {MIN_YEAR} and {MAX_YEAR}")
    budgets: list[Budget]
    if budget_id is not None:
        budget = await db.get(Budget, budget_id)
        if budget is None or budget.tenant_id != tenant.id:
            raise LookupError("Budget not found")
        bounds = fiscal_year_bounds_from_label(budget.fiscal_year, sm)
        if bounds is None:
            raise ValueError("This budget has no usable fiscal year label")
        if fiscal_year is not None:
            asked = fiscal_year_bounds_from_label(fiscal_year.strip(), sm)
            if asked != bounds:
                raise ValueError("fiscal_year does not match the selected budget")
        label = fiscal_year.strip() if fiscal_year else budget.fiscal_year
        budgets = [budget]
    else:
        if fiscal_year:
            label = fiscal_year.strip()
            bounds = fiscal_year_bounds_from_label(label, sm)
            if bounds is None:
                raise ValueError(f"fiscal_year must be between {MIN_YEAR} and {MAX_YEAR}")
        else:
            fy = fiscal_year_of(today_local(tenant), sm)
            label = fiscal_year_label(fy, sm)
            bounds = fiscal_year_bounds(date(fy, sm, 1), sm)
        year_prefix = str(bounds[0].year)
        candidates = (
            (
                await db.execute(
                    select(Budget)
                    .where(Budget.tenant_id == tenant.id, Budget.status == "FINAL", Budget.fiscal_year.like(f"{year_prefix}%"))
                    .order_by(Budget.id)
                    .limit(MAX_BUDGETS_SCANNED)
                )
            )
            .scalars()
            .all()
        )
        budgets = [b for b in candidates if fiscal_year_bounds_from_label(b.fiscal_year, sm) == bounds]
    scope = Scope(start_month=sm, label=label, start=bounds[0], end=bounds[1], budgets=budgets)
    if budgets:
        scope.lines = list(
            (
                await db.execute(
                    select(BudgetLine)
                    .where(BudgetLine.tenant_id == tenant.id, BudgetLine.budget_id.in_([b.id for b in budgets]))
                    .order_by(BudgetLine.id)
                )
            )
            .scalars()
            .all()
        )
        scope.account_ids = {ln.account_id for ln in scope.lines if ln.account_id is not None}
    return scope


def line_months(line: BudgetLine, scope: Scope) -> list[date]:
    """Calendar months a budget line covers (month: 1, quarter: 3, year / unparseable: the fiscal year)."""
    _kind, start, end = budget_line_period(line.period_month, (scope.start, scope.end), scope.start_month)
    if start is None or end is None:
        return scope.fy_months
    return months_between(start, end)


def spread_amount(amount: Decimal, months: list[date]) -> dict[date, Decimal]:
    """Even split in 4 decimals; the rounding remainder goes to the last month so the parts add up exactly."""
    n = len(months)
    amount = Decimal(str(amount or 0))
    share = (amount / n).quantize(Q4, rounding=ROUND_DOWN)
    out = {m: share for m in months}
    out[months[-1]] = amount - share * (n - 1)
    return out


async def load_cost_centers(db: AsyncSession, tenant_id: int, ids: set[int]) -> dict[int, CostCenter]:
    if not ids:
        return {}
    rows = (await db.execute(select(CostCenter).where(CostCenter.tenant_id == tenant_id, CostCenter.id.in_(ids)))).scalars().all()
    return {c.id: c for c in rows}


async def load_accounts(db: AsyncSession, tenant_id: int, ids: set[int]) -> dict[int, ChartOfAccount]:
    if not ids:
        return {}
    rows = (
        await db.execute(select(ChartOfAccount).where(ChartOfAccount.tenant_id == tenant_id, ChartOfAccount.id.in_(ids)))
    ).scalars().all()
    return {a.id: a for a in rows}


def account_label(acct: ChartOfAccount | None, fallback_id: int | None) -> str:
    if acct is None:
        return f"Account #{fallback_id}" if fallback_id is not None else "(Any account)"
    return f"{acct.account_number} - {acct.name}" if acct.account_number else acct.name


def cc_label(cc: CostCenter | None, fallback_id: int | None) -> str:
    if cc is None:
        return f"Cost centre #{fallback_id}" if fallback_id is not None else "(No cost centre)"
    return f"{cc.center_code} - {cc.name}" if cc.center_code else cc.name


def department_of(cc: CostCenter | None) -> str:
    return (cc.department or "").strip() if cc is not None else ""


def vendor_link_subquery(tenant_id: int):
    """voucher_id -> vendor_id from the explicit vendor bill link (cancelled bills ignored). One row per voucher."""
    from app.models.finance import VendorBill

    return (
        select(VendorBill.voucher_id.label("voucher_id"), func.min(VendorBill.vendor_id).label("vendor_id"))
        .where(
            VendorBill.tenant_id == tenant_id,
            VendorBill.voucher_id.is_not(None),
            func.upper(VendorBill.status) != "CANCELLED",
        )
        .group_by(VendorBill.voucher_id)
        .subquery("vendor_link")
    )
