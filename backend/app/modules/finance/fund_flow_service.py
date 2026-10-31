"""Sprint 6: Fund Flow Statement (sources & applications of funds)."""

from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.finance.mis_coa_helpers import account_balances_as_of, financial_snapshot, _money


async def generate_fund_flow(
    db: AsyncSession,
    tenant_id: int,
    *,
    from_date: date,
    to_date: date,
) -> dict[str, Any]:
    """Approximate fund flow from CoA snapshots at period start/end (read-only)."""
    start_rows = await account_balances_as_of(db, tenant_id, from_date)
    end_rows = await account_balances_as_of(db, tenant_id, to_date)
    start = financial_snapshot(start_rows)
    end = financial_snapshot(end_rows)

    # Period P&L approximated as change in retained earnings proxy: end net - start net isn't available;
    # use income/expense at end as YTD-style period proxy when openings are sparse.
    net_profit = end["net_profit"]
    depreciation = end["depreciation"]

    increase_liabilities = _money(max(0.0, end["liabilities"] - start["liabilities"]))
    decrease_assets = _money(max(0.0, start["assets"] - end["assets"]))
    decrease_fixed = _money(max(0.0, start["fixed_assets"] - end["fixed_assets"]))

    sources = [
        {"item": "Net Profit", "amount": net_profit},
        {"item": "Depreciation & amortization", "amount": depreciation},
        {"item": "Increase in liabilities (loans/creditors)", "amount": increase_liabilities},
        {"item": "Decrease in assets / sale of fixed assets", "amount": _money(decrease_assets + decrease_fixed)},
    ]
    total_sources = _money(sum(x["amount"] for x in sources))

    increase_fixed = _money(max(0.0, end["fixed_assets"] - start["fixed_assets"]))
    increase_wc_inventory = _money(max(0.0, end["inventory"] - start["inventory"]))
    increase_wc_ar = _money(max(0.0, end["ar"] - start["ar"]))
    decrease_liabilities = _money(max(0.0, start["liabilities"] - end["liabilities"]))
    # Dividend / tax not tracked separately — use heuristics from expense labels if present later
    tax_paid = 0.0
    dividend_paid = 0.0

    applications = [
        {"item": "Dividend paid", "amount": dividend_paid},
        {"item": "Tax paid", "amount": tax_paid},
        {"item": "Increase in fixed assets", "amount": increase_fixed},
        {"item": "Increase in working capital (inventory)", "amount": increase_wc_inventory},
        {"item": "Increase in working capital (debtors)", "amount": increase_wc_ar},
        {"item": "Decrease in liabilities", "amount": decrease_liabilities},
    ]
    total_application = _money(sum(x["amount"] for x in applications))
    net_change = _money(total_sources - total_application)

    def _with_pct(rows: list[dict[str, Any]], total: float) -> list[dict[str, Any]]:
        out = []
        for r in rows:
            pct = _money((r["amount"] / total) * 100) if total else 0.0
            out.append({**r, "percent_of_total": pct})
        return out

    return {
        "from_date": from_date.isoformat(),
        "to_date": to_date.isoformat(),
        "sources": _with_pct(sources, total_sources),
        "total_sources": total_sources,
        "applications": _with_pct(applications, total_application),
        "total_application": total_application,
        "net_change": net_change,
        "opening_snapshot": start,
        "closing_snapshot": end,
    }
