"""Sprint 6: Enhanced cash flow — scenarios, sensitivity, break-even, runway."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.finance import Voucher, VoucherLine
from app.modules.finance.advanced_voucher_service import voucher_in_books_clause
from app.modules.finance.mis_coa_helpers import account_balances_as_of, financial_snapshot, _d, _money


async def _avg_monthly_cashflow(db: AsyncSession, tenant_id: int, *, days: int = 90) -> dict[str, float]:
    end = date.today()
    start = end - timedelta(days=days)
    # Rough proxy: DEBIT lines on RECEIPT vouchers = inflow, CREDIT lines on PAYMENT vouchers = outflow.
    vtype = func.upper(func.coalesce(Voucher.voucher_type, ""))
    side = func.upper(func.coalesce(VoucherLine.entry_type, ""))
    inflow_sum, outflow_sum = (
        await db.execute(
            select(
                func.coalesce(func.sum(VoucherLine.amount).filter(vtype == "RECEIPT", side == "DEBIT"), 0),
                func.coalesce(func.sum(VoucherLine.amount).filter(vtype == "PAYMENT", side == "CREDIT"), 0),
            )
            .join(Voucher, VoucherLine.voucher_id == Voucher.id)
            .where(
                Voucher.tenant_id == tenant_id,
                Voucher.status == "POSTED",
                voucher_in_books_clause(),
                Voucher.voucher_date >= start,
                Voucher.voucher_date <= end,
            )
        )
    ).one()
    inflow = float(_d(inflow_sum))
    outflow = float(_d(outflow_sum))
    months = max(days / 30.0, 1.0)
    return {
        "avg_monthly_inflow": _money(inflow / months),
        "avg_monthly_outflow": _money(outflow / months),
        "net_monthly": _money((inflow - outflow) / months),
    }


async def scenario_analysis(
    db: AsyncSession,
    tenant_id: int,
) -> dict[str, Any]:
    snap = financial_snapshot(await account_balances_as_of(db, tenant_id, date.today()))
    flow = await _avg_monthly_cashflow(db, tenant_id)
    cash = float(snap["cash"])
    base_in = float(flow["avg_monthly_inflow"])
    base_out = float(flow["avg_monthly_outflow"])

    def _scenario(name: str, in_mult: float, out_mult: float) -> dict[str, Any]:
        monthly_in = _money(base_in * in_mult)
        monthly_out = _money(base_out * out_mult)
        net = _money(monthly_in - monthly_out)
        if net >= 0:
            runway = None
            runway_label = "Sustainable / growing"
        else:
            burn = abs(net)
            months = _money(cash / burn) if burn else None
            runway = months
            runway_label = f"{months} months" if months is not None else "n/a"
        return {
            "name": name,
            "monthly_inflow": monthly_in,
            "monthly_outflow": monthly_out,
            "net_monthly": net,
            "ending_cash_12m": _money(cash + net * 12),
            "runway_months": runway,
            "runway_label": runway_label,
        }

    scenarios = [
        _scenario("best_case", 1.15, 0.95),
        _scenario("expected", 1.0, 1.0),
        _scenario("worst_case", 0.8, 1.1),
    ]
    expected = scenarios[1]
    narrative = (
        f"Cash on hand is {cash:.2f}. Expected net monthly cash flow is {expected['net_monthly']:.2f}. "
    )
    if expected["runway_months"] is not None:
        narrative += (
            f"At current burn, cash runs out in about {expected['runway_months']:.1f} months. "
            "Consider accelerating collections or delaying non-critical spend."
        )
    else:
        narrative += "Cash position is stable or improving under the expected scenario."

    return {
        "as_of": date.today().isoformat(),
        "current_cash": cash,
        "baseline": flow,
        "scenarios": scenarios,
        "narrative": narrative,
    }


async def sensitivity_analysis(
    db: AsyncSession,
    tenant_id: int,
    *,
    variable: str = "sales",
    change_percent: float = -20,
) -> dict[str, Any]:
    base = await scenario_analysis(db, tenant_id)
    expected = next(s for s in base["scenarios"] if s["name"] == "expected")
    factor = 1.0 + (change_percent / 100.0)
    monthly_in = float(expected["monthly_inflow"])
    monthly_out = float(expected["monthly_outflow"])
    var = (variable or "sales").lower()
    if var in {"sales", "revenue", "inflow"}:
        monthly_in = _money(monthly_in * factor)
    elif var in {"expenses", "outflow", "costs"}:
        monthly_out = _money(monthly_out * factor)
    elif var in {"payment_delay", "delays"}:
        # Delay reduces near-term inflow
        monthly_in = _money(monthly_in * max(0.5, 1.0 + change_percent / 200.0))
    else:
        monthly_in = _money(monthly_in * factor)

    net = _money(monthly_in - monthly_out)
    cash = float(base["current_cash"])
    runway = _money(cash / abs(net)) if net < 0 else None
    return {
        "variable": variable,
        "change_percent": change_percent,
        "baseline": expected,
        "adjusted": {
            "monthly_inflow": monthly_in,
            "monthly_outflow": monthly_out,
            "net_monthly": net,
            "runway_months": runway,
            "ending_cash_12m": _money(cash + net * 12),
        },
    }


async def break_even_analysis(db: AsyncSession, tenant_id: int) -> dict[str, Any]:
    snap = financial_snapshot(await account_balances_as_of(db, tenant_id, date.today()))
    flow = await _avg_monthly_cashflow(db, tenant_id)
    # Treat average outflow as fixed+variable proxy; contribution margin ~ 40%
    monthly_fixed = float(flow["avg_monthly_outflow"]) * 0.6
    contribution_margin_ratio = 0.4
    if contribution_margin_ratio <= 0:
        required = None
    else:
        required = _money(monthly_fixed / contribution_margin_ratio)
    return {
        "monthly_fixed_costs_est": _money(monthly_fixed),
        "contribution_margin_ratio": contribution_margin_ratio,
        "break_even_monthly_revenue": required,
        "current_monthly_revenue_est": flow["avg_monthly_inflow"],
        "gap": _money((required or 0) - float(flow["avg_monthly_inflow"])) if required else None,
        "snapshot_expense": snap["expense"],
    }


async def cash_runway(db: AsyncSession, tenant_id: int) -> dict[str, Any]:
    base = await scenario_analysis(db, tenant_id)
    expected = next(s for s in base["scenarios"] if s["name"] == "expected")
    return {
        "current_cash": base["current_cash"],
        "net_monthly": expected["net_monthly"],
        "runway_months": expected["runway_months"],
        "runway_label": expected["runway_label"],
        "narrative": base["narrative"],
    }
