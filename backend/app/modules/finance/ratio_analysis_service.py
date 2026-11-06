"""Sprint 6: Ratio analysis with benchmarks and trend helpers."""

from __future__ import annotations

from calendar import monthrange
from datetime import date
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.finance.mis_coa_helpers import (
    _money,
    account_balances_as_of,
    account_balances_for_dates,
    financial_snapshot,
)

# Soft industry-agnostic benchmarks (SME manufacturing defaults)
BENCHMARKS: dict[str, dict[str, float]] = {
    "current_ratio": {"good": 1.5, "warn": 1.0},
    "quick_ratio": {"good": 1.0, "warn": 0.7},
    "cash_ratio": {"good": 0.3, "warn": 0.1},
    "gross_profit_margin": {"good": 0.25, "warn": 0.10},
    "net_profit_margin": {"good": 0.08, "warn": 0.02},
    "roe": {"good": 0.12, "warn": 0.05},
    "roa": {"good": 0.06, "warn": 0.02},
    "inventory_turnover": {"good": 4.0, "warn": 2.0},
    "receivables_turnover": {"good": 6.0, "warn": 3.0},
    "payables_turnover": {"good": 6.0, "warn": 3.0},
    "asset_turnover": {"good": 1.0, "warn": 0.5},
    "debt_to_equity": {"good_max": 1.5, "warn_max": 2.5},  # lower is better
    "interest_coverage": {"good": 3.0, "warn": 1.5},
}


def _safe_div(num: float, den: float) -> float | None:
    if den == 0:
        return None
    return _money(num / den)


def _status(name: str, value: float | None) -> str:
    if value is None:
        return "n/a"
    b = BENCHMARKS.get(name) or {}
    if "good_max" in b:
        if value <= b["good_max"]:
            return "good"
        if value <= b.get("warn_max", b["good_max"] * 2):
            return "warning"
        return "critical"
    good = b.get("good", 0)
    warn = b.get("warn", 0)
    if value >= good:
        return "good"
    if value >= warn:
        return "warning"
    return "critical"


def _ratio_row(name: str, label: str, category: str, value: float | None, formula: str) -> dict[str, Any]:
    b = BENCHMARKS.get(name) or {}
    benchmark = b.get("good", b.get("good_max"))
    return {
        "name": name,
        "label": label,
        "category": category,
        "value": value,
        "benchmark": benchmark,
        "status": _status(name, value),
        "formula": formula,
    }


def ratios_from_snapshot(snap: dict[str, Any], *, prior: dict[str, Any] | None = None) -> dict[str, Any]:
    ca = float(snap["current_assets"])
    cl = float(snap["current_liabilities"])
    inv = float(snap["inventory"])
    cash = float(snap["cash"])
    income = float(snap["income"])
    gp = float(snap["gross_profit"])
    np_ = float(snap["net_profit"])
    equity = float(snap["equity"])
    assets = float(snap["assets"])
    cogs = float(snap["cogs"])
    ar = float(snap["ar"])
    ap = float(snap["ap"])
    debt = float(snap["loans"]) + float(snap["current_liabilities"])
    ebit = float(snap["ebit"])
    interest = float(snap["interest"]) or 0.01

    avg_inv = (inv + float((prior or snap)["inventory"])) / 2
    avg_ar = (ar + float((prior or snap)["ar"])) / 2
    avg_ap = (ap + float((prior or snap)["ap"])) / 2
    purchases = cogs + max(0.0, inv - float((prior or snap)["inventory"]))

    ratios = [
        _ratio_row("current_ratio", "Current Ratio", "liquidity", _safe_div(ca, cl), "CA / CL"),
        _ratio_row("quick_ratio", "Quick Ratio", "liquidity", _safe_div(ca - inv, cl), "(CA - Inventory) / CL"),
        _ratio_row("cash_ratio", "Cash Ratio", "liquidity", _safe_div(cash, cl), "Cash / CL"),
        _ratio_row(
            "gross_profit_margin",
            "Gross Profit Margin",
            "profitability",
            _safe_div(gp, income),
            "Gross Profit / Revenue",
        ),
        _ratio_row(
            "net_profit_margin",
            "Net Profit Margin",
            "profitability",
            _safe_div(np_, income),
            "Net Profit / Revenue",
        ),
        _ratio_row("roe", "Return on Equity", "profitability", _safe_div(np_, equity), "Net Profit / Equity"),
        _ratio_row("roa", "Return on Assets", "profitability", _safe_div(np_, assets), "Net Profit / Assets"),
        _ratio_row(
            "inventory_turnover",
            "Inventory Turnover",
            "efficiency",
            _safe_div(cogs, avg_inv),
            "COGS / Avg Inventory",
        ),
        _ratio_row(
            "receivables_turnover",
            "Receivables Turnover",
            "efficiency",
            _safe_div(income, avg_ar),
            "Revenue / Avg AR",
        ),
        _ratio_row(
            "payables_turnover",
            "Payables Turnover",
            "efficiency",
            _safe_div(purchases, avg_ap),
            "Purchases / Avg AP",
        ),
        _ratio_row("asset_turnover", "Asset Turnover", "efficiency", _safe_div(income, assets), "Revenue / Assets"),
        _ratio_row(
            "debt_to_equity",
            "Debt-to-Equity",
            "leverage",
            _safe_div(debt, equity),
            "Total Debt / Equity",
        ),
        _ratio_row(
            "interest_coverage",
            "Interest Coverage",
            "leverage",
            _safe_div(ebit, interest),
            "EBIT / Interest",
        ),
    ]
    by_cat: dict[str, list] = {}
    for r in ratios:
        by_cat.setdefault(r["category"], []).append(r)
    return {"ratios": ratios, "by_category": by_cat, "snapshot": snap}


async def calculate_ratios(
    db: AsyncSession,
    tenant_id: int,
    *,
    as_of_date: date,
) -> dict[str, Any]:
    rows = await account_balances_as_of(db, tenant_id, as_of_date)
    snap = financial_snapshot(rows)
    # Prior year-end for averages
    prior_date = _prior_year_end(as_of_date)
    prior_rows = await account_balances_as_of(db, tenant_id, prior_date)
    prior = financial_snapshot(prior_rows)
    result = ratios_from_snapshot(snap, prior=prior)
    result["as_of_date"] = as_of_date.isoformat()
    result["prior_date"] = prior_date.isoformat()
    return result


def _prior_year_end(as_of_date: date) -> date:
    """Same prior date ``calculate_ratios`` uses for averages."""
    prior_date = date(as_of_date.year - 1, 12, 31)
    if prior_date >= as_of_date:
        prior_date = date(as_of_date.year, 1, 1)
    return prior_date


async def ratio_trend(
    db: AsyncSession,
    tenant_id: int,
    *,
    ratio_name: str,
    months: int = 6,
    as_of: date | None = None,
) -> dict[str, Any]:
    as_of = as_of or date.today()
    months = max(1, min(months, 24))
    point_dates: list[date] = []
    y, m = as_of.year, as_of.month
    for _ in range(months):
        last_day = monthrange(y, m)[1]
        point_dates.append(date(y, m, min(as_of.day, last_day)))
        m -= 1
        if m == 0:
            m = 12
            y -= 1

    # One grouped ledger query for every point date and its prior year-end.
    all_dates = point_dates + [_prior_year_end(d) for d in point_dates]
    balances = await account_balances_for_dates(db, tenant_id, all_dates)
    snapshots: dict[date, dict[str, Any]] = {}

    def snapshot_for(d: date) -> dict[str, Any]:
        if d not in snapshots:
            snapshots[d] = financial_snapshot(balances[d])
        return snapshots[d]

    points = []
    for d in point_dates:
        calc = ratios_from_snapshot(snapshot_for(d), prior=snapshot_for(_prior_year_end(d)))
        match = next((r for r in calc["ratios"] if r["name"] == ratio_name), None)
        points.append({"date": d.isoformat(), "value": match["value"] if match else None})
    points.reverse()
    return {"ratio_name": ratio_name, "months": months, "points": points}
