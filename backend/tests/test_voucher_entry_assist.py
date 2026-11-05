"""Voucher entry assistant: read-only hints beside the voucher form.

Run: docker compose exec backend pytest tests/test_voucher_entry_assist.py -q
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.models.finance import AccountGroup, ChartOfAccount, Voucher, VoucherLine
from app.modules.finance.voucher_controls import compute_duplicate_risk_hash
from app.modules.finance.voucher_entry_assist_service import template_narration
from tests.benchmark_fixtures import api_client, seed_tenant_admin

URL = "/api/v1/finance/voucher-entry-assist"


async def _post(db, tenant_id, num, d, debit_acct, credit_acct, amount, narration, reference=None):
    v = Voucher(
        tenant_id=tenant_id, voucher_number=num, voucher_type="PAYMENT", voucher_date=d, status="POSTED",
        description=narration, reference=reference, books_applied=True,
    )
    v.duplicate_risk_hash = compute_duplicate_risk_hash(
        tenant_id=tenant_id, voucher_date=d, reference=reference, line_account_ids=[debit_acct, credit_acct],
        debit_total=float(amount), credit_total=float(amount),
    )
    db.add(v)
    await db.flush()
    db.add_all([
        VoucherLine(tenant_id=tenant_id, voucher_id=v.id, account_id=debit_acct, entry_type="DEBIT", amount=Decimal(amount)),
        VoucherLine(tenant_id=tenant_id, voucher_id=v.id, account_id=credit_acct, entry_type="CREDIT", amount=Decimal(amount)),
    ])


async def _seed(db, *, start_month: int = 7):
    tenant, user = await seed_tenant_admin(db)
    tenant.feature_flags = {"fiscal_year_start_month": start_month}
    t = tenant.id
    asset = AccountGroup(tenant_id=t, name="Cash-in-hand", code="EA-CASH", nature="Asset", default_normal_balance="debit")
    expense = AccountGroup(tenant_id=t, name="Indirect Expenses", code="EA-EXP", nature="Expense", default_normal_balance="debit")
    db.add_all([asset, expense])
    await db.flush()
    cash = ChartOfAccount(tenant_id=t, account_number="EA-1", name="Cash in Hand", group_id=asset.id,
                          normal_balance="debit", balance=Decimal("1000"))
    rent = ChartOfAccount(tenant_id=t, account_number="EA-5", name="Office Rent", group_id=expense.id, normal_balance="debit")
    power = ChartOfAccount(tenant_id=t, account_number="EA-6", name="Electricity", group_id=expense.id, normal_balance="debit")
    db.add_all([cash, rent, power])
    await db.flush()
    recent = date.today() - timedelta(days=10)
    for i in range(3):
        await _post(db, t, f"EA-V{i}", recent - timedelta(days=i), rent.id, cash.id, "100", "Being office rent paid in cash.")
    await _post(db, t, "EA-V9", recent, power.id, cash.id, "50", "Being electricity bill paid.", reference="DESCO-1")
    await db.commit()
    return tenant, user, cash, rent, power


def _body(lines, *, d=None, reference=None, voucher_type="PAYMENT"):
    return {
        "voucher_type": voucher_type,
        "voucher_date": (d or date.today()).isoformat(),
        "reference": reference,
        "lines": lines,
    }


@pytest.mark.asyncio
async def test_assist_hints_and_warnings(db_session_integration):
    db = db_session_integration
    tenant, user, cash, rent, power = await _seed(db)
    lines = [
        {"account_id": rent.id, "entry_type": "DEBIT", "amount": "5000"},
        {"account_id": cash.id, "entry_type": "CREDIT", "amount": "5000"},
    ]
    async with api_client(db, tenant, user) as ac:
        res = await ac.post(URL, json=_body(lines))
    assert res.status_code == 200, res.text
    data = res.json()

    assert data["fiscal_year"] == data["current_fiscal_year"]
    assert data["fiscal_year"]["start_month"] == 7

    by_id = {a["account_id"]: a for a in data["accounts"]}
    assert by_id[cash.id]["balance"] == "1000.0000"
    assert by_id[cash.id]["projected_balance"] == "-4000.0000"
    assert by_id[cash.id]["is_cash_or_bank"] is True
    assert by_id[rent.id]["times_used_last_year"] == 3
    assert by_id[rent.id]["unusual_amount"] is True

    messages = " ".join(w["message"] for w in data["warnings"])
    assert "more than 3×" in messages
    assert "would go negative" in messages

    assert [s["account_id"] for s in data["suggested_accounts"]] == [power.id]
    assert data["suggested_accounts"][0]["side"] == "DEBIT"
    assert "Being office rent paid in cash." in data["recent_narrations"]


@pytest.mark.asyncio
async def test_assist_flags_duplicate_and_other_fiscal_year(db_session_integration):
    db = db_session_integration
    tenant, user, cash, _rent, power = await _seed(db)
    dup_date = date.today() - timedelta(days=10)
    lines = [
        {"account_id": power.id, "entry_type": "DEBIT", "amount": "50"},
        {"account_id": cash.id, "entry_type": "CREDIT", "amount": "50"},
    ]
    async with api_client(db, tenant, user) as ac:
        dup = (await ac.post(URL, json=_body(lines, d=dup_date, reference="DESCO-1"))).json()
        old = (await ac.post(URL, json=_body(lines, d=date.today() - timedelta(days=800)))).json()

    assert [s["voucher_number"] for s in dup["similar_posted_vouchers"]] == ["EA-V9"]
    assert any(w["level"] == "danger" and "duplicate" in w["message"] for w in dup["warnings"])
    assert old["fiscal_year"]["fiscal_year"] < old["current_fiscal_year"]["fiscal_year"]
    assert any(w["level"] == "info" and "financial year" in w["message"] for w in old["warnings"])


@pytest.mark.asyncio
async def test_assist_ignores_other_tenant_accounts(db_session_integration):
    db = db_session_integration
    tenant, user, _cash, _rent, _power = await _seed(db)
    other_tenant, _other_user, other_cash, _r, _p = await _seed(db)
    async with api_client(db, tenant, user) as ac:
        res = await ac.post(URL, json=_body([{"account_id": other_cash.id, "entry_type": "CREDIT", "amount": "10"}]))
    assert res.status_code == 200
    assert res.json()["accounts"] == []


@pytest.mark.asyncio
async def test_assist_can_be_switched_off(db_session_integration):
    db = db_session_integration
    tenant, user, *_ = await _seed(db)
    tenant.feature_flags = {**tenant.feature_flags, "voucher_entry_assist_enabled": False}
    await db.commit()
    async with api_client(db, tenant, user) as ac:
        res = await ac.post(URL, json=_body([]))
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_narration_uses_ai_then_falls_back_to_template(db_session_integration, monkeypatch):
    db = db_session_integration
    tenant, user, cash, rent, _power = await _seed(db)
    lines = [
        {"account_id": rent.id, "entry_type": "DEBIT", "amount": "100"},
        {"account_id": cash.id, "entry_type": "CREDIT", "amount": "100"},
    ]
    import app.common.gemini_client as gc

    async def fake_ai(*_args, **_kwargs):
        return '"Being office rent for November paid in cash."\nExtra line'

    async def no_ai(*_args, **_kwargs):
        return None

    async with api_client(db, tenant, user) as ac:
        monkeypatch.setattr(gc, "generate_text_for_tenant", fake_ai)
        ai = (await ac.post(f"{URL}/narration", json=_body(lines))).json()
        monkeypatch.setattr(gc, "generate_text_for_tenant", no_ai)
        fallback = (await ac.post(f"{URL}/narration", json=_body(lines))).json()

    assert ai == {"narration": "Being office rent for November paid in cash.", "source": "ai"}
    assert fallback == {"narration": "Being payment of 100.00 to Office Rent from Cash in Hand.", "source": "template"}


def test_template_narration_shapes():
    assert template_narration("RECEIPT", ["Bank"], ["Buyer A"], Decimal("2500"), "INV-9") == (
        "Being receipt of 2,500.00 from Buyer A into Bank (ref. INV-9)."
    )
    assert template_narration("JOURNAL", [], [], Decimal("0"), None) == (
        "Being the selected ledger debited and the selected ledger credited for 0.00."
    )
