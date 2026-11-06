"""Shared CoA balance helpers for MIS reports (read-only, from opening + POSTED vouchers)."""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.finance import AccountGroup, ChartOfAccount, Voucher, VoucherLine
from app.modules.finance.advanced_voucher_service import voucher_in_books_clause
from app.modules.finance.posting_core import line_base_amount_sql

ZERO = Decimal("0")


def _d(v: Any) -> Decimal:
    try:
        return Decimal(str(v or 0))
    except Exception:
        return ZERO


def _money(v: Decimal | float) -> float:
    return round(float(v), 2)


async def _accounts_with_groups(db: AsyncSession, tenant_id: int) -> list[Any]:
    return (
        await db.execute(
            select(ChartOfAccount, AccountGroup)
            .join(AccountGroup, ChartOfAccount.group_id == AccountGroup.id)
            .where(ChartOfAccount.tenant_id == tenant_id)
        )
    ).all()


def _posted_lines_filters(tenant_id: int, last_date: date) -> list[Any]:
    return [
        VoucherLine.tenant_id == tenant_id,
        Voucher.tenant_id == tenant_id,
        Voucher.status == "POSTED",
        voucher_in_books_clause(),
        Voucher.voucher_date <= last_date,
    ]


async def account_balances_as_of(
    db: AsyncSession,
    tenant_id: int,
    as_of: date,
) -> list[dict[str, Any]]:
    """Return per-account signed balances (normal-balance convention) as of date."""
    accounts = await _accounts_with_groups(db, tenant_id)
    # Aggregate in SQL: one row per (account, side) instead of every voucher line.
    posted = (
        await db.execute(
            select(VoucherLine.account_id, VoucherLine.entry_type, func.coalesce(func.sum(line_base_amount_sql()), 0))
            .join(Voucher, VoucherLine.voucher_id == Voucher.id)
            .where(*_posted_lines_filters(tenant_id, as_of))
            .group_by(VoucherLine.account_id, VoucherLine.entry_type)
        )
    ).all()
    movement: dict[int, dict[str, float]] = defaultdict(lambda: {"DEBIT": 0.0, "CREDIT": 0.0})
    for acct_id, entry_type, total in posted:
        movement[acct_id][(entry_type or "DEBIT").upper()] += float(_d(total))
    return _balance_rows(accounts, movement)


async def account_balances_for_dates(
    db: AsyncSession,
    tenant_id: int,
    dates: list[date],
) -> dict[date, list[dict[str, Any]]]:
    """``account_balances_as_of`` for several dates with one grouped query (instead of one per date).

    Each voucher date is put into the bucket of the first target date on/after it; running Decimal
    totals over the sorted buckets then give the balance as of every target date.
    """
    targets = sorted(set(dates))
    if not targets:
        return {}
    accounts = await _accounts_with_groups(db, tenant_id)
    bucket = case(
        *[(Voucher.voucher_date <= d, idx) for idx, d in enumerate(targets)],
        else_=len(targets),
    )
    posted = (
        await db.execute(
            select(
                VoucherLine.account_id,
                VoucherLine.entry_type,
                bucket.label("bucket"),
                func.coalesce(func.sum(line_base_amount_sql()), 0),
            )
            .join(Voucher, VoucherLine.voucher_id == Voucher.id)
            .where(*_posted_lines_filters(tenant_id, targets[-1]))
            .group_by(VoucherLine.account_id, VoucherLine.entry_type, bucket)
        )
    ).all()
    # per_bucket[idx][(account_id, entry_type)] = Decimal total of lines dated in that bucket
    per_bucket: list[dict[tuple[int, str | None], Decimal]] = [defaultdict(lambda: ZERO) for _ in targets]
    for acct_id, entry_type, idx, total in posted:
        per_bucket[int(idx)][(acct_id, entry_type)] += _d(total)

    out: dict[date, list[dict[str, Any]]] = {}
    running: dict[tuple[int, str | None], Decimal] = defaultdict(lambda: ZERO)
    for idx, target in enumerate(targets):
        for key, total in per_bucket[idx].items():
            running[key] += total
        movement: dict[int, dict[str, float]] = defaultdict(lambda: {"DEBIT": 0.0, "CREDIT": 0.0})
        for (acct_id, entry_type), total in running.items():
            movement[acct_id][(entry_type or "DEBIT").upper()] += float(total)
        out[target] = _balance_rows(accounts, movement)
    return out


def _balance_rows(accounts: list[Any], movement: dict[int, dict[str, float]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for account, group in accounts:
        opening = float(_d(account.opening_balance))
        debit_mov = movement[account.id]["DEBIT"]
        credit_mov = movement[account.id]["CREDIT"]
        if (account.normal_balance or "debit").lower() == "debit":
            bal = opening + debit_mov - credit_mov
        else:
            bal = opening + credit_mov - debit_mov
        nature = (group.nature or "").strip() or "Asset"
        name_l = f"{account.name or ''} {account.account_number or ''}".lower()
        is_cash = bool(getattr(account, "is_bank_account", False)) or bool(
            getattr(group, "is_bank_group", False)
        )
        if not is_cash and ("cash" in name_l or "bank" in name_l):
            is_cash = True
        is_inventory = "inventor" in name_l or "stock" in name_l
        is_ar = "receivable" in name_l or "debtor" in name_l
        is_ap = "payable" in name_l or "creditor" in name_l
        is_fixed = "fixed asset" in name_l or "plant" in name_l or "machinery" in name_l or "equipment" in name_l
        is_loan = "loan" in name_l or "borrowing" in name_l
        is_depreciation = "depreciat" in name_l or "amortis" in name_l or "amortiz" in name_l
        is_interest = "interest" in name_l
        is_cogs = "cogs" in name_l or "cost of goods" in name_l or "cost of sales" in name_l
        rows.append(
            {
                "account_id": account.id,
                "account_number": account.account_number,
                "account_name": account.name,
                "group_name": group.name,
                "nature": nature,
                "balance": _money(bal),
                "is_cash": is_cash,
                "is_inventory": is_inventory,
                "is_ar": is_ar,
                "is_ap": is_ap,
                "is_fixed": is_fixed,
                "is_loan": is_loan,
                "is_depreciation": is_depreciation,
                "is_interest": is_interest,
                "is_cogs": is_cogs,
                "normal_balance": account.normal_balance,
            }
        )
    return rows


def nature_summary(rows: list[dict[str, Any]]) -> dict[str, float]:
    summary = {"Asset": 0.0, "Liability": 0.0, "Equity": 0.0, "Income": 0.0, "Expense": 0.0}
    for r in rows:
        n = r.get("nature") or "Asset"
        summary[n] = summary.get(n, 0.0) + float(r.get("balance") or 0)
    return {k: _money(v) for k, v in summary.items()}


def financial_snapshot(rows: list[dict[str, Any]]) -> dict[str, Any]:
    summary = nature_summary(rows)
    income = summary.get("Income", 0.0)
    expense = summary.get("Expense", 0.0)
    assets = summary.get("Asset", 0.0)
    liabilities = summary.get("Liability", 0.0)
    equity = summary.get("Equity", 0.0)
    net_profit = _money(income - expense)
    cash = _money(sum(float(r["balance"]) for r in rows if r.get("is_cash") and r.get("nature") == "Asset"))
    inventory = _money(sum(float(r["balance"]) for r in rows if r.get("is_inventory") and r.get("nature") == "Asset"))
    ar = _money(sum(float(r["balance"]) for r in rows if r.get("is_ar") and r.get("nature") == "Asset"))
    ap = _money(sum(float(r["balance"]) for r in rows if r.get("is_ap") and r.get("nature") == "Liability"))
    fixed = _money(sum(float(r["balance"]) for r in rows if r.get("is_fixed") and r.get("nature") == "Asset"))
    loans = _money(sum(float(r["balance"]) for r in rows if r.get("is_loan") and r.get("nature") == "Liability"))
    current_assets = _money(max(0.0, assets - fixed))
    current_liabilities = _money(max(0.0, liabilities - loans))
    depreciation = _money(
        sum(abs(float(r["balance"])) for r in rows if r.get("is_depreciation") and r.get("nature") == "Expense")
    )
    interest = _money(
        sum(abs(float(r["balance"])) for r in rows if r.get("is_interest") and r.get("nature") == "Expense")
    )
    cogs = _money(sum(abs(float(r["balance"])) for r in rows if r.get("is_cogs") and r.get("nature") == "Expense"))
    if cogs <= 0:
        cogs = _money(expense * 0.6)  # heuristic when no COGS accounts tagged
    gross_profit = _money(income - cogs)
    ebit = _money(net_profit + interest)
    return {
        "income": income,
        "expense": expense,
        "net_profit": net_profit,
        "gross_profit": gross_profit,
        "assets": assets,
        "liabilities": liabilities,
        "equity": equity,
        "cash": cash,
        "inventory": inventory,
        "ar": ar,
        "ap": ap,
        "fixed_assets": fixed,
        "loans": loans,
        "current_assets": current_assets,
        "current_liabilities": current_liabilities,
        "depreciation": depreciation,
        "interest": interest,
        "cogs": cogs,
        "ebit": ebit,
    }
