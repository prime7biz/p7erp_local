"""Credit/debit notes change the party outstanding exactly once, and only when posted.

Run:
docker compose exec backend pytest tests/test_accounting_party_notes.py -q
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import CREDIT_DEBIT_NOTE_ENABLED
from app.database import get_db
from app.main import app
from app.models import Customer
from app.models.finance import AccountingPeriod, Voucher, VoucherLine
from app.models.party_ledger import PartyLedger, PartyLedgerBill

from tests.go_live_fixtures import create_admin_tenant_with_user
from tests.test_accounting_posting_integrity import _account, _override


async def _seed(db):
    tenant, user, _ = await create_admin_tenant_with_user(db)
    tenant.feature_flags = {**(tenant.feature_flags or {}), CREDIT_DEBIT_NOTE_ENABLED: True}
    today = date.today()
    db.add(
        AccountingPeriod(
            tenant_id=tenant.id,
            period_name=f"P{uuid.uuid4().hex[:4]}",
            start_date=today - timedelta(days=60),
            end_date=today + timedelta(days=60),
            is_closed=False,
        )
    )
    ar = await _account(db, tenant.id, "Customer AR")
    sales_return = await _account(db, tenant.id, "Sales return")
    slug = uuid.uuid4().hex[:8]
    customer = Customer(tenant_id=tenant.id, customer_code=f"C{slug}"[:10], name=f"Buyer {slug}")
    db.add(customer)
    await db.flush()
    ledger = PartyLedger(
        tenant_id=tenant.id,
        party_type="CUSTOMER",
        customer_id=customer.id,
        ledger_account_id=ar.id,
        opening_balance=Decimal("0"),
        opening_balance_type="DR",
        current_balance=Decimal("1000"),
        current_balance_type="DR",
        is_active=True,
    )
    db.add(ledger)
    await db.flush()
    original = PartyLedgerBill(
        tenant_id=tenant.id,
        party_ledger_id=ledger.id,
        bill_number=f"INV-{slug}"[:20],
        bill_date=today - timedelta(days=5),
        bill_type="SALE",
        original_amount=Decimal("1000"),
        amount_type="DR",
        pending_amount=Decimal("1000"),
        settled_amount=Decimal("0"),
        status="PENDING",
        due_date=today + timedelta(days=10),
    )
    db.add(original)
    await db.commit()
    return tenant, user, ar, sales_return, ledger, original


async def _note_bills(db, ledger_id: int) -> list[PartyLedgerBill]:
    return list(
        (
            await db.execute(
                select(PartyLedgerBill).where(
                    PartyLedgerBill.party_ledger_id == ledger_id,
                    PartyLedgerBill.bill_type == "CREDIT_NOTE",
                    PartyLedgerBill.status != "CANCELLED",
                )
            )
        ).scalars().all()
    )


@pytest.mark.asyncio
async def test_credit_note_reduces_outstanding_once_on_post(db_session_integration):
    db = db_session_integration
    tenant, user, ar, sales_return, ledger, original = await _seed(db)
    _override(db, user, tenant)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            h = {"X-Tenant-Id": str(tenant.id)}
            r = await ac.post(
                "/api/v1/finance/credit-notes",
                headers=h,
                json={
                    "voucher_date": date.today().isoformat(),
                    "description": "Return of 4 pcs",
                    "party_ledger_id": ledger.id,
                    "original_bill_id": original.id,
                    "amount": "400",
                    "revenue_or_purchase_account_id": sales_return.id,
                },
            )
            assert r.status_code == 200, r.text
            note_id = r.json()["id"]

            # Draft: nothing changes yet.
            await db.refresh(original)
            assert Decimal(str(original.pending_amount)) == Decimal("1000")
            assert await _note_bills(db, ledger.id) == []

            note = await db.get(Voucher, note_id)
            note.status = "APPROVED"
            await db.commit()
            p = await ac.post(f"/api/v1/finance/vouchers/{note_id}/post", headers=h, json={})
            assert p.status_code == 200, p.text

            await db.refresh(original)
            await db.refresh(ledger)
            assert Decimal(str(original.pending_amount)) == Decimal("600")
            bills = await _note_bills(db, ledger.id)
            assert len(bills) == 1
            assert Decimal(str(bills[0].pending_amount)) == Decimal("0")
            # Outstanding 1000 - 400 = 600 (reduced once, not two or three times)
            assert Decimal(str(ledger.current_balance)) == Decimal("600")
            assert ledger.current_balance_type == "DR"

            # Ledger: Dr Sales return 400 / Cr AR 400
            lines = list((await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == note_id))).scalars().all())
            debit = sum(Decimal(str(ln.amount)) for ln in lines if ln.entry_type == "DEBIT")
            credit = sum(Decimal(str(ln.amount)) for ln in lines if ln.entry_type == "CREDIT")
            assert debit == credit == Decimal("400")

            # Cancel posting restores the original bill; re-posting applies once again.
            c = await ac.post(f"/api/v1/finance/vouchers/{note_id}/cancel-posting", headers=h)
            assert c.status_code == 200, c.text
            await db.refresh(original)
            assert Decimal(str(original.pending_amount)) == Decimal("1000")
            assert await _note_bills(db, ledger.id) == []

            p2 = await ac.post(f"/api/v1/finance/vouchers/{note_id}/post", headers=h, json={})
            assert p2.status_code == 200, p2.text
            await db.refresh(original)
            await db.refresh(ledger)
            assert Decimal(str(original.pending_amount)) == Decimal("600")
            assert len(await _note_bills(db, ledger.id)) == 1
            assert Decimal(str(ledger.current_balance)) == Decimal("600")
    finally:
        app.dependency_overrides.clear()
