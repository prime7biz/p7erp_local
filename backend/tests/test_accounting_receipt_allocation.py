"""A receipt can settle bills only up to its own amount, and only once it is posted.

Run:
docker compose exec backend pytest tests/test_accounting_receipt_allocation.py -q
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi import HTTPException

from app.models.finance import Voucher, VoucherLine
from app.modules.finance.party_ledger_bill_service import (
    allocate_to_bill,
    auto_allocate_payment,
    create_bill_from_voucher_line,
    voucher_unallocated_for_party,
)
from app.modules.finance.party_ledger_service import get_or_create_party_ledger

from tests.test_party_ledger import _seed_party_world


async def _voucher(db, tenant_id: int, vtype: str, status: str, account_id: int, entry: str, amount: str, days_ago: int = 0):
    v = Voucher(
        tenant_id=tenant_id,
        voucher_number=f"{vtype[:2]}-{uuid.uuid4().hex[:8]}",
        voucher_type=vtype,
        voucher_date=date.today() - timedelta(days=days_ago),
        status=status,
    )
    db.add(v)
    await db.flush()
    line = VoucherLine(tenant_id=tenant_id, voucher_id=v.id, account_id=account_id, entry_type=entry, amount=amount)
    db.add(line)
    await db.flush()
    return v, line


async def _two_sale_bills(db):
    tenant, customer, *_ = await _seed_party_world(db)
    pl = await get_or_create_party_ledger(db, tenant.id, "CUSTOMER", customer.id)
    bills = []
    for i in (1, 2):
        v, line = await _voucher(db, tenant.id, "JOURNAL", "POSTED", pl.ledger_account_id, "DEBIT", "100.00", days_ago=10 - i)
        bills.append(await create_bill_from_voucher_line(db, tenant.id, v, line, party_ledger_id=pl.id))
    return tenant, pl, bills


@pytest.mark.asyncio
async def test_receipt_cannot_settle_more_than_its_amount(db_session_integration):
    db = db_session_integration
    tenant, pl, bills = await _two_sale_bills(db)
    recv, _ = await _voucher(db, tenant.id, "RECEIPT", "POSTED", pl.ledger_account_id, "CREDIT", "100.00")

    await allocate_to_bill(db, tenant.id, bill_id=bills[0].id, voucher_id=recv.id, allocated_amount=Decimal("100"))
    assert await voucher_unallocated_for_party(db, tenant.id, recv, pl.id) == Decimal("0")
    with pytest.raises(HTTPException) as exc:
        await allocate_to_bill(db, tenant.id, bill_id=bills[1].id, voucher_id=recv.id, allocated_amount=Decimal("100"))
    assert exc.value.status_code == 400
    assert "unallocated" in str(exc.value.detail)
    await db.refresh(bills[1])
    assert Decimal(str(bills[1].pending_amount)) == Decimal("100")

    # Auto-allocating the same receipt again settles nothing more.
    assert await auto_allocate_payment(db, tenant.id, pl.id, recv, Decimal("100"), allocation_method="FIFO") == []


@pytest.mark.asyncio
async def test_unposted_receipt_cannot_settle_bills(db_session_integration):
    db = db_session_integration
    tenant, pl, bills = await _two_sale_bills(db)
    draft, _ = await _voucher(db, tenant.id, "RECEIPT", "DRAFT", pl.ledger_account_id, "CREDIT", "50.00")
    with pytest.raises(HTTPException) as exc:
        await allocate_to_bill(db, tenant.id, bill_id=bills[0].id, voucher_id=draft.id, allocated_amount=Decimal("50"))
    assert exc.value.status_code == 400
    await db.refresh(bills[0])
    assert Decimal(str(bills[0].pending_amount)) == Decimal("100")


@pytest.mark.asyncio
async def test_fifo_receipt_capped_at_voucher_amount(db_session_integration):
    db = db_session_integration
    tenant, pl, bills = await _two_sale_bills(db)
    recv, _ = await _voucher(db, tenant.id, "RECEIPT", "POSTED", pl.ledger_account_id, "CREDIT", "150.00")
    # Caller asks for more than the receipt is worth; only 150 is applied.
    allocs = await auto_allocate_payment(db, tenant.id, pl.id, recv, Decimal("500"), allocation_method="FIFO")
    assert sum(Decimal(str(a.allocated_amount)) for a in allocs) == Decimal("150")
    await db.refresh(bills[0])
    await db.refresh(bills[1])
    assert Decimal(str(bills[0].pending_amount)) == Decimal("0")
    assert Decimal(str(bills[1].pending_amount)) == Decimal("50")
