"""Budget utilization checks for voucher post (warn / block modes).

Two rules, chosen by tenant flag ``budget_enforcement_v2`` (default ON, explicit False = legacy):

v2 (same numbers as Budget vs Actual, ``budget_vs_actual_service``):
    * FINAL budgets; a budget line counts when the voucher date is inside the line's own period
      (month ``YYYY-MM``, quarter ``YYYY-Qn`` of the financial year, otherwise the budget's whole
      financial year). Lines with no usable period are not enforced (as before).
    * Spend = base-currency debit - credit on Expense / Asset accounts (account group nature, else
      the account's normal balance). Income / Liability / Equity lines are never enforced (more
      income than budgeted is not overspending); an "any account" line counts only its
      Expense / Asset movement.
    * used = POSTED, in-books vouchers; pending = DRAFT / CHECKED / RECOMMENDED / APPROVED; both
      in that period, both netted. The voucher being posted is excluded.
    * Only budget lines this voucher ADDS spend to can warn or block. A refund / reversal (net
      credit) never blocks, and another cost centre being over budget does not block this voucher.

legacy (``budget_enforcement_v2`` = false): voucher-currency debits only, exact voucher month only,
and any over-budget line with a cost centre present on the voucher blocked it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.business_date import today_local
from app.common.tenant_feature_keys import (
    BUDGET_MODE_OFF,
    get_budget_enforcement_mode,
    is_budget_enforcement_v2_enabled,
)
from app.models.finance import AccountGroup, Budget, BudgetLine, ChartOfAccount, Voucher, VoucherLine
from app.modules.finance.advanced_voucher_service import voucher_in_books_clause
from app.modules.finance.budget_vs_actual_service import (
    RULE_DEBIT_MINUS_CREDIT,
    budget_line_period,
    net_rule,
)
from app.modules.finance.fiscal_year import fiscal_year_bounds_from_label, fy_start_month
from app.modules.finance.posting_core import line_base_amount, line_base_amount_sql

PENDING_STATUSES = ("DRAFT", "CHECKED", "RECOMMENDED", "APPROVED")
NEAR_LIMIT_PCT = 90.0
ZERO = Decimal("0")


def _to_float(v: object) -> float:
    if v is None:
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).replace(",", "").strip() or 0)
    except (TypeError, ValueError):
        return 0.0


@dataclass
class BudgetCheckResult:
    ok: bool
    mode: str
    remaining: float | None
    warnings: list[str] = field(default_factory=list)
    over_budget: bool = False
    has_budget: bool = False
    budget_amount: float | None = None
    used_amount: float | None = None
    pending_amount: float | None = None
    projected: float | None = None
    status: str = "within_budget"  # within_budget | near_limit | exceeded
    can_post: bool = True
    warning_message: str | None = None
    enforcement_mode: str = "off"


async def evaluate_voucher_budget(
    db: AsyncSession,
    *,
    tenant_id: int,
    feature_flags: Any,
    voucher: Voucher,
    lines: list[VoucherLine],
) -> BudgetCheckResult:
    """Compare voucher cost-center spend to FINAL budgets for the voucher month.

    Only lines with ``cost_center_id`` are checked. If no matching FINAL budget
    lines exist for the period, enforcement is a no-op (ok=True).
    """
    mode = get_budget_enforcement_mode(feature_flags)
    if mode == BUDGET_MODE_OFF:
        return BudgetCheckResult(
            ok=True,
            mode=mode,
            remaining=None,
            warnings=[],
            enforcement_mode=mode,
            status="within_budget",
            can_post=True,
        )

    cc_lines = [ln for ln in lines if ln.cost_center_id is not None]
    if not cc_lines:
        return BudgetCheckResult(
            ok=True,
            mode=mode,
            remaining=None,
            warnings=[],
            enforcement_mode=mode,
            status="within_budget",
            can_post=True,
        )

    if is_budget_enforcement_v2_enabled(feature_flags):
        return await _evaluate_v2(
            db, tenant_id=tenant_id, feature_flags=feature_flags, mode=mode, voucher=voucher, cc_lines=cc_lines
        )
    return await _evaluate_legacy(db, tenant_id=tenant_id, mode=mode, voucher=voucher, cc_lines=cc_lines)


def _no_budget(mode: str) -> BudgetCheckResult:
    return BudgetCheckResult(
        ok=True,
        mode=mode,
        remaining=None,
        warnings=[],
        enforcement_mode=mode,
        status="within_budget",
        can_post=True,
        has_budget=False,
    )


def _signed_spend(rule: str, entry_type: str | None, amount: Decimal) -> Decimal:
    """Spend contribution of one debit / credit amount on an account netted debit - credit."""
    if rule != RULE_DEBIT_MINUS_CREDIT:
        return ZERO
    return amount if (entry_type or "").upper() == "DEBIT" else -amount


def _period_label(line: BudgetLine, period_type: str, start: date, end: date) -> str:
    if period_type == "month":
        return str(line.period_month)
    return f"{line.period_month or 'FY'} ({start.isoformat()} to {end.isoformat()})"


async def _evaluate_v2(
    db: AsyncSession,
    *,
    tenant_id: int,
    feature_flags: Any,
    mode: str,
    voucher: Voucher,
    cc_lines: list[VoucherLine],
) -> BudgetCheckResult:
    v_date = voucher.voucher_date or today_local()
    start_month = fy_start_month(feature_flags)
    cc_ids = {int(ln.cost_center_id) for ln in cc_lines}
    candidates = (
        await db.execute(
            select(BudgetLine, Budget.fiscal_year)
            .join(Budget, BudgetLine.budget_id == Budget.id)
            .where(
                Budget.tenant_id == tenant_id,
                Budget.status == "FINAL",
                BudgetLine.tenant_id == tenant_id,
                BudgetLine.cost_center_id.in_(cc_ids),
            )
            .order_by(BudgetLine.id)
        )
    ).all()
    active: list[tuple[BudgetLine, str, date, date]] = []
    for line, fiscal_year in candidates:
        period_type, start, end = budget_line_period(
            line.period_month, fiscal_year_bounds_from_label(fiscal_year, start_month), start_month
        )
        if start is None or end is None or not (start <= v_date <= end):
            continue
        active.append((line, period_type, start, end))
    if not active:
        return _no_budget(mode)

    account_ids = {int(ln.account_id) for ln in cc_lines if ln.account_id}
    account_ids |= {int(line.account_id) for line, *_ in active if line.account_id is not None}
    rules: dict[int, str] = {}
    if account_ids:
        for acct_id, nature, normal_balance in (
            await db.execute(
                select(ChartOfAccount.id, AccountGroup.nature, ChartOfAccount.normal_balance)
                .join(AccountGroup, ChartOfAccount.group_id == AccountGroup.id)
                .where(ChartOfAccount.tenant_id == tenant_id, ChartOfAccount.id.in_(account_ids))
            )
        ).all():
            rules[acct_id] = net_rule(nature, normal_balance)

    def rule_of(account_id: int | None) -> str:
        return rules.get(account_id, RULE_DEBIT_MINUS_CREDIT) if account_id is not None else RULE_DEBIT_MINUS_CREDIT

    def applies(line: BudgetLine, cost_center_id: int | None, account_id: int | None) -> bool:
        if cost_center_id != line.cost_center_id:
            return False
        return line.account_id is None or account_id == line.account_id

    # Budget lines this voucher moves (Expense / Asset spend only), with the voucher's own net spend.
    touched: list[tuple[BudgetLine, str, date, date, Decimal]] = []
    for line, period_type, start, end in active:
        if line.account_id is not None and rule_of(line.account_id) != RULE_DEBIT_MINUS_CREDIT:
            continue
        proposed = ZERO
        for ln in cc_lines:
            acct = int(ln.account_id) if ln.account_id else None
            if applies(line, int(ln.cost_center_id), acct):
                proposed += _signed_spend(rule_of(acct), ln.entry_type, line_base_amount(ln))
        if proposed != ZERO:
            touched.append((line, period_type, start, end, proposed))
    if not touched:
        return _no_budget(mode)

    year_col = func.extract("year", Voucher.voucher_date)
    month_col = func.extract("month", Voucher.voucher_date)
    query = (
        select(
            Voucher.status,
            VoucherLine.account_id,
            VoucherLine.cost_center_id,
            VoucherLine.entry_type,
            year_col,
            month_col,
            func.coalesce(func.sum(line_base_amount_sql()), 0),
        )
        .join(Voucher, VoucherLine.voucher_id == Voucher.id)
        .where(
            VoucherLine.tenant_id == tenant_id,
            Voucher.tenant_id == tenant_id,
            Voucher.id != voucher.id,
            Voucher.status.in_(("POSTED", *PENDING_STATUSES)),
            voucher_in_books_clause(),
            VoucherLine.cost_center_id.in_({int(t[0].cost_center_id) for t in touched}),
            Voucher.voucher_date >= min(t[2] for t in touched),
            Voucher.voucher_date <= max(t[3] for t in touched),
        )
        .group_by(Voucher.status, VoucherLine.account_id, VoucherLine.cost_center_id, VoucherLine.entry_type, year_col, month_col)
    )
    if all(t[0].account_id is not None for t in touched):
        query = query.where(VoucherLine.account_id.in_({int(t[0].account_id) for t in touched}))
    movement = [
        (status, acct, cc, entry_type, date(int(year), int(month), 1), Decimal(str(total or 0)))
        for status, acct, cc, entry_type, year, month, total in (await db.execute(query)).all()
    ]
    unknown_accounts = {acct for _s, acct, *_ in movement if acct is not None and acct not in rules}
    if unknown_accounts:
        for acct_id, nature, normal_balance in (
            await db.execute(
                select(ChartOfAccount.id, AccountGroup.nature, ChartOfAccount.normal_balance)
                .join(AccountGroup, ChartOfAccount.group_id == AccountGroup.id)
                .where(ChartOfAccount.tenant_id == tenant_id, ChartOfAccount.id.in_(unknown_accounts))
            )
        ).all():
            rules[acct_id] = net_rule(nature, normal_balance)

    warnings: list[str] = []
    min_remaining: Decimal | None = None
    over = near = False
    totals = {"budget": ZERO, "used": ZERO, "pending": ZERO, "projected": ZERO}
    for line, period_type, start, end, proposed in touched:
        used = pending = ZERO
        for status, acct, cc, entry_type, month_start, amount in movement:
            if not applies(line, cc, acct) or not (start <= month_start <= end):
                continue
            spend = _signed_spend(rule_of(acct), entry_type, amount)
            if status == "POSTED":
                used += spend
            else:
                pending += spend
        budget_amt = Decimal(str(line.amount or 0))
        projected = used + pending + proposed
        remaining = budget_amt - projected
        totals["budget"] += budget_amt
        totals["used"] += used
        totals["pending"] += pending
        totals["projected"] += projected
        if min_remaining is None or remaining < min_remaining:
            min_remaining = remaining
        if proposed <= ZERO:
            continue  # this voucher lowers spend on the line: never warns or blocks
        where = f"cost center {line.cost_center_id}" + (f" / account {line.account_id}" if line.account_id else "")
        label = _period_label(line, period_type, start, end)
        if projected > budget_amt:
            over = True
            warnings.append(
                f"Budget exceeded for {where} in {label}: budget={round(float(budget_amt), 2)}, "
                f"projected={round(float(projected), 2)}, remaining={round(float(remaining), 4)}"
            )
        elif budget_amt > 0 and projected / budget_amt * 100 >= Decimal(str(NEAR_LIMIT_PCT)):
            near = True
            warnings.append(
                f"Budget near limit for {where} in {label}: "
                f"{round(float(projected / budget_amt * 100), 1)}% utilized. Remaining: {round(float(remaining), 4)}"
            )

    status = "exceeded" if over else ("near_limit" if near else "within_budget")
    can_post = not (over and mode == "block")
    return BudgetCheckResult(
        ok=can_post,
        mode=mode,
        remaining=round(float(min_remaining), 4) if min_remaining is not None else None,
        warnings=warnings,
        over_budget=over,
        has_budget=True,
        budget_amount=round(float(totals["budget"]), 4),
        used_amount=round(float(totals["used"]), 4),
        pending_amount=round(float(totals["pending"]), 4),
        projected=round(float(totals["projected"]), 4),
        status=status,
        can_post=can_post,
        warning_message="; ".join(warnings) if warnings else None,
        enforcement_mode=mode,
    )


async def _evaluate_legacy(
    db: AsyncSession,
    *,
    tenant_id: int,
    mode: str,
    voucher: Voucher,
    cc_lines: list[VoucherLine],
) -> BudgetCheckResult:
    period_month = (voucher.voucher_date or today_local()).strftime("%Y-%m")
    budget_rows = list(
        (
            await db.execute(
                select(Budget).where(
                    Budget.tenant_id == tenant_id,
                    Budget.status == "FINAL",
                )
            )
        )
        .scalars()
        .all()
    )
    if not budget_rows:
        return BudgetCheckResult(
            ok=True,
            mode=mode,
            remaining=None,
            warnings=[],
            enforcement_mode=mode,
            status="within_budget",
            can_post=True,
        )

    budget_ids = [b.id for b in budget_rows]
    budget_lines = list(
        (
            await db.execute(
                select(BudgetLine).where(
                    BudgetLine.tenant_id == tenant_id,
                    BudgetLine.budget_id.in_(budget_ids),
                    BudgetLine.period_month == period_month,
                    BudgetLine.cost_center_id.isnot(None),
                )
            )
        )
        .scalars()
        .all()
    )
    if not budget_lines:
        return BudgetCheckResult(
            ok=True,
            mode=mode,
            remaining=None,
            warnings=[],
            enforcement_mode=mode,
            status="within_budget",
            can_post=True,
        )

    posted_rows = list(
        (
            await db.execute(
                select(VoucherLine, Voucher)
                .join(Voucher, VoucherLine.voucher_id == Voucher.id)
                .where(
                    VoucherLine.tenant_id == tenant_id,
                    Voucher.status == "POSTED",
                    Voucher.id != voucher.id,
                    VoucherLine.cost_center_id.isnot(None),
                )
            )
        ).all()
    )
    pending_rows = list(
        (
            await db.execute(
                select(VoucherLine, Voucher)
                .join(Voucher, VoucherLine.voucher_id == Voucher.id)
                .where(
                    VoucherLine.tenant_id == tenant_id,
                    Voucher.status.in_(["DRAFT", "CHECKED", "RECOMMENDED", "APPROVED"]),
                    Voucher.id != voucher.id,
                    VoucherLine.cost_center_id.isnot(None),
                )
            )
        ).all()
    )

    # Aggregate proposed debit impact by (cost_center_id, account_id) — use absolute
    # amount for budget consumption (expense-style utilization).
    proposed: dict[tuple[int, int | None], float] = {}
    for ln in cc_lines:
        key = (int(ln.cost_center_id), int(ln.account_id) if ln.account_id else None)
        amt = _to_float(ln.amount)
        if (ln.entry_type or "").upper() == "CREDIT":
            continue
        proposed[key] = proposed.get(key, 0.0) + amt

    warnings: list[str] = []
    min_remaining: float | None = None
    over = False
    near = False
    tracked_budget = 0.0
    tracked_used = 0.0
    tracked_pending = 0.0
    tracked_projected = 0.0
    has_budget = False

    for bl in budget_lines:
        if bl.cost_center_id is None:
            continue
        budget_amt = _to_float(bl.amount)
        posted_actual = 0.0
        for voucher_line, _v in posted_rows:
            if voucher_line.cost_center_id != bl.cost_center_id:
                continue
            if bl.account_id is not None and voucher_line.account_id != bl.account_id:
                continue
            if (voucher_line.entry_type or "").upper() != "DEBIT":
                continue
            v_date = _v.voucher_date
            if v_date is None or v_date.strftime("%Y-%m") != period_month:
                continue
            posted_actual += _to_float(voucher_line.amount)

        pending_actual = 0.0
        for voucher_line, _v in pending_rows:
            if voucher_line.cost_center_id != bl.cost_center_id:
                continue
            if bl.account_id is not None and voucher_line.account_id != bl.account_id:
                continue
            if (voucher_line.entry_type or "").upper() != "DEBIT":
                continue
            v_date = _v.voucher_date
            if v_date is None or v_date.strftime("%Y-%m") != period_month:
                continue
            pending_actual += _to_float(voucher_line.amount)

        proposed_amt = 0.0
        for (cc_id, acct_id), amt in proposed.items():
            if cc_id != bl.cost_center_id:
                continue
            if bl.account_id is not None and acct_id != bl.account_id:
                continue
            proposed_amt += amt

        if proposed_amt <= 0 and posted_actual <= 0 and pending_actual <= 0:
            continue

        has_budget = True
        projected = posted_actual + pending_actual + proposed_amt
        remaining = round(budget_amt - projected, 4)
        tracked_budget += budget_amt
        tracked_used += posted_actual
        tracked_pending += pending_actual
        tracked_projected += projected
        if min_remaining is None or remaining < min_remaining:
            min_remaining = remaining
        util_pct = (projected / budget_amt * 100.0) if budget_amt > 0 else 0.0
        if projected > budget_amt + 1e-9:
            over = True
            warnings.append(
                f"Budget exceeded for cost center {bl.cost_center_id}"
                + (f" / account {bl.account_id}" if bl.account_id else "")
                + f" in {period_month}: budget={round(budget_amt, 2)}, "
                f"projected={round(projected, 2)}, remaining={remaining}"
            )
        elif util_pct >= 90.0:
            near = True
            warnings.append(
                f"Budget near limit for cost center {bl.cost_center_id}"
                + (f" / account {bl.account_id}" if bl.account_id else "")
                + f" in {period_month}: {round(util_pct, 1)}% utilized. Remaining: {remaining}"
            )

    if not has_budget:
        return BudgetCheckResult(
            ok=True,
            mode=mode,
            remaining=None,
            warnings=[],
            enforcement_mode=mode,
            status="within_budget",
            can_post=True,
            has_budget=False,
        )

    if over:
        status = "exceeded"
    elif near:
        status = "near_limit"
    else:
        status = "within_budget"

    can_post = True
    if over and mode == "block":
        can_post = False

    warning_message = "; ".join(warnings) if warnings else None
    return BudgetCheckResult(
        ok=can_post,
        mode=mode,
        remaining=min_remaining,
        warnings=warnings,
        over_budget=over,
        has_budget=True,
        budget_amount=round(tracked_budget, 4),
        used_amount=round(tracked_used, 4),
        pending_amount=round(tracked_pending, 4),
        projected=round(tracked_projected, 4),
        status=status,
        can_post=can_post,
        warning_message=warning_message,
        enforcement_mode=mode,
    )
