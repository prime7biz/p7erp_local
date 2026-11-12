"""Expense-control exceptions (Phase 4): deterministic rules with evidence. Read-only, never blocks a workflow.

Rules (constants in `constants.py`):
  UNUSUAL_INCREASE    expense account: spend of the as-of month (to as_of_date) > 150% of the average of the 3 full months
                      before it, at least BDT 10,000 (base currency). A zero average never triggers.
  UNBUDGETED_SPEND    fiscal-year spend (> 0) on an (account, cost centre) that no FINAL budget line of that fiscal year
                      covers (a line covers when its account is empty or equal AND its cost centre is empty or equal).
                      Skipped when the fiscal year has no FINAL budget at all.
  REPEATED_AMOUNT     same account + same base amount + same party within 7 days (party = vendor bill vendor, else the
                      normalised narration; lines with neither are ignored). Last 90 days, newest 5000 debit lines.
  MISSING_COST_CENTRE fiscal-year expense lines with no cost centre, one item per account (net amount not zero).
  BUDGET_ALERT        FINAL budget lines whose period covers as_of_date and whose used percent is >= 80 / 100 / 110.
"Expense account" = group class in EXPENSE_CLASSES, or no class and nature Expense. Voucher rules: posted, in books.

Query budget: 2 (group classes) + 1-2 per rule + 3 per FINAL budget of the fiscal year (cap MAX_BUDGETS_SCANNED).
Nothing runs per row, per cost centre or per month.
"""

from __future__ import annotations

import re
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.tenant_feature_keys import get_budget_enforcement_mode
from app.models.finance import ChartOfAccount, Voucher, VoucherLine
from app.modules.finance.budget_analytics.analytics_service import status_for
from app.modules.finance.budget_analytics.common import (
    ZERO,
    add_months,
    check_report_date,
    debit_minus_credit_sql,
    in_books_conditions,
    month_key,
    q4,
    resolve_scope,
    vendor_link_subquery,
)
from app.modules.finance.budget_analytics.constants import (
    CONTROL_CODES,
    MAX_EVIDENCE_IDS,
    MAX_ITEMS_PER_RULE,
    MAX_REPEAT_SCAN_LINES,
    REPEATED_LOOKBACK_DAYS,
    REPEATED_MIN_AMOUNT,
    REPEATED_WINDOW_DAYS,
    UNUSUAL_INCREASE_MIN_AMOUNT,
    UNUSUAL_INCREASE_RATIO_PERCENT,
    UNUSUAL_INCREASE_TRAILING_MONTHS,
    WARNING_PERCENT,
)
from app.modules.finance.budget_analytics.expense_service import expense_group_ids
from app.modules.finance.budget_analytics.schemas import ControlItem, ControlRule, ExpenseControlsResponse
from app.modules.finance.budget_vs_actual_service import RULE_CREDIT_MINUS_DEBIT, compute_budget_vs_actual
from app.modules.finance.fiscal_year import fiscal_year_bounds, fiscal_year_label, fiscal_year_of, fy_start_month
from app.modules.finance.statements.classification_service import load_group_classification

_WS = re.compile(r"\s+")
_SEVERITY_BY_STATUS = {"warning": "medium", "over": "high", "critical": "high"}


def _norm(text: str | None) -> str:
    return _WS.sub(" ", (text or "").strip().lower())


def _rule(code: str, items: list[ControlItem], *, note: str | None = None, count: int | None = None, amount: Decimal | None = None) -> ControlRule:
    label, severity = CONTROL_CODES[code]
    return ControlRule(
        code=code,
        label=label,
        severity=severity,  # type: ignore[arg-type]
        count=len(items) if count is None else count,
        amount=q4(sum((i.amount for i in items), ZERO) if amount is None else amount),
        items=items[:MAX_ITEMS_PER_RULE],
        note=note,
    )


async def _sample_vouchers(
    db: AsyncSession, tenant_id: int, expense_ids: set[int], start: date, end: date, extra: list, keys: list[tuple[Any, ...]], partition: list
) -> dict[tuple[Any, ...], list[int]]:
    """Newest voucher ids per partition key (at most MAX_EVIDENCE_IDS lines each) in ONE window-function query."""
    if not keys:
        return {}
    rank = func.row_number().over(partition_by=partition, order_by=(Voucher.voucher_date.desc(), Voucher.id.desc(), VoucherLine.id.desc()))
    inner = (
        select(*partition, Voucher.id.label("voucher_id"), rank.label("rn"))
        .select_from(VoucherLine)
        .join(Voucher, VoucherLine.voucher_id == Voucher.id)
        .where(
            *in_books_conditions(tenant_id),
            VoucherLine.account_id.in_(expense_ids),
            Voucher.voucher_date >= start,
            Voucher.voucher_date <= end,
            *extra,
        )
        .subquery("samples")
    )
    cols = [inner.c[i] for i in range(len(partition))]
    out: dict[tuple[Any, ...], list[int]] = defaultdict(list)
    wanted = set(keys)
    rows = (await db.execute(select(*cols, inner.c.voucher_id).where(inner.c.rn <= MAX_EVIDENCE_IDS))).all()
    for row in rows:
        key = tuple(row[:-1])
        if key in wanted and row[-1] not in out[key]:
            out[key].append(row[-1])
    return out


async def build_expense_controls(db: AsyncSession, tenant: Any, *, as_of: date) -> ExpenseControlsResponse:
    check_report_date(as_of, "as_of_date")
    sm = fy_start_month(tenant.feature_flags)
    fy_start, fy_end = fiscal_year_bounds(as_of, sm)
    fy_label = fiscal_year_label(fiscal_year_of(as_of, sm), sm)
    groups = await load_group_classification(db, tenant.id)
    class_of, unclassified_ids = expense_group_ids(groups)
    group_ids = set(class_of) | unclassified_ids
    expense_ids: set[int] = set()
    if group_ids:
        expense_ids = set(
            (await db.execute(select(ChartOfAccount.id).where(ChartOfAccount.tenant_id == tenant.id, ChartOfAccount.group_id.in_(group_ids)))).scalars()
        )
    rules: list[ControlRule] = []
    scope = await resolve_scope(db, tenant, fy_label, None)

    if expense_ids:
        rules.append(await _unusual_increase(db, tenant.id, expense_ids, as_of))
        rules.append(await _unbudgeted(db, tenant.id, expense_ids, scope, fy_start, as_of))
        rules.append(await _repeated(db, tenant.id, expense_ids, as_of))
        rules.append(await _missing_cc(db, tenant.id, expense_ids, fy_start, as_of))
    else:
        note = "No expense accounts are classified yet."
        rules.extend(_rule(code, [], note=note) for code in ("UNUSUAL_INCREASE", "UNBUDGETED_SPEND", "REPEATED_AMOUNT", "MISSING_COST_CENTRE"))
    rules.append(await _budget_alerts(db, tenant, scope, as_of))
    rules.sort(key=lambda r: list(CONTROL_CODES).index(r.code))
    return ExpenseControlsResponse(
        as_of_date=as_of,
        fiscal_year=fy_label,
        base_currency=tenant.base_currency or "BDT",
        enforcement_mode=get_budget_enforcement_mode(tenant.feature_flags),
        rules=rules,
        data_as_of=datetime.utcnow(),
    )


# ---- UNUSUAL_INCREASE ------------------------------------------------------------------------------------------------
async def _unusual_increase(db, tenant_id: int, expense_ids: set[int], as_of: date) -> ControlRule:
    month_start = as_of.replace(day=1)
    trail_start = add_months(month_start, -UNUSUAL_INCREASE_TRAILING_MONTHS)
    year_col, month_col = func.extract("year", Voucher.voucher_date), func.extract("month", Voucher.voucher_date)
    stmt = (
        select(VoucherLine.account_id, year_col, month_col, func.coalesce(func.sum(debit_minus_credit_sql()), 0))
        .select_from(VoucherLine)
        .join(Voucher, VoucherLine.voucher_id == Voucher.id)
        .where(
            *in_books_conditions(tenant_id),
            VoucherLine.account_id.in_(expense_ids),
            Voucher.voucher_date >= trail_start,
            Voucher.voucher_date <= as_of,
        )
        .group_by(VoucherLine.account_id, year_col, month_col)
    )
    per_account: dict[int, dict[str, Decimal]] = defaultdict(dict)
    for account_id, year, month, total in (await db.execute(stmt)).all():
        per_account[account_id][month_key(date(int(year), int(month), 1))] = q4(total)
    prior_keys = [month_key(add_months(month_start, -i)) for i in range(UNUSUAL_INCREASE_TRAILING_MONTHS, 0, -1)]
    flagged: list[tuple[Decimal, int, Decimal, Decimal, dict[str, Decimal]]] = []
    for account_id, months in per_account.items():
        current = months.get(month_key(month_start), ZERO)
        average = sum((months.get(k, ZERO) for k in prior_keys), ZERO) / UNUSUAL_INCREASE_TRAILING_MONTHS
        if average <= ZERO or current < UNUSUAL_INCREASE_MIN_AMOUNT:
            continue
        ratio = current / average * Decimal("100")
        if ratio > UNUSUAL_INCREASE_RATIO_PERCENT:
            flagged.append((ratio, account_id, current, average, {k: months.get(k, ZERO) for k in prior_keys}))
    flagged.sort(key=lambda x: (-x[0], x[1]))
    samples = await _sample_vouchers(
        db, tenant_id, expense_ids, month_start, as_of, [], [(a,) for _r, a, *_ in flagged[:MAX_ITEMS_PER_RULE]], [VoucherLine.account_id]
    )
    items = [
        ControlItem(
            code="UNUSUAL_INCREASE",
            severity=CONTROL_CODES["UNUSUAL_INCREASE"][1],  # type: ignore[arg-type]
            title="Spend is far above the recent monthly average",
            amount=current,
            account_id=account_id,
            voucher_ids=samples.get((account_id,), []),
            evidence={
                "month": month_key(month_start),
                "current_spend": format(current, "f"),
                "trailing_average": format(q4(average), "f"),
                "ratio_percent": format(q4(ratio), "f"),
                "trailing_months": {k: format(v, "f") for k, v in prior.items()},
                "threshold_percent": format(UNUSUAL_INCREASE_RATIO_PERCENT, "f"),
                "minimum_amount": format(UNUSUAL_INCREASE_MIN_AMOUNT, "f"),
                "from_date": month_start.isoformat(),
                "to_date": as_of.isoformat(),
            },
        )
        for ratio, account_id, current, average, prior in flagged
    ]
    return _rule("UNUSUAL_INCREASE", items)


# ---- UNBUDGETED_SPEND ---------------------------------------------------------------------------------------------
async def _unbudgeted(db, tenant_id: int, expense_ids: set[int], scope, fy_start: date, as_of: date) -> ControlRule:
    if not scope.budgets:
        return _rule("UNBUDGETED_SPEND", [], note="No FINAL budget covers this fiscal year, so the rule is skipped.")
    covers_all = any(ln.account_id is None and ln.cost_center_id is None for ln in scope.lines)
    acct_only = {ln.account_id for ln in scope.lines if ln.cost_center_id is None and ln.account_id is not None}
    cc_only = {ln.cost_center_id for ln in scope.lines if ln.account_id is None and ln.cost_center_id is not None}
    pairs = {(ln.account_id, ln.cost_center_id) for ln in scope.lines if ln.account_id is not None and ln.cost_center_id is not None}
    stmt = (
        select(VoucherLine.account_id, VoucherLine.cost_center_id, func.coalesce(func.sum(debit_minus_credit_sql()), 0), func.count(VoucherLine.id))
        .select_from(VoucherLine)
        .join(Voucher, VoucherLine.voucher_id == Voucher.id)
        .where(
            *in_books_conditions(tenant_id),
            VoucherLine.account_id.in_(expense_ids),
            Voucher.voucher_date >= fy_start,
            Voucher.voucher_date <= as_of,
        )
        .group_by(VoucherLine.account_id, VoucherLine.cost_center_id)
    )
    rows = []
    for account_id, cc_id, total, count in (await db.execute(stmt)).all():
        spend = q4(total)
        if spend <= ZERO or covers_all or account_id in acct_only or (cc_id is not None and cc_id in cc_only) or (account_id, cc_id) in pairs:
            continue
        rows.append((spend, account_id, cc_id, int(count)))
    rows.sort(key=lambda r: (-r[0], r[1], r[2] or 0))
    part = [VoucherLine.account_id, VoucherLine.cost_center_id]
    samples = await _sample_vouchers(db, tenant_id, expense_ids, fy_start, as_of, [], [(a, c) for _s, a, c, _n in rows[:MAX_ITEMS_PER_RULE]], part)
    items = [
        ControlItem(
            code="UNBUDGETED_SPEND",
            severity=CONTROL_CODES["UNBUDGETED_SPEND"][1],  # type: ignore[arg-type]
            title="Spend on an account / cost centre with no FINAL budget line",
            amount=spend,
            account_id=account_id,
            cost_center_id=cc_id,
            voucher_ids=samples.get((account_id, cc_id), []),
            evidence={
                "spend": format(spend, "f"),
                "line_count": count,
                "budget_ids": [b.id for b in scope.budgets],
                "from_date": fy_start.isoformat(),
                "to_date": as_of.isoformat(),
            },
        )
        for spend, account_id, cc_id, count in rows
    ]
    return _rule("UNBUDGETED_SPEND", items)


# ---- REPEATED_AMOUNT ------------------------------------------------------------------------------------------------
async def _repeated(db, tenant_id: int, expense_ids: set[int], as_of: date) -> ControlRule:
    start = as_of - timedelta(days=REPEATED_LOOKBACK_DAYS)
    link = vendor_link_subquery(tenant_id)
    base = debit_minus_credit_sql()
    stmt = (
        select(
            VoucherLine.id,
            Voucher.id,
            Voucher.voucher_date,
            VoucherLine.account_id,
            base,
            link.c.vendor_id,
            VoucherLine.notes,
            Voucher.description,
        )
        .select_from(VoucherLine)
        .join(Voucher, VoucherLine.voucher_id == Voucher.id)
        .outerjoin(link, link.c.voucher_id == Voucher.id)
        .where(
            *in_books_conditions(tenant_id),
            Voucher.status == "POSTED",  # a reversed original and its reversal never count as a repeat
            Voucher.reversed_by_voucher_id.is_(None),
            Voucher.reverses_voucher_id.is_(None),
            func.upper(VoucherLine.entry_type) == "DEBIT",
            VoucherLine.account_id.in_(expense_ids),
            Voucher.voucher_date >= start,
            Voucher.voucher_date <= as_of,
        )
        .order_by(Voucher.voucher_date.desc(), VoucherLine.id.desc())
        .limit(MAX_REPEAT_SCAN_LINES)
    )
    data = (await db.execute(stmt)).all()
    groups: dict[tuple, list[tuple[date, int, int]]] = defaultdict(list)
    for line_id, voucher_id, vdate, account_id, amount, vendor_id, notes, description in data:
        amount = q4(amount)
        if amount < REPEATED_MIN_AMOUNT:
            continue
        if vendor_id is not None:
            party: tuple = ("vendor", vendor_id)
        else:
            text = _norm(notes) or _norm(description)
            if not text:
                continue
            party = ("narration", text)
        groups[(account_id, amount, party)].append((vdate, voucher_id, line_id))
    items: list[ControlItem] = []
    for (account_id, amount, party), entries in groups.items():
        entries.sort()
        cluster = [entries[0]]
        clusters = []
        for entry in entries[1:]:
            if (entry[0] - cluster[-1][0]).days <= REPEATED_WINDOW_DAYS:
                cluster.append(entry)
            else:
                clusters.append(cluster)
                cluster = [entry]
        clusters.append(cluster)
        for cl in clusters:
            vouchers = list(dict.fromkeys(v for _d, v, _l in cl))
            if len(vouchers) < 2:
                continue
            items.append(
                ControlItem(
                    code="REPEATED_AMOUNT",
                    severity=CONTROL_CODES["REPEATED_AMOUNT"][1],  # type: ignore[arg-type]
                    title="Same amount posted again within a few days",
                    amount=amount * len(cl),
                    account_id=account_id,
                    voucher_ids=vouchers[:MAX_EVIDENCE_IDS],
                    evidence={
                        "unit_amount": format(amount, "f"),
                        "occurrences": len(cl),
                        "dates": [d.isoformat() for d, _v, _l in cl][:MAX_EVIDENCE_IDS],
                        "party_type": party[0],
                        "party": party[1] if party[0] == "narration" else None,
                        "vendor_id": party[1] if party[0] == "vendor" else None,
                        "window_days": REPEATED_WINDOW_DAYS,
                    },
                )
            )
    items.sort(key=lambda i: (-i.amount, i.account_id or 0, i.voucher_ids[0] if i.voucher_ids else 0))
    note = (
        f"Only the newest {MAX_REPEAT_SCAN_LINES} expense debit lines of the last {REPEATED_LOOKBACK_DAYS} days were checked."
        if len(data) >= MAX_REPEAT_SCAN_LINES
        else None
    )
    return _rule("REPEATED_AMOUNT", items, note=note)


# ---- MISSING_COST_CENTRE ------------------------------------------------------------------------------------------
async def _missing_cc(db, tenant_id: int, expense_ids: set[int], fy_start: date, as_of: date) -> ControlRule:
    cond = [VoucherLine.cost_center_id.is_(None)]
    stmt = (
        select(VoucherLine.account_id, func.coalesce(func.sum(debit_minus_credit_sql()), 0), func.count(VoucherLine.id))
        .select_from(VoucherLine)
        .join(Voucher, VoucherLine.voucher_id == Voucher.id)
        .where(
            *in_books_conditions(tenant_id),
            VoucherLine.account_id.in_(expense_ids),
            Voucher.voucher_date >= fy_start,
            Voucher.voucher_date <= as_of,
            *cond,
        )
        .group_by(VoucherLine.account_id)
    )
    rows = [(q4(total), account_id, int(count)) for account_id, total, count in (await db.execute(stmt)).all() if q4(total) != ZERO]
    rows.sort(key=lambda r: (-abs(r[0]), r[1]))
    samples = await _sample_vouchers(
        db, tenant_id, expense_ids, fy_start, as_of, cond, [(a,) for _t, a, _c in rows[:MAX_ITEMS_PER_RULE]], [VoucherLine.account_id]
    )
    items = [
        ControlItem(
            code="MISSING_COST_CENTRE",
            severity=CONTROL_CODES["MISSING_COST_CENTRE"][1],  # type: ignore[arg-type]
            title="Expense lines have no cost centre",
            amount=total,
            account_id=account_id,
            voucher_ids=samples.get((account_id,), []),
            evidence={"net_amount": format(total, "f"), "line_count": count, "from_date": fy_start.isoformat(), "to_date": as_of.isoformat()},
        )
        for total, account_id, count in rows
    ]
    return _rule("MISSING_COST_CENTRE", items)


# ---- BUDGET_ALERT ---------------------------------------------------------------------------------------------------
async def _budget_alerts(db, tenant, scope, as_of: date) -> ControlRule:
    found: list[tuple[Decimal, ControlItem]] = []
    for budget in scope.budgets:
        data = await compute_budget_vs_actual(db, tenant, budget)
        for line in data["rows"]:
            if line.get("net_rule") == RULE_CREDIT_MINUS_DEBIT:
                continue  # income / liability lines: reaching the plan is not an overspend
            start, end = line.get("period_start"), line.get("period_end")
            if start and end and not (date.fromisoformat(start) <= as_of <= date.fromisoformat(end)):
                continue
            planned = Decimal(str(line["budget_amount"]))
            actual = Decimal(str(line["actual_amount"]))
            status, used = status_for(planned, actual)
            if planned <= ZERO or used is None or used < WARNING_PERCENT:
                continue
            found.append(
                (
                    used,
                    ControlItem(
                        code="BUDGET_ALERT",
                        severity=_SEVERITY_BY_STATUS.get(status, "medium"),  # type: ignore[arg-type]
                        title=f"Budget line at {q4(used)}% ({status})",
                        amount=q4(actual),
                        account_id=line["account_id"],
                        cost_center_id=line["cost_center_id"],
                        budget_id=budget.id,
                        budget_line_id=line["line_id"],
                        evidence={
                            "status": status,
                            "used_percent": format(q4(used), "f"),
                            "budget_amount": format(q4(planned), "f"),
                            "actual_amount": format(q4(actual), "f"),
                            "period_month": line["period_month"],
                            "period_start": start,
                            "period_end": end,
                            "thresholds": {"warning": "80", "over": "100", "critical": "110"},
                        },
                    ),
                )
            )
    found.sort(key=lambda x: (-x[0], x[1].budget_id or 0, x[1].budget_line_id or 0))
    return _rule("BUDGET_ALERT", [i for _u, i in found], note="Alerts are informational; the tenant's budget enforcement mode is unchanged.")
