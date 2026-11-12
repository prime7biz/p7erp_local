"""Two-sided Balance Sheet (PLAN "Two-sided Balance Sheet", acceptance 2.4). SQL: 3 statements (limit 8).

Stock is the GL balance of the `STOCK_IN_HAND` ledgers, so the sheet balances with perpetual inventory.
The result of the year so far and of earlier years sits on one line, on the liabilities side when it is a
profit and on the assets side when it is an accumulated loss.
When the ledgers' stored opening balances do not balance, a `Difference in opening balances` line (as in Tally) sits
on the side that balances the sheet (liabilities when the openings are debit-heavy) and is warned about.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant import Tenant
from app.modules.finance.fiscal_year import fiscal_year_bounds, fy_start_month
from app.modules.finance.posting_core import BALANCE_TOLERANCE
from app.modules.finance.statements.constants import (
    BS_ASSET_PRIMARIES,
    BS_LIABILITY_PRIMARIES,
    OPENING_DIFFERENCE_CODE,
    OPENING_DIFFERENCE_LABEL,
    PRIMARY_UNCLASSIFIED,
)
from app.modules.finance.statements.group_tree import (
    company_from,
    fiscal_period,
    opening_difference_warning,
    sheet_primary,
    unclassified_warning,
)
from app.modules.finance.statements.ledger_aggregate_service import (
    LedgerCalc,
    build_ledger_calcs,
    opening_difference,
)
from app.modules.finance.statements.schemas import (
    BalanceSheetProfitLoss,
    BalanceSheetResponse,
    BalanceSheetTotals,
    SheetNode,
    SheetReconciliation,
)

ZERO = Decimal("0")


def profit_and_loss_result(calcs: list[LedgerCalc]) -> tuple[Decimal, Decimal]:
    """(earlier years, current fiscal year) result, profit positive. Needs calcs built from fiscal-year start."""
    opening = -sum((c.pre_fy_net for c in calcs if c.is_pl), ZERO)
    current = sum((c.period_credit - c.period_debit + (-c.opening_net) for c in calcs if c.is_pl), ZERO)
    return opening, current


def _unclassified_on_asset_side(calc: LedgerCalc) -> bool:
    nature = (calc.group.nature if calc.group else "").lower()
    return nature == "asset"


async def build_balance_sheet(
    db: AsyncSession,
    tenant: Tenant,
    *,
    as_of_date: date,
    include_zero: bool = False,
) -> BalanceSheetResponse:
    fy_start, _ = fiscal_year_bounds(as_of_date, fy_start_month(tenant.feature_flags))
    calcs, groups = await build_ledger_calcs(db, tenant.id, from_date=fy_start, to_date=as_of_date, fy_start=fy_start)
    sheet_calcs = [c for c in calcs if not c.is_pl]

    keep = (lambda c: True) if include_zero else (lambda c: c.closing_net != ZERO)
    as_liability = lambda c: -c.closing_net  # noqa: E731  credit positive
    as_asset = lambda c: c.closing_net  # noqa: E731  debit positive

    def side(primaries, value_fn, extra_unclassified) -> tuple[list[SheetNode], Decimal]:
        nodes: list[SheetNode] = []
        total = ZERO
        for primary in primaries:
            node, amount = sheet_primary(groups, sheet_calcs, primary=primary, value_fn=value_fn, keep_fn=keep)
            if node is not None:
                nodes.append(node)
                total += amount
        node, amount = sheet_primary(
            groups, extra_unclassified, primary=PRIMARY_UNCLASSIFIED, value_fn=value_fn, keep_fn=keep
        )
        if node is not None:
            nodes.append(node)
            total += amount
        return nodes, total

    unclassified = [c for c in sheet_calcs if c.primary == PRIMARY_UNCLASSIFIED]
    liabilities, liab_total = side(
        BS_LIABILITY_PRIMARIES, as_liability, [c for c in unclassified if not _unclassified_on_asset_side(c)]
    )
    assets, asset_total = side(BS_ASSET_PRIMARIES, as_asset, [c for c in unclassified if _unclassified_on_asset_side(c)])

    opening_pl, current_pl = profit_and_loss_result(calcs)
    total_pl = opening_pl + current_pl
    pl_side = "liabilities" if total_pl >= ZERO else "assets"
    sign = Decimal(1) if pl_side == "liabilities" else Decimal(-1)
    pl_node = SheetNode(
        name="Profit & Loss A/c",
        row_type="result",
        outer_amount=abs(total_pl),
        children=[
            SheetNode(name="Opening Balance", row_type="result", inner_amount=opening_pl * sign),
            SheetNode(name="Current Period", row_type="result", inner_amount=current_pl * sign),
        ],
    )
    if total_pl != ZERO or opening_pl != ZERO or current_pl != ZERO or include_zero:
        (liabilities if pl_side == "liabilities" else assets).append(pl_node)
        if pl_side == "liabilities":
            liab_total += total_pl
        else:
            asset_total += -total_pl

    # Debit-heavy openings make the assets side larger, so the difference goes on the liabilities side.
    opening_diff = opening_difference(calcs)
    if opening_diff != ZERO:
        diff_node = SheetNode(
            name=OPENING_DIFFERENCE_LABEL,
            row_type="opening_difference",
            code=OPENING_DIFFERENCE_CODE,
            outer_amount=abs(opening_diff),
        )
        if opening_diff > ZERO:
            liabilities.append(diff_node)
            liab_total += opening_diff
        else:
            assets.append(diff_node)
            asset_total += -opening_diff

    difference = liab_total - asset_total
    return BalanceSheetResponse(
        report="balance_sheet",
        company=company_from(tenant),
        period=fiscal_period(tenant, from_date=None, to_date=None, as_of_date=as_of_date),
        base_currency=tenant.base_currency or "BDT",
        liabilities=liabilities,
        assets=assets,
        profit_and_loss=BalanceSheetProfitLoss(
            opening=opening_pl, current_period=current_pl, amount=abs(total_pl), side=pl_side
        ),
        totals=BalanceSheetTotals(liabilities=liab_total, assets=asset_total, difference=difference),
        warnings=unclassified_warning(
            [
                (c.group_id, abs(c.closing_net) + abs(c.pre_fy_net))
                for c in calcs
                if c.primary == PRIMARY_UNCLASSIFIED and (c.closing_net != ZERO or c.pre_fy_net != ZERO)
            ]
        )
        + opening_difference_warning(opening_diff),
        reconciliation=SheetReconciliation(
            balanced=abs(difference) <= BALANCE_TOLERANCE, difference=difference, opening_difference=opening_diff
        ),
        data_as_of=datetime.utcnow(),
    )
