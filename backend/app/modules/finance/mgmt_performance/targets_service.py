"""Break-even, production, marketing and profit targets (02 "Targets"). Pure maths on the forecast + contribution.

    unallocated       = posted DIRECT_LANDED + DIRECT_SELLING ledger cost of the period (deducted once)
    contingency       = sum over months of (opex forecast of the month x that month's contingency %)
    required          = opex forecast + contingency + target profit + unallocated - finished-goods contribution so far
    expected %        = this period's finished-goods contribution %, else the confirmed order book %, else UNKNOWN
    break-even value  = (opex forecast + unallocated) / expected %
    profit-target value = (opex forecast + contingency + target profit + unallocated) / expected %
    remaining production value  = max(0, required) / expected %
    remaining production pieces = max(0, required) / contribution per piece (this period)
    marketing gap value = max(0, required - pipeline contribution) / expected %
    result so far     = contribution - unallocated - opex forecast   (accounting profit is shown beside, never added)
Amounts summed for a quarter / year; percentages recomputed from the sums.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.mgmt_performance import MgmtMonthlyTarget
from app.modules.finance.budget_analytics.common import month_key, q4
from app.modules.finance.mgmt_performance.constants import HUNDRED, LANDED_SELLING, ZERO
from app.modules.finance.mgmt_performance.contribution_service import ContributionResult
from app.modules.finance.mgmt_performance.expense_forecast_service import ForecastResult, opex_totals

UNKNOWN = "UNKNOWN"


@dataclass
class MonthTarget:
    target_profit: Decimal
    contingency_pct: Decimal
    is_set: bool


async def load_targets(db: AsyncSession, tenant_id: int, months: list[date]) -> dict[date, MonthTarget]:
    keys = {month_key(m): m for m in months}
    out = {m: MonthTarget(ZERO, ZERO, False) for m in months}
    for row in (
        await db.execute(
            select(MgmtMonthlyTarget).where(MgmtMonthlyTarget.tenant_id == tenant_id, MgmtMonthlyTarget.period_month.in_(list(keys)))
        )
    ).scalars():
        m = keys[row.period_month]
        out[m] = MonthTarget(Decimal(str(row.target_profit_amount)), Decimal(str(row.contingency_pct)), True)
    return out


def _div_pct(amount: Decimal, pct: Decimal | None) -> Decimal | None:
    if pct is None or pct <= ZERO:
        return None
    return q4(amount * HUNDRED / pct)


def compute_targets(forecast: ForecastResult, contribution: ContributionResult, targets: dict[date, MonthTarget]) -> dict[str, Any]:
    months = forecast.period.months
    opex = opex_totals(forecast)["forecast"]
    per_month_opex = {m: sum((r.months[m].forecast for r in forecast.rows.values() if m in r.months), ZERO) for m in months}
    contingency = q4(sum((per_month_opex[m] * targets[m].contingency_pct / HUNDRED for m in months), ZERO))
    target_profit = q4(sum((targets[m].target_profit for m in months), ZERO))
    unallocated = q4(sum((forecast.direct_posted.get(c, ZERO) for c in LANDED_SELLING), ZERO))
    fg = contribution.contribution
    required = q4(opex + contingency + target_profit + unallocated - fg)

    reasons: list[str] = []
    if contribution.contribution_pct is not None and contribution.contribution_pct > ZERO:
        pct, pct_source = contribution.contribution_pct, "FINISHED_GOODS_THIS_PERIOD"
    elif contribution.order_book_contribution_pct is not None and contribution.order_book_contribution_pct > ZERO:
        pct, pct_source = contribution.order_book_contribution_pct, "CONFIRMED_ORDER_BOOK"
    else:
        pct, pct_source = None, UNKNOWN
        reasons.append("CONTRIBUTION_PCT_UNKNOWN")
    per_piece = contribution.contribution_per_piece if contribution.contribution_per_piece and contribution.contribution_per_piece > ZERO else None
    if per_piece is None:
        reasons.append("CONTRIBUTION_PER_PIECE_UNKNOWN")
    if not any(t.is_set for t in targets.values()):
        reasons.append("TARGET_NOT_SET")

    need = max(ZERO, required)
    marketing_need = max(ZERO, required - contribution.pipeline_contribution)
    if required <= ZERO:
        gap_status = "COVERED"
    elif required <= contribution.pipeline_contribution:
        gap_status = "PIPELINE_COVERS"
    else:
        gap_status = "GAP"
    return {
        "opex_forecast": opex,
        "contingency": contingency,
        "target_profit": target_profit,
        "unallocated_landed_selling": unallocated,
        "fg_contribution": fg,
        "pipeline_contribution": contribution.pipeline_contribution,
        "required_contribution": required,
        "expected_contribution_pct": pct,
        "expected_contribution_pct_source": pct_source,
        "contribution_per_piece": per_piece,
        "break_even_value": _div_pct(opex + unallocated, pct),
        "profit_target_value": _div_pct(opex + contingency + target_profit + unallocated, pct),
        "remaining_production_value": _div_pct(need, pct),
        "remaining_production_pieces": q4(need / per_piece) if per_piece is not None else None,
        "marketing_gap_value": _div_pct(marketing_need, pct),
        "result_so_far": q4(fg - unallocated - opex),
        "result_with_pipeline": q4(fg + contribution.pipeline_contribution - unallocated - opex),
        "gap_status": gap_status,
        "targets_set_months": [month_key(m) for m, t in targets.items() if t.is_set],
        "reason_codes": reasons,
    }


def targets_out(t: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k, v in t.items():
        out[k] = format(q4(v), "f") if isinstance(v, Decimal) else v
    return out
