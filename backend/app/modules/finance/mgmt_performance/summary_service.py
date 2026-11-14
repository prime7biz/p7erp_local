"""Accounting profit (official, posted GL), cash wrapper and the Overview summary. Read-only."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.common.tenant_feature_keys import is_mfg_integrated_planning_v1_enabled, is_planning_math_v2_enabled
from app.modules.finance.budget_analytics.common import q4
from app.modules.finance.mgmt_performance.access import ViewerScope
from app.modules.finance.mgmt_performance.contribution_service import compute_contribution
from app.modules.finance.mgmt_performance.expense_forecast_service import (
    compute_forecast,
    evaluate_row,
    forecast_payload,
    opex_totals,
)
from app.modules.finance.mgmt_performance.periods import Period
from app.modules.finance.mgmt_performance.targets_service import compute_targets, load_targets, targets_out

CASH_HORIZON_DEFAULT = 90
CASH_HORIZON_MAX = 180
MAX_CASH_ROWS = 500


def _m(v: Decimal | None) -> str | None:
    return format(q4(v), "f") if v is not None else None


def _signed(result: Any) -> Decimal:
    amount = Decimal(str(result.amount))
    return amount if result.kind == "profit" else -amount


async def accounting_profit(db: AsyncSession, tenant: Any, period: Period) -> dict[str, Any]:
    """Same numbers as Finance > Profit & Loss for the same dates (`build_profit_loss`)."""
    from app.modules.finance.statements.profit_loss_service import build_profit_loss

    pl = await build_profit_loss(db, tenant, from_date=period.start, to_date=period.end)
    return {
        "from_date": period.start,
        "to_date": period.end,
        "gross_result": _m(_signed(pl.trading.gross_result)),
        "nett_result": _m(_signed(pl.profit_and_loss.nett_result)),
        "income_expense_movement": _m(Decimal(str(pl.income_expense_movement))),
        "balanced": pl.reconciliation.balanced,
        "value_class": "ACTUAL",
        "source": "FINANCE_PROFIT_AND_LOSS",
    }


async def cash_forecast(db: AsyncSession, tenant: Any, today: date, horizon_days: int) -> dict[str, Any]:
    from app.modules.mfg_intelligence.cash_requirement_service import build_cash_requirement

    data = await build_cash_requirement(
        db, tenant, date_from=today, horizon_days=horizon_days, today=today,
        planning_math_v2=is_planning_math_v2_enabled(tenant.feature_flags),
        integrated_planning=is_mfg_integrated_planning_v1_enabled(tenant.feature_flags),
    )
    data["rows"] = data.get("rows", [])[:MAX_CASH_ROWS]
    return data


async def build_summary(db: AsyncSession, tenant: Any, period: Period, scope: ViewerScope) -> dict[str, Any]:
    forecast = await compute_forecast(db, tenant, period)
    contribution = await compute_contribution(db, tenant, period)
    targets = compute_targets(forecast, contribution, await load_targets(db, tenant.id, period.months))
    profit = await accounting_profit(db, tenant, period)
    totals = opex_totals(forecast)
    counts: dict[str, int] = {}
    for r in forecast.rows.values():
        fig = evaluate_row(forecast, r)
        if fig.budget == fig.actual == fig.committed == fig.forecast == 0:
            continue
        counts[fig.status] = counts.get(fig.status, 0) + 1
    unmapped = sum(1 for v in forecast.unmapped_actual.values() if v != 0)
    if unmapped:
        counts["UNMAPPED"] = unmapped
    reasons = list(dict.fromkeys(forecast.reason_codes + contribution.reason_codes + targets["reason_codes"]))
    return {
        "period": {"kind": period.kind, "label": period.label, "start": period.start, "end": period.end, "today": period.today},
        "base_currency": forecast.base_currency,
        "accounting_profit": profit,
        "fg_contribution": {
            "value": _m(contribution.value),
            "direct_cost": _m(contribution.direct_cost),
            "contribution": _m(contribution.contribution),
            "contribution_pct": _m(contribution.contribution_pct),
            "unallocated_landed_selling": _m(targets["unallocated_landed_selling"]),
            "net_contribution": _m(contribution.contribution - targets["unallocated_landed_selling"]),
            "counted_qty": _m(contribution.counted_qty),
            "orders": len(contribution.orders),
            "unknown_orders": contribution.unknown_orders,
            "value_class": "ESTIMATED",
        },
        "opex": {k: _m(v) for k, v in totals.items()},
        "forecast_result": {
            "so_far": _m(targets["result_so_far"]),
            "with_pipeline": _m(targets["result_with_pipeline"]),
            "value_class": "FORECAST",
        },
        "budget_status_counts": counts,
        "targets": targets_out(targets),
        "reason_codes": reasons,
        "notes": [
            "Accounting profit = posted vouchers only (same as Finance > Profit & Loss).",
            "Finished-goods contribution and the forecast are estimates - not posted - and are never added to the "
            "accounting profit.",
        ],
        "scope": "company" if scope.company else "own_cost_centres",
    }


__all__ = ["accounting_profit", "build_summary", "cash_forecast", "forecast_payload"]
