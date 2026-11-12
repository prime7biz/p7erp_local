"""Monthly Funds Flow (PLAN "Monthly Funds Flow", acceptance 2.8). SQL: 4 statements (limit 6).

working capital = Current Assets - Current Liabilities, at every month boundary, where
  Current Assets      = ledgers of CASH_IN_HAND, BANK_ACCOUNTS, STOCK_IN_HAND, SUNDRY_DEBTORS, CURRENT_ASSETS
  Current Liabilities = ledgers of CURRENT_LIABILITIES, SUNDRY_CREDITORS   (BANK_OD / borrowings are excluded)
Unclassified groups are not guessed into either side.
The Trial Balance / Balance Sheet line "Difference in opening balances" (unbalanced stored openings) is a Balance
Sheet item with no ledger: it is never part of working capital, so funds flow is unaffected by it.
funds_flow = closing WC - opening WC; month N closing is month N+1 opening by construction.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.finance import ChartOfAccount, Voucher, VoucherLine
from app.models.tenant import Tenant
from app.modules.finance.posting_core import BALANCE_TOLERANCE, line_base_amount_sql
from app.modules.finance.statements.cash_flow_service import fiscal_year_range
from app.modules.finance.statements.classification_service import load_group_classification
from app.modules.finance.statements.flow_common import (
    WC_ASSET_CLASSES,
    WC_LIABILITY_CLASSES,
    ZERO,
    group_ids_for,
    month_spans,
    q4,
    voucher_statement_clause,
    year_month_sql,
)
from app.modules.finance.statements.flow_schemas import (
    FundsFlowMonth,
    FundsFlowResponse,
    FundsFlowTotal,
)
from app.modules.finance.statements.group_tree import company_from, fiscal_period
from app.modules.finance.statements.schemas import Reconciliation


async def working_capital_series(
    db: AsyncSession, tenant_id: int, asset_ids: list[int], liability_ids: list[int], fy_start: date, fy_end: date
) -> tuple[dict[str, Decimal], dict[tuple[str, int], Decimal]]:
    """(opening net per side before fy_start incl. stored opening balances, movement per (side, yyyymm)).

    Side is "A" (current assets) or "L" (current liabilities); nets are debit minus credit. 2 statements.
    The movement key 0 holds everything before `fy_start`.
    """
    all_ids = asset_ids + liability_ids
    if not all_ids:
        return {"A": ZERO, "L": ZERO}, {}
    # Labels (not repeated expressions) go into GROUP BY, so the bound dates are not sent twice.
    side = case((ChartOfAccount.group_id.in_(asset_ids), "A"), else_="L").label("wc_side_key")
    amount = line_base_amount_sql()
    signed = case((func.upper(VoucherLine.entry_type) == "DEBIT", amount), else_=-amount)
    period = case((Voucher.voucher_date < fy_start, 0), else_=year_month_sql()).label("wc_period_key")
    moves = (
        await db.execute(
            select(side, period, func.coalesce(func.sum(signed), 0))
            .select_from(VoucherLine)
            .join(Voucher, VoucherLine.voucher_id == Voucher.id)
            .join(ChartOfAccount, ChartOfAccount.id == VoucherLine.account_id)
            .where(
                VoucherLine.tenant_id == tenant_id,
                Voucher.tenant_id == tenant_id,
                ChartOfAccount.tenant_id == tenant_id,
                ChartOfAccount.group_id.in_(all_ids),
                Voucher.voucher_date <= fy_end,
                voucher_statement_clause(),
            )
            .group_by(side, period)
        )
    ).all()
    opening_signed = case(
        (func.lower(ChartOfAccount.normal_balance) == "debit", ChartOfAccount.opening_balance),
        else_=-ChartOfAccount.opening_balance,
    )
    stored = (
        await db.execute(
            select(side, func.coalesce(func.sum(opening_signed), 0))
            .where(ChartOfAccount.tenant_id == tenant_id, ChartOfAccount.group_id.in_(all_ids))
            .group_by(side)
        )
    ).all()
    opening = {"A": ZERO, "L": ZERO}
    for s, value in stored:
        opening[s] = q4(value)
    movement = {(s, int(p)): q4(v) for s, p, v in moves}
    return opening, movement


async def build_funds_flow(
    db: AsyncSession, tenant: Tenant, *, fiscal_year: int | None, today: date
) -> FundsFlowResponse:
    fy_start, fy_end, fy = fiscal_year_range(tenant, fiscal_year, today)
    groups = await load_group_classification(db, tenant.id)  # 2 statements
    asset_ids = group_ids_for(groups, WC_ASSET_CLASSES)
    liability_ids = group_ids_for(groups, WC_LIABILITY_CLASSES)
    opening, movement = await working_capital_series(db, tenant.id, asset_ids, liability_ids, fy_start, fy_end)

    ca = opening["A"] + movement.get(("A", 0), ZERO)
    cl = opening["L"] + movement.get(("L", 0), ZERO)  # debit-positive net; liabilities are normally negative
    year_opening = ca + cl
    months: list[FundsFlowMonth] = []
    for span in month_spans(fy_start):
        wc_open = ca + cl
        ca += movement.get(("A", span.ym), ZERO)
        cl += movement.get(("L", span.ym), ZERO)
        wc_close = ca + cl
        months.append(
            FundsFlowMonth(
                month=span.key,
                label=span.label,
                from_date=span.start,
                to_date=span.end,
                working_capital_opening=wc_open,
                working_capital_closing=wc_close,
                funds_flow=wc_close - wc_open,
                current_assets_closing=ca,
                current_liabilities_closing=-cl,
            )
        )
    year_closing = ca + cl
    total_flow = sum((m.funds_flow for m in months), ZERO)
    difference = total_flow - (year_closing - year_opening)
    return FundsFlowResponse(
        report="funds_flow_monthly",
        company=company_from(tenant),
        period=fiscal_period(tenant, from_date=fy_start, to_date=fy_end),
        base_currency=tenant.base_currency or "BDT",
        fiscal_year=fy,
        months=months,
        grand_total=FundsFlowTotal(
            working_capital_opening=year_opening, working_capital_closing=year_closing, funds_flow=total_flow
        ),
        reconciliation=Reconciliation(balanced=abs(difference) <= BALANCE_TOLERANCE, difference=difference),
        data_as_of=datetime.utcnow(),
    )
