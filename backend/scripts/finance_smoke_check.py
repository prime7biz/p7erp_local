"""Read-only smoke check of the new finance reports for one tenant (service functions, not HTTP).

Runs every statement / control / analytics service and prints a compact PASS / WARN / FAIL table with the
reconciliation checks:
  TB debit == credit (opening, period, closing); BS liabilities == assets; P&L nett == TB income-expense movement;
  cash flow monthly continuity + GL closing; funds flow continuity; Operating Cost % == 100 - Nett Profit %;
  Control Tower card total == its exception list total (count and amount), and no card failed.
Exit code 1 on any FAIL or exception. Nothing is written: every check runs in a READ ONLY transaction that is
rolled back. Use it after `finance_enable_demo.py` (the AI commentary needs the finance AI flags).

Usage (inside Docker):
  docker compose exec -T backend python scripts/finance_smoke_check.py --company-code LAKH806201
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
import traceback
from datetime import date
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import case, func, select, text  # noqa: E402

from app.common.business_date import today_local  # noqa: E402
from app.common.rls import bind_session_bypass, bind_session_tenant  # noqa: E402
from app.database import AsyncSessionLocal, safe_async_session_rollback  # noqa: E402
from app.models import Role, Tenant, User  # noqa: E402
from app.models.finance import ChartOfAccount  # noqa: E402
from app.modules.finance.ai_insights.constants import REPORTS  # noqa: E402
from app.modules.finance.ai_insights.schemas import CommentaryRequest  # noqa: E402
from app.modules.finance.ai_insights.service import build_commentary  # noqa: E402
from app.modules.finance.budget_analytics.analytics_service import build_budget_analytics  # noqa: E402
from app.modules.finance.budget_analytics.constants import DIMENSIONS, EXPENSE_GROUP_BY  # noqa: E402
from app.modules.finance.budget_analytics.controls_service import build_expense_controls  # noqa: E402
from app.modules.finance.budget_analytics.expense_service import build_expense_analysis  # noqa: E402
from app.modules.finance.control.constants import CARD_DEFS  # noqa: E402
from app.modules.finance.control.control_tower_service import (  # noqa: E402
    build_control_tower,
    build_exception_list,
)
from app.modules.finance.control.profitability_service import list_order_profit  # noqa: E402
from app.modules.finance.fiscal_year import fiscal_year_bounds, fy_start_month  # noqa: E402
from app.modules.finance.statements.balance_sheet_service import build_balance_sheet  # noqa: E402
from app.modules.finance.statements.cash_flow_service import build_cash_flow  # noqa: E402
from app.modules.finance.statements.funds_flow_service import build_funds_flow  # noqa: E402
from app.modules.finance.statements.ledger_aggregate_service import build_ledger_calcs  # noqa: E402
from app.modules.finance.statements.profit_loss_service import build_profit_loss  # noqa: E402
from app.modules.finance.statements.ratio_service import build_ratio_analysis  # noqa: E402
from app.modules.finance.statements.stock_gl_service import build_stock_gl  # noqa: E402
from app.modules.finance.statements.trial_balance_service import build_trial_balance  # noqa: E402

ZERO = Decimal("0")
PASS, WARN, FAIL = "PASS", "WARN", "FAIL"
FAILED_CARD_NOTE = "could not be calculated"


class Ctx:
    def __init__(self, db, tenant: Tenant, user: User, today: date):
        self.db, self.tenant, self.user, self.today = db, tenant, user, today
        self.fy_start = fiscal_year_bounds(today, fy_start_month(tenant.feature_flags))[0]


def _signed(result) -> Decimal:
    return result.amount if result.kind == "profit" else -result.amount


async def stored_opening_imbalance(db, tenant_id: int) -> Decimal:
    """Debit-positive sum of the ledgers' stored opening balances (zero when the openings balance)."""
    signed = case(
        (func.lower(ChartOfAccount.normal_balance) == "debit", ChartOfAccount.opening_balance),
        else_=-ChartOfAccount.opening_balance,
    )
    total = (
        await db.execute(select(func.coalesce(func.sum(signed), 0)).where(ChartOfAccount.tenant_id == tenant_id))
    ).scalar_one()
    return Decimal(str(total)).quantize(Decimal("0.0001"))


def _data_note(imbalance: Decimal) -> str:
    side = "Dr" if imbalance > ZERO else "Cr"
    return (
        f"DATA: the ledgers' stored opening balances are unbalanced by {abs(imbalance)} {side} "
        "(Tally: 'Difference in opening balances'); a finance admin must enter the opposite opening balance"
    )


# ---- checks: each returns (status, detail) -------------------------------------------------------------
async def check_tb(c: Ctx):
    tb = await build_trial_balance(c.db, c.tenant, from_date=c.fy_start, to_date=c.today, include_zero=False)
    t = tb.totals
    diffs = {
        "opening": t.opening_debit - t.opening_credit,
        "period": t.period_debit - t.period_credit,
        "closing": t.closing_debit - t.closing_credit,
    }
    bad = {k: v for k, v in diffs.items() if v != ZERO}
    detail = f"closing Dr {t.closing_debit} = Cr {t.closing_credit}; rows {len(tb.rows)}"
    if not bad and tb.reconciliation.balanced:
        return PASS, detail
    imbalance = await stored_opening_imbalance(c.db, c.tenant.id)
    if diffs["period"] == ZERO and diffs["opening"] == diffs["closing"] == imbalance != ZERO:
        return FAIL, _data_note(imbalance)
    return FAIL, f"debit != credit {bad}"


async def check_bs(c: Ctx):
    bs = await build_balance_sheet(c.db, c.tenant, as_of_date=c.today, include_zero=False)
    t = bs.totals
    detail = f"liabilities {t.liabilities} assets {t.assets} difference {t.difference}"
    if t.liabilities == t.assets and t.difference == ZERO and bs.reconciliation.balanced:
        return PASS, detail
    imbalance = await stored_opening_imbalance(c.db, c.tenant.id)
    if imbalance != ZERO and t.difference == -imbalance:
        return FAIL, f"{detail}; {_data_note(imbalance)}"
    return FAIL, detail


async def check_pl(c: Ctx):
    pnl = await build_profit_loss(c.db, c.tenant, from_date=c.fy_start, to_date=c.today, include_zero=False)
    calcs, _g = await build_ledger_calcs(c.db, c.tenant.id, from_date=c.fy_start, to_date=c.today, fy_start=c.fy_start)
    tb_movement = sum((x.period_credit - x.period_debit for x in calcs if x.is_pl), ZERO)
    nett = _signed(pnl.profit_and_loss.nett_result)
    ok = nett == pnl.income_expense_movement == tb_movement
    return (PASS if ok else FAIL), f"nett {nett} / P&L movement {pnl.income_expense_movement} / TB movement {tb_movement}"


async def check_cash(c: Ctx):
    cf = await build_cash_flow(c.db, c.tenant, fiscal_year=None, today=c.today)
    problems = []
    if cf.months and cf.months[0].opening_cash != cf.opening_cash:
        problems.append("first opening != opening_cash")
    for m in cf.months:
        if m.closing_cash != m.opening_cash + m.nett_flow or m.nett_flow != m.inflow - m.outflow:
            problems.append(f"{m.month} closing != opening + nett")
    for prev, nxt in zip(cf.months, cf.months[1:]):
        if prev.closing_cash != nxt.opening_cash:
            problems.append(f"{prev.month} closing != {nxt.month} opening")
    if cf.months and cf.months[-1].closing_cash != cf.grand_total.closing_cash:
        problems.append("last closing != grand total")
    if cf.grand_total.closing_cash != cf.gl_closing_cash or not cf.reconciliation.balanced:
        problems.append(f"closing {cf.grand_total.closing_cash} != GL {cf.gl_closing_cash}")
    pool = cf.closing_pool
    detail = (
        f"open {cf.opening_cash} close {cf.grand_total.closing_cash} = GL {cf.gl_closing_cash}; "
        f"cash {pool.cash_in_hand} bank {pool.bank_accounts} OD {pool.bank_od}"
    )
    return (FAIL, "; ".join(problems[:4])) if problems else (PASS, detail)


async def check_funds(c: Ctx):
    ff = await build_funds_flow(c.db, c.tenant, fiscal_year=None, today=c.today)
    problems = []
    for m in ff.months:
        if m.funds_flow != m.working_capital_closing - m.working_capital_opening:
            problems.append(f"{m.month} flow != closing - opening")
        if m.current_assets_closing - m.current_liabilities_closing != m.working_capital_closing:
            problems.append(f"{m.month} CA - CL != WC")
    for prev, nxt in zip(ff.months, ff.months[1:]):
        if prev.working_capital_closing != nxt.working_capital_opening:
            problems.append(f"{prev.month} closing != {nxt.month} opening")
    g = ff.grand_total
    if ff.months and (g.working_capital_opening != ff.months[0].working_capital_opening
                      or g.working_capital_closing != ff.months[-1].working_capital_closing):
        problems.append("grand total != first opening / last closing")
    if g.funds_flow != g.working_capital_closing - g.working_capital_opening or not ff.reconciliation.balanced:
        problems.append("grand flow != closing - opening")
    detail = f"WC {g.working_capital_opening} -> {g.working_capital_closing} (flow {g.funds_flow})"
    return (FAIL, "; ".join(problems[:4])) if problems else (PASS, detail)


async def check_ratio(c: Ctx):
    ra = await build_ratio_analysis(c.db, c.tenant, from_date=c.fy_start, to_date=c.today)
    ratios = {r.code: r for r in ra.principal_ratios}
    groups = {g.code: g for g in ra.principal_groups}
    nett, op = ratios["NETT_PROFIT_PCT"].value, ratios["OPERATING_COST_PCT"].value
    problems = []
    if (nett is None) != (op is None):
        problems.append("one of Nett Profit % / Operating Cost % is null")
    elif nett is not None and abs((Decimal(100) - nett) - op) > Decimal("0.0001"):
        problems.append(f"Operating Cost % {op} != 100 - Nett Profit % {nett}")
    due = groups["SUNDRY_DEBTORS_DUE"]
    if due.source is None:
        problems.append("debtors due has no source")
    detail = (
        f"nett% {nett} op.cost% {op}; due source {due.source} (automatic {due.source_automatic}) "
        f"debtors due {due.amount} creditors due {groups['SUNDRY_CREDITORS_DUE'].amount}"
    )
    return (FAIL, "; ".join(problems)) if problems else (PASS, detail)


async def check_stock_gl(c: Ctx):
    s = await build_stock_gl(c.db, c.tenant, as_of_date=c.today)
    detail = f"FIFO {s.fifo_total} GL {s.gl_total} difference {s.difference} (alert only)"
    return (PASS if s.difference == ZERO else WARN), detail


async def check_control_tower(c: Ctx):
    tower = await build_control_tower(c.db, c.tenant, as_of=c.today, severity="all")
    problems, shown = [], []
    for card in tower.cards:
        if card.note and FAILED_CARD_NOTE in card.note:
            problems.append(f"{card.code} failed")
            continue
        lst = await build_exception_list(c.db, c.tenant, code=card.code, as_of=c.today, limit=1, offset=0)
        if (lst.total, lst.amount) != (card.count, card.amount):
            problems.append(f"{card.code} card {card.count}/{card.amount} != list {lst.total}/{lst.amount}")
        if card.count:
            shown.append(f"{card.code}={card.count}")
    if len(tower.cards) != len(CARD_DEFS):
        problems.append(f"{len(tower.cards)} cards, expected {len(CARD_DEFS)}")
    detail = f"{len(tower.cards)} cards = lists; " + (", ".join(shown) if shown else "no exceptions")
    return (FAIL, "; ".join(problems)) if problems else (PASS, detail)


async def check_profitability(c: Ctx):
    res = await list_order_profit(
        c.db, c.tenant, from_date=c.fy_start, to_date=c.today, limit=50, offset=0, sort="order_code"
    )
    return PASS, f"{res.total} order(s); unattributed {res.unattributed_actual}"


async def check_budget(c: Ctx):
    out = []
    for dim in DIMENSIONS:
        res = await build_budget_analytics(c.db, c.tenant, fiscal_year=None, budget_id=None, dimension=dim)
        out.append(f"{dim}={len(res.rows)}")
    return PASS, f"FY {res.fiscal_year}, {len(res.budgets)} budget(s); rows " + ", ".join(out)


async def check_expense(c: Ctx):
    out = []
    for group_by in EXPENSE_GROUP_BY:
        res = await build_expense_analysis(c.db, c.tenant, from_date=c.fy_start, to_date=c.today, group_by=group_by)
        out.append(f"{group_by}={len(res.rows)}")
    return PASS, f"total {res.total_current}; rows " + ", ".join(out)


async def check_expense_controls(c: Ctx):
    res = await build_expense_controls(c.db, c.tenant, as_of=c.today)
    return PASS, ", ".join(f"{r.code}={r.count}" for r in res.rules)


def commentary_check(report: str):
    async def _run(c: Ctx):
        res = await build_commentary(c.db, c.tenant, c.user, CommentaryRequest(report=report, use_ai=False), audit=False)
        ok = res.source == "deterministic" and bool(res.summary)
        return (PASS if ok else FAIL), f"{len(res.facts)} facts, {len(res.findings)} findings"

    return _run


CHECKS = [
    ("trial_balance", check_tb),
    ("balance_sheet", check_bs),
    ("profit_loss", check_pl),
    ("cash_flow_monthly", check_cash),
    ("funds_flow_monthly", check_funds),
    ("ratio_analysis", check_ratio),
    ("stock_vs_gl", check_stock_gl),
    ("control_tower", check_control_tower),
    ("profitability_orders", check_profitability),
    ("budget_analytics", check_budget),
    ("expense_analysis", check_expense),
    ("expense_controls", check_expense_controls),
] + [(f"ai_commentary:{r}", commentary_check(r)) for r in REPORTS]


async def _admin_user(db, tenant_id: int) -> User | None:
    stmt = (
        select(User)
        .join(Role, Role.id == User.role_id)
        .where(User.tenant_id == tenant_id, User.is_active.is_(True), Role.tenant_id == tenant_id, Role.name == "admin")
        .order_by(User.id)
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def main(company_code: str, verbose: bool) -> int:
    results: list[tuple[str, str, str]] = []
    async with AsyncSessionLocal() as db:
        await bind_session_bypass(db)
        tenant = (await db.execute(select(Tenant).where(Tenant.company_code == company_code))).scalar_one_or_none()
        if tenant is None:
            print(f"No tenant with company code {company_code}.")
            return 2
        await bind_session_tenant(db, tenant.id)
        user = await _admin_user(db, tenant.id)
        if user is None:
            print("Tenant has no active admin user (needed for the commentary check).")
            return 2
        db.expunge(tenant)  # detached copies survive the rollbacks between checks
        db.expunge(user)
        await db.rollback()
        ctx = Ctx(db, tenant, user, today_local(tenant))
        for name, fn in CHECKS:
            try:
                await db.execute(text("SET TRANSACTION READ ONLY"))
                status, detail = await fn(ctx)
            except Exception as exc:  # noqa: BLE001 - every check is reported, none stops the run
                status, detail = FAIL, f"exception {type(exc).__name__}: {str(exc)[:160]}"
                if verbose:
                    traceback.print_exc()
            await safe_async_session_rollback(db)
            results.append((name, status, detail))

    width = max(len(n) for n, _s, _d in results)
    print(f"Finance smoke check - {company_code} (tenant {tenant.id}), as of {ctx.today}, FY from {ctx.fy_start}")
    print(f"{'check'.ljust(width)} | status | detail")
    print(f"{'-' * width}-+--------+-{'-' * 60}")
    for name, status, detail in results:
        print(f"{name.ljust(width)} | {status.ljust(6)} | {detail}")
    fails = sum(1 for _n, s, _d in results if s == FAIL)
    warns = sum(1 for _n, s, _d in results if s == WARN)
    print(f"\n{len(results)} checks: {len(results) - fails - warns} PASS, {warns} WARN, {fails} FAIL")
    return 1 if fails else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--company-code", required=True)
    parser.add_argument("--verbose", action="store_true", help="Print tracebacks of failed checks")
    args = parser.parse_args()
    sys.exit(asyncio.run(main(args.company_code.strip(), args.verbose)))
