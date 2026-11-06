"""Budget enforcement v2 (tenant flag ``budget_enforcement_v2``, default ON).

Same numbers as Budget vs Actual: base currency, Expense / Asset netted debit - credit, each budget
line's own month / quarter / financial year; only lines this voucher adds spend to warn or block.

Run in Docker: docker compose exec backend pytest tests/test_budget_enforcement_v2.py -q
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest

from app.common.tenant_feature_keys import (
    BUDGET_ENFORCEMENT_MODE,
    BUDGET_ENFORCEMENT_V2,
    is_budget_enforcement_v2_enabled,
)
from app.models.finance import AccountGroup, Budget, BudgetLine, ChartOfAccount, CostCenter, Voucher, VoucherLine
from app.modules.finance.budget_enforcement_service import evaluate_voucher_budget
from tests.benchmark_fixtures import api_client, seed_tenant_admin


async def _account(db, tenant_id: int, nature: str = "Expense", normal: str = "debit") -> ChartOfAccount:
    slug = uuid.uuid4().hex[:8]
    grp = AccountGroup(tenant_id=tenant_id, name=f"{nature}-{slug}", code=f"G{slug}"[:12], nature=nature,
                       default_normal_balance=normal, allow_posting=True)
    db.add(grp)
    await db.flush()
    acct = ChartOfAccount(tenant_id=tenant_id, account_number=f"B-{slug}", name=f"{nature} {slug}", group_id=grp.id,
                          normal_balance=normal, balance=Decimal("0"), opening_balance=Decimal("0"), is_active=True)
    db.add(acct)
    await db.flush()
    return acct


async def _cost_center(db, tenant_id: int) -> CostCenter:
    cc = CostCenter(tenant_id=tenant_id, center_code=f"CC{uuid.uuid4().hex[:6]}", name="Sewing")
    db.add(cc)
    await db.flush()
    return cc


async def _voucher(db, tenant_id: int, vdate: date, lines: list[tuple], status: str = "POSTED") -> tuple[Voucher, list]:
    """lines: (account_id, cost_center_id, entry_type, amount, base_amount)."""
    v = Voucher(tenant_id=tenant_id, voucher_number=f"BV-{uuid.uuid4().hex[:8]}", voucher_type="JOURNAL",
                voucher_date=vdate, status=status)
    db.add(v)
    await db.flush()
    rows = []
    for account_id, cc_id, entry_type, amount, base in lines:
        rate = (Decimal(base) / Decimal(amount)) if Decimal(amount) else Decimal("1")
        row = VoucherLine(tenant_id=tenant_id, voucher_id=v.id, account_id=account_id, cost_center_id=cc_id,
                          entry_type=entry_type, amount=Decimal(amount), base_amount=Decimal(base), exchange_rate=rate)
        db.add(row)
        rows.append(row)
    await db.flush()
    return v, rows


async def _budget(db, tenant_id: int, fiscal_year: str, lines: list[tuple]) -> Budget:
    """lines: (cost_center_id, account_id, period, amount)."""
    budget = Budget(tenant_id=tenant_id, budget_name=f"FY {fiscal_year}", fiscal_year=fiscal_year, status="FINAL")
    db.add(budget)
    await db.flush()
    for cc_id, account_id, period, amount in lines:
        db.add(BudgetLine(tenant_id=tenant_id, budget_id=budget.id, cost_center_id=cc_id, account_id=account_id,
                          period_month=period, amount=Decimal(amount)))
    await db.flush()
    return budget


async def _check(db, tenant, voucher, lines, mode: str = "block", **flags):
    return await evaluate_voucher_budget(
        db,
        tenant_id=tenant.id,
        feature_flags={**(tenant.feature_flags or {}), BUDGET_ENFORCEMENT_MODE: mode, **flags},
        voucher=voucher,
        lines=lines,
    )


async def _setup(db, *, fy_start_month: int | None = None):
    tenant, user = await seed_tenant_admin(db)
    if fy_start_month:
        tenant.feature_flags = {**(tenant.feature_flags or {}), "fiscal_year_start_month": fy_start_month}
    await db.flush()
    return tenant, user, await _account(db, tenant.id), await _cost_center(db, tenant.id)


def test_flag_defaults_on_and_explicit_false_is_legacy():
    assert is_budget_enforcement_v2_enabled(None) is True
    assert is_budget_enforcement_v2_enabled({}) is True
    assert is_budget_enforcement_v2_enabled({BUDGET_ENFORCEMENT_V2: False}) is False


@pytest.mark.asyncio
async def test_base_currency_and_the_line_month_only(db_session_integration):
    db = db_session_integration
    tenant, _user, acct, cc = await _setup(db)
    await _budget(db, tenant.id, "2026", [(cc.id, acct.id, "2026-03", "1000")])
    await _voucher(db, tenant.id, date(2026, 3, 2), [(acct.id, cc.id, "DEBIT", "5", "550")])  # USD 5 @ 110
    await _voucher(db, tenant.id, date(2026, 2, 28), [(acct.id, cc.id, "DEBIT", "9999", "9999")])  # other month
    v, lines = await _voucher(db, tenant.id, date(2026, 3, 20), [(acct.id, cc.id, "DEBIT", "4", "440")], status="APPROVED")

    result = await _check(db, tenant, v, lines, mode="warn")
    assert result.has_budget and result.used_amount == 550.0
    assert result.projected == 990.0 and result.remaining == 10.0
    assert result.status == "near_limit" and result.can_post

    legacy = await _check(db, tenant, v, lines, mode="warn", **{BUDGET_ENFORCEMENT_V2: False})
    assert legacy.projected == 9.0  # voucher currency: USD counted as if it were BDT


@pytest.mark.asyncio
async def test_refunds_net_off_spend(db_session_integration):
    db = db_session_integration
    tenant, _user, acct, cc = await _setup(db)
    await _budget(db, tenant.id, "2026", [(cc.id, acct.id, "2026-04", "1000")])
    await _voucher(db, tenant.id, date(2026, 4, 1), [(acct.id, cc.id, "DEBIT", "900", "900")])
    await _voucher(db, tenant.id, date(2026, 4, 5), [(acct.id, cc.id, "CREDIT", "300", "300")])  # refund
    v, lines = await _voucher(db, tenant.id, date(2026, 4, 9), [(acct.id, cc.id, "DEBIT", "350", "350")], status="APPROVED")

    result = await _check(db, tenant, v, lines)
    assert (result.used_amount, result.projected) == (600.0, 950.0)
    assert result.can_post and not result.over_budget

    legacy = await _check(db, tenant, v, lines, **{BUDGET_ENFORCEMENT_V2: False})
    assert legacy.over_budget and not legacy.can_post  # debits only: 900 + 350


@pytest.mark.asyncio
async def test_quarter_and_financial_year_lines_are_enforced(db_session_integration):
    db = db_session_integration
    tenant, _user, acct, cc = await _setup(db, fy_start_month=7)
    await _budget(db, tenant.id, "2025-26", [(cc.id, acct.id, "2025-Q1", "500")])  # Jul-Sep 2025
    await _voucher(db, tenant.id, date(2025, 8, 10), [(acct.id, cc.id, "DEBIT", "400", "400")])
    await _voucher(db, tenant.id, date(2025, 10, 1), [(acct.id, cc.id, "DEBIT", "800", "800")])  # Q2: not counted
    v, lines = await _voucher(db, tenant.id, date(2025, 9, 30), [(acct.id, cc.id, "DEBIT", "200", "200")], status="APPROVED")

    result = await _check(db, tenant, v, lines)
    assert result.over_budget and not result.can_post
    assert (result.used_amount, result.projected) == (400.0, 600.0)
    assert "2025-Q1 (2025-07-01 to 2025-09-30)" in result.warnings[0]
    legacy = await _check(db, tenant, v, lines, **{BUDGET_ENFORCEMENT_V2: False})
    assert legacy.has_budget is False  # legacy only knew "YYYY-MM" lines

    october, oct_lines = await _voucher(
        db, tenant.id, date(2025, 10, 2), [(acct.id, cc.id, "DEBIT", "200", "200")], status="APPROVED"
    )
    assert (await _check(db, tenant, october, oct_lines)).has_budget is False

    # Annual line of the same budget's financial year.
    acct2 = await _account(db, tenant.id)
    await _budget(db, tenant.id, "2025-26", [(cc.id, acct2.id, "ANNUAL", "1000")])
    await _voucher(db, tenant.id, date(2025, 7, 1), [(acct2.id, cc.id, "DEBIT", "700", "700")])
    await _voucher(db, tenant.id, date(2026, 7, 1), [(acct2.id, cc.id, "DEBIT", "5000", "5000")])  # next FY
    v2, l2 = await _voucher(db, tenant.id, date(2026, 6, 30), [(acct2.id, cc.id, "DEBIT", "301", "301")], status="APPROVED")
    annual = await _check(db, tenant, v2, l2)
    assert annual.projected == 1001.0 and not annual.can_post


@pytest.mark.asyncio
async def test_pending_vouchers_count_and_reversal_voucher_never_blocks(db_session_integration):
    db = db_session_integration
    tenant, _user, acct, cc = await _setup(db)
    await _budget(db, tenant.id, "2026", [(cc.id, acct.id, "2026-05", "1000")])
    await _voucher(db, tenant.id, date(2026, 5, 1), [(acct.id, cc.id, "DEBIT", "500", "500")])
    await _voucher(db, tenant.id, date(2026, 5, 2), [(acct.id, cc.id, "DEBIT", "300", "300")], status="DRAFT")
    await _voucher(db, tenant.id, date(2026, 5, 3), [(acct.id, cc.id, "DEBIT", "999", "999")], status="CANCELLED")
    v, lines = await _voucher(db, tenant.id, date(2026, 5, 4), [(acct.id, cc.id, "DEBIT", "300", "300")], status="APPROVED")
    result = await _check(db, tenant, v, lines)
    assert (result.used_amount, result.pending_amount, result.projected) == (500.0, 300.0, 1100.0)
    assert result.over_budget and not result.can_post

    # Already over budget, but this voucher only reverses spend: it must be allowed.
    await _voucher(db, tenant.id, date(2026, 5, 5), [(acct.id, cc.id, "DEBIT", "900", "900")])
    refund, refund_lines = await _voucher(
        db, tenant.id, date(2026, 5, 6), [(acct.id, cc.id, "CREDIT", "100", "100")], status="APPROVED"
    )
    result = await _check(db, tenant, refund, refund_lines)
    assert result.can_post and not result.over_budget and result.status == "within_budget"
    assert not result.warnings


@pytest.mark.asyncio
async def test_other_cost_center_over_budget_does_not_block(db_session_integration):
    db = db_session_integration
    tenant, _user, acct, cc_a = await _setup(db)
    cc_b = await _cost_center(db, tenant.id)
    await _budget(db, tenant.id, "2026", [(cc_a.id, acct.id, "2026-06", "100"), (cc_b.id, acct.id, "2026-06", "1000")])
    await _voucher(db, tenant.id, date(2026, 6, 1), [(acct.id, cc_a.id, "DEBIT", "500", "500")])  # A is over
    v, lines = await _voucher(db, tenant.id, date(2026, 6, 2), [(acct.id, cc_b.id, "DEBIT", "50", "50")], status="APPROVED")

    result = await _check(db, tenant, v, lines)
    assert result.can_post and not result.over_budget
    assert result.budget_amount == 1000.0  # only cost centre B is measured
    legacy = await _check(db, tenant, v, lines, **{BUDGET_ENFORCEMENT_V2: False})
    assert not legacy.can_post  # legacy blocked B's voucher because A was over


@pytest.mark.asyncio
async def test_income_lines_are_not_enforced_and_any_account_counts_spend_only(db_session_integration):
    db = db_session_integration
    tenant, _user, rent, cc = await _setup(db)
    sales = await _account(db, tenant.id, "Income", "credit")
    await _budget(db, tenant.id, "2026", [(cc.id, sales.id, "2026-07", "100")])
    v, lines = await _voucher(db, tenant.id, date(2026, 7, 3), [(sales.id, cc.id, "CREDIT", "5000", "5000")], status="APPROVED")
    result = await _check(db, tenant, v, lines)
    assert result.can_post and result.has_budget is False

    cc2 = await _cost_center(db, tenant.id)
    await _budget(db, tenant.id, "2026", [(cc2.id, None, "2026-07", "1000")])  # any account
    await _voucher(db, tenant.id, date(2026, 7, 1), [(sales.id, cc2.id, "CREDIT", "8000", "8000")])  # income: ignored
    await _voucher(db, tenant.id, date(2026, 7, 2), [(rent.id, cc2.id, "DEBIT", "800", "800")])
    v2, l2 = await _voucher(
        db, tenant.id, date(2026, 7, 9),
        [(rent.id, cc2.id, "DEBIT", "250", "250"), (sales.id, cc2.id, "CREDIT", "250", "250")],
        status="APPROVED",
    )
    result = await _check(db, tenant, v2, l2)
    assert (result.used_amount, result.projected) == (800.0, 1050.0)
    assert result.over_budget and not result.can_post


@pytest.mark.asyncio
async def test_post_preflight_endpoint_uses_v2(db_session_integration):
    db = db_session_integration
    tenant, user, acct, cc = await _setup(db)
    tenant.feature_flags = {**(tenant.feature_flags or {}), BUDGET_ENFORCEMENT_MODE: "block"}
    await _budget(db, tenant.id, "2026", [(cc.id, acct.id, "2026-08", "1000")])
    await _voucher(db, tenant.id, date(2026, 8, 1), [(acct.id, cc.id, "DEBIT", "10", "1100")])  # USD 10 @ 110
    v, _lines = await _voucher(db, tenant.id, date(2026, 8, 2), [(acct.id, cc.id, "DEBIT", "1", "1")], status="APPROVED")
    await db.commit()
    async with api_client(db, tenant, user) as ac:
        r = await ac.post(f"/api/v1/finance/vouchers/{v.id}/post-preflight")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["can_post"] is False and body["status"] == "exceeded"
    assert body["used_amount"] == 1100.0
