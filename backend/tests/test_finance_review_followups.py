"""Finance modernization review follow-ups.

  (a) spreadsheet formula-injection guard shared by the budget CSV and statement XLSX exports
  (b) per user + tenant rate limit on POST /finance/statements/commentary (429)
  (c) Control Tower GRN / vendor-bill amounts on foreign-currency documents without an exchange rate are disclosed
      (row `currency_note` + card note), totals unchanged

Run: docker compose exec -T backend pytest tests/test_finance_review_followups.py -q
"""

from __future__ import annotations

import io
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.common.spreadsheet_safety import neutralize_formula
from tests.benchmark_fixtures import api_client, seed_item
from tests.finance_control_fixtures import CONTROL_FLAG
from tests.finance_statement_fixtures import seed_world
from tests.test_finance_control_tower import _bill, _grn, _po_line, _vendor

D = Decimal
DANGEROUS = [
    "=1+1", "+1", "-1", "@SUM(A1)", "\t=1", "\r=1", "\n=1", " =HYPERLINK(\"x\")", "  +cmd", "\t \t-2", " @x",
    "\uff1d1+1", "\uff0b1", "\uff0d1", "\uff20SUM(A1)", "  \uff1dcmd",
]
SAFE = ["", "Rent", "Sales 2027", "a=b", "100", "N/A", "Cash-in-hand"]


# ---- (a) formula injection ---------------------------------------------------------------------------------------------
@pytest.mark.parametrize("text", DANGEROUS)
def test_dangerous_cells_are_quoted(text):
    assert neutralize_formula(text) == "'" + text


@pytest.mark.parametrize("text", SAFE)
def test_safe_cells_are_unchanged(text):
    assert neutralize_formula(text) == text


def test_budget_csv_and_statement_xlsx_use_the_shared_guard():
    from openpyxl import load_workbook

    from app.modules.finance.budget_analytics.analytics_service import _csv_safe
    from app.modules.finance.statements.export_service import ExportRow, ExportTable, render_xlsx

    for text in DANGEROUS:
        assert _csv_safe(text) == "'" + text
    table = ExportTable(
        title="Trial Balance", company=" =evil()", address="\uff20addr", period="2027", currency="BDT",
        columns=["Particulars", "Note"], rows=[ExportRow([" +ledger", "\t-1"])],
    )
    ws = load_workbook(io.BytesIO(render_xlsx(table))).active
    values = [c.value for row in ws.iter_rows() for c in row if isinstance(c.value, str)]
    for text in (" =evil()", "\uff20addr", " +ledger", "\t-1"):
        assert "'" + text in values and text not in values


# ---- (b) commentary rate limit -------------------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_commentary_rate_limit_per_user_and_tenant(db_session_integration, monkeypatch):
    from app.modules.ai_tool import guardrails

    monkeypatch.setattr(
        guardrails,
        "get_settings",
        lambda: SimpleNamespace(
            ai_rate_limit_window_seconds=60,
            ai_rate_limit_chat_per_window=2,
            ai_rate_limit_read_per_window=50,
            ai_rate_limit_heavy_per_window=12,
        ),
    )
    db = db_session_integration
    flags = {"finance_ai_insights_v2": True, "finance_statements_v2": True}
    tenant, user, _w = await seed_world(db, flags=flags)
    tenant2, user2, _w2 = await seed_world(db, flags=flags)
    await db.commit()
    body = {"report": "profit_loss", "from_date": "2026-01-01", "to_date": "2026-12-31", "use_ai": False}
    url = "/api/v1/finance/statements/commentary"
    async with api_client(db, tenant, user) as ac:
        assert [(await ac.post(url, json=body)).status_code for _ in range(2)] == [200, 200]
        blocked = await ac.post(url, json=body)
        assert blocked.status_code == 429 and "Rate limit" in blocked.json()["detail"]
    async with api_client(db, tenant2, user2) as ac2:  # another user / tenant has its own budget
        assert (await ac2.post(url, json=body)).status_code == 200


@pytest.mark.asyncio
async def test_commentary_denied_request_does_not_use_the_budget(db_session_integration, monkeypatch):
    calls: list[str] = []

    async def _spy(*, key: str, category: str) -> None:
        calls.append(key)

    monkeypatch.setattr("app.modules.finance.ai_insights.router.enforce_route_rate_limit", _spy)
    db = db_session_integration
    tenant, user, _w = await seed_world(db, flags={"finance_statements_v2": True})  # AI flag off -> 404
    await db.commit()
    async with api_client(db, tenant, user) as ac:
        r = await ac.post(
            "/api/v1/finance/statements/commentary",
            json={"report": "profit_loss", "from_date": "2026-01-01", "to_date": "2026-12-31", "use_ai": False},
        )
    assert r.status_code == 404 and calls == []


# ---- (c) missing exchange rate disclosure ----------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_control_tower_flags_foreign_documents_without_rate(db_session_integration):
    db = db_session_integration
    tenant, user, _w = await seed_world(db, flags=CONTROL_FLAG)
    t = tenant.id
    vendor = await _vendor(db, t)
    item, wh, _unit = await seed_item(db, t, code="FX-ITEM")
    # GRNs, all unbilled: USD without a rate (counted at 1), USD at 110, BDT without a rate (base currency: fine)
    po_usd, pl_usd = await _po_line(db, t, vendor, item, wh, price="100", qty="100")
    po_usd.currency = "USD"
    po_rate, pl_rate = await _po_line(db, t, vendor, item, wh, price="100", qty="100")
    po_rate.currency, po_rate.exchange_rate_to_base = "USD", D("110")
    po_bdt, pl_bdt = await _po_line(db, t, vendor, item, wh, price="100", qty="100")
    po_bdt.currency = "BDT"
    g_usd, _ = await _grn(db, t, vendor, po_usd, pl_usd, item, wh, qty="10", received=date(2027, 1, 5))
    await _grn(db, t, vendor, po_rate, pl_rate, item, wh, qty="1", received=date(2027, 1, 6))
    await _grn(db, t, vendor, po_bdt, pl_bdt, item, wh, qty="2", received=date(2027, 1, 7))
    # A USD vendor bill without a rate, price 110 vs PO 100 x 100 -> variance 1000 (above the 500 floor)
    po_b, pl_b = await _po_line(db, t, vendor, item, wh, price="100", qty="100")
    gb, gib = await _grn(db, t, vendor, po_b, pl_b, item, wh, qty="100", received=date(2027, 1, 10))
    bill = await _bill(db, t, vendor, gb, gib, pl_b, price="110", qty="100", item=item)
    bill.currency = "USD"
    await db.flush()

    as_of = {"as_of_date": "2027-06-30"}
    async with api_client(db, tenant, user) as ac:
        cards = {c["code"]: c for c in (await ac.get("/api/v1/finance/control-tower", params=as_of)).json()["cards"]}
        grn_rows = (await ac.get("/api/v1/finance/control-tower/exceptions/GRN_NOT_BILLED", params={**as_of, "limit": 50})).json()
        var_rows = (
            await ac.get("/api/v1/finance/control-tower/exceptions/VENDOR_BILL_VARIANCE", params={**as_of, "limit": 50})
        ).json()

    grn = cards["GRN_NOT_BILLED"]
    assert (grn["count"], grn["amount"]) == (3, "12200.0000")  # 1000 (rate 1) + 11000 + 200: semantics unchanged
    assert "1 foreign-currency document(s) have no exchange rate" in grn["note"]
    notes = {r["reference"]: r["details"]["currency_note"] for r in grn_rows["rows"]}
    assert notes.pop(g_usd.grn_code).startswith("No exchange rate")
    assert set(notes.values()) == {None}

    var = cards["VENDOR_BILL_VARIANCE"]
    assert (var["count"], var["amount"]) == (1, "1000.0000")
    assert "1 foreign-currency document(s)" in var["note"]
    assert var_rows["rows"][0]["reference"] == bill.bill_code
    assert var_rows["rows"][0]["details"]["currency_note"].startswith("No exchange rate")
