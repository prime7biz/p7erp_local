"""Budget vs actual: each line counts only its own period, nets by account nature, and FX lines use base_amount.

Run in Docker: docker compose exec backend pytest tests/test_budget_vs_actual_fiscal_year.py -q
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest

from app.models.finance import AccountGroup, Budget, BudgetLine, ChartOfAccount, Voucher, VoucherLine
from app.modules.finance.budget_vs_actual_service import budget_line_period, net_rule
from app.modules.finance.fiscal_year import fiscal_year_bounds_from_label
from tests.benchmark_fixtures import api_client, seed_tenant_admin


def test_fiscal_year_bounds_from_label():
    assert fiscal_year_bounds_from_label("2026", 1) == (date(2026, 1, 1), date(2026, 12, 31))
    assert fiscal_year_bounds_from_label("2025-26", 7) == (date(2025, 7, 1), date(2026, 6, 30))
    assert fiscal_year_bounds_from_label(" 2025 ", 7) == (date(2025, 7, 1), date(2026, 6, 30))
    assert fiscal_year_bounds_from_label("FY-old", 1) is None
    assert fiscal_year_bounds_from_label("", 1) is None


def test_budget_line_period():
    fy = (date(2025, 7, 1), date(2026, 6, 30))
    assert budget_line_period("2025-07", fy, 7) == ("month", date(2025, 7, 1), date(2025, 7, 31))
    assert budget_line_period("2026-02", fy, 7) == ("month", date(2026, 2, 1), date(2026, 2, 28))
    # Quarters follow the financial year that starts in the given year (Q1 = Jul-Sep for a July FY).
    assert budget_line_period("2025-Q1", fy, 7) == ("quarter", date(2025, 7, 1), date(2025, 9, 30))
    assert budget_line_period("2025-Q3", fy, 7) == ("quarter", date(2026, 1, 1), date(2026, 3, 31))
    assert budget_line_period("2026-Q4", (date(2026, 1, 1), date(2026, 12, 31)), 1) == (
        "quarter", date(2026, 10, 1), date(2026, 12, 31),
    )
    # Anything that is not a month / quarter is an annual line.
    assert budget_line_period("2025-26", fy, 7) == ("year", date(2025, 7, 1), date(2026, 6, 30))
    assert budget_line_period("ANNUAL", fy, 7) == ("year", date(2025, 7, 1), date(2026, 6, 30))
    assert budget_line_period("2025-13", fy, 7) == ("year", date(2025, 7, 1), date(2026, 6, 30))
    assert budget_line_period("", None, 1) == ("all", None, None)


def test_net_rule_by_nature():
    assert net_rule("Expense", "debit") == "debit_minus_credit"
    assert net_rule("Asset", "debit") == "debit_minus_credit"
    assert net_rule("Income", "credit") == "credit_minus_debit"
    assert net_rule("Liability", "credit") == "credit_minus_debit"
    assert net_rule("equity", None) == "credit_minus_debit"
    # Unknown group nature falls back to the account's normal balance.
    assert net_rule(None, "credit") == "credit_minus_debit"
    assert net_rule("", "debit") == "debit_minus_credit"


async def _account(db, tenant_id: int, nature: str, normal: str, name: str) -> ChartOfAccount:
    slug = uuid.uuid4().hex[:8]
    grp = AccountGroup(tenant_id=tenant_id, name=f"{nature}-{slug}", code=f"G{slug}"[:12], nature=nature,
                       default_normal_balance=normal, allow_posting=True)
    db.add(grp)
    await db.flush()
    acct = ChartOfAccount(tenant_id=tenant_id, account_number=f"X-{slug}", name=name, group_id=grp.id,
                          normal_balance=normal, balance=Decimal("0"), opening_balance=Decimal("0"), is_active=True)
    db.add(acct)
    await db.flush()
    return acct


async def _expense_account(db, tenant_id: int) -> ChartOfAccount:
    return await _account(db, tenant_id, "Expense", "debit", "Freight")


async def _posted(db, tenant_id: int, account_id: int, vdate: date, amount: str, base: str,
                  entry_type: str = "DEBIT", status: str = "POSTED") -> None:
    v = Voucher(tenant_id=tenant_id, voucher_number=f"JV-{uuid.uuid4().hex[:8]}", voucher_type="JOURNAL",
                voucher_date=vdate, status=status)
    db.add(v)
    await db.flush()
    db.add(VoucherLine(tenant_id=tenant_id, voucher_id=v.id, account_id=account_id, entry_type=entry_type,
                       amount=Decimal(amount), base_amount=Decimal(base)))
    await db.flush()


async def _budget(db, tenant_id: int, fiscal_year: str, lines: list[tuple[int | None, str, str]]) -> Budget:
    budget = Budget(tenant_id=tenant_id, budget_name=f"FY {fiscal_year}", fiscal_year=fiscal_year)
    db.add(budget)
    await db.flush()
    for account_id, period, amount in lines:
        db.add(BudgetLine(tenant_id=tenant_id, budget_id=budget.id, account_id=account_id, period_month=period,
                          amount=Decimal(amount)))
    await db.flush()
    return budget


async def _vs_actual(db, tenant, user, budget) -> dict:
    async with api_client(db, tenant, user) as ac:
        r = await ac.get(f"/api/v1/finance/budgets/{budget.id}/vs-actual")
    assert r.status_code == 200, r.text
    return r.json()


@pytest.mark.asyncio
async def test_annual_line_uses_fiscal_year_and_base_amount(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    tenant.feature_flags = {**(tenant.feature_flags or {}), "fiscal_year_start_month": 7}
    await db.flush()
    acct = await _expense_account(db, tenant.id)

    await _posted(db, tenant.id, acct.id, date(2025, 6, 30), "999", "999")  # previous FY - excluded
    await _posted(db, tenant.id, acct.id, date(2025, 7, 1), "10", "1105")  # USD 10 @ 110.5 - included
    await _posted(db, tenant.id, acct.id, date(2026, 6, 30), "200", "200")  # last day - included
    await _posted(db, tenant.id, acct.id, date(2026, 7, 1), "777", "777")  # next FY - excluded

    budget = await _budget(db, tenant.id, "2025-26", [(acct.id, "2025-26", "1000")])
    body = await _vs_actual(db, tenant, user, budget)
    assert body["period_start"] == "2025-07-01"
    assert body["period_end"] == "2026-06-30"
    row = body["rows"][0]
    assert row["period_type"] == "year"
    assert (row["period_start"], row["period_end"]) == ("2025-07-01", "2026-06-30")
    assert row["actual_amount"] == 1305.0
    assert body["total_actual"] == 1305.0
    assert body["total_variance"] == 305.0


@pytest.mark.asyncio
async def test_monthly_line_counts_only_its_month(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    tenant.feature_flags = {**(tenant.feature_flags or {}), "fiscal_year_start_month": 7}
    await db.flush()
    acct = await _expense_account(db, tenant.id)

    await _posted(db, tenant.id, acct.id, date(2025, 6, 30), "999", "999")  # day before - excluded
    await _posted(db, tenant.id, acct.id, date(2025, 7, 1), "10", "1105")  # first day, FX - included
    await _posted(db, tenant.id, acct.id, date(2025, 7, 31), "45", "45")  # last day - included
    await _posted(db, tenant.id, acct.id, date(2025, 8, 1), "200", "200")  # next month - excluded
    await _posted(db, tenant.id, acct.id, date(2025, 7, 15), "500", "500", status="DRAFT")  # not posted

    budget = await _budget(db, tenant.id, "2025-26", [(acct.id, "2025-07", "1000"), (acct.id, "2025-08", "150")])
    body = await _vs_actual(db, tenant, user, budget)
    july, august = body["rows"]
    assert july["period_type"] == "month"
    assert (july["period_start"], july["period_end"]) == ("2025-07-01", "2025-07-31")
    assert july["actual_amount"] == 1150.0
    assert july["variance"] == 150.0
    assert august["actual_amount"] == 200.0
    assert august["variance"] == 50.0
    assert body["total_actual"] == 1350.0
    assert body["total_budget"] == 1150.0


@pytest.mark.asyncio
async def test_quarterly_line_counts_only_its_quarter(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    tenant.feature_flags = {**(tenant.feature_flags or {}), "fiscal_year_start_month": 7}
    await db.flush()
    acct = await _expense_account(db, tenant.id)

    await _posted(db, tenant.id, acct.id, date(2025, 6, 30), "1", "1")  # before Q1 - excluded
    await _posted(db, tenant.id, acct.id, date(2025, 7, 10), "100", "100")  # Q1 (Jul-Sep)
    await _posted(db, tenant.id, acct.id, date(2025, 9, 30), "50", "50")  # Q1 last day
    await _posted(db, tenant.id, acct.id, date(2025, 10, 1), "7", "7")  # Q2 - excluded

    budget = await _budget(db, tenant.id, "2025-26", [(acct.id, "2025-Q1", "120")])
    body = await _vs_actual(db, tenant, user, budget)
    row = body["rows"][0]
    assert row["period_type"] == "quarter"
    assert (row["period_start"], row["period_end"]) == ("2025-07-01", "2025-09-30")
    assert row["actual_amount"] == 150.0
    assert row["variance"] == 30.0
    assert row["variance_pct"] == 25.0


@pytest.mark.asyncio
async def test_expense_nets_debit_minus_credit(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    acct = await _expense_account(db, tenant.id)

    await _posted(db, tenant.id, acct.id, date(2026, 3, 5), "500", "500", "DEBIT")
    await _posted(db, tenant.id, acct.id, date(2026, 3, 20), "120", "120", "CREDIT")  # reversal / refund

    budget = await _budget(db, tenant.id, "2026", [(acct.id, "2026-03", "400")])
    row = (await _vs_actual(db, tenant, user, budget))["rows"][0]
    assert row["nature"] == "Expense"
    assert row["net_rule"] == "debit_minus_credit"
    assert row["actual_debit"] == 500.0
    assert row["actual_credit"] == 120.0
    assert row["actual_amount"] == 380.0  # not 620 (debits + credits)
    assert row["variance"] == -20.0


@pytest.mark.asyncio
async def test_income_nets_credit_minus_debit(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    sales = await _account(db, tenant.id, "Income", "credit", "Sales")

    await _posted(db, tenant.id, sales.id, date(2026, 4, 2), "1000", "1000", "CREDIT")
    await _posted(db, tenant.id, sales.id, date(2026, 4, 25), "150", "150", "DEBIT")  # sales return
    await _posted(db, tenant.id, sales.id, date(2026, 5, 1), "9000", "9000", "CREDIT")  # next month

    budget = await _budget(db, tenant.id, "2026", [(sales.id, "2026-04", "800")])
    body = await _vs_actual(db, tenant, user, budget)
    row = body["rows"][0]
    assert row["nature"] == "Income"
    assert row["net_rule"] == "credit_minus_debit"
    assert row["actual_amount"] == 850.0
    assert row["variance"] == 50.0
    assert body["total_actual"] == 850.0


@pytest.mark.asyncio
async def test_any_account_line_signs_each_account_by_its_nature(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    rent = await _expense_account(db, tenant.id)
    sales = await _account(db, tenant.id, "Income", "credit", "Sales")

    await _posted(db, tenant.id, rent.id, date(2026, 6, 3), "300", "300", "DEBIT")
    await _posted(db, tenant.id, sales.id, date(2026, 6, 4), "1000", "1000", "CREDIT")

    budget = await _budget(db, tenant.id, "2026", [(None, "2026-06", "0")])
    row = (await _vs_actual(db, tenant, user, budget))["rows"][0]
    assert row["nature"] is None
    assert row["net_rule"] == "per_account"
    assert row["actual_debit"] == 300.0
    assert row["actual_credit"] == 1000.0
    assert row["actual_amount"] == 1300.0  # expense +300 (Dr-Cr) and income +1000 (Cr-Dr)
