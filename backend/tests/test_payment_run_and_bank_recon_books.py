"""Payment runs only mark bills paid with a posted payment voucher; bank reconciliation reads the ledger.

Run in Docker: docker compose exec backend pytest tests/test_payment_run_and_bank_recon_books.py -q
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest

from app.models.finance import (
    AccountGroup,
    AccountingPeriod,
    BankAccount,
    ChartOfAccount,
    OutstandingBill,
    Voucher,
    VoucherLine,
)
from tests.benchmark_fixtures import api_client, seed_tenant_admin

RUN_DATE = date(2026, 5, 15)


async def _bank_gl(db, tenant_id: int, opening: str = "0") -> ChartOfAccount:
    slug = uuid.uuid4().hex[:6]
    grp = AccountGroup(tenant_id=tenant_id, name=f"Bank {slug}", code=f"BK{slug}", nature="Asset", is_bank_group=True)
    db.add(grp)
    await db.flush()
    acct = ChartOfAccount(tenant_id=tenant_id, account_number=f"BK-{slug}", name="City Bank current", group_id=grp.id,
                          normal_balance="debit", opening_balance=Decimal(opening), balance=Decimal(opening))
    db.add(acct)
    await db.flush()
    return acct


async def _bank(db, tenant_id: int, gl_account_id: int | None, current_balance: str = "0") -> BankAccount:
    bank = BankAccount(tenant_id=tenant_id, account_name="Main", bank_name="City Bank",
                       account_number=uuid.uuid4().hex[:10], gl_account_id=gl_account_id,
                       current_balance=Decimal(current_balance))
    db.add(bank)
    await db.flush()
    return bank


async def _bill(db, tenant_id: int, amount: str = "300") -> OutstandingBill:
    bill = OutstandingBill(tenant_id=tenant_id, bill_no=f"B-{uuid.uuid4().hex[:6]}", party_name="Alpha Fabrics",
                           bill_type="PAYABLE", bill_date=RUN_DATE, due_date=RUN_DATE, amount=Decimal(amount))
    db.add(bill)
    await db.flush()
    return bill


async def _run_to_processed(ac, bank_id: int | None, bill_id: int) -> int:
    created = await ac.post(
        "/api/v1/finance/banking/payment-runs",
        json={"run_date": RUN_DATE.isoformat(), "bank_account_id": bank_id,
              "items": [{"bill_id": bill_id, "party_name": "Alpha Fabrics", "amount": "300"}]},
    )
    assert created.status_code == 200, created.text
    run_id = created.json()["id"]
    assert (await ac.post(f"/api/v1/finance/banking/payment-runs/{run_id}/approve")).status_code == 200
    assert (await ac.post(f"/api/v1/finance/banking/payment-runs/{run_id}/process")).status_code == 200
    return run_id


@pytest.mark.asyncio
async def test_execute_without_bank_ledger_does_not_mark_bill_paid(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    bank = await _bank(db, tenant.id, gl_account_id=None)
    bill = await _bill(db, tenant.id)
    async with api_client(db, tenant, user) as ac:
        run_id = await _run_to_processed(ac, bank.id, bill.id)
        r = await ac.post(f"/api/v1/finance/banking/payment-runs/{run_id}/execute")
        assert r.status_code == 400, r.text
        assert "ledger" in r.json()["detail"]
        no_bank_run = await _run_to_processed(ac, None, bill.id)
        r2 = await ac.post(f"/api/v1/finance/banking/payment-runs/{no_bank_run}/execute")
        assert r2.status_code == 400, r2.text
    await db.refresh(bill)
    assert bill.status == "OPEN"
    assert Decimal(str(bill.paid_amount)) == Decimal("0")


@pytest.mark.asyncio
async def test_execute_posts_voucher_then_marks_bill_paid(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    gl = await _bank_gl(db, tenant.id, opening="1000")
    bank = await _bank(db, tenant.id, gl.id)
    bill = await _bill(db, tenant.id)
    db.add(AccountingPeriod(tenant_id=tenant.id, period_name="May 2026", start_date=date(2026, 5, 1),
                            end_date=date(2026, 5, 31), is_closed=False))
    await db.flush()
    async with api_client(db, tenant, user) as ac:
        run_id = await _run_to_processed(ac, bank.id, bill.id)
        r = await ac.post(f"/api/v1/finance/banking/payment-runs/{run_id}/execute")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "EXECUTED"
    voucher = await db.get(Voucher, body["executed_voucher_id"])
    assert voucher.status == "POSTED"
    await db.refresh(bill)
    assert bill.status == "PAID"
    assert Decimal(str(bill.paid_amount)) == Decimal("300.00")


@pytest.mark.asyncio
async def test_bank_reconciliation_book_balance_comes_from_posted_ledger(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    gl = await _bank_gl(db, tenant.id, opening="1000")
    other = await _bank_gl(db, tenant.id)
    bank = await _bank(db, tenant.id, gl.id, current_balance="99999")  # stale cached figure

    async def voucher(on: date, status: str, entry: str, amount: str, base: str, **flags):
        v = Voucher(tenant_id=tenant.id, voucher_number=f"V-{uuid.uuid4().hex[:8]}", voucher_type="JOURNAL",
                    voucher_date=on, status=status, **flags)
        db.add(v)
        await db.flush()
        contra = "CREDIT" if entry == "DEBIT" else "DEBIT"
        db.add_all([
            VoucherLine(tenant_id=tenant.id, voucher_id=v.id, account_id=gl.id, entry_type=entry,
                        amount=Decimal(amount), base_amount=Decimal(base)),
            VoucherLine(tenant_id=tenant.id, voucher_id=v.id, account_id=other.id, entry_type=contra,
                        amount=Decimal(amount), base_amount=Decimal(base)),
        ])
        await db.flush()

    await voucher(date(2026, 4, 1), "POSTED", "DEBIT", "10", "1100.50")  # USD receipt: base counts
    await voucher(date(2026, 4, 20), "POSTED", "CREDIT", "200", "200")
    await voucher(date(2026, 4, 25), "DRAFT", "DEBIT", "5000", "5000")  # not posted
    await voucher(date(2026, 4, 26), "POSTED", "DEBIT", "777", "777", is_memorandum=True)  # not in books
    await voucher(date(2026, 5, 2), "POSTED", "CREDIT", "300", "300")  # after statement date

    async with api_client(db, tenant, user) as ac:
        r = await ac.post(
            "/api/v1/finance/banking/reconciliation",
            json={"bank_account_id": bank.id, "statement_date": "2026-04-30", "statement_balance": "1900.50"},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert Decimal(body["book_balance"]) == Decimal("1900.50")
    assert Decimal(body["difference_amount"]) == Decimal("0")
    assert body["status"] == "MATCHED"
