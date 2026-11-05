"""Roadmap item 15: optional direct post (flag direct_post_vouchers, default off).

Run: docker compose exec backend pytest tests/test_benchmark_direct_post.py -q
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.models.finance import AccountGroup, AccountingPeriod, ChartOfAccount
from tests.benchmark_fixtures import api_client, seed_tenant_admin


async def _setup(db, *, flag: bool):
    tenant, user = await seed_tenant_admin(db)
    tenant.feature_flags = {"direct_post_vouchers": flag}
    t = tenant.id
    exp = AccountGroup(tenant_id=t, name="Expenses", code="DP-EXP", nature="Expense")
    ast = AccountGroup(tenant_id=t, name="Cash", code="DP-CASH", nature="Asset")
    db.add_all([exp, ast])
    await db.flush()
    rent = ChartOfAccount(tenant_id=t, account_number="DP-5", name="Rent", group_id=exp.id, normal_balance="debit")
    cash = ChartOfAccount(tenant_id=t, account_number="DP-1", name="Cash", group_id=ast.id, normal_balance="debit")
    today = date.today()
    db.add_all([
        rent,
        cash,
        AccountingPeriod(tenant_id=t, period_name=f"DP {today:%Y-%m}", start_date=today - timedelta(days=40),
                         end_date=today + timedelta(days=40), is_closed=False),
    ])
    await db.flush()
    await db.commit()
    return tenant, user, rent, cash


def _body(rent_id: int, cash_id: int):
    return {
        "voucher_type": "JOURNAL",
        "voucher_date": date.today().isoformat(),
        "description": "Rent paid",
        "lines": [
            {"account_id": rent_id, "entry_type": "DEBIT", "amount": "500"},
            {"account_id": cash_id, "entry_type": "CREDIT", "amount": "500"},
        ],
    }


@pytest.mark.asyncio
async def test_direct_post_walks_every_step(db_session_integration):
    db = db_session_integration
    tenant, user, rent, cash = await _setup(db, flag=True)
    async with api_client(db, tenant, user) as ac:
        vid = (await ac.post("/api/v1/finance/vouchers", json=_body(rent.id, cash.id))).json()["id"]
        r = await ac.post(f"/api/v1/finance/vouchers/{vid}/direct-post")
        again = await ac.post(f"/api/v1/finance/vouchers/{vid}/direct-post")
        hist = (await ac.get(f"/api/v1/finance/vouchers/{vid}/history")).json()["events"]
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "POSTED"
    assert again.status_code == 409
    steps = [e["to_status"] for e in reversed(hist) if e["event"] == "status"]
    assert steps == ["SUBMITTED", "CHECKED", "RECOMMENDED", "APPROVED", "POSTED"]
    assert all(e["reason"] == "Direct post (single-step mode)" for e in hist if e["event"] == "status")


@pytest.mark.asyncio
async def test_direct_post_off_by_default(db_session_integration):
    db = db_session_integration
    tenant, user, rent, cash = await _setup(db, flag=False)
    async with api_client(db, tenant, user) as ac:
        vid = (await ac.post("/api/v1/finance/vouchers", json=_body(rent.id, cash.id))).json()["id"]
        r = await ac.post(f"/api/v1/finance/vouchers/{vid}/direct-post")
    assert r.status_code == 404
