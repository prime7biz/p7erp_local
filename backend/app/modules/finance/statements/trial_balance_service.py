"""Grouped Trial Balance (PLAN "Grouped Trial Balance", acceptance 2.3).

Primary group -> account groups -> ledgers, plus a synthetic `Profit & Loss A/c` line holding the result of
earlier fiscal years (no voucher is created). When the ledgers' stored opening balances do not balance, a second
synthetic line `Difference in opening balances` (as in Tally) sits on the side that balances the opening and closing
columns (credit when the openings are debit-heavy) and an OPENING_BALANCE_DIFFERENCE warning is returned.
SQL: 3 statements (limit 6).
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant import Tenant
from app.modules.finance.fiscal_year import fiscal_year_bounds, fy_start_month
from app.modules.finance.posting_core import BALANCE_TOLERANCE
from app.modules.finance.statements.constants import (
    OPENING_DIFFERENCE_CODE,
    OPENING_DIFFERENCE_LABEL,
    PRIMARY_UNCLASSIFIED,
    TB_PRIMARY_ORDER,
)
from app.modules.finance.statements.group_tree import (
    GroupNode,
    assemble,
    company_from,
    fiscal_period,
    opening_difference_warning,
    unclassified_warning,
)
from app.modules.finance.statements.ledger_aggregate_service import (
    LedgerCalc,
    build_ledger_calcs,
    opening_difference,
)
from app.modules.finance.statements.schemas import (
    Drilldown,
    SheetReconciliation,
    TrialBalanceResponse,
    TrialBalanceRow,
    TrialBalanceTotals,
)

ZERO = Decimal("0")


def _split(net: Decimal) -> tuple[Decimal, Decimal]:
    return (net, ZERO) if net > ZERO else (ZERO, -net)


def _dr_cr(net: Decimal) -> str:
    return "Dr" if net > ZERO else ("Cr" if net < ZERO else "")


def _row(
    row_type, id_, parent_id, name, depth, cls, opening, pdr, pcr, drill: Drilldown, code: str | None = None
) -> TrialBalanceRow:
    closing = opening + pdr - pcr
    od, oc = _split(opening)
    cd, cc = _split(closing)
    return TrialBalanceRow(
        row_type=row_type,
        code=code,
        id=id_,
        parent_id=parent_id,
        name=name,
        depth=depth,
        statement_class=cls,
        opening_debit=od,
        opening_credit=oc,
        period_debit=pdr,
        period_credit=pcr,
        closing_debit=cd,
        closing_credit=cc,
        dr_cr=_dr_cr(closing),
        drilldown=drill,
    )


def _emit_group(node: GroupNode, parent_id: int | None, depth: int) -> tuple[list[TrialBalanceRow], tuple]:
    """Rows for a group (group line first) and its (opening, period debit, period credit) sums."""
    body: list[TrialBalanceRow] = []
    opening = pdr = pcr = ZERO
    for ledger in node.ledgers:
        body.append(
            _row(
                "ledger", ledger.account_id, node.group.id, ledger.name,
                depth + 1, ledger.effective_class, ledger.opening_net, ledger.period_debit, ledger.period_credit,
                Drilldown(kind="ledger", id=ledger.account_id),
            )
        )
        opening += ledger.opening_net
        pdr += ledger.period_debit
        pcr += ledger.period_credit
    for child in node.children:
        child_rows, (c_open, c_dr, c_cr) = _emit_group(child, node.group.id, depth + 1)
        body.extend(child_rows)
        opening += c_open
        pdr += c_dr
        pcr += c_cr
    head = _row(
        "group", node.group.id, parent_id, node.group.name, depth, node.group.effective_class,
        opening, pdr, pcr, Drilldown(kind="group", id=node.group.id),
    )
    return [head, *body], (opening, pdr, pcr)


async def build_trial_balance(
    db: AsyncSession,
    tenant: Tenant,
    *,
    from_date: date,
    to_date: date,
    include_zero: bool = False,
) -> TrialBalanceResponse:
    fy_start, _fy_end = fiscal_year_bounds(from_date, fy_start_month(tenant.feature_flags))
    calcs, groups = await build_ledger_calcs(db, tenant.id, from_date=from_date, to_date=to_date, fy_start=fy_start)
    shown: list[LedgerCalc] = calcs if include_zero else [c for c in calcs if not c.is_empty]

    rows: list[TrialBalanceRow] = []
    for primary in TB_PRIMARY_ORDER:
        roots = assemble(groups, shown, primary=primary, include_empty_groups=include_zero)
        if not roots:
            continue
        group_rows: list[TrialBalanceRow] = []
        opening = pdr = pcr = ZERO
        for root in roots:
            emitted, (o, d, c) = _emit_group(root, None, 1)
            group_rows.extend(emitted)
            opening += o
            pdr += d
            pcr += c
        rows.append(
            _row(
                "primary", None, None, primary, 0, None, opening, pdr, pcr,
                Drilldown(kind="unclassified" if primary == PRIMARY_UNCLASSIFIED else "primary"),
            )
        )
        rows.extend(group_rows)

    # Result of earlier fiscal years (opening balances + movement before the fiscal year, income / expense only).
    pl_bf = sum((c.pre_fy_net for c in calcs if c.is_pl), ZERO)
    if pl_bf != ZERO or include_zero:
        rows.append(
            _row(
                "profit_and_loss", None, None, "Profit & Loss A/c", 0, None, pl_bf, ZERO, ZERO,
                Drilldown(kind="profit_and_loss"),
            )
        )

    # Unbalanced stored opening balances: the opposite amount on one line, in the opening and closing columns.
    opening_diff = opening_difference(calcs)
    if opening_diff != ZERO:
        rows.append(
            _row(
                "opening_difference", None, None, OPENING_DIFFERENCE_LABEL, 0, None, -opening_diff, ZERO, ZERO,
                Drilldown(kind="opening_difference"), code=OPENING_DIFFERENCE_CODE,
            )
        )

    # Grand totals from ledger lines (not from netted group rows) so debit == credit is a real check.
    totals = TrialBalanceTotals()
    for net_open, pdr, pcr in [(c.opening_net, c.period_debit, c.period_credit) for c in calcs] + [
        (pl_bf, ZERO, ZERO),
        (-opening_diff, ZERO, ZERO),
    ]:
        od, oc = _split(net_open)
        cd, cc = _split(net_open + pdr - pcr)
        totals.opening_debit += od
        totals.opening_credit += oc
        totals.period_debit += pdr
        totals.period_credit += pcr
        totals.closing_debit += cd
        totals.closing_credit += cc

    diff = totals.closing_debit - totals.closing_credit
    return TrialBalanceResponse(
        report="trial_balance",
        company=company_from(tenant),
        period=fiscal_period(tenant, from_date=from_date, to_date=to_date),
        base_currency=tenant.base_currency or "BDT",
        rows=rows,
        totals=totals,
        warnings=unclassified_warning(
            [(c.group_id, abs(c.closing_net)) for c in shown if c.primary == PRIMARY_UNCLASSIFIED]
        )
        + opening_difference_warning(opening_diff),
        reconciliation=SheetReconciliation(
            balanced=abs(diff) <= BALANCE_TOLERANCE, difference=diff, opening_difference=opening_diff
        ),
        data_as_of=datetime.utcnow(),
    )
