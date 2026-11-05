"""Roadmap item 12: per-tenant financial year start + P&L brought forward (no year-end close).

Run: docker compose exec backend pytest tests/test_benchmark_fiscal_year.py -q
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from app.common.tenant_feature_keys import normalize_feature_flags
from app.models.finance import AccountGroup, ChartOfAccount, Voucher, VoucherLine
from app.modules.finance.fiscal_year import fiscal_year_bounds, fiscal_year_label, fiscal_year_of
from app.modules.finance.voucher_controls import allocate_series_voucher_number
from tests.benchmark_fixtures import api_client, seed_tenant_admin


def test_fiscal_year_helpers():
    assert fiscal_year_of(date(2026, 6, 30), 7) == 2025
    assert fiscal_year_of(date(2026, 7, 1), 7) == 2026
    assert fiscal_year_of(date(2026, 3, 1), 1) == 2026
    assert fiscal_year_bounds(date(2026, 9, 15), 7) == (date(2026, 7, 1), date(2027, 6, 30))
    assert fiscal_year_bounds(date(2026, 9, 15), 1) == (date(2026, 1, 1), date(2026, 12, 31))
    assert fiscal_year_label(2026, 7) == "2026-27"
    assert fiscal_year_label(2026, 1) == "2026"


def test_start_month_validated_on_write():
    assert normalize_feature_flags({"fiscal_year_start_month": "7"})["fiscal_year_start_month"] == 7
    for bad in (0, 13, "July", 6.5, True):
        with pytest.raises(ValueError):
            normalize_feature_flags({"fiscal_year_start_month": bad})


async def _post(db, tenant_id: int, num: str, d: date, debit_acct: int, credit_acct: int, amount: str):
    v = Voucher(tenant_id=tenant_id, voucher_number=num, voucher_type="JOURNAL", voucher_date=d, status="POSTED",
                books_applied=True)
    db.add(v)
    await db.flush()
    db.add_all([
        VoucherLine(tenant_id=tenant_id, voucher_id=v.id, account_id=debit_acct, entry_type="DEBIT", amount=Decimal(amount)),
        VoucherLine(tenant_id=tenant_id, voucher_id=v.id, account_id=credit_acct, entry_type="CREDIT", amount=Decimal(amount)),
    ])


async def _seed_books(db, *, start_month: int):
    tenant, user = await seed_tenant_admin(db)
    tenant.feature_flags = {"fiscal_year_start_month": start_month}
    t = tenant.id
    groups = {
        n: AccountGroup(tenant_id=t, name=n, code=f"FY-{n[:3].upper()}", nature=n,
                        default_normal_balance="credit" if n == "Income" else "debit")
        for n in ("Asset", "Income", "Expense")
    }
    db.add_all(groups.values())
    await db.flush()
    cash = ChartOfAccount(tenant_id=t, account_number="FY-1", name="Cash", group_id=groups["Asset"].id, normal_balance="debit")
    sales = ChartOfAccount(tenant_id=t, account_number="FY-4", name="Sales", group_id=groups["Income"].id, normal_balance="credit")
    rent = ChartOfAccount(tenant_id=t, account_number="FY-5", name="Rent", group_id=groups["Expense"].id, normal_balance="debit")
    db.add_all([cash, sales, rent])
    await db.flush()
    await _post(db, t, "FY-V1", date(2026, 3, 1), cash.id, sales.id, "1000")  # earlier financial year
    await _post(db, t, "FY-V2", date(2026, 8, 1), rent.id, cash.id, "300")
    await _post(db, t, "FY-V3", date(2026, 8, 5), cash.id, sales.id, "500")
    await db.commit()
    return tenant, user, cash, sales, rent


@pytest.mark.asyncio
async def test_trial_balance_fy_basis_brings_profit_forward(db_session_integration):
    db = db_session_integration
    tenant, user, cash, sales, rent = await _seed_books(db, start_month=7)
    async with api_client(db, tenant, user) as ac:
        cum = (await ac.get("/api/v1/finance/reports/trial-balance", params={"as_of_date": "2026-09-30"})).json()
        fy = (await ac.get("/api/v1/finance/reports/trial-balance", params={"as_of_date": "2026-09-30", "basis": "fy"})).json()
        fs = (await ac.get("/api/v1/finance/reports/financial-statements", params={"as_of_date": "2026-09-30", "basis": "fy"})).json()

    by_name = lambda data: {r["account_name"]: r for r in data["rows"]}  # noqa: E731
    assert by_name(cum)["Sales"]["credit"] == 1500.0  # default output unchanged
    assert cum["basis"] == "cumulative" and cum["profit_brought_forward"] is None

    rows = by_name(fy)
    assert rows["Sales"]["credit"] == 500.0
    assert rows["Rent"]["debit"] == 300.0
    assert rows["Cash"]["debit"] == 1200.0
    pbf = rows["Profit & Loss brought forward (earlier years)"]
    assert pbf["credit"] == 1000.0 and pbf["account_id"] == 0 and pbf["is_computed"] is True
    assert fy["total_debit"] == fy["total_credit"] == 1500.0
    assert fy["fiscal_year"]["label"] == "2026-27" and fy["fiscal_year"]["start_date"] == "2026-07-01"

    assert fs["profit_and_loss"] == {"income": 500.0, "expense": 300.0, "net_profit": 200.0}
    assert fs["profit_brought_forward"] == 1000.0


@pytest.mark.asyncio
async def test_voucher_numbers_follow_tenant_fiscal_year(db_session_integration):
    db = db_session_integration
    tenant, _user = await seed_tenant_admin(db)
    tenant.feature_flags = {"fiscal_year_start_month": 7}
    await db.flush()
    num, _seq, key, fy = await allocate_series_voucher_number(
        db, tenant_id=tenant.id, voucher_date=date(2026, 3, 15), voucher_type="PAYMENT", branch_code="MAIN"
    )
    assert fy == 2025 and num.startswith("VCH-2025-") and key.startswith("2025:")
