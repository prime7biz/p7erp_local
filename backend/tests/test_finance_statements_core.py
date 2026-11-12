"""Finance statements core (PLAN Phase 2, first half): classification, Trial Balance, Balance Sheet, P&L.

Expected figures are worked out by hand from `tests/finance_statement_fixtures.py::seed_world`, not by calling
the services under test. Hand-worked 2026 figures (fiscal year = calendar year):
  closing: Cash 81,900 Dr, Inventory 48,000, Receivable 41,000 (30,000 + FX 11,000 base), Misc asset 400,
           Payable 20,000 Cr, Capital 100,000 Cr, Sales 41,000 Cr, COGS 12,000, Wages 5,000, Rent 3,000,
           Interest 1,000 Cr, Misc expense 700. 2025 profit carried forward: 30,000 Cr.
  Trading: sales 41,000 - COGS 12,000 - direct wages 5,000 = gross profit 24,000.
  Nett:    24,000 + interest 1,000 - rent 3,000 - unclassified expense 700 = 21,300.
  Balance Sheet: liabilities 100,000 + 20,000 + P&L (30,000 + 21,300) = 171,300 = assets 170,900 + 400.

Run: docker compose exec -T backend pytest tests/test_finance_statements_core.py -q
"""

from __future__ import annotations

import importlib.util
import re
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models.audit import AuditLog
from app.models.finance import AccountGroup, ChartOfAccount
from app.models.inventory import StockGroup
from app.modules.finance.statements import constants as K
from app.modules.finance.statements.classification_service import (
    descendants_inheriting_from,
    load_group_classification,
)
from app.modules.finance.statements.balance_sheet_service import build_balance_sheet
from app.modules.finance.statements.profit_loss_service import (
    MemoStock,
    build_profit_loss,
    periodic_stock_adjustment,
)
from app.modules.finance.statements.trial_balance_service import build_trial_balance
from app.modules.finance.system_coa_seeding_service import seed_tenant_system_coa
from app.modules.finance.system_coa_templates import (
    SYSTEM_ACCOUNT_GROUPS,
    SYSTEM_GROUP_STATEMENT_CLASS,
    SYSTEM_GROUP_STATEMENT_CLASS_STANDARD,
)
from tests.benchmark_fixtures import api_client
from tests.finance_statement_fixtures import D, make_group, make_ledger, post, seed_noise_tenant, seed_world
from tests.test_perf_inventory_reports_equivalence import QueryCounter

API = "/api/v1/finance/statements"
TB_2026 = {"from_date": "2026-01-01", "to_date": "2026-12-31"}
MONEY_RE = re.compile(r"^-?\d+\.\d{4}$")

CLOSING_NET = {  # debit minus credit at 2026-12-31
    "Cash in Hand": D("81900"),
    "Inventory": D("48000"),
    "Trade Receivable": D("41000"),
    "Misc Asset A/c": D("400"),
    "Trade Payable": D("-20000"),
    "Paid Up Capital": D("-100000"),
    "Sales": D("-41000"),
    "COGS": D("12000"),
    "Wages": D("5000"),
    "Rent": D("3000"),
    "Interest Income": D("-1000"),
    "Misc Expense A/c": D("700"),
}


def _net(row: dict, prefix: str) -> Decimal:
    return D(row[f"{prefix}_debit"]) - D(row[f"{prefix}_credit"])


async def _get(ac, path: str, **params):
    return await ac.get(f"{API}/{path}", params=params)


def _find(nodes: list[dict], name: str) -> dict | None:
    for n in nodes:
        if n["name"] == name:
            return n
        hit = _find(n.get("children", []), name)
        if hit:
            return hit
    return None


# ---- Trial Balance -------------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_trial_balance_balances_and_reconciles(db_session_integration):
    db = db_session_integration
    await seed_noise_tenant(db)  # other tenant's postings must never show up
    tenant, user, _w = await seed_world(db)
    async with api_client(db, tenant, user) as ac:
        r = await _get(ac, "trial-balance", **TB_2026)
    assert r.status_code == 200, r.text
    body = r.json()
    totals = body["totals"]
    assert D(totals["closing_debit"]) == D(totals["closing_credit"]) == D("192000")
    assert D(totals["opening_debit"]) == D(totals["opening_credit"]) == D("130000")
    assert body["reconciliation"] == {"balanced": True, "difference": "0.0000"}
    assert body["base_currency"] == "BDT" and body["company"]["name"] == tenant.name
    for value in totals.values():
        assert MONEY_RE.match(value), value

    ledgers = {r_["name"]: r_ for r_ in body["rows"] if r_["row_type"] == "ledger"}
    assert set(ledgers) == set(CLOSING_NET)
    for name, row in ledgers.items():
        assert MONEY_RE.match(row["closing_debit"])
        # opening + period = closing, per ledger
        assert _net(row, "opening") + D(row["period_debit"]) - D(row["period_credit"]) == _net(row, "closing"), name
        assert _net(row, "closing") == CLOSING_NET[name], name

    pnl = next(r_ for r_ in body["rows"] if r_["row_type"] == "profit_and_loss")
    assert D(pnl["opening_credit"]) == D("30000") == D(pnl["closing_credit"])


@pytest.mark.asyncio
async def test_trial_balance_group_rows_equal_sum_of_children(db_session_integration):
    db = db_session_integration
    tenant, user, w = await seed_world(db)
    async with api_client(db, tenant, user) as ac:
        body = (await _get(ac, "trial-balance", **TB_2026)).json()
    rows = body["rows"]
    group_rows = [r for r in rows if r["row_type"] == "group"]
    assert group_rows
    for g in group_rows:
        kids = [r for r in rows if r["parent_id"] == g["id"] and r["row_type"] in ("group", "ledger")]
        for prefix in ("opening", "closing"):
            assert _net(g, prefix) == sum((_net(k, prefix) for k in kids), D(0)), (g["name"], prefix)
        assert D(g["period_debit"]) == sum((D(k["period_debit"]) for k in kids), D(0)), g["name"]
        assert D(g["period_credit"]) == sum((D(k["period_credit"]) for k in kids), D(0)), g["name"]
    # a primary group equals the sum of its top-level rows
    primaries = [i for i, r in enumerate(rows) if r["row_type"] == "primary"]
    for pos, idx in enumerate(primaries):
        end = primaries[pos + 1] if pos + 1 < len(primaries) else len(rows)
        top = [r for r in rows[idx + 1:end] if r["depth"] == 1 and r["row_type"] == "group"]
        assert _net(rows[idx], "closing") == sum((_net(t, "closing") for t in top), D(0)), rows[idx]["name"]
    # Debtors has no class of its own: it inherits Current Assets and nests under that group
    debtors = next(r for r in rows if r["name"] == "Debtors")
    assert debtors["statement_class"] == "CURRENT_ASSETS" and debtors["parent_id"] == w["groups"]["ca"].id


@pytest.mark.asyncio
async def test_trial_balance_unclassified_never_guessed_and_include_zero(db_session_integration):
    db = db_session_integration
    tenant, user, w = await seed_world(db)
    zero = await make_ledger(db, tenant.id, w["groups"]["iexp"], "Never Used")
    async with api_client(db, tenant, user) as ac:
        body = (await _get(ac, "trial-balance", **TB_2026)).json()
        with_zero = (await _get(ac, "trial-balance", include_zero="true", **TB_2026)).json()
    rows = body["rows"]
    idx = next(i for i, r in enumerate(rows) if r["row_type"] == "primary" and r["name"] == "Unclassified")
    tail = [r["name"] for r in rows[idx + 1:] if r["row_type"] != "profit_and_loss"]
    assert tail == ["Misc Asset", "Misc Asset A/c", "Misc Expense", "Misc Expense A/c"]
    assert body["warnings"] == [{"code": "UNCLASSIFIED_GROUPS", "count": 2, "amount": "1100.0000"}]
    assert zero.name not in {r["name"] for r in rows}
    assert zero.name in {r["name"] for r in with_zero["rows"]}


# ---- Balance Sheet -------------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_balance_sheet_balances_with_current_period_result(db_session_integration):
    db = db_session_integration
    await seed_noise_tenant(db)
    tenant, user, _w = await seed_world(db)
    async with api_client(db, tenant, user) as ac:
        r = await _get(ac, "balance-sheet", as_of_date="2026-12-31")
    assert r.status_code == 200, r.text
    bs = r.json()
    assert D(bs["totals"]["liabilities"]) == D(bs["totals"]["assets"]) == D("171300")
    assert bs["totals"]["difference"] == "0.0000" and bs["reconciliation"]["balanced"] is True
    assert bs["profit_and_loss"] == {"opening": "30000.0000", "current_period": "21300.0000",
                                     "amount": "51300.0000", "side": "liabilities"}
    # stock = GL inventory ledger (STOCK_IN_HAND), under Current Assets
    assert D(_find(bs["assets"], "Inventory")["inner_amount"]) == D("48000")
    assert D(_find(bs["assets"], "Current Assets")["outer_amount"]) == D("81900") + D("48000") + D("41000")
    assert D(_find(bs["liabilities"], "Capital Account")["outer_amount"]) == D("100000")
    assert D(_find(bs["liabilities"], "Current Liabilities")["outer_amount"]) == D("20000")
    # unclassified asset is shown (not guessed into Current Assets) and warned about
    assert D(_find(bs["assets"], "Unclassified")["outer_amount"]) == D("400")
    assert bs["warnings"][0]["code"] == "UNCLASSIFIED_GROUPS" and bs["warnings"][0]["count"] == 2


@pytest.mark.asyncio
async def test_balance_sheet_accumulated_loss_goes_to_assets(db_session_integration):
    db = db_session_integration
    tenant, user, w = await seed_world(db)
    lg = w["ledgers"]
    await post(db, tenant.id, date(2026, 10, 1), [(lg["rent"], "DEBIT", "200000"), (lg["cash"], "CREDIT", "200000")])
    async with api_client(db, tenant, user) as ac:
        bs = (await _get(ac, "balance-sheet", as_of_date="2026-12-31")).json()
    assert bs["profit_and_loss"]["side"] == "assets"
    assert bs["profit_and_loss"]["amount"] == "148700.0000"  # 51,300 - 200,000
    assert bs["totals"]["difference"] == "0.0000"
    assert D(bs["totals"]["liabilities"]) == D(bs["totals"]["assets"])


# ---- Profit & Loss -------------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_profit_loss_gl_only_with_cogs_once(db_session_integration):
    db = db_session_integration
    await seed_noise_tenant(db)
    tenant, user, _w = await seed_world(db)
    async with api_client(db, tenant, user) as ac:
        r = await _get(ac, "profit-loss", **TB_2026)
    assert r.status_code == 200, r.text
    pl = r.json()
    t, p = pl["trading"], pl["profit_and_loss"]
    assert t["gross_result"] == {"kind": "profit", "amount": "24000.0000"}
    assert p["nett_result"] == {"kind": "profit", "amount": "21300.0000"}
    assert D(t["debit_total"]) == D(t["credit_total"]) == D("41000")
    assert D(p["debit_total"]) == D(p["credit_total"]) == D("25000")
    # nett result == income/expense movement (classified + disclosed unclassified), COGS counted once
    assert D(pl["income_expense_movement"]) == D("21300")
    cogs_nodes = [n for n in t["debit_rows"] if n["name"] == "Cost of Goods Sold"]
    assert len(cogs_nodes) == 1 and D(cogs_nodes[0]["outer_amount"]) == D("12000")
    assert D(_find(t["debit_rows"], "Direct Expenses")["outer_amount"]) == D("5000")
    assert D(_find(t["credit_rows"], "Sales Accounts")["outer_amount"]) == D("41000")
    assert D(_find(p["debit_rows"], "Unclassified Expenses")["outer_amount"]) == D("700")
    assert D(_find(p["credit_rows"], "Indirect Incomes")["outer_amount"]) == D("1000")
    # memo stock is not computed by the endpoint and is never part of the result
    assert t["memo_stock_status"] == "NOT_COMPUTED" and t["opening_stock"]["raw_material"] is None
    assert pl["reconciliation"]["balanced"] is True


@pytest.mark.asyncio
async def test_memo_stock_never_enters_gross_result_and_periodic_reconciles(db_session_integration):
    db = db_session_integration
    tenant, _user, _w = await seed_world(db)
    plain = await build_profit_loss(db, tenant, from_date=date(2026, 1, 1), to_date=date(2026, 12, 31))
    memo = MemoStock(
        opening={"raw_material": D("25000"), "finished_goods": D("15000")},
        closing={"raw_material": D("30000"), "finished_goods": D("18000")},
    )
    with_memo = await build_profit_loss(
        db, tenant, from_date=date(2026, 1, 1), to_date=date(2026, 12, 31), memo_stock=memo
    )
    assert with_memo.trading.gross_result == plain.trading.gross_result
    assert with_memo.trading.debit_total == plain.trading.debit_total
    assert with_memo.profit_and_loss.nett_result == plain.profit_and_loss.nett_result
    assert with_memo.trading.memo_stock_status == "FIFO_MEMO"
    adj = with_memo.stock_adjustment
    # periodic = 41,000 + 48,000 - 40,000 - 0 purchases - 5,000 direct = 44,000 ; GL gross = 24,000
    assert adj.gl_gross_result == D("24000") and adj.periodic_gross_result == D("44000")
    assert adj.stock_adjustment == D("20000") == D("48000") - D("40000") + D("12000")  # CS - OS + COGS
    assert adj.periodic_gross_result == adj.gl_gross_result + adj.stock_adjustment


def test_periodic_comparison_zero_when_gl_cogs_consumes_stock_exactly():
    # perpetual: capitalised purchases 500 flow through stock; OS 100, CS 150 -> COGS 450.
    # Periodic books expense those purchases (500): its gross equals GL gross when purchases are passed as 0 GL
    # purchases and the periodic world replaces COGS by OS + P - CS = 450.
    adj = periodic_stock_adjustment(
        gl_gross=D("1000") - D("450"),
        sales_and_direct_income=D("1000"),
        purchases=D("0"),
        direct_expenses=D("0"),
        opening_stock=D("100"),
        closing_stock=D("150"),
    )
    assert adj.periodic_gross_result == D("1050")
    assert adj.stock_adjustment == D("500")  # exactly the capitalised purchases, disclosed
    assert adj.periodic_gross_result == adj.gl_gross_result + adj.stock_adjustment


# ---- Fiscal years --------------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_synthetic_pl_brought_forward_equals_balance_sheet_opening_january(db_session_integration):
    db = db_session_integration
    tenant, user, _w = await seed_world(db)
    async with api_client(db, tenant, user) as ac:
        tb = (await _get(ac, "trial-balance", **TB_2026)).json()
        bs = (await _get(ac, "balance-sheet", as_of_date="2026-12-31")).json()
        fy = (await _get(ac, "trial-balance", fiscal_year=2025)).json()
    pnl = next(r for r in tb["rows"] if r["row_type"] == "profit_and_loss")
    assert D(pnl["opening_credit"]) == D(bs["profit_and_loss"]["opening"]) == D("30000")
    assert fy["period"]["from_date"] == "2025-01-01" and fy["period"]["to_date"] == "2025-12-31"
    assert fy["period"]["fiscal_year"] == "2025"
    assert D(fy["totals"]["closing_debit"]) == D(fy["totals"]["closing_credit"])


@pytest.mark.asyncio
async def test_july_fiscal_year_boundaries_and_brought_forward(db_session_integration):
    db = db_session_integration
    tenant, user, _w = await seed_world(db, flags={"fiscal_year_start_month": 7})
    async with api_client(db, tenant, user) as ac:
        tb = (await _get(ac, "trial-balance", from_date="2026-07-01", to_date="2026-12-31")).json()
        bs = (await _get(ac, "balance-sheet", as_of_date="2026-12-31")).json()
        fy = (await _get(ac, "profit-loss", fiscal_year=2025)).json()
    # everything before 2026-07-01 closes into the brought-forward line:
    # sales 50,000 + 30,000 + interest 1,000 - wages 25,000 - COGS 12,000 - rent 3,000 - misc 700 = 40,300
    pnl = next(r for r in tb["rows"] if r["row_type"] == "profit_and_loss")
    assert D(pnl["opening_credit"]) == D("40300")
    assert tb["period"]["fiscal_year"] == "2026-27"
    assert D(bs["profit_and_loss"]["opening"]) == D("40300")
    assert D(bs["profit_and_loss"]["current_period"]) == D("11000")  # the FX sale in July 2026
    assert bs["totals"]["difference"] == "0.0000"
    assert fy["period"]["from_date"] == "2025-07-01" and fy["period"]["to_date"] == "2026-06-30"
    assert D(tb["totals"]["closing_debit"]) == D(tb["totals"]["closing_credit"])


# ---- Classification ------------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_inheritance_override_and_cycle_guard(db_session_integration):
    db = db_session_integration
    tenant, _user, w = await seed_world(db)
    t, g = tenant.id, w["groups"]
    # override: a child with its own class lands in a different primary group
    fixed = await make_group(db, t, "Plant", "Asset", "FIXED_ASSETS", g["ca"])
    await make_ledger(db, t, fixed, "Machine", "5000")
    # self-parent and A -> B -> A loops (no database protection exists)
    selfish = await make_group(db, t, "Selfish", "Asset", None)
    selfish.parent_group_id = selfish.id
    a = await make_group(db, t, "Loop A", "Asset", "INVESTMENTS")
    b = await make_group(db, t, "Loop B", "Asset", None, a)
    a.parent_group_id = b.id
    await db.flush()
    await make_ledger(db, t, selfish, "Selfish ledger", "10")
    await make_ledger(db, t, b, "Loop ledger", "20")

    groups = await load_group_classification(db, t)
    assert groups[g["debtors"].id].effective_class == "CURRENT_ASSETS"
    assert groups[g["debtors"].id].source_group_id == g["ca"].id
    assert groups[fixed.id].effective_class == "FIXED_ASSETS"
    assert groups[selfish.id].effective_class is None
    assert groups[b.id].effective_class == "INVESTMENTS" and groups[b.id].source_group_id == a.id
    assert set(descendants_inheriting_from(groups, a.id)) == {a.id, b.id}  # terminates despite the loop

    async with api_client(db, tenant, user=_user) as ac:
        body = (await _get(ac, "trial-balance", **TB_2026)).json()
        bs = (await _get(ac, "balance-sheet", as_of_date="2026-12-31")).json()
    rows = body["rows"]
    plant = next(r for r in rows if r["name"] == "Plant")
    assert plant["parent_id"] is None and plant["depth"] == 1  # top level inside Fixed Assets, not under Current Assets
    primary_names = [r["name"] for r in rows if r["row_type"] == "primary"]
    assert primary_names.index("Fixed Assets") < primary_names.index("Investments") < primary_names.index("Current Assets")
    assert sum(1 for r in rows if r["name"] == "Loop A") == 1 and sum(1 for r in rows if r["name"] == "Loop B") == 1
    assert sum(1 for r in rows if r["name"] == "Selfish") == 1
    # the three new ledgers carry opening balances (5,000 + 10 + 20) with no offsetting entry: the report shows
    # that difference instead of hiding it
    assert D(body["reconciliation"]["difference"]) == D("5030") and body["reconciliation"]["balanced"] is False
    assert D(_find(bs["assets"], "Fixed Assets")["outer_amount"]) == D("5000")


@pytest.mark.asyncio
async def test_classification_setup_preview_update_and_audit(db_session_integration):
    db = db_session_integration
    other, _ou, ow = await seed_world(db)
    tenant, user, w = await seed_world(db)
    g = w["groups"]
    async with api_client(db, tenant, user) as ac:
        base = "/api/v1/finance/account-groups"
        r = await ac.get(f"{base}/{g['ca'].id}/statement-class", params={"proposed": "FIXED_ASSETS"})
        assert r.status_code == 200, r.text
        state = r.json()
        # Current Assets + its three child groups; the two children with their own class do not inherit
        assert state["statement_class"] == "CURRENT_ASSETS" and state["affected_group_count"] == 2
        assert {x["name"] for x in state["affected_groups"]} == {"Current Assets", "Debtors"}
        assert state["affected_ledger_count"] == 1 and state["proposed_class"] == "FIXED_ASSETS"
        assert "COGS" in state["allowed_classes"]

        r = await ac.put(f"{base}/{g['misc_asset'].id}/statement-class", json={"statement_class": "CURRENT_ASSETS"})
        assert r.status_code == 200 and r.json()["effective_class"] == "CURRENT_ASSETS"
        logs = (await db.execute(select(AuditLog).where(
            AuditLog.tenant_id == tenant.id, AuditLog.action == "finance.account_group.statement_class.update"
        ))).scalars().all()
        assert len(logs) == 1 and logs[0].resource == f"account_group:{g['misc_asset'].id}"
        assert '"to": "CURRENT_ASSETS"' in logs[0].details and logs[0].user_id == user.id
        # same value again changes nothing and writes no second audit row
        await ac.put(f"{base}/{g['misc_asset'].id}/statement-class", json={"statement_class": "CURRENT_ASSETS"})
        count = (await db.execute(select(AuditLog).where(
            AuditLog.tenant_id == tenant.id, AuditLog.action == "finance.account_group.statement_class.update"
        ))).scalars().all()
        assert len(count) == 1
        # clearing returns to Unclassified
        r = await ac.put(f"{base}/{g['misc_asset'].id}/statement-class", json={"statement_class": None})
        assert r.json()["effective_class"] is None

        # validation (422): not on the allowlist, wrong case, unknown field, bad preview value
        for bad in ("NOT_A_CLASS", "cogs", ""):
            assert (await ac.put(f"{base}/{g['ca'].id}/statement-class", json={"statement_class": bad})).status_code == 422
        assert (await ac.put(f"{base}/{g['ca'].id}/statement-class", json={"x": 1})).status_code == 422
        assert (await ac.get(f"{base}/{g['ca'].id}/statement-class", params={"proposed": "NOPE"})).status_code == 422

        # another tenant's group looks missing, and is not changed
        foreign = ow["groups"]["ca"]
        assert (await ac.get(f"{base}/{foreign.id}/statement-class")).status_code == 404
        r = await ac.put(f"{base}/{foreign.id}/statement-class", json={"statement_class": "FIXED_ASSETS"})
        assert r.status_code == 404
    await db.refresh(foreign)
    assert foreign.statement_class == "CURRENT_ASSETS" and other.id != tenant.id


@pytest.mark.asyncio
async def test_classification_write_requires_manager_or_admin(db_session_integration):
    db = db_session_integration
    tenant, user, w = await seed_world(
        db, role_name="accountant", permissions={"finance.access": True},
        flags={"rbac_enforcement": "off"},
    )
    gid = w["groups"]["misc_asset"].id
    base = "/api/v1/finance/account-groups"
    async with api_client(db, tenant, user) as ac:
        assert (await ac.get(f"{base}/{gid}/statement-class")).status_code == 200  # reading is fine
        r = await ac.put(f"{base}/{gid}/statement-class", json={"statement_class": "CURRENT_ASSETS"})
        assert r.status_code == 403
        # the generic create / update only accept the field for manager / admin too
        payload = {"name": "New G", "nature": "Asset", "statement_class": "CURRENT_ASSETS"}
        assert (await ac.post(base, json=payload)).status_code == 403
        assert (await ac.patch(f"{base}/{gid}", json={**_group_patch(w["groups"]["misc_asset"]),
                                                       "statement_class": "CURRENT_ASSETS"})).status_code == 403
    await db.refresh(w["groups"]["misc_asset"])
    assert w["groups"]["misc_asset"].statement_class is None


def _group_patch(group: AccountGroup) -> dict:
    return {"name": group.name, "nature": group.nature, "parent_group_id": group.parent_group_id}


@pytest.mark.asyncio
async def test_existing_group_create_and_update_accept_optional_class(db_session_integration):
    db = db_session_integration
    tenant, user, w = await seed_world(db)
    base = "/api/v1/finance/account-groups"
    ca = w["groups"]["ca"]
    async with api_client(db, tenant, user) as ac:
        r = await ac.post(base, json={"name": "Brand New", "nature": "Asset", "statement_class": "FIXED_ASSETS"})
        assert r.status_code == 200, r.text
        assert r.json()["statement_class"] == "FIXED_ASSETS"
        assert (await ac.post(base, json={"name": "Bad", "nature": "Asset", "statement_class": "BAD"})).status_code == 422
        # an old client PATCH without the field keeps the class
        r = await ac.patch(f"{base}/{ca.id}", json={"name": "Current Assets (renamed)", "nature": "Asset"})
        assert r.status_code == 200 and r.json()["statement_class"] == "CURRENT_ASSETS"
        # an explicit value changes it and is audited
        r = await ac.patch(f"{base}/{ca.id}", json={"name": "Current Assets (renamed)", "nature": "Asset",
                                                     "statement_class": "INVESTMENTS"})
        assert r.status_code == 200 and r.json()["statement_class"] == "INVESTMENTS"
    actions = (await db.execute(select(AuditLog.action).where(AuditLog.tenant_id == tenant.id))).scalars().all()
    assert actions.count("finance.account_group.statement_class.update") == 2  # create + change


@pytest.mark.asyncio
async def test_stock_nature_setup(db_session_integration):
    db = db_session_integration
    tenant, user, _w = await seed_world(db)
    other, _ou, _ow = await seed_world(db)
    parent = StockGroup(tenant_id=tenant.id, group_code="P1", name="Fabric")
    db.add(parent)
    await db.flush()
    child = StockGroup(tenant_id=tenant.id, group_code="C1", name="Woven", parent_id=parent.id)
    selfish = StockGroup(tenant_id=tenant.id, group_code="S1", name="Selfish")
    foreign = StockGroup(tenant_id=other.id, group_code="F1", name="Foreign")
    db.add_all([child, selfish, foreign])
    await db.flush()
    selfish.parent_id = selfish.id
    await db.flush()
    base = "/api/v1/finance/stock-groups"
    async with api_client(db, tenant, user) as ac:
        r = await ac.put(f"{base}/{parent.id}/stock-nature", json={"stock_nature": "RAW_MATERIAL"})
        assert r.status_code == 200 and r.json()["effective_nature"] == "RAW_MATERIAL"
        r = await ac.get(f"{base}/{child.id}/stock-nature")
        assert r.json()["stock_nature"] is None and r.json()["effective_nature"] == "RAW_MATERIAL"
        assert r.json()["inherited_from_group_id"] == parent.id
        r = await ac.get(f"{base}/{selfish.id}/stock-nature")  # self-parent must not hang
        assert r.status_code == 200 and r.json()["effective_nature"] is None
        assert (await ac.put(f"{base}/{parent.id}/stock-nature", json={"stock_nature": "PACKING"})).status_code == 422
        assert (await ac.put(f"{base}/{foreign.id}/stock-nature", json={"stock_nature": "OTHER"})).status_code == 404
        assert (await ac.get(f"{base}/{foreign.id}/stock-nature")).status_code == 404
    await db.refresh(foreign)
    assert foreign.stock_nature is None
    logged = (await db.execute(select(AuditLog).where(
        AuditLog.tenant_id == tenant.id, AuditLog.action == "inventory.stock_group.stock_nature.update"
    ))).scalars().all()
    assert len(logged) == 1


# ---- Gates: flag, permissions, validation --------------------------------------------------------------
@pytest.mark.asyncio
@pytest.mark.parametrize("flags", [{"finance_statements_v2": False}, {"finance_statements_v2": "true"}])
async def test_flag_off_returns_404(db_session_integration, flags):
    db = db_session_integration
    tenant, user, _w = await seed_world(db)
    tenant.feature_flags = dict(flags)
    await db.flush()
    async with api_client(db, tenant, user) as ac:
        for path in ("trial-balance", "balance-sheet", "profit-loss"):
            assert (await _get(ac, path)).status_code == 404, path


def test_flag_helper_is_strict_and_not_default_on():
    from app.common import tenant_feature_keys as fk

    for flags in (None, {}, {fk.FINANCE_STATEMENTS_V2: "true"}, {fk.FINANCE_STATEMENTS_V2: 1}, "x"):
        assert fk.is_finance_statements_v2_enabled(flags) is False
    assert fk.is_finance_statements_v2_enabled({fk.FINANCE_STATEMENTS_V2: True}) is True
    assert fk.FINANCE_STATEMENTS_V2 not in fk.DEFAULT_ON_FEATURE_FLAGS
    assert fk.FINANCE_STATEMENTS_V2 not in fk.with_effective_default_flags({})


@pytest.mark.asyncio
async def test_permission_denials_and_soft_key_convention(db_session_integration):
    db = db_session_integration
    enforce = {"rbac_enforcement": "enforce"}
    # no finance.access -> 403
    t1, u1, _ = await seed_world(db, role_name="viewer", permissions={}, flags=enforce)
    # finance.access but explicit finance.mis_report.view=false -> 403
    t2, u2, _ = await seed_world(
        db, role_name="analyst", permissions={"finance.access": True, "finance.mis_report.view": False}, flags=enforce
    )
    # finance.access and the soft key missing -> allowed (missing key allows)
    t3, u3, _ = await seed_world(db, role_name="clerk", permissions={"finance.access": True}, flags=enforce)
    for tenant, user, expected in ((t1, u1, 403), (t2, u2, 403), (t3, u3, 200)):
        async with api_client(db, tenant, user) as ac:
            for path in ("trial-balance", "balance-sheet", "profit-loss"):
                assert (await _get(ac, path)).status_code == expected, (user.username, path)


@pytest.mark.asyncio
async def test_validation_errors_are_422(db_session_integration):
    db = db_session_integration
    tenant, user, _w = await seed_world(db)
    async with api_client(db, tenant, user) as ac:
        bad = [
            ("trial-balance", {"from_date": "2026-13-01"}),
            ("trial-balance", {"from_date": "not-a-date"}),
            ("trial-balance", {"from_date": "2026-12-31", "to_date": "2026-01-01"}),
            ("trial-balance", {"fiscal_year": 2026, "from_date": "2026-01-01"}),
            ("trial-balance", {"fiscal_year": 1800}),
            ("profit-loss", {"from_date": "2026-12-31", "to_date": "2026-01-01"}),
            ("profit-loss", {"fiscal_year": 2026, "to_date": "2026-12-31"}),
            ("balance-sheet", {"as_of_date": "2026-02-30"}),
            ("balance-sheet", {"as_of_date": "2026-12-31", "fiscal_year": 2026}),
        ]
        for path, params in bad:
            assert (await _get(ac, path, **params)).status_code == 422, (path, params)
        # defaults (current fiscal year through today) are accepted
        for path in ("trial-balance", "balance-sheet", "profit-loss"):
            assert (await _get(ac, path)).status_code == 200


# ---- Query budget --------------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_statement_query_counts_are_bounded(db_session_integration):
    db = db_session_integration
    tenant, _user, w = await seed_world(db)
    start, end = date(2026, 1, 1), date(2026, 12, 31)

    async def counts() -> tuple[int, int, int]:
        with QueryCounter(db) as tb_q:
            await build_trial_balance(db, tenant, from_date=start, to_date=end)
        with QueryCounter(db) as bs_q:
            await build_balance_sheet(db, tenant, as_of_date=end)
        with QueryCounter(db) as pl_q:
            await build_profit_loss(db, tenant, from_date=start, to_date=end)
        return tb_q.count, bs_q.count, pl_q.count

    small = await counts()
    for i in range(60):  # many more ledgers and vouchers must not add statements (no per-ledger loop)
        ledger = await make_ledger(db, tenant.id, w["groups"]["iexp"], f"Bulk {i}")
        await post(db, tenant.id, date(2026, 3, 1), [(ledger, "DEBIT", "10"), (w["ledgers"]["cash"], "CREDIT", "10")])
    large = await counts()
    assert small == large
    assert small[0] <= 6 and small[1] <= 8 and small[2] <= 8, small


# ---- Templates, migration map, DB constraint -----------------------------------------------------------
def _load_migration(name: str):
    path = Path(__file__).resolve().parents[1] / "alembic" / "versions" / name
    spec = importlib.util.spec_from_file_location(name[:-3], path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_template_classes_match_migration_and_allowlist():
    mig = _load_migration("293_account_group_statement_class.py")
    assert mig.SYSTEM_CODE_CLASS == SYSTEM_GROUP_STATEMENT_CLASS
    assert tuple(mig.ALLOWED) == K.STATEMENT_CLASSES and "COGS" in K.STATEMENT_CLASS_SET
    codes = {g["system_code"] for g in SYSTEM_ACCOUNT_GROUPS}
    assert set(SYSTEM_GROUP_STATEMENT_CLASS) <= codes
    assert set(SYSTEM_GROUP_STATEMENT_CLASS.values()) <= K.STATEMENT_CLASS_SET
    unclassified = {g["system_code"] for g in SYSTEM_ACCOUNT_GROUPS if "statement_class" not in g}
    assert unclassified == {"CONTROL_ACCOUNTS"}  # memorandum: a finance admin reviews it
    assert set(SYSTEM_GROUP_STATEMENT_CLASS_STANDARD) == {
        "CASH_AND_BANK", "TRADE_FINANCE_LIABILITIES", "DEFERRED_LIABILITIES", "SERVICE_REVENUE_GROUP",
    }
    assert not set(SYSTEM_GROUP_STATEMENT_CLASS) & set(SYSTEM_GROUP_STATEMENT_CLASS_STANDARD)
    assert set(SYSTEM_GROUP_STATEMENT_CLASS_STANDARD.values()) <= K.STATEMENT_CLASS_SET
    assert {c for _code, _nat, c in mig.TALLY_SEED_CODE_CLASS} <= K.STATEMENT_CLASS_SET
    stock = _load_migration("294_stock_group_stock_nature.py")
    assert tuple(stock.ALLOWED) == K.STOCK_NATURES
    assert set(K.CLASS_TO_PRIMARY) == K.STATEMENT_CLASS_SET


@pytest.mark.asyncio
async def test_new_tenants_get_classified_system_groups_and_db_rejects_bad_values(db_session_integration):
    db = db_session_integration
    tenant, _user, _w = await seed_world(db)
    await seed_tenant_system_coa(db, tenant.id)
    rows = (await db.execute(select(AccountGroup.system_code, AccountGroup.statement_class).where(
        AccountGroup.tenant_id == tenant.id, AccountGroup.system_code.is_not(None)
    ))).all()
    got = {code: cls for code, cls in rows}
    assert len(got) == len(SYSTEM_ACCOUNT_GROUPS)
    assert {c: v for c, v in got.items() if v} == {**SYSTEM_GROUP_STATEMENT_CLASS, **SYSTEM_GROUP_STATEMENT_CLASS_STANDARD}
    assert got["RAW_MATERIAL_COGS"] == "COGS" and got["CASH_AND_BANK"] == "BANK_ACCOUNTS"
    assert got["CONTROL_ACCOUNTS"] is None

    group = await make_group(db, tenant.id, "Constraint probe", "Asset")
    with pytest.raises(IntegrityError):
        async with db.begin_nested():
            group.statement_class = "NOT_ALLOWED"
            await db.flush()
    # stock groups: same allowlist at database level
    sg = StockGroup(tenant_id=tenant.id, group_code="CK1", name="Probe")
    db.add(sg)
    await db.flush()
    with pytest.raises(IntegrityError):
        async with db.begin_nested():
            sg.stock_nature = "PACKING"
            await db.flush()
