"""Sprint 6: MIS reports — fund flow, ratios, comparative, scenarios.

Run:
    docker compose exec backend pytest tests/test_mis_reports.py -q
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest

from app.common.tenant_feature_keys import MIS_REPORTS_ENABLED, is_mis_reports_enabled
from app.models.finance import AccountGroup, ChartOfAccount
from app.models.tenant import Tenant, TenantType
from app.modules.finance.comparative_statement_service import (
    generate_comparative_balance_sheet,
    generate_comparative_pl,
)
from app.modules.finance.enhanced_cash_flow_service import (
    break_even_analysis,
    cash_runway,
    scenario_analysis,
    sensitivity_analysis,
)
from app.modules.finance.fund_flow_service import generate_fund_flow
from app.modules.finance.mis_coa_helpers import financial_snapshot
from app.modules.finance.ratio_analysis_service import calculate_ratios, ratios_from_snapshot


def test_mis_flag_default_on():
    assert is_mis_reports_enabled(None) is True
    assert is_mis_reports_enabled({}) is True
    assert is_mis_reports_enabled({MIS_REPORTS_ENABLED: False}) is False
    assert is_mis_reports_enabled({MIS_REPORTS_ENABLED: True}) is True


def test_ratios_from_snapshot_has_categories():
    snap = {
        "income": 100000.0,
        "expense": 70000.0,
        "net_profit": 30000.0,
        "gross_profit": 40000.0,
        "assets": 200000.0,
        "liabilities": 80000.0,
        "equity": 120000.0,
        "cash": 20000.0,
        "inventory": 30000.0,
        "ar": 25000.0,
        "ap": 15000.0,
        "fixed_assets": 100000.0,
        "loans": 40000.0,
        "current_assets": 100000.0,
        "current_liabilities": 40000.0,
        "depreciation": 5000.0,
        "interest": 2000.0,
        "cogs": 60000.0,
        "ebit": 32000.0,
    }
    result = ratios_from_snapshot(snap)
    assert len(result["ratios"]) >= 12
    assert "liquidity" in result["by_category"]
    assert "profitability" in result["by_category"]
    cr = next(r for r in result["ratios"] if r["name"] == "current_ratio")
    assert cr["value"] == 2.5
    assert cr["status"] == "good"


async def _seed_coa(db) -> Tenant:
    code = f"MIS{uuid.uuid4().hex[:8].upper()}"
    t = Tenant(
        name=f"MIS {code}",
        company_code=code[:18],
        tenant_type=TenantType.manufacturer,
        is_active=True,
        feature_flags={},
    )
    db.add(t)
    await db.flush()
    for nature, normal, name, bal, flags in [
        ("Asset", "debit", "Cash", Decimal("50000"), {"is_bank_account": True}),
        ("Asset", "debit", "Inventory Stock", Decimal("30000"), {}),
        ("Asset", "debit", "Trade Receivable", Decimal("20000"), {}),
        ("Liability", "credit", "Trade Payable", Decimal("15000"), {}),
        ("Equity", "credit", "Capital", Decimal("60000"), {}),
        ("Income", "credit", "Sales Revenue", Decimal("80000"), {}),
        ("Expense", "debit", "Operating Expense", Decimal("25000"), {}),
    ]:
        slug = uuid.uuid4().hex[:6]
        grp = AccountGroup(
            tenant_id=t.id,
            name=f"{nature}-{slug}",
            code=f"G{slug}"[:12],
            nature=nature,
            system_code=f"MIS_{slug}",
            default_normal_balance=normal,
        )
        db.add(grp)
        await db.flush()
        acct = ChartOfAccount(
            tenant_id=t.id,
            account_number=f"{name[:4]}-{slug}"[:32],
            name=name,
            group_id=grp.id,
            normal_balance=normal,
            opening_balance=bal,
            balance=bal,
            is_active=True,
            is_bank_account=flags.get("is_bank_account", False),
        )
        db.add(acct)
    await db.flush()
    return t


@pytest.mark.asyncio
async def test_fund_flow_and_ratios(db_session_integration):
    db = db_session_integration
    t = await _seed_coa(db)
    today = date.today()
    fund = await generate_fund_flow(db, t.id, from_date=date(today.year, 1, 1), to_date=today)
    assert "sources" in fund and "applications" in fund
    assert "net_change" in fund
    assert fund["total_sources"] >= 0

    ratios = await calculate_ratios(db, t.id, as_of_date=today)
    assert len(ratios["ratios"]) >= 12
    assert ratios["snapshot"]["cash"] > 0


@pytest.mark.asyncio
async def test_comparative_and_scenarios(db_session_integration):
    db = db_session_integration
    t = await _seed_coa(db)
    y = date.today().year
    bs = await generate_comparative_balance_sheet(db, t.id, year1=y - 1, year2=y)
    assert len(bs["rows"]) >= 5
    pl = await generate_comparative_pl(db, t.id, year1=y - 1, year2=y)
    assert pl["statement"] == "profit_and_loss"

    scenarios = await scenario_analysis(db, t.id)
    assert len(scenarios["scenarios"]) == 3
    sens = await sensitivity_analysis(db, t.id, variable="sales", change_percent=-20)
    assert "adjusted" in sens
    be = await break_even_analysis(db, t.id)
    assert "break_even_monthly_revenue" in be
    rw = await cash_runway(db, t.id)
    assert "current_cash" in rw
