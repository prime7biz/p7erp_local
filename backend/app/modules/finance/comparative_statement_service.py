"""Sprint 6: Comparative Balance Sheet and P&L."""

from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.finance.mis_coa_helpers import account_balances_as_of, financial_snapshot, _money


def _line(particulars: str, y1: float, y2: float) -> dict[str, Any]:
    change = _money(y2 - y1)
    pct = _money((change / abs(y1)) * 100) if y1 else (100.0 if y2 else 0.0)
    return {
        "particulars": particulars,
        "year1": _money(y1),
        "year2": _money(y2),
        "absolute_change": change,
        "percent_change": pct,
        "significant": abs(pct) >= 10.0,
    }


async def generate_comparative_balance_sheet(
    db: AsyncSession,
    tenant_id: int,
    *,
    year1: int,
    year2: int,
) -> dict[str, Any]:
    d1 = date(year1, 12, 31)
    d2 = date(year2, 12, 31)
    s1 = financial_snapshot(await account_balances_as_of(db, tenant_id, d1))
    s2 = financial_snapshot(await account_balances_as_of(db, tenant_id, d2))
    rows = [
        _line("Fixed Assets", s1["fixed_assets"], s2["fixed_assets"]),
        _line("Current Assets", s1["current_assets"], s2["current_assets"]),
        _line("  Inventory", s1["inventory"], s2["inventory"]),
        _line("  Receivables (AR)", s1["ar"], s2["ar"]),
        _line("  Cash & Bank", s1["cash"], s2["cash"]),
        _line("Total Assets", s1["assets"], s2["assets"]),
        _line("Equity", s1["equity"], s2["equity"]),
        _line("Loans / Borrowings", s1["loans"], s2["loans"]),
        _line("Current Liabilities", s1["current_liabilities"], s2["current_liabilities"]),
        _line("  Payables (AP)", s1["ap"], s2["ap"]),
        _line("Total Liabilities", s1["liabilities"], s2["liabilities"]),
    ]
    return {
        "statement": "balance_sheet",
        "year1": year1,
        "year2": year2,
        "as_of_year1": d1.isoformat(),
        "as_of_year2": d2.isoformat(),
        "rows": rows,
        "significant_count": sum(1 for r in rows if r["significant"]),
    }


async def generate_comparative_pl(
    db: AsyncSession,
    tenant_id: int,
    *,
    year1: int,
    year2: int,
) -> dict[str, Any]:
    d1 = date(year1, 12, 31)
    d2 = date(year2, 12, 31)
    s1 = financial_snapshot(await account_balances_as_of(db, tenant_id, d1))
    s2 = financial_snapshot(await account_balances_as_of(db, tenant_id, d2))
    rows = [
        _line("Revenue / Income", s1["income"], s2["income"]),
        _line("COGS (est.)", s1["cogs"], s2["cogs"]),
        _line("Gross Profit", s1["gross_profit"], s2["gross_profit"]),
        _line("Expenses", s1["expense"], s2["expense"]),
        _line("Net Profit", s1["net_profit"], s2["net_profit"]),
    ]
    return {
        "statement": "profit_and_loss",
        "year1": year1,
        "year2": year2,
        "as_of_year1": d1.isoformat(),
        "as_of_year2": d2.isoformat(),
        "rows": rows,
        "significant_count": sum(1 for r in rows if r["significant"]),
    }
