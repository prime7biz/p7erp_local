"""Budget vs actual: only the budget's financial year counts, and FX lines use base_amount.

Run in Docker: docker compose exec backend pytest tests/test_budget_vs_actual_fiscal_year.py -q
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest

from app.models.finance import AccountGroup, Budget, BudgetLine, ChartOfAccount, Voucher, VoucherLine
from app.modules.finance.fiscal_year import fiscal_year_bounds_from_label
from tests.benchmark_fixtures import api_client, seed_tenant_admin


def test_fiscal_year_bounds_from_label():
    assert fiscal_year_bounds_from_label("2026", 1) == (date(2026, 1, 1), date(2026, 12, 31))
    assert fiscal_year_bounds_from_label("2025-26", 7) == (date(2025, 7, 1), date(2026, 6, 30))
    assert fiscal_year_bounds_from_label(" 2025 ", 7) == (date(2025, 7, 1), date(2026, 6, 30))
    assert fiscal_year_bounds_from_label("FY-old", 1) is None
    assert fiscal_year_bounds_from_label("", 1) is None


async def _expense_account(db, tenant_id: int) -> ChartOfAccount:
    slug = uuid.uuid4().hex[:8]
    grp = AccountGroup(tenant_id=tenant_id, name=f"Exp-{slug}", code=f"E{slug}"[:12], nature="Expense",
                       default_normal_balance="debit", allow_posting=True)
    db.add(grp)
    await db.flush()
    acct = ChartOfAccount(tenant_id=tenant_id, account_number=f"X-{slug}", name="Freight", group_id=grp.id,
                          normal_balance="debit", balance=Decimal("0"), opening_balance=Decimal("0"), is_active=True)
    db.add(acct)
    await db.flush()
    return acct


async def _posted(db, tenant_id: int, account_id: int, vdate: date, amount: str, base: str) -> None:
    v = Voucher(tenant_id=tenant_id, voucher_number=f"JV-{uuid.uuid4().hex[:8]}", voucher_type="JOURNAL",
                voucher_date=vdate, status="POSTED")
    db.add(v)
    await db.flush()
    db.add(VoucherLine(tenant_id=tenant_id, voucher_id=v.id, account_id=account_id, entry_type="DEBIT",
                       amount=Decimal(amount), base_amount=Decimal(base)))
    await db.flush()


@pytest.mark.asyncio
async def test_budget_vs_actual_uses_fiscal_year_and_base_amount(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    tenant.feature_flags = {**(tenant.feature_flags or {}), "fiscal_year_start_month": 7}
    await db.flush()
    acct = await _expense_account(db, tenant.id)

    await _posted(db, tenant.id, acct.id, date(2025, 6, 30), "999", "999")  # previous FY - excluded
    await _posted(db, tenant.id, acct.id, date(2025, 7, 1), "10", "1105")  # USD 10 @ 110.5 - included
    await _posted(db, tenant.id, acct.id, date(2026, 6, 30), "200", "200")  # last day - included
    await _posted(db, tenant.id, acct.id, date(2026, 7, 1), "777", "777")  # next FY - excluded

    budget = Budget(tenant_id=tenant.id, budget_name="FY 2025-26", fiscal_year="2025-26")
    db.add(budget)
    await db.flush()
    db.add(BudgetLine(tenant_id=tenant.id, budget_id=budget.id, account_id=acct.id, period_month="2025-07",
                      amount=Decimal("1000")))
    await db.flush()

    async with api_client(db, tenant, user) as ac:
        r = await ac.get(f"/api/v1/finance/budgets/{budget.id}/vs-actual")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["period_start"] == "2025-07-01"
    assert body["period_end"] == "2026-06-30"
    assert body["rows"][0]["actual_amount"] == 1305.0
    assert body["total_actual"] == 1305.0
    assert body["total_variance"] == 305.0
