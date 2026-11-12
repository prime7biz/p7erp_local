"""Monthly Cash Flow (PLAN "Monthly Cash Flow", acceptance 2.7, 2.11). SQL: 4 statements (limit 5).

Cash pool = ledgers of CASH_IN_HAND + BANK_ACCOUNTS + BANK_OD after the ledger-level cash / bank rule
(`classification_service.resolve_ledger_class`; signed debit minus credit; Bank OD is credit-normal, so an overdraft
lowers the pool).

Inflow / outflow, per voucher, over the pool ledgers only:
    pool_debit   = sum of debit lines on pool ledgers          pool_credit = sum of credit lines on pool ledgers
    contra       = min(pool_debit, pool_credit)                (money moved between two pool ledgers inside one voucher)
    inflow       = pool_debit - contra     outflow = pool_credit - contra
So a cash <-> bank transfer is neither inflow nor outflow (Tally behaviour; PLAN is silent, flagged to the user), but
nett_flow = inflow - outflow = pool_debit - pool_credit is exact either way and always rolls the balance forward.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.finance import ChartOfAccount, Voucher, VoucherLine
from app.models.tenant import Tenant
from app.modules.finance.fiscal_year import fiscal_year_bounds, fy_start_month
from app.modules.finance.posting_core import BALANCE_TOLERANCE, line_base_amount_sql
from app.modules.finance.statements.classification_service import (
    GroupInfo,
    ledger_is_bank_sql,
    ledger_is_cash_sql,
    load_group_classification,
    pool_ledgers_sql,
    resolve_ledger_class,
)
from app.modules.finance.statements.constants import BANK_ACCOUNTS, BANK_OD, CASH_IN_HAND
from app.modules.finance.statements.flow_common import (
    CASH_POOL_CLASSES,
    ZERO,
    MonthSpan,
    month_spans,
    q4,
    voucher_statement_clause,
    year_month_sql,
)
from app.modules.finance.statements.flow_schemas import (
    CashFlowMonth,
    CashFlowResponse,
    CashFlowTotal,
    CashPoolSplit,
    FlowDrilldown,
    dr_cr_of,
)
from app.modules.finance.statements.group_tree import company_from, fiscal_period
from app.modules.finance.statements.schemas import Reconciliation


@dataclass
class MonthFlow:
    inflow: Decimal = ZERO
    outflow: Decimal = ZERO
    contra: Decimal = ZERO
    gross_debit: Decimal = ZERO
    gross_credit: Decimal = ZERO


def _signed_amounts():
    amount = line_base_amount_sql()
    is_debit = func.upper(VoucherLine.entry_type) == "DEBIT"
    return amount, is_debit


def cash_pool_clause(groups: dict[int, GroupInfo], tenant_id: int):
    """WHERE clause on ChartOfAccount for the cash-pool ledgers (group class + ledger-level cash / bank rule)."""
    return pool_ledgers_sql(groups, tenant_id, CASH_POOL_CLASSES)


def pool_voucher_subquery(tenant_id: int, pool_clause, start: date, end: date):
    """One row per (voucher, month): pool debit and credit. The contra split happens in the outer query."""
    amount, is_debit = _signed_amounts()
    ym_key = year_month_sql().label("ym_key")  # grouped by label so the arithmetic constants are sent once
    stmt = (
        select(
            Voucher.id.label("vid"),
            ym_key,
            func.coalesce(func.sum(case((is_debit, amount), else_=0)), 0).label("pd"),
            func.coalesce(func.sum(case((~is_debit, amount), else_=0)), 0).label("pc"),
        )
        .select_from(VoucherLine)
        .join(Voucher, VoucherLine.voucher_id == Voucher.id)
        .join(ChartOfAccount, ChartOfAccount.id == VoucherLine.account_id)
        .where(
            VoucherLine.tenant_id == tenant_id,
            Voucher.tenant_id == tenant_id,
            ChartOfAccount.tenant_id == tenant_id,
            pool_clause,
            Voucher.voucher_date >= start,
            Voucher.voucher_date <= end,
            voucher_statement_clause(),
        )
        .group_by(Voucher.id, ym_key)
    )
    return stmt.subquery("pool_voucher")


async def pool_month_flows(db: AsyncSession, tenant_id: int, pool_clause, start: date, end: date) -> dict[int, MonthFlow]:
    """{yyyymm: MonthFlow}. ONE grouped statement for the whole range. `pool_clause` from `cash_pool_clause`."""
    if pool_clause is None:
        return {}
    sub = pool_voucher_subquery(tenant_id, pool_clause, start, end)
    contra = func.least(sub.c.pd, sub.c.pc)
    rows = (
        await db.execute(
            select(
                sub.c.ym_key,
                func.coalesce(func.sum(sub.c.pd - contra), 0),
                func.coalesce(func.sum(sub.c.pc - contra), 0),
                func.coalesce(func.sum(contra), 0),
                func.coalesce(func.sum(sub.c.pd), 0),
                func.coalesce(func.sum(sub.c.pc), 0),
            ).group_by(sub.c.ym_key)
        )
    ).all()
    return {
        int(ym): MonthFlow(q4(i), q4(o), q4(c), q4(gd), q4(gc)) for ym, i, o, c, gd, gc in rows
    }


async def pool_balances_by_class(
    db: AsyncSession, groups: dict[int, GroupInfo], tenant_id: int, pool_clause, start: date, end: date
) -> dict[str, tuple[Decimal, Decimal]]:
    """{resolved ledger class: (net before `start`, net at `end`)} including each ledger's stored opening balance.

    1 statement (grouped by group and the two ledger-rule flags; the class is resolved in Python).
    """
    if pool_clause is None:
        return {}
    amount, is_debit = _signed_amounts()
    signed = case((is_debit, amount), else_=-amount)
    lines = (
        select(
            VoucherLine.account_id.label("account_id"),
            func.coalesce(func.sum(case((Voucher.voucher_date < start, signed), else_=0)), 0).label("pre"),
            func.coalesce(func.sum(signed), 0).label("upto"),
        )
        .join(Voucher, VoucherLine.voucher_id == Voucher.id)
        .where(
            VoucherLine.tenant_id == tenant_id,
            Voucher.tenant_id == tenant_id,
            Voucher.voucher_date <= end,
            voucher_statement_clause(),
        )
        .group_by(VoucherLine.account_id)
        .subquery()
    )
    opening = case(
        (func.lower(ChartOfAccount.normal_balance) == "debit", ChartOfAccount.opening_balance),
        else_=-ChartOfAccount.opening_balance,
    )
    is_bank = ledger_is_bank_sql(tenant_id).label("is_bank")
    is_cash = ledger_is_cash_sql(tenant_id).label("is_cash")
    rows = (
        await db.execute(
            select(
                ChartOfAccount.group_id,
                is_bank,
                is_cash,
                func.coalesce(func.sum(opening + func.coalesce(lines.c.pre, 0)), 0),
                func.coalesce(func.sum(opening + func.coalesce(lines.c.upto, 0)), 0),
            )
            .outerjoin(lines, lines.c.account_id == ChartOfAccount.id)
            .where(ChartOfAccount.tenant_id == tenant_id, pool_clause)
            .group_by(ChartOfAccount.group_id, is_bank, is_cash)
        )
    ).all()
    out: dict[str, tuple[Decimal, Decimal]] = {}
    for gid, bank_flag, cash_flag, pre, upto in rows:
        info = groups.get(gid)
        cls = resolve_ledger_class(
            info.effective_class if info else None, is_bank=bool(bank_flag), is_cash=bool(cash_flag)
        ) or ""
        old_pre, old_upto = out.get(cls, (ZERO, ZERO))
        out[cls] = (old_pre + q4(pre), old_upto + q4(upto))
    return out


def fiscal_year_range(tenant: Tenant, fiscal_year: int | None, today: date) -> tuple[date, date, int]:
    start_month = fy_start_month(tenant.feature_flags)
    if fiscal_year is None:
        start, end = fiscal_year_bounds(today, start_month)
        return start, end, start.year
    start, end = fiscal_year_bounds(date(fiscal_year, start_month, 1), start_month)
    return start, end, fiscal_year


async def build_cash_flow(
    db: AsyncSession, tenant: Tenant, *, fiscal_year: int | None, today: date
) -> CashFlowResponse:
    fy_start, fy_end, fy = fiscal_year_range(tenant, fiscal_year, today)
    groups = await load_group_classification(db, tenant.id)  # 2 statements
    pool = cash_pool_clause(groups, tenant.id)

    flows = await pool_month_flows(db, tenant.id, pool, fy_start, fy_end)  # 1 statement
    balances = await pool_balances_by_class(db, groups, tenant.id, pool, fy_start, fy_end)  # 1 statement

    opening_cash = sum((pre for pre, _ in balances.values()), ZERO)
    gl_closing = sum((upto for _, upto in balances.values()), ZERO)
    by_class: dict[str, Decimal] = {CASH_IN_HAND: ZERO, BANK_ACCOUNTS: ZERO, BANK_OD: ZERO}
    for cls, (_pre, upto) in balances.items():
        by_class[cls] = by_class.get(cls, ZERO) + upto

    months: list[CashFlowMonth] = []
    running = opening_cash
    tot_in = tot_out = tot_contra = ZERO
    for span in month_spans(fy_start):
        f = flows.get(span.ym, MonthFlow())
        nett = f.inflow - f.outflow
        months.append(
            CashFlowMonth(
                month=span.key,
                label=span.label,
                from_date=span.start,
                to_date=span.end,
                opening_cash=running,
                inflow=f.inflow,
                outflow=f.outflow,
                nett_flow=nett,
                closing_cash=running + nett,
                drilldown=FlowDrilldown(value=span.key),
            )
        )
        running += nett
        tot_in += f.inflow
        tot_out += f.outflow
        tot_contra += f.contra

    difference = running - gl_closing
    return CashFlowResponse(
        report="cash_flow_monthly",
        company=company_from(tenant),
        period=fiscal_period(tenant, from_date=fy_start, to_date=fy_end),
        base_currency=tenant.base_currency or "BDT",
        fiscal_year=fy,
        opening_cash=opening_cash,
        opening_dr_cr=dr_cr_of(opening_cash),
        months=months,
        grand_total=CashFlowTotal(
            inflow=tot_in, outflow=tot_out, nett_flow=tot_in - tot_out, closing_cash=running
        ),
        gl_closing_cash=gl_closing,
        closing_pool=CashPoolSplit(
            cash_in_hand=by_class[CASH_IN_HAND],
            bank_accounts=by_class[BANK_ACCOUNTS],
            bank_od=by_class[BANK_OD],
            cash_without_od=by_class[CASH_IN_HAND] + by_class[BANK_ACCOUNTS],
        ),
        contra_excluded=tot_contra,
        reconciliation=Reconciliation(balanced=abs(difference) <= BALANCE_TOLERANCE, difference=difference),
        data_as_of=datetime.utcnow(),
    )


def parse_month(value: str, fy_start: date) -> MonthSpan:
    for span in month_spans(fy_start):
        if span.key == value:
            return span
    raise HTTPException(status_code=422, detail="month must be a YYYY-MM inside the fiscal year")
