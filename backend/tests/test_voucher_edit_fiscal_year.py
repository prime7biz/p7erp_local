"""Voucher edit: row lock sees the latest status, and moving the date to another financial year renumbers.

Run in Docker: docker compose exec backend pytest tests/test_voucher_edit_fiscal_year.py -q
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import text

from app.models.finance import AccountGroup, ChartOfAccount, Voucher
from tests.benchmark_fixtures import api_client, seed_tenant_admin


async def _seed_accounts(db, tenant_id: int):
    slug = uuid.uuid4().hex[:6]
    grp = AccountGroup(tenant_id=tenant_id, name=f"Exp {slug}", code=f"VE-E{slug}", nature="Expense")
    cash_grp = AccountGroup(tenant_id=tenant_id, name=f"Cash {slug}", code=f"VE-C{slug}", nature="Asset")
    db.add_all([grp, cash_grp])
    await db.flush()
    rent = ChartOfAccount(tenant_id=tenant_id, account_number=f"VE-5{slug}", name="Rent", group_id=grp.id, normal_balance="debit")
    cash = ChartOfAccount(tenant_id=tenant_id, account_number=f"VE-1{slug}", name="Cash", group_id=cash_grp.id, normal_balance="debit")
    db.add_all([rent, cash])
    await db.flush()
    return rent, cash


def _body(rent_id: int, cash_id: int, on: date, amount: str = "100"):
    return {
        "voucher_type": "JOURNAL",
        "voucher_date": on.isoformat(),
        "description": "Office rent",
        "lines": [
            {"account_id": rent_id, "entry_type": "DEBIT", "amount": amount},
            {"account_id": cash_id, "entry_type": "CREDIT", "amount": amount},
        ],
    }


@pytest.mark.asyncio
async def test_edit_keeps_number_in_same_year_and_renumbers_across_years(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    tenant.feature_flags = {**(tenant.feature_flags or {}), "fiscal_year_start_month": 7}
    rent, cash = await _seed_accounts(db, tenant.id)
    await db.commit()
    async with api_client(db, tenant, user) as ac:
        created = await ac.post("/api/v1/finance/vouchers", json=_body(rent.id, cash.id, date(2026, 6, 10)))
        assert created.status_code == 200, created.text
        vid = created.json()["id"]
        first_number = created.json()["voucher_number"]
        assert first_number.startswith("VCH-2025-")  # July-June year 2025-26

        same_year = await ac.patch(f"/api/v1/finance/vouchers/{vid}", json=_body(rent.id, cash.id, date(2026, 6, 30), "120"))
        assert same_year.status_code == 200, same_year.text
        assert same_year.json()["voucher_number"] == first_number

        next_year = await ac.patch(f"/api/v1/finance/vouchers/{vid}", json=_body(rent.id, cash.id, date(2026, 7, 1), "120"))
        assert next_year.status_code == 200, next_year.text
        assert next_year.json()["voucher_number"].startswith("VCH-2026-")

        hist = await ac.get(f"/api/v1/finance/vouchers/{vid}/history")
    row = await db.get(Voucher, vid)
    assert row.fiscal_year == 2026
    assert row.number_series_key.startswith("2026:")
    renumber_event = hist.json()["events"][0]
    assert renumber_event["changes"]["voucher_number"] == {"from": first_number, "to": row.voucher_number}


@pytest.mark.asyncio
async def test_edit_rejected_when_status_changed_meanwhile(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    rent, cash = await _seed_accounts(db, tenant.id)
    await db.commit()
    async with api_client(db, tenant, user) as ac:
        created = await ac.post("/api/v1/finance/vouchers", json=_body(rent.id, cash.id, date(2026, 3, 1)))
        assert created.status_code == 200, created.text
        vid = created.json()["id"]
        # The session still holds a DRAFT copy; another request posts it behind our back.
        cached = await db.get(Voucher, vid)
        assert cached.status == "DRAFT"
        await db.execute(text("UPDATE vouchers SET status = 'POSTED' WHERE id = :id"), {"id": vid})
        r = await ac.patch(f"/api/v1/finance/vouchers/{vid}", json=_body(rent.id, cash.id, date(2026, 3, 2)))
    assert r.status_code == 400, r.text
    assert "DRAFT or REJECTED" in r.text
