"""Finance modernization Phase 0: cost-centre dashboard, ledger-activity and cash-flow defect fixes.

Run in Docker: docker compose exec backend pytest tests/test_finance_report_defects.py -q
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.finance import AccountGroup, ChartOfAccount, CostCenter, Voucher, VoucherLine
from tests.benchmark_fixtures import api_client, seed_tenant_admin
from tests.test_perf_inventory_reports_equivalence import QueryCounter

CC_URL = "/api/v1/finance/cost-centers/dashboard"
LEDGER_URL = "/api/v1/finance/reports/ledger-activity"
CASH_URL = "/api/v1/finance/reports/cash-flow-statement"
TB_URL = "/api/v1/finance/reports/trial-balance"


async def _account(db, tenant_id: int, name: str, nature: str, normal: str, opening: str = "0") -> ChartOfAccount:
    slug = uuid.uuid4().hex[:8]
    grp = AccountGroup(
        tenant_id=tenant_id,
        name=f"G-{slug}",
        code=f"G{slug}"[:12],
        nature=nature,
        default_normal_balance=normal,
        allow_posting=True,
    )
    db.add(grp)
    await db.flush()
    acct = ChartOfAccount(
        tenant_id=tenant_id,
        account_number=f"A-{slug}",
        name=name,
        group_id=grp.id,
        normal_balance=normal,
        balance=Decimal("0"),
        opening_balance=Decimal(opening),
        is_active=True,
    )
    db.add(acct)
    await db.flush()
    return acct


async def _voucher(db, tenant_id, vdate, lines, *, status="POSTED", **flags) -> Voucher:
    """lines: (account, 'DEBIT'|'CREDIT', amount, base_amount, rate, cost_centre|None)."""
    v = Voucher(
        tenant_id=tenant_id,
        voucher_number=f"JV-{uuid.uuid4().hex[:8]}",
        voucher_type=flags.pop("voucher_type", "JOURNAL"),
        voucher_date=vdate,
        status=status,
        **flags,
    )
    db.add(v)
    await db.flush()
    for account, entry, amount, base, rate, cc in lines:
        db.add(
            VoucherLine(
                tenant_id=tenant_id,
                voucher_id=v.id,
                account_id=account.id,
                entry_type=entry,
                amount=Decimal(amount),
                base_amount=Decimal(base),
                exchange_rate=Decimal(rate),
                cost_center_id=cc.id if cc is not None else None,
            )
        )
    await db.flush()
    return v


async def _setup(db):
    tenant, user = await seed_tenant_admin(db)
    cash = await _account(db, tenant.id, "Cash in hand", "Asset", "debit", "1000")
    expense = await _account(db, tenant.id, "Rent expense", "Expense", "debit", "100")
    sales = await _account(db, tenant.id, "Sales", "Income", "credit", "0")
    cc = CostCenter(tenant_id=tenant.id, center_code="CC-X", name="Cutting")
    db.add(cc)
    await db.flush()
    return tenant, user, cash, expense, sales, cc


def _row(body, cc):
    return next(r for r in body if r["cost_center_id"] == cc.id)


# ---------------------------------------------------------------------------
# Cost-centre dashboard
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cost_center_dashboard_counts_only_posted_in_books_base_currency(db_session_integration):
    db = db_session_integration
    tenant, user, cash, expense, _sales, cc = await _setup(db)
    d = date(2026, 3, 10)
    # Counted: POSTED, foreign currency line: amount 10 @ 110 => base 1100.
    await _voucher(db, tenant.id, d, [(expense, "DEBIT", "10", "1100", "110", cc), (cash, "CREDIT", "10", "1100", "110", None)])
    # Counted: plain BDT credit on the cost centre.
    await _voucher(db, tenant.id, d, [(cash, "DEBIT", "40", "40", "1", None), (expense, "CREDIT", "40", "40", "1", cc)])
    # Excluded.
    big = "99999"
    for status in ("DRAFT", "SUBMITTED", "CANCELLED"):
        await _voucher(db, tenant.id, d, [(expense, "DEBIT", big, big, "1", cc), (cash, "CREDIT", big, big, "1", None)], status=status)
    await _voucher(db, tenant.id, d, [(expense, "DEBIT", big, big, "1", cc), (cash, "CREDIT", big, big, "1", None)], is_memorandum=True)
    await _voucher(
        db, tenant.id, d, [(expense, "DEBIT", big, big, "1", cc), (cash, "CREDIT", big, big, "1", None)],
        is_optional=True, include_in_books=False,
    )
    await _voucher(db, tenant.id, d, [(expense, "DEBIT", big, big, "1", cc), (cash, "CREDIT", big, big, "1", None)], is_post_dated=True)

    async with api_client(db, tenant, user) as ac:
        r = await ac.get(CC_URL)
    assert r.status_code == 200, r.text
    row = _row(r.json(), cc)
    assert set(row) == {"cost_center_id", "center_code", "name", "department", "debit_total", "credit_total", "net"}
    assert row["debit_total"] == 1100.0
    assert row["credit_total"] == 40.0
    assert row["net"] == 1060.0


@pytest.mark.asyncio
async def test_cost_center_dashboard_date_filter_and_invalid_range(db_session_integration):
    db = db_session_integration
    tenant, user, cash, expense, _s, cc = await _setup(db)
    for day, amt in ((date(2026, 1, 15), "10"), (date(2026, 2, 15), "20"), (date(2026, 3, 15), "30")):
        await _voucher(db, tenant.id, day, [(expense, "DEBIT", amt, amt, "1", cc), (cash, "CREDIT", amt, amt, "1", None)])
    async with api_client(db, tenant, user) as ac:
        assert _row((await ac.get(CC_URL)).json(), cc)["debit_total"] == 60.0
        r = await ac.get(CC_URL, params={"from_date": "2026-02-01", "to_date": "2026-02-28"})
        assert _row(r.json(), cc)["debit_total"] == 20.0
        r = await ac.get(CC_URL, params={"from_date": "2026-02-01"})
        assert _row(r.json(), cc)["debit_total"] == 50.0
        r = await ac.get(CC_URL, params={"to_date": "2026-01-31"})
        assert _row(r.json(), cc)["debit_total"] == 10.0
        bad = await ac.get(CC_URL, params={"from_date": "2026-03-01", "to_date": "2026-02-01"})
        assert bad.status_code == 422


@pytest.mark.asyncio
async def test_cost_center_dashboard_cross_tenant_isolation(db_session_integration):
    db = db_session_integration
    tenant, user, cash, expense, _s, cc = await _setup(db)
    other, other_user, o_cash, o_expense, _os, o_cc = await _setup(db)  # same centre code "CC-X"
    assert o_cc.center_code == cc.center_code
    d = date(2026, 3, 10)
    await _voucher(db, tenant.id, d, [(expense, "DEBIT", "10", "10", "1", cc), (cash, "CREDIT", "10", "10", "1", None)])
    await _voucher(db, other.id, d, [(o_expense, "DEBIT", "777", "777", "1", o_cc), (o_cash, "CREDIT", "777", "777", "1", None)])
    async with api_client(db, tenant, user) as ac:
        body = (await ac.get(CC_URL)).json()
    assert [r["cost_center_id"] for r in body] == [cc.id]
    assert body[0]["debit_total"] == 10.0


# ---------------------------------------------------------------------------
# Ledger activity
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ledger_activity_opening_prior_movement_base_currency_and_tb_equality(db_session_integration):
    db = db_session_integration
    tenant, user, cash, expense, _s, _cc = await _setup(db)
    tenant.feature_flags = {**(tenant.feature_flags or {}), "fiscal_year_start_month": 7}
    await db.flush()
    # Prior posted movement on the expense account (opening 100): +50 base.
    await _voucher(db, tenant.id, date(2025, 12, 31), [(expense, "DEBIT", "50", "50", "1", None), (cash, "CREDIT", "50", "50", "1", None)])
    # Prior debit in a previous fiscal year too (mid-year boundary): +5
    await _voucher(db, tenant.id, date(2025, 6, 30), [(expense, "DEBIT", "5", "5", "1", None), (cash, "CREDIT", "5", "5", "1", None)])
    # Prior excluded vouchers: ignored.
    for status in ("DRAFT", "SUBMITTED", "CANCELLED"):
        await _voucher(db, tenant.id, date(2025, 12, 1), [(expense, "DEBIT", "999", "999", "1", None), (cash, "CREDIT", "999", "999", "1", None)], status=status)
    await _voucher(db, tenant.id, date(2025, 12, 1), [(expense, "DEBIT", "999", "999", "1", None), (cash, "CREDIT", "999", "999", "1", None)], is_memorandum=True)
    # Period (starts mid fiscal year, 2026-01-01): FX debit 10 @ 110 => 1100 base, then credit 20.
    await _voucher(db, tenant.id, date(2026, 1, 5), [(expense, "DEBIT", "10", "1100", "110", None), (cash, "CREDIT", "10", "1100", "110", None)])
    await _voucher(db, tenant.id, date(2026, 1, 20), [(cash, "DEBIT", "20", "20", "1", None), (expense, "CREDIT", "20", "20", "1", None)])
    # Future (after to_date) and post-dated: ignored.
    await _voucher(db, tenant.id, date(2026, 2, 20), [(expense, "DEBIT", "7", "7", "1", None), (cash, "CREDIT", "7", "7", "1", None)])

    params = {"account_id": expense.id, "from_date": "2026-01-01", "to_date": "2026-01-31"}
    async with api_client(db, tenant, user) as ac:
        with QueryCounter(db) as qc:
            r = await ac.get(LEDGER_URL, params=params)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["opening_balance"] == 155.0  # 100 + 50 + 5
        assert [row["amount"] for row in body["rows"]] == [1100.0, 20.0]  # base currency
        assert [row["running_balance"] for row in body["rows"]] == [1255.0, 1235.0]
        assert body["closing_balance"] == 1235.0
        assert set(body) == {"account_id", "account_number", "account_name", "from_date", "to_date", "opening_balance", "closing_balance", "rows"}
        # Constant number of queries regardless of voucher count (no per-voucher loop).
        assert qc.count <= 6, qc.count

        tb = (await ac.get(TB_URL, params={"as_of_date": "2026-01-31", "account_id": expense.id})).json()
    tb_row = tb["rows"][0]
    assert tb_row["debit"] - tb_row["credit"] == body["closing_balance"]


@pytest.mark.asyncio
async def test_ledger_activity_credit_normal_account_sign(db_session_integration):
    db = db_session_integration
    tenant, user, cash, _e, sales, _cc = await _setup(db)
    await _voucher(db, tenant.id, date(2025, 12, 1), [(cash, "DEBIT", "300", "300", "1", None), (sales, "CREDIT", "300", "300", "1", None)])
    await _voucher(db, tenant.id, date(2026, 1, 3), [(sales, "DEBIT", "50", "50", "1", None), (cash, "CREDIT", "50", "50", "1", None)])
    async with api_client(db, tenant, user) as ac:
        r = await ac.get(LEDGER_URL, params={"account_id": sales.id, "from_date": "2026-01-01", "to_date": "2026-01-31"})
    body = r.json()
    assert body["opening_balance"] == 300.0
    assert body["closing_balance"] == 250.0


@pytest.mark.asyncio
async def test_ledger_activity_cross_tenant_and_denials(db_session_integration):
    db = db_session_integration
    tenant, user, _cash, expense, _s, _cc = await _setup(db)
    other, other_user, _oc, o_expense, _os, _occ = await _setup(db)
    await _voucher(db, other.id, date(2025, 12, 1), [(o_expense, "DEBIT", "500", "500", "1", None), (_oc, "CREDIT", "500", "500", "1", None)])
    async with api_client(db, tenant, user) as ac:
        # Another tenant's account looks like "not found".
        r = await ac.get(LEDGER_URL, params={"account_id": o_expense.id})
        assert r.status_code == 404
        # Own account is unaffected by the other tenant's movement.
        r = await ac.get(LEDGER_URL, params={"account_id": expense.id, "from_date": "2026-01-01", "to_date": "2026-01-31"})
        assert r.json()["opening_balance"] == 100.0
    # User of another tenant against this tenant context is denied.
    async with api_client(db, tenant, other_user) as ac:
        for url, p in ((LEDGER_URL, {"account_id": expense.id}), (CASH_URL, {}), (CC_URL, {})):
            assert (await ac.get(url, params=p)).status_code == 403


@pytest.mark.asyncio
async def test_reports_require_authentication(db_session_integration):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        for url, p in ((LEDGER_URL, {"account_id": 1}), (CASH_URL, {}), (CC_URL, {})):
            r = await ac.get(url, params=p)
            assert r.status_code in (401, 403), (url, r.status_code)


# ---------------------------------------------------------------------------
# Cash-flow statement
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cash_flow_opening_includes_prior_movement_and_closes(db_session_integration):
    db = db_session_integration
    tenant, user, cash, expense, sales, _cc = await _setup(db)  # cash opening 1000
    tenant.feature_flags = {**(tenant.feature_flags or {}), "fiscal_year_start_month": 7}
    await db.flush()
    # Prior posted cash movement: +200 (previous fiscal year) and -30 (this fiscal year, before the period).
    await _voucher(db, tenant.id, date(2025, 5, 1), [(cash, "DEBIT", "200", "200", "1", None), (sales, "CREDIT", "200", "200", "1", None)])
    await _voucher(db, tenant.id, date(2025, 12, 1), [(expense, "DEBIT", "30", "30", "1", None), (cash, "CREDIT", "30", "30", "1", None)])
    # Prior foreign-currency cash receipt: 2 @ 110 => +220 base.
    await _voucher(db, tenant.id, date(2025, 12, 15), [(cash, "DEBIT", "2", "220", "110", None), (sales, "CREDIT", "2", "220", "110", None)])
    # Prior excluded vouchers.
    for status in ("DRAFT", "SUBMITTED", "CANCELLED"):
        await _voucher(db, tenant.id, date(2025, 12, 1), [(cash, "DEBIT", "888", "888", "1", None), (sales, "CREDIT", "888", "888", "1", None)], status=status)
    await _voucher(db, tenant.id, date(2025, 12, 1), [(cash, "DEBIT", "888", "888", "1", None), (sales, "CREDIT", "888", "888", "1", None)], is_post_dated=True)
    # Period (mid fiscal year): +100 receipt, -40 payment. After period: ignored by closing.
    await _voucher(db, tenant.id, date(2026, 1, 10), [(cash, "DEBIT", "100", "100", "1", None), (sales, "CREDIT", "100", "100", "1", None)])
    await _voucher(db, tenant.id, date(2026, 1, 20), [(expense, "DEBIT", "40", "40", "1", None), (cash, "CREDIT", "40", "40", "1", None)])
    await _voucher(db, tenant.id, date(2026, 3, 1), [(cash, "DEBIT", "5", "5", "1", None), (sales, "CREDIT", "5", "5", "1", None)])

    params = {"from_date": "2026-01-01", "to_date": "2026-01-31"}
    async with api_client(db, tenant, user) as ac:
        with QueryCounter(db) as qc:
            r = await ac.get(CASH_URL, params=params)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["opening_cash_balance"] == 1390.0  # 1000 + 200 - 30 + 220
        assert body["totals"]["net_cash_flow"] == 60.0
        assert body["closing_cash_balance"] == body["opening_cash_balance"] + body["totals"]["net_cash_flow"] == 1450.0
        assert set(body) == {"from_date", "to_date", "opening_cash_balance", "closing_cash_balance", "sections", "totals"}
        assert qc.count <= 8, qc.count

        # Period with no vouchers: opening is carried, closing equals opening.
        r2 = await ac.get(CASH_URL, params={"from_date": "2026-06-01", "to_date": "2026-06-30"})
        b2 = r2.json()
        assert b2["opening_cash_balance"] == 1455.0  # includes the 2026-03-01 receipt
        assert b2["closing_cash_balance"] == 1455.0


@pytest.mark.asyncio
async def test_cash_flow_cross_tenant_isolation(db_session_integration):
    db = db_session_integration
    tenant, user, cash, _e, sales, _cc = await _setup(db)
    other, _ou, o_cash, _oe, o_sales, _occ = await _setup(db)
    await _voucher(db, other.id, date(2025, 12, 1), [(o_cash, "DEBIT", "5000", "5000", "1", None), (o_sales, "CREDIT", "5000", "5000", "1", None)])
    async with api_client(db, tenant, user) as ac:
        r = await ac.get(CASH_URL, params={"from_date": "2026-01-01", "to_date": "2026-01-31"})
    assert r.json()["opening_cash_balance"] == 1000.0
