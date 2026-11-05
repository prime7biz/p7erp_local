"""Roadmap item 5: per-voucher edit log (create, edit diff, status change with reason, delete).

Run: docker compose exec backend pytest tests/test_benchmark_voucher_history.py -q
"""

from __future__ import annotations

from datetime import date

import pytest

from app.models.finance import AccountGroup, ChartOfAccount
from tests.benchmark_fixtures import api_client, seed_tenant_admin


async def _seed_accounts(db, tenant_id: int):
    grp = AccountGroup(tenant_id=tenant_id, name="Expenses", code="VH-EXP", nature="Expense")
    cash_grp = AccountGroup(tenant_id=tenant_id, name="Cash", code="VH-CASH", nature="Asset")
    db.add_all([grp, cash_grp])
    await db.flush()
    rent = ChartOfAccount(tenant_id=tenant_id, account_number="VH-5001", name="Rent", group_id=grp.id, normal_balance="debit")
    cash = ChartOfAccount(tenant_id=tenant_id, account_number="VH-1001", name="Cash", group_id=cash_grp.id, normal_balance="debit")
    db.add_all([rent, cash])
    await db.flush()
    return rent, cash


def _body(rent_id: int, cash_id: int, amount: str, description: str = "Office rent"):
    return {
        "voucher_type": "JOURNAL",
        "voucher_date": date.today().isoformat(),
        "description": description,
        "lines": [
            {"account_id": rent_id, "entry_type": "DEBIT", "amount": amount},
            {"account_id": cash_id, "entry_type": "CREDIT", "amount": amount},
        ],
    }


@pytest.mark.asyncio
async def test_voucher_history_records_lifecycle(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    rent, cash = await _seed_accounts(db, tenant.id)
    await db.commit()
    async with api_client(db, tenant, user) as ac:
        created = await ac.post("/api/v1/finance/vouchers", json=_body(rent.id, cash.id, "100"))
        assert created.status_code == 200, created.text
        vid = created.json()["id"]

        edited = await ac.patch(f"/api/v1/finance/vouchers/{vid}", json=_body(rent.id, cash.id, "150", "Office rent Nov"))
        assert edited.status_code == 200, edited.text

        submitted = await ac.post(f"/api/v1/finance/vouchers/{vid}/status", json={"status": "SUBMITTED", "reason": "ready for check"})
        assert submitted.status_code == 200, submitted.text

        hist = await ac.get(f"/api/v1/finance/vouchers/{vid}/history")
        assert hist.status_code == 200, hist.text
        events = hist.json()["events"]

        deleted = await ac.delete(f"/api/v1/finance/vouchers/{vid}")
        after_delete = await ac.get(f"/api/v1/finance/vouchers/{vid}/history")

    assert [e["event"] for e in events] == ["status", "updated", "created"]
    status_ev, update_ev, create_ev = events
    assert status_ev["from_status"] == "DRAFT" and status_ev["to_status"] == "SUBMITTED"
    assert status_ev["reason"] == "ready for check"
    assert status_ev["username"] == user.username
    assert set(update_ev["changes"]) == {"description", "lines"}
    assert update_ev["changes"]["lines"]["from"]["debit_total"] == 100.0
    assert update_ev["changes"]["lines"]["to"]["debit_total"] == 150.0
    assert create_ev["to_status"] == "DRAFT"

    assert deleted.status_code == 200
    assert after_delete.status_code == 200
    assert after_delete.json()["events"][0]["event"] == "deleted"


@pytest.mark.asyncio
async def test_voucher_history_is_tenant_scoped(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    rent, cash = await _seed_accounts(db, tenant.id)
    other_tenant, other_user = await seed_tenant_admin(db)
    await db.commit()
    async with api_client(db, tenant, user) as ac:
        vid = (await ac.post("/api/v1/finance/vouchers", json=_body(rent.id, cash.id, "10"))).json()["id"]
    async with api_client(db, other_tenant, other_user) as ac:
        r = await ac.get(f"/api/v1/finance/vouchers/{vid}/history")
    assert r.status_code == 404
