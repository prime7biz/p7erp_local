"""Expense analysis (Phase 4): totals by month / account / cost centre / vendor with a previous-period comparison.

Expense = debit minus credit base-currency movement of POSTED in-books vouchers on accounts whose group's effective
statement class is in EXPENSE_CLASSES (DIRECT_EXPENSES, INDIRECT_EXPENSES, COGS, PURCHASE_ACCOUNTS). Groups with no
statement class whose nature is "Expense" are NOT guessed into a class: they are reported separately in `warnings`
(UNCLASSIFIED_EXPENSE_GROUPS) and left out of every total.

Previous period = the same number of days directly before from_date.
Vendor grouping uses ONLY the explicit link vendor_bills.voucher_id -> voucher (cancelled bills ignored); expense on
vouchers with no such link goes to the row "(No vendor bill link)".
Month rows compare each month with the previous CALENDAR month (full month); totals use the previous period above.

Query budget: 2 (group classes) + 1 (data) + 1 (names).
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.finance import ChartOfAccount, Voucher, VoucherLine
from app.models.inventory import Vendor
from app.modules.finance.budget_analytics.common import (
    ZERO,
    account_label,
    add_months,
    cc_label,
    debit_minus_credit_sql,
    in_books_conditions,
    load_accounts,
    load_cost_centers,
    month_key,
    months_between,
    q4,
    vendor_link_subquery,
)
from app.modules.finance.budget_analytics.constants import (
    EXPENSE_CLASSES,
    EXPENSE_GROUP_BY,
    EXPENSE_NATURE,
    MAX_ANALYSIS_DAYS,
)
from app.modules.finance.budget_analytics.schemas import (
    ExpenseAnalysisResponse,
    ExpenseClassTotal,
    ExpenseRow,
    ExpenseWarning,
)
from app.modules.finance.statements.classification_service import GroupInfo, load_group_classification

NO_VENDOR = "(No vendor bill link)"


def expense_group_ids(groups: dict[int, GroupInfo]) -> tuple[dict[int, str], set[int]]:
    """({group_id: expense class} for classified expense groups, {group ids with no class but nature Expense})."""
    classified = {gid: g.effective_class for gid, g in groups.items() if g.effective_class in EXPENSE_CLASSES}
    unclassified = {
        gid for gid, g in groups.items() if g.effective_class is None and (g.nature or "").strip().lower() == EXPENSE_NATURE
    }
    return classified, unclassified


def previous_period(from_date: date, to_date: date) -> tuple[date, date]:
    days = (to_date - from_date).days + 1
    prev_to = from_date - timedelta(days=1)
    return prev_to - timedelta(days=days - 1), prev_to


def _pct(change: Decimal, previous: Decimal) -> Decimal | None:
    return (change / previous * Decimal("100")) if previous > ZERO else None


async def build_expense_analysis(
    db: AsyncSession, tenant: Any, *, from_date: date, to_date: date, group_by: str
) -> ExpenseAnalysisResponse:
    if group_by not in EXPENSE_GROUP_BY:
        raise ValueError(f"group_by must be one of: {', '.join(EXPENSE_GROUP_BY)}")
    if from_date > to_date:
        raise ValueError("from_date must be on or before to_date")
    if (to_date - from_date).days + 1 > MAX_ANALYSIS_DAYS:
        raise ValueError(f"The period may not be longer than {MAX_ANALYSIS_DAYS} days")
    prev_from, prev_to = previous_period(from_date, to_date)

    groups = await load_group_classification(db, tenant.id)
    class_of, unclassified_ids = expense_group_ids(groups)
    all_ids = set(class_of) | unclassified_ids
    fetch_from = min(prev_from, add_months(from_date.replace(day=1), -1)) if group_by == "month" else prev_from

    amount = debit_minus_credit_sql()
    d = Voucher.voucher_date
    cur = func.coalesce(func.sum(case((and_(d >= from_date, d <= to_date), amount), else_=0)), 0)
    prv = func.coalesce(func.sum(case((and_(d >= prev_from, d <= prev_to), amount), else_=0)), 0)
    full = func.coalesce(func.sum(amount), 0)
    data: list[Any] = []
    if all_ids:
        key_cols: list[Any] = []
        link = None
        if group_by == "month":
            key_cols = [func.extract("year", d), func.extract("month", d)]
        elif group_by == "cost_center":
            key_cols = [VoucherLine.cost_center_id]
        elif group_by == "vendor":
            link = vendor_link_subquery(tenant.id)
            key_cols = [link.c.vendor_id]
        stmt = (
            select(ChartOfAccount.id, ChartOfAccount.group_id, *key_cols, cur, prv, full)
            .select_from(VoucherLine)
            .join(Voucher, VoucherLine.voucher_id == Voucher.id)
            .join(ChartOfAccount, ChartOfAccount.id == VoucherLine.account_id)
        )
        if link is not None:
            stmt = stmt.outerjoin(link, link.c.voucher_id == Voucher.id)
        stmt = stmt.where(
            *in_books_conditions(tenant.id),
            ChartOfAccount.tenant_id == tenant.id,
            ChartOfAccount.group_id.in_(all_ids),
            d >= fetch_from,
            d <= to_date,
        ).group_by(ChartOfAccount.id, ChartOfAccount.group_id, *key_cols)
        data = list((await db.execute(stmt)).all())

    cur_by: dict[Any, Decimal] = defaultdict(lambda: ZERO)
    prv_by: dict[Any, Decimal] = defaultdict(lambda: ZERO)
    full_by: dict[Any, Decimal] = defaultdict(lambda: ZERO)
    class_cur: dict[str, Decimal] = defaultdict(lambda: ZERO)
    class_prv: dict[str, Decimal] = defaultdict(lambda: ZERO)
    un_cur = un_prv = ZERO
    un_accounts: set[int] = set()
    for row in data:
        account_id, group_id = row[0], row[1]
        c, p, f = q4(row[-3]), q4(row[-2]), q4(row[-1])
        if group_id in unclassified_ids:
            un_cur += c
            un_prv += p
            if c or p:
                un_accounts.add(account_id)
            continue
        if group_by == "month":
            key: Any = month_key(date(int(row[2]), int(row[3]), 1))
        elif group_by == "account":
            key = account_id
        else:
            key = row[2]
        cur_by[key] += c
        prv_by[key] += p
        full_by[key] += f
        class_cur[class_of[group_id]] += c
        class_prv[class_of[group_id]] += p

    rows: list[ExpenseRow] = []
    if group_by == "month":
        for m in months_between(from_date.replace(day=1), to_date):
            k = month_key(m)
            previous = q4(full_by.get(month_key(add_months(m, -1)), ZERO))
            current = q4(cur_by.get(k, ZERO))
            change = current - previous
            rows.append(ExpenseRow(id=k, label=k, current=current, previous=previous, change=change, change_percent=_pct(change, previous)))
    else:
        keys = [k for k in set(cur_by) | set(prv_by) if cur_by.get(k, ZERO) or prv_by.get(k, ZERO)]
        real_ids = {k for k in keys if k is not None}
        if group_by == "account":
            accounts = await load_accounts(db, tenant.id, real_ids)
            names = {k: account_label(accounts.get(k), k) for k in keys}
        elif group_by == "cost_center":
            ccs = await load_cost_centers(db, tenant.id, real_ids)
            names = {k: cc_label(ccs.get(k), k) for k in keys}
        else:
            vendors = (
                {v.id: v for v in (await db.execute(select(Vendor).where(Vendor.tenant_id == tenant.id, Vendor.id.in_(real_ids)))).scalars()}
                if real_ids
                else {}
            )
            names = {k: ((vendors[k].name if k in vendors else f"Vendor #{k}") if k is not None else NO_VENDOR) for k in keys}
        for k in sorted(keys, key=lambda x: (-cur_by.get(x, ZERO), names[x].lower(), str(x))):
            current, previous = q4(cur_by.get(k, ZERO)), q4(prv_by.get(k, ZERO))
            change = current - previous
            rows.append(ExpenseRow(id=k, label=names[k], current=current, previous=previous, change=change, change_percent=_pct(change, previous)))

    total_current = q4(sum(cur_by.values(), ZERO))
    total_previous = q4(sum(prv_by.values(), ZERO))
    change = total_current - total_previous
    warnings: list[ExpenseWarning] = []
    if un_cur or un_prv:
        warnings.append(
            ExpenseWarning(
                code="UNCLASSIFIED_EXPENSE_GROUPS",
                message="Expense-nature account groups with no statement class are not in the totals. Classify them to include them.",
                current=q4(un_cur),
                previous=q4(un_prv),
                account_count=len(un_accounts),
            )
        )
    notes = ["Totals use posted, in-books vouchers in base currency; a reversed voucher and its reversal net to zero."]
    if group_by == "month":
        notes.append("Each month is compared with the previous calendar month; the totals compare with the previous period of equal length.")
    if group_by == "vendor":
        notes.append("Vendor comes only from the vendor bill that created the voucher; other expense is shown as '(No vendor bill link)'.")
    return ExpenseAnalysisResponse(
        from_date=from_date,
        to_date=to_date,
        previous_from_date=prev_from,
        previous_to_date=prev_to,
        group_by=group_by,
        base_currency=tenant.base_currency or "BDT",
        expense_classes=sorted(EXPENSE_CLASSES),
        rows=rows,
        by_class=[
            ExpenseClassTotal(statement_class=c, current=q4(class_cur[c]), previous=q4(class_prv[c]))
            for c in sorted(set(class_cur) | set(class_prv))
        ],
        total_current=total_current,
        total_previous=total_previous,
        change=change,
        change_percent=_pct(change, total_previous),
        warnings=warnings,
        notes=notes,
        data_as_of=datetime.utcnow(),
    )
