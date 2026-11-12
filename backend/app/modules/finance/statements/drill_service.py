"""Drill-down levels (PLAN "Drill-down", acceptance 2.12, 2.15): group -> ledger -> vouchers, and cash-flow month -> ledgers.

Every level uses the same ledger numbers as the Trial Balance (`build_ledger_calcs`), so a level always sums to its
parent. Ids are tenant-validated; another tenant's id is reported exactly like a missing one (404). Lists are bounded.
SQL per level: group 3, ledger 4-5, cash-flow month 4 (limit 5).
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.finance import ChartOfAccount, Voucher, VoucherLine
from app.models.tenant import Tenant
from app.modules.finance.fiscal_year import fiscal_year_bounds, fy_start_month
from app.modules.finance.posting_core import line_base_amount_sql
from app.modules.finance.statements.cash_flow_service import (
    cash_pool_clause,
    fiscal_year_range,
    parse_month,
    pool_month_flows,
)
from app.modules.finance.statements.classification_service import (
    GroupInfo,
    ledger_is_bank_sql,
    ledger_is_cash_sql,
    load_group_classification,
    resolve_ledger_class,
)
from app.modules.finance.statements.flow_common import (
    ZERO,
    q4,
    voucher_statement_clause,
)
from app.modules.finance.statements.flow_schemas import (
    DrillAmounts,
    DrillCashFlowResponse,
    DrillCashLedger,
    DrillGroupResponse,
    DrillLedgerResponse,
    DrillRow,
    DrillVoucherRow,
    dr_cr_of,
)
from app.modules.finance.statements.group_tree import company_from, fiscal_period
from app.modules.finance.statements.ledger_aggregate_service import LedgerCalc, build_ledger_calcs
from app.modules.finance.statements.schemas import Reconciliation


def _amounts(opening: Decimal, debit: Decimal, credit: Decimal) -> DrillAmounts:
    closing = opening + debit - credit
    return DrillAmounts(
        opening=opening,
        debit=debit,
        credit=credit,
        closing=closing,
        opening_dr_cr=dr_cr_of(opening),
        closing_dr_cr=dr_cr_of(closing),
    )


def _sum(calcs: list[LedgerCalc]) -> DrillAmounts:
    return _amounts(
        sum((c.opening_net for c in calcs), ZERO),
        sum((c.period_debit for c in calcs), ZERO),
        sum((c.period_credit for c in calcs), ZERO),
    )


def _subtree_ids(groups: dict[int, GroupInfo], group_id: int) -> set[int]:
    seen: set[int] = set()
    stack = [group_id]
    while stack:
        gid = stack.pop()
        if gid in seen or gid not in groups:
            continue
        seen.add(gid)
        stack.extend(groups[gid].children)
    return seen


def _range(tenant: Tenant, from_date: date | None, to_date: date | None, today: date) -> tuple[date, date, date]:
    start_month = fy_start_month(tenant.feature_flags)
    if to_date is None:
        to_date = today
    if from_date is None:
        from_date = fiscal_year_bounds(to_date, start_month)[0]
    if from_date > to_date:
        raise HTTPException(status_code=422, detail="from_date must be on or before to_date")
    return from_date, to_date, fiscal_year_bounds(from_date, start_month)[0]


async def drill_group(
    db: AsyncSession, tenant: Tenant, *, group_id: int, from_date: date | None, to_date: date | None, today: date
) -> DrillGroupResponse:
    start, end, fy_start = _range(tenant, from_date, to_date, today)
    calcs, groups = await build_ledger_calcs(db, tenant.id, from_date=start, to_date=end, fy_start=fy_start)
    group = groups.get(group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Account group not found")

    by_group: dict[int, list[LedgerCalc]] = {}
    for c in calcs:
        by_group.setdefault(c.group_id, []).append(c)

    rows: list[DrillRow] = []
    for child_id in group.children:
        if child_id == group_id or child_id not in groups:
            continue
        members = [c for gid in _subtree_ids(groups, child_id) for c in by_group.get(gid, [])]
        if all(m.is_empty for m in members):
            continue
        child = groups[child_id]
        rows.append(
            DrillRow(row_type="group", id=child_id, name=child.name, statement_class=child.effective_class, **_sum(members).model_dump())
        )
    for c in sorted(by_group.get(group_id, []), key=lambda x: (x.account_number, x.account_id)):
        if c.is_empty:
            continue
        rows.append(
            DrillRow(
                row_type="ledger",
                id=c.account_id,
                name=c.name,
                statement_class=c.effective_class,
                **_amounts(c.opening_net, c.period_debit, c.period_credit).model_dump(),
            )
        )
    total_members = [c for gid in _subtree_ids(groups, group_id) for c in by_group.get(gid, [])]
    return DrillGroupResponse(
        report="drill_group",
        company=company_from(tenant),
        period=fiscal_period(tenant, from_date=start, to_date=end),
        base_currency=tenant.base_currency or "BDT",
        group_id=group_id,
        group_name=group.name,
        parent_group_id=group.parent_id,
        rows=rows,
        total=_sum(total_members),
        reconciliation=Reconciliation(balanced=True, difference=ZERO),
        data_as_of=datetime.utcnow(),
    )


async def drill_ledger(
    db: AsyncSession,
    tenant: Tenant,
    *,
    account_id: int,
    from_date: date | None,
    to_date: date | None,
    today: date,
    limit: int,
    offset: int,
) -> DrillLedgerResponse:
    start, end, fy_start = _range(tenant, from_date, to_date, today)
    calcs, _groups = await build_ledger_calcs(db, tenant.id, from_date=start, to_date=end, fy_start=fy_start)
    calc = next((c for c in calcs if c.account_id == account_id), None)
    if calc is None:
        raise HTTPException(status_code=404, detail="Account not found")

    amount = line_base_amount_sql()
    is_debit = func.upper(VoucherLine.entry_type) == "DEBIT"
    debit = func.coalesce(func.sum(case((is_debit, amount), else_=0)), 0)
    credit = func.coalesce(func.sum(case((~is_debit, amount), else_=0)), 0)
    running = func.sum(debit - credit).over(order_by=(Voucher.voucher_date, Voucher.id))
    page = (
        await db.execute(
            select(
                Voucher.id,
                Voucher.voucher_number,
                Voucher.voucher_type,
                Voucher.voucher_date,
                Voucher.description,
                debit,
                credit,
                running,
                func.count().over(),
            )
            .select_from(VoucherLine)
            .join(Voucher, VoucherLine.voucher_id == Voucher.id)
            .where(
                VoucherLine.tenant_id == tenant.id,
                Voucher.tenant_id == tenant.id,
                VoucherLine.account_id == account_id,
                Voucher.voucher_date >= start,
                Voucher.voucher_date <= end,
                voucher_statement_clause(),
            )
            .group_by(Voucher.id)
            .order_by(Voucher.voucher_date, Voucher.id)
            .limit(limit)
            .offset(offset)
        )
    ).all()
    total = int(page[0][8]) if page else 0
    if not page and offset > 0:
        total = int(
            (
                await db.execute(
                    select(func.count(func.distinct(Voucher.id)))
                    .select_from(VoucherLine)
                    .join(Voucher, VoucherLine.voucher_id == Voucher.id)
                    .where(
                        VoucherLine.tenant_id == tenant.id,
                        Voucher.tenant_id == tenant.id,
                        VoucherLine.account_id == account_id,
                        Voucher.voucher_date >= start,
                        Voucher.voucher_date <= end,
                        voucher_statement_clause(),
                    )
                )
            ).scalar()
            or 0
        )
    return DrillLedgerResponse(
        report="drill_ledger",
        company=company_from(tenant),
        period=fiscal_period(tenant, from_date=start, to_date=end),
        base_currency=tenant.base_currency or "BDT",
        account_id=account_id,
        account_name=calc.name,
        group_id=calc.group_id,
        opening=calc.opening_net,
        period_debit=calc.period_debit,
        period_credit=calc.period_credit,
        closing=calc.closing_net,
        total_vouchers=total,
        limit=limit,
        offset=offset,
        rows=[
            DrillVoucherRow(
                voucher_id=vid,
                voucher_number=number,
                voucher_type=vtype,
                voucher_date=vdate,
                description=desc,
                debit=q4(d),
                credit=q4(c),
                running_balance=calc.opening_net + q4(run),
            )
            for vid, number, vtype, vdate, desc, d, c, run, _n in page
        ],
        reconciliation=Reconciliation(balanced=True, difference=ZERO),
        data_as_of=datetime.utcnow(),
    )


async def drill_cash_flow_month(
    db: AsyncSession, tenant: Tenant, *, fiscal_year: int | None, month: str, today: date
) -> DrillCashFlowResponse:
    fy_start, fy_end, _fy = fiscal_year_range(tenant, fiscal_year, today)
    span = parse_month(month, fy_start)
    groups = await load_group_classification(db, tenant.id)
    pool = cash_pool_clause(groups, tenant.id)
    flows = (await pool_month_flows(db, tenant.id, pool, span.start, span.end)).get(span.ym)
    inflow, outflow, contra = (flows.inflow, flows.outflow, flows.contra) if flows else (ZERO, ZERO, ZERO)

    ledgers: list[DrillCashLedger] = []
    if pool is not None:
        amount = line_base_amount_sql()
        is_debit = func.upper(VoucherLine.entry_type) == "DEBIT"
        is_bank = ledger_is_bank_sql(tenant.id).label("is_bank")
        is_cash = ledger_is_cash_sql(tenant.id).label("is_cash")
        rows = (
            await db.execute(
                select(
                    ChartOfAccount.id,
                    ChartOfAccount.name,
                    ChartOfAccount.group_id,
                    is_bank,
                    is_cash,
                    func.coalesce(func.sum(case((is_debit, amount), else_=0)), 0),
                    func.coalesce(func.sum(case((~is_debit, amount), else_=0)), 0),
                )
                .select_from(VoucherLine)
                .join(Voucher, VoucherLine.voucher_id == Voucher.id)
                .join(ChartOfAccount, ChartOfAccount.id == VoucherLine.account_id)
                .where(
                    VoucherLine.tenant_id == tenant.id,
                    Voucher.tenant_id == tenant.id,
                    ChartOfAccount.tenant_id == tenant.id,
                    pool,
                    Voucher.voucher_date >= span.start,
                    Voucher.voucher_date <= span.end,
                    voucher_statement_clause(),
                )
                .group_by(ChartOfAccount.id, ChartOfAccount.name, ChartOfAccount.group_id)
                .order_by(ChartOfAccount.name, ChartOfAccount.id)
            )
        ).all()
        ledgers = [
            DrillCashLedger(
                account_id=aid,
                name=name,
                statement_class=resolve_ledger_class(
                    groups[gid].effective_class if gid in groups else None, is_bank=bool(bk), is_cash=bool(cs)
                ),
                debit=q4(d),
                credit=q4(c),
            )
            for aid, name, gid, bk, cs, d, c in rows
        ]
    total_debit = sum((x.debit for x in ledgers), ZERO)
    total_credit = sum((x.credit for x in ledgers), ZERO)
    difference = abs((total_debit - contra) - inflow) + abs((total_credit - contra) - outflow)
    return DrillCashFlowResponse(
        report="drill_cash_flow",
        company=company_from(tenant),
        period=fiscal_period(tenant, from_date=span.start, to_date=span.end),
        base_currency=tenant.base_currency or "BDT",
        month=span.key,
        inflow=inflow,
        outflow=outflow,
        nett_flow=inflow - outflow,
        contra_excluded=contra,
        ledgers=ledgers,
        total_debit=total_debit,
        total_credit=total_credit,
        reconciliation=Reconciliation(balanced=difference == ZERO, difference=difference),
        data_as_of=datetime.utcnow(),
    )
