"""Budget vs actual by cost centre / account / month / department, with exact drill-down to voucher lines (Phase 4).

Actual = signed base-currency movement of POSTED in-books vouchers (a reversed voucher with its reversal nets to zero)
inside the fiscal year, on expense-nature accounts plus every account a selected budget line names. The SAME cells feed
every dimension and the drill-down, so each slice adds up to the same overall actual.

Budget: for cost centre / account / department the budget lines' amounts are summed as entered. For the month
dimension a "YYYY-MM" line goes to its month; a quarter ("YYYY-Qn") or annual line is spread EVENLY over its months
(4 decimals, rounding remainder on the last month, so the parts add up exactly). Lines whose month is outside the fiscal
year add their own months after the 12 fiscal months.

Query budget (independent of rows): scope 2-3, cells 1, names 2, drill 3.
"""

from __future__ import annotations

import csv
import io
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.spreadsheet_safety import neutralize_formula
from app.common.tenant_feature_keys import get_budget_enforcement_mode
from app.models.finance import ChartOfAccount, CostCenter, Voucher, VoucherLine
from app.modules.finance.budget_analytics.common import (
    ZERO,
    Scope,
    account_label,
    cc_label,
    department_of,
    in_books_conditions,
    join_lines,
    line_months,
    load_accounts,
    load_cost_centers,
    month_end,
    month_key,
    parse_month,
    q4,
    resolve_scope,
    signed_amount_sql,
    spread_amount,
    universe_clause,
)
from app.modules.finance.budget_analytics.constants import (
    CRITICAL_PERCENT,
    DIMENSIONS,
    OVER_PERCENT,
    STATUS_CRITICAL,
    STATUS_OVER,
    STATUS_WARNING,
    STATUS_WITHIN,
    WARNING_PERCENT,
)
from app.modules.finance.budget_analytics.schemas import (
    AnalyticsRow,
    AnalyticsTotals,
    BudgetAnalyticsResponse,
    BudgetRef,
    DrillLine,
    DrilldownResponse,
)

SPREAD_NOTE = (
    "Month view: quarter and annual budget lines are spread evenly over their months (4 decimals, the rounding "
    "remainder goes to the last month)."
)
NO_DEPARTMENT = "(No department)"


def status_for(budget: Decimal, actual: Decimal) -> tuple[str, Decimal | None]:
    """(status, used_percent). A zero budget with spend is 'over' (no percent); nothing spent is 'within'."""
    if budget <= ZERO:
        return (STATUS_OVER if actual > ZERO else STATUS_WITHIN), None
    used = actual / budget * Decimal("100")
    if used >= CRITICAL_PERCENT:
        return STATUS_CRITICAL, used
    if used >= OVER_PERCENT:
        return STATUS_OVER, used
    if used >= WARNING_PERCENT:
        return STATUS_WARNING, used
    return STATUS_WITHIN, used


def _row_numbers(budget: Decimal, actual: Decimal) -> dict[str, Any]:
    variance = budget - actual
    status, used = status_for(budget, actual)
    return {
        "budget": budget,
        "actual": actual,
        "variance": variance,
        "variance_percent": (variance / budget * Decimal("100")) if budget > ZERO else None,
        "used_percent": used,
        "status": status,
    }


async def fetch_actual_cells(db: AsyncSession, tenant_id: int, scope: Scope) -> dict[tuple[int, int | None, date], Decimal]:
    """{(account_id, cost_center_id, month_start): signed actual} for the fiscal year. One query."""
    year_col, month_col = func.extract("year", Voucher.voucher_date), func.extract("month", Voucher.voucher_date)
    stmt = join_lines(
        select(VoucherLine.account_id, VoucherLine.cost_center_id, year_col, month_col, func.coalesce(func.sum(signed_amount_sql()), 0)),
        tenant_id,
    ).where(
        *in_books_conditions(tenant_id),
        Voucher.voucher_date >= scope.start,
        Voucher.voucher_date <= scope.end,
        universe_clause(scope.account_ids),
    ).group_by(VoucherLine.account_id, VoucherLine.cost_center_id, year_col, month_col)
    cells: dict[tuple[int, int | None, date], Decimal] = {}
    for account_id, cc_id, year, month, total in (await db.execute(stmt)).all():
        cells[(account_id, cc_id, date(int(year), int(month), 1))] = q4(total)
    return cells


async def build_budget_analytics(
    db: AsyncSession, tenant: Any, *, fiscal_year: str | None, budget_id: int | None, dimension: str
) -> BudgetAnalyticsResponse:
    if dimension not in DIMENSIONS:
        raise ValueError(f"dimension must be one of: {', '.join(DIMENSIONS)}")
    scope = await resolve_scope(db, tenant, fiscal_year, budget_id)
    if dimension == "department":
        has_dept = await db.scalar(
            select(func.count())
            .select_from(CostCenter)
            .where(CostCenter.tenant_id == tenant.id, func.trim(func.coalesce(CostCenter.department, "")) != "")
        )
        if not has_dept:
            raise ValueError(
                "No cost centre has a department set, so a department view is not available. "
                "Fill in the department on the Finance cost centres first (HR departments are not used)."
            )
    cells = await fetch_actual_cells(db, tenant.id, scope)

    cc_ids = {k[1] for k in cells if k[1] is not None} | {ln.cost_center_id for ln in scope.lines if ln.cost_center_id is not None}
    account_ids = {k[0] for k in cells} | scope.account_ids
    cost_centers = await load_cost_centers(db, tenant.id, cc_ids)
    accounts = await load_accounts(db, tenant.id, account_ids) if dimension == "account" else {}

    def key_of(account_id: int | None, cc_id: int | None, month: date | None) -> Any:
        if dimension == "cost_center":
            return cc_id
        if dimension == "account":
            return account_id
        if dimension == "month":
            return month_key(month) if month else None
        return department_of(cost_centers.get(cc_id)) if cc_id is not None else ""

    actual_by: dict[Any, Decimal] = defaultdict(lambda: ZERO)
    for (account_id, cc_id, month), amount in cells.items():
        actual_by[key_of(account_id, cc_id, month)] += amount
    budget_by: dict[Any, Decimal] = defaultdict(lambda: ZERO)
    for line in scope.lines:
        amount = Decimal(str(line.amount or 0))
        if dimension == "month":
            for month, part in spread_amount(amount, line_months(line, scope)).items():
                budget_by[month_key(month)] += part
        else:
            budget_by[key_of(line.account_id, line.cost_center_id, None)] += amount

    keys = set(actual_by) | set(budget_by)
    if dimension == "month":
        fy_keys = [month_key(m) for m in scope.fy_months]
        ordered = fy_keys + sorted(k for k in keys if k not in fy_keys)
        keys |= set(fy_keys)  # show every fiscal month, even an empty one
    else:
        def label(k: Any) -> str:
            if dimension == "cost_center":
                return cc_label(cost_centers.get(k), k)
            if dimension == "account":
                return account_label(accounts.get(k), k)
            return k or NO_DEPARTMENT

        ordered = sorted(keys, key=lambda k: (k is None or k == "", label(k).lower(), str(k)))

    rows: list[AnalyticsRow] = []
    for k in ordered:
        if k not in keys:
            continue
        if dimension == "cost_center":
            row_id, label_text = k, cc_label(cost_centers.get(k), k)
        elif dimension == "account":
            row_id, label_text = k, account_label(accounts.get(k), k) if k is not None else "(Any account)"
        elif dimension == "month":
            row_id = label_text = k
        else:
            row_id, label_text = (k or None), (k or NO_DEPARTMENT)
        rows.append(AnalyticsRow(id=row_id, label=label_text, **_row_numbers(q4(budget_by.get(k, ZERO)), q4(actual_by.get(k, ZERO)))))

    total_budget = sum((r.budget for r in rows), ZERO)
    total_actual = sum((r.actual for r in rows), ZERO)
    totals = AnalyticsTotals(**_row_numbers(total_budget, total_actual))
    notes: list[str] = []
    if dimension == "month":
        notes.append(SPREAD_NOTE)
    if not scope.budgets:
        notes.append("No FINAL budget covers this fiscal year, so budget amounts are 0.")
    notes.append("Actual counts expense accounts plus any account named by a budget line, posted and in the books.")
    return BudgetAnalyticsResponse(
        fiscal_year=scope.label,
        fiscal_year_start=scope.start,
        fiscal_year_end=scope.end,
        dimension=dimension,
        base_currency=tenant.base_currency or "BDT",
        enforcement_mode=get_budget_enforcement_mode(tenant.feature_flags),
        budgets=[BudgetRef(id=b.id, budget_name=b.budget_name, status=b.status) for b in scope.budgets],
        rows=rows,
        totals=totals,
        notes=notes,
        data_as_of=datetime.utcnow(),
    )


# ---- drill-down ------------------------------------------------------------------------------------------------------
async def build_drilldown(
    db: AsyncSession,
    tenant: Any,
    *,
    fiscal_year: str | None,
    budget_id: int | None,
    cost_center_id: int | None,
    no_cost_center: bool,
    account_id: int | None,
    department: str | None,
    no_department: bool,
    month: str | None,
    limit: int,
    offset: int,
) -> DrilldownResponse:
    if cost_center_id is not None and no_cost_center:
        raise ValueError("Use either cost_center_id or no_cost_center, not both")
    if department is not None and no_department:
        raise ValueError("Use either department or no_department, not both")
    scope = await resolve_scope(db, tenant, fiscal_year, budget_id)
    start, end = scope.start, scope.end
    if month:
        first = parse_month(month)
        if not (scope.start <= first <= scope.end):
            raise ValueError("month is outside the fiscal year")
        start, end = first, month_end(first)
    cc_map: dict[int, CostCenter] = {}
    if cost_center_id is not None:
        cc_map = await load_cost_centers(db, tenant.id, {cost_center_id})
        if cost_center_id not in cc_map:
            raise LookupError("Cost centre not found")
    if account_id is not None:
        if account_id not in await load_accounts(db, tenant.id, {account_id}):
            raise LookupError("Account not found")

    conds = [*in_books_conditions(tenant.id), Voucher.voucher_date >= start, Voucher.voucher_date <= end, universe_clause(scope.account_ids)]
    if cost_center_id is not None:
        conds.append(VoucherLine.cost_center_id == cost_center_id)
    if no_cost_center:
        conds.append(VoucherLine.cost_center_id.is_(None))
    if account_id is not None:
        conds.append(VoucherLine.account_id == account_id)
    dept_expr = func.trim(func.coalesce(CostCenter.department, ""))
    if department is not None:
        conds.append(dept_expr == department.strip())
    if no_department:
        conds.append(dept_expr == "")

    cc_join = and_(CostCenter.id == VoucherLine.cost_center_id, CostCenter.tenant_id == tenant.id)

    def base(stmt):
        stmt = join_lines(stmt, tenant.id)
        if department is not None or no_department:
            stmt = stmt.outerjoin(CostCenter, cc_join)
        return stmt.where(*conds)

    total, count = (
        await db.execute(base(select(func.coalesce(func.sum(signed_amount_sql()), 0), func.count(VoucherLine.id))))
    ).one()
    page_stmt = join_lines(
        select(
            VoucherLine.id,
            Voucher.id,
            Voucher.voucher_number,
            Voucher.voucher_date,
            Voucher.status,
            ChartOfAccount.id,
            ChartOfAccount.account_number,
            ChartOfAccount.name,
            VoucherLine.cost_center_id,
            CostCenter.name,
            func.coalesce(VoucherLine.notes, Voucher.description),
            VoucherLine.entry_type,
            signed_amount_sql(),
        ),
        tenant.id,
    ).outerjoin(CostCenter, cc_join).where(*conds)
    page_stmt = page_stmt.order_by(Voucher.voucher_date, Voucher.id, VoucherLine.id).limit(limit).offset(offset)
    lines = [
        DrillLine(
            voucher_line_id=r[0], voucher_id=r[1], voucher_number=r[2], voucher_date=r[3], voucher_status=r[4],
            account_id=r[5], account_number=r[6], account_name=r[7], cost_center_id=r[8], cost_center_name=r[9],
            narration=r[10], entry_type=(r[11] or "").upper(), base_amount=abs(q4(r[12])), signed_amount=q4(r[12]),
        )
        for r in (await db.execute(page_stmt)).all()
    ]
    return DrilldownResponse(
        fiscal_year=scope.label,
        base_currency=tenant.base_currency or "BDT",
        filters={
            "budget_id": budget_id, "cost_center_id": cost_center_id, "no_cost_center": no_cost_center,
            "account_id": account_id, "department": department, "no_department": no_department, "month": month,
        },
        total=q4(total),
        line_count=int(count or 0),
        limit=limit,
        offset=offset,
        lines=lines,
        data_as_of=datetime.utcnow(),
    )


# ---- CSV export ------------------------------------------------------------------------------------------------------
def _csv_safe(text: str) -> str:
    """Stop spreadsheet formula injection (shared rule in `app.common.spreadsheet_safety`)."""
    return neutralize_formula(text)


def analytics_to_csv(data: BudgetAnalyticsResponse) -> str:
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["id", "label", "budget", "actual", "variance", "variance_percent", "used_percent", "status"])

    def fmt(v: Decimal | None) -> str:
        return "" if v is None else format(v.quantize(Decimal("0.0001")), "f")

    for r in data.rows:
        writer.writerow(
            [_csv_safe("" if r.id is None else str(r.id)), _csv_safe(r.label), fmt(r.budget), fmt(r.actual), fmt(r.variance),
             fmt(r.variance_percent), fmt(r.used_percent), r.status]
        )
    t = data.totals
    writer.writerow(["", "TOTAL", fmt(t.budget), fmt(t.actual), fmt(t.variance), fmt(t.variance_percent), fmt(t.used_percent), t.status])
    return out.getvalue()
