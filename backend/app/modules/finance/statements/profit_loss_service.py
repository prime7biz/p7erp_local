"""Trading + Profit & Loss A/c, GL only (PLAN "Trading + Profit & Loss A/c", acceptance 2.5, 2.6).

P7 posts perpetual inventory (GRN Dr Inventory; challan / consumption Dr COGS), so every figure comes from
classified GL movement. FIFO opening / closing stock is a disclosure-only memo and never enters
`gross_result`. SQL: 3 statements (limit 8).

Unclassified income / expense groups are not guessed into a class: they are shown in the Profit & Loss part
as "Unclassified Income / Expenses" (by the group's own nature) so nett result still equals the full
income-expense movement, and an UNCLASSIFIED_GROUPS warning is returned.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant import Tenant
from app.modules.finance.fiscal_year import fiscal_year_bounds, fy_start_month
from app.modules.finance.posting_core import BALANCE_TOLERANCE
from app.modules.finance.statements.constants import (
    PL_CREDIT_CLASSES,
    PL_DEBIT_CLASSES,
    PRIMARY_UNCLASSIFIED,
    TRADING_CREDIT_CLASSES,
    TRADING_DEBIT_CLASSES,
    CLASS_TO_PRIMARY,
    PURCHASE_ACCOUNTS,
)
from app.modules.finance.statements.group_tree import (
    company_from,
    fiscal_period,
    sheet_primary,
    unclassified_warning,
)
from app.modules.finance.statements.ledger_aggregate_service import LedgerCalc, build_ledger_calcs
from app.modules.finance.statements.schemas import (
    ProfitLossAccount,
    ProfitLossResponse,
    Reconciliation,
    Result,
    SheetNode,
    StockAdjustment,
    StockMemo,
    TradingAccount,
)

ZERO = Decimal("0")


@dataclass
class MemoStock:
    """FIFO memo figures (disclosure only). `opening` / `closing` map raw_material / work_in_process / finished_goods."""

    opening: dict[str, Decimal]
    closing: dict[str, Decimal]


def _result(amount: Decimal) -> Result:
    return Result(kind="profit" if amount >= ZERO else "loss", amount=abs(amount))


def periodic_stock_adjustment(
    *,
    gl_gross: Decimal,
    sales_and_direct_income: Decimal,
    purchases: Decimal,
    direct_expenses: Decimal,
    opening_stock: Decimal,
    closing_stock: Decimal,
) -> StockAdjustment:
    """periodic gross = Sales + Direct Income + Closing - Opening - Purchases - Direct Expenses (PLAN section 5).

    adjustment = periodic gross - GL gross, so periodic = GL + adjustment exactly.
    """
    periodic = sales_and_direct_income + closing_stock - opening_stock - purchases - direct_expenses
    return StockAdjustment(
        gl_gross_result=gl_gross, periodic_gross_result=periodic, stock_adjustment=periodic - gl_gross
    )


def _memo_model(values: dict[str, Decimal] | None) -> StockMemo:
    if values is None:
        return StockMemo()
    return StockMemo(
        raw_material=values.get("raw_material", ZERO),
        work_in_process=values.get("work_in_process", ZERO),
        finished_goods=values.get("finished_goods", ZERO),
    )


async def build_profit_loss(
    db: AsyncSession,
    tenant: Tenant,
    *,
    from_date: date,
    to_date: date,
    include_zero: bool = False,
    memo_stock: MemoStock | None = None,
) -> ProfitLossResponse:
    fy_start, _ = fiscal_year_bounds(from_date, fy_start_month(tenant.feature_flags))
    calcs, groups = await build_ledger_calcs(db, tenant.id, from_date=from_date, to_date=to_date, fy_start=fy_start)
    pl_calcs = [c for c in calcs if c.is_pl]

    keep = (lambda c: True) if include_zero else (lambda c: c.period_debit != ZERO or c.period_credit != ZERO)
    debit_net = lambda c: c.period_debit - c.period_credit  # noqa: E731
    credit_net = lambda c: c.period_credit - c.period_debit  # noqa: E731

    def section(classes, value_fn) -> tuple[list[SheetNode], Decimal]:
        nodes: list[SheetNode] = []
        total = ZERO
        for cls in classes:
            node, amount = sheet_primary(
                groups, [c for c in pl_calcs if c.effective_class == cls],
                primary=CLASS_TO_PRIMARY[cls], value_fn=value_fn, keep_fn=keep,
            )
            if node is not None:
                nodes.append(node)
                total += amount
        return nodes, total

    trading_debit, trading_debit_sum = section(TRADING_DEBIT_CLASSES, debit_net)
    trading_credit, trading_credit_sum = section(TRADING_CREDIT_CLASSES, credit_net)
    indirect_debit, indirect_debit_sum = section(PL_DEBIT_CLASSES, debit_net)
    indirect_credit, indirect_credit_sum = section(PL_CREDIT_CLASSES, credit_net)

    # Unclassified income / expense groups, placed by the group's own nature (never by name).
    unclassified = [c for c in pl_calcs if c.primary == PRIMARY_UNCLASSIFIED]
    u_expense = [c for c in unclassified if (c.group.nature if c.group else "").lower() == "expense"]
    u_income = [c for c in unclassified if c not in u_expense]
    for calcs_u, value_fn, nodes, label in (
        (u_expense, debit_net, indirect_debit, "expense"),
        (u_income, credit_net, indirect_credit, "income"),
    ):
        node, amount = sheet_primary(groups, calcs_u, primary=PRIMARY_UNCLASSIFIED, value_fn=value_fn, keep_fn=keep)
        if node is not None:
            node.name = f"Unclassified {'Expenses' if label == 'expense' else 'Income'}"
            nodes.append(node)
            if label == "expense":
                indirect_debit_sum += amount
            else:
                indirect_credit_sum += amount

    # Trading account: gross result = credits - debits, balanced by a c/o line on the lighter side.
    gross = trading_credit_sum - trading_debit_sum
    t_debit_rows, t_credit_rows = list(trading_debit), list(trading_credit)
    if gross >= ZERO:
        t_debit_rows.append(SheetNode(name="Gross Profit c/o", row_type="result", outer_amount=gross))
        t_debit_total, t_credit_total = trading_debit_sum + gross, trading_credit_sum
    else:
        t_credit_rows.append(SheetNode(name="Gross Loss c/o", row_type="result", outer_amount=-gross))
        t_debit_total, t_credit_total = trading_debit_sum, trading_credit_sum - gross

    # Profit & Loss part: brought-forward gross result, indirect lines, nett result.
    pl_debit_rows, pl_credit_rows = list(indirect_debit), list(indirect_credit)
    if gross >= ZERO:
        pl_credit_rows.insert(0, SheetNode(name="Gross Profit b/f", row_type="result", outer_amount=gross))
    else:
        pl_debit_rows.insert(0, SheetNode(name="Gross Loss b/f", row_type="result", outer_amount=-gross))
    pl_debit_side = indirect_debit_sum + (ZERO if gross >= ZERO else -gross)
    pl_credit_side = indirect_credit_sum + (gross if gross >= ZERO else ZERO)
    nett = pl_credit_side - pl_debit_side
    if nett >= ZERO:
        pl_debit_rows.append(SheetNode(name="Nett Profit", row_type="result", outer_amount=nett))
        pl_debit_total, pl_credit_total = pl_debit_side + nett, pl_credit_side
    else:
        pl_credit_rows.append(SheetNode(name="Nett Loss", row_type="result", outer_amount=-nett))
        pl_debit_total, pl_credit_total = pl_debit_side, pl_credit_side - nett

    movement = sum((c.period_credit - c.period_debit for c in pl_calcs), ZERO)

    # Memo stock + periodic comparison (disclosure only; gross_result above is already final).
    stock_adjustment = None
    if memo_stock is not None:
        stock_adjustment = periodic_stock_adjustment(
            gl_gross=gross,
            sales_and_direct_income=trading_credit_sum,
            purchases=sum(
                (c.period_debit - c.period_credit for c in pl_calcs if c.effective_class == PURCHASE_ACCOUNTS), ZERO
            ),
            direct_expenses=sum(
                (c.period_debit - c.period_credit for c in pl_calcs if c.effective_class == "DIRECT_EXPENSES"), ZERO
            ),
            opening_stock=sum(memo_stock.opening.values(), ZERO),
            closing_stock=sum(memo_stock.closing.values(), ZERO),
        )

    unclassified_alerts = [
        (c.group_id, abs(c.period_credit - c.period_debit)) for c in unclassified if not c.is_empty or include_zero
    ]
    t_diff = t_debit_total - t_credit_total
    p_diff = pl_debit_total - pl_credit_total
    return ProfitLossResponse(
        report="profit_loss",
        company=company_from(tenant),
        period=fiscal_period(tenant, from_date=from_date, to_date=to_date),
        base_currency=tenant.base_currency or "BDT",
        trading=TradingAccount(
            debit_rows=t_debit_rows,
            credit_rows=t_credit_rows,
            opening_stock=_memo_model(memo_stock.opening if memo_stock else None),
            closing_stock=_memo_model(memo_stock.closing if memo_stock else None),
            memo_stock_status="FIFO_MEMO" if memo_stock else "NOT_COMPUTED",
            gross_result=_result(gross),
            debit_total=t_debit_total,
            credit_total=t_credit_total,
        ),
        profit_and_loss=ProfitLossAccount(
            debit_rows=pl_debit_rows,
            credit_rows=pl_credit_rows,
            gross_brought_forward=_result(gross),
            nett_result=_result(nett),
            debit_total=pl_debit_total,
            credit_total=pl_credit_total,
        ),
        stock_adjustment=stock_adjustment,
        income_expense_movement=movement,
        warnings=unclassified_warning(unclassified_alerts),
        reconciliation=Reconciliation(
            balanced=abs(t_diff) <= BALANCE_TOLERANCE and abs(p_diff) <= BALANCE_TOLERANCE,
            difference=abs(t_diff) + abs(p_diff),
        ),
        data_as_of=datetime.utcnow(),
    )
