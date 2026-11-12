"""Sprint 1: bill-wise party ledger — flags, create, allocate, overdue, interest, isolation.

Run:
    docker compose exec backend pytest tests/test_party_ledger.py -q
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.common.permissions import (
    MATERIAL_CONTROL_GOVERNANCE_KEYS,
    PERMISSION_PARTY_LEDGER_ALLOCATE,
    PERMISSION_PARTY_LEDGER_VIEW,
)
from app.common.tenant_feature_keys import (
    PARTY_LEDGER_AUTO_ALLOCATE,
    PARTY_LEDGER_ENABLED,
    PARTY_LEDGER_INTEREST_CALC,
    is_party_ledger_auto_allocate,
    is_party_ledger_enabled,
    is_party_ledger_interest_calc,
)
from app.models import Customer, Tenant, Vendor
from app.models.finance import AccountGroup, ChartOfAccount, Voucher, VoucherLine
from app.models.party_ledger import PartyLedger, PartyLedgerBill
from app.models.tenant import TenantType
from app.modules.finance.party_ledger_bill_service import (
    allocate_to_bill,
    auto_allocate_payment,
    calculate_bill_interest,
    cancel_bills_for_voucher,
    create_bill_from_voucher_line,
    mark_overdue_bills,
)
from app.modules.finance.party_ledger_hooks import daily_party_ledger_maintenance, on_voucher_posted
from app.modules.finance.party_ledger_service import (
    get_or_create_party_ledger,
    get_party_aging_report,
    get_party_ledger_statement,
    update_party_ledger_balance,
)


class TestPartyLedgerFlags:
    def test_master_default_off(self):
        assert is_party_ledger_enabled(None) is False
        assert is_party_ledger_enabled({}) is False
        assert is_party_ledger_enabled({PARTY_LEDGER_ENABLED: True}) is True

    def test_auto_allocate_requires_master(self):
        assert is_party_ledger_auto_allocate({}) is False
        assert is_party_ledger_auto_allocate({PARTY_LEDGER_ENABLED: True}) is True
        assert (
            is_party_ledger_auto_allocate(
                {PARTY_LEDGER_ENABLED: True, PARTY_LEDGER_AUTO_ALLOCATE: False}
            )
            is False
        )

    def test_interest_requires_both(self):
        assert is_party_ledger_interest_calc({PARTY_LEDGER_ENABLED: True}) is False
        assert (
            is_party_ledger_interest_calc(
                {PARTY_LEDGER_ENABLED: True, PARTY_LEDGER_INTEREST_CALC: True}
            )
            is True
        )

    def test_permissions_registered(self):
        keys = {row["key"] for row in MATERIAL_CONTROL_GOVERNANCE_KEYS}
        assert PERMISSION_PARTY_LEDGER_VIEW in keys
        assert PERMISSION_PARTY_LEDGER_ALLOCATE in keys


async def _seed_party_world(db, *, enable_flag: bool = True):
    slug = uuid.uuid4().hex[:10]
    flags = {PARTY_LEDGER_ENABLED: True, PARTY_LEDGER_AUTO_ALLOCATE: True} if enable_flag else {}
    tenant = Tenant(
        name=f"PL {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"pl{slug}"[:18],
        feature_flags=flags,
    )
    db.add(tenant)
    await db.flush()

    group = AccountGroup(
        tenant_id=tenant.id,
        name="Trade Receivables",
        code=f"TR{slug}"[:12],
        nature="Asset",
        system_code="TRADE_RECEIVABLES",
        default_normal_balance="debit",
    )
    db.add(group)
    await db.flush()

    pay_group = AccountGroup(
        tenant_id=tenant.id,
        name="Trade Payables",
        code=f"TP{slug}"[:12],
        nature="Liability",
        system_code="TRADE_PAYABLES",
        default_normal_balance="credit",
    )
    db.add(pay_group)
    await db.flush()

    customer = Customer(tenant_id=tenant.id, customer_code=f"C{slug}"[:10], name=f"Buyer {slug}")
    db.add(customer)
    vendor = Vendor(tenant_id=tenant.id, vendor_code=f"V{slug}"[:10], name=f"Supplier {slug}")
    db.add(vendor)
    await db.flush()

    cash = ChartOfAccount(
        tenant_id=tenant.id,
        account_number=f"CASH-{slug}"[:16],
        name="Cash",
        group_id=group.id,
        normal_balance="debit",
    )
    db.add(cash)
    await db.flush()

    return tenant, customer, vendor, group, pay_group, cash


@pytest.mark.asyncio
async def test_get_or_create_customer_and_vendor(db_session_integration):
    db = db_session_integration
    tenant, customer, vendor, *_ = await _seed_party_world(db)

    pl_c = await get_or_create_party_ledger(db, tenant.id, "CUSTOMER", customer.id, credit_days=45)
    pl_c2 = await get_or_create_party_ledger(db, tenant.id, "CUSTOMER", customer.id)
    assert pl_c.id == pl_c2.id
    assert pl_c.party_type == "CUSTOMER"
    assert pl_c.credit_days == 45

    pl_v = await get_or_create_party_ledger(db, tenant.id, "VENDOR", vendor.id)
    assert pl_v.party_type == "VENDOR"
    assert pl_v.customer_id is None
    assert pl_v.vendor_id == vendor.id

    # Tenant isolation: other tenant cannot see same unique customer id path
    other = Tenant(
        name="Other",
        tenant_type=TenantType.manufacturer,
        is_active=True,
        company_code=f"ot{uuid.uuid4().hex[:8]}",
    )
    db.add(other)
    await db.flush()
    rows = (
        await db.execute(select(PartyLedger).where(PartyLedger.tenant_id == other.id))
    ).scalars().all()
    assert rows == []


@pytest.mark.asyncio
async def test_sale_bill_receipt_fifo_and_manual(db_session_integration):
    db = db_session_integration
    tenant, customer, _vendor, group, _pg, cash = await _seed_party_world(db)
    pl = await get_or_create_party_ledger(
        db, tenant.id, "CUSTOMER", customer.id, interest_rate_monthly=Decimal("1.5")
    )

    # Two sale journals → two DR bills
    bills = []
    for i, amt in enumerate((Decimal("100.00"), Decimal("50.00")), start=1):
        v = Voucher(
            tenant_id=tenant.id,
            voucher_number=f"JV-SALE-{i}-{uuid.uuid4().hex[:6]}",
            voucher_type="JOURNAL",
            voucher_date=date.today() - timedelta(days=10 - i),
            status="POSTED",
            description=f"Sale {i}",
        )
        db.add(v)
        await db.flush()
        line = VoucherLine(
            tenant_id=tenant.id,
            voucher_id=v.id,
            account_id=pl.ledger_account_id,
            entry_type="DEBIT",
            amount=str(amt),
        )
        db.add(line)
        await db.flush()
        bill = await create_bill_from_voucher_line(
            db, tenant.id, v, line, party_ledger_id=pl.id
        )
        bills.append(bill)

    assert bills[0].amount_type == "DR"
    assert bills[0].status == "PENDING"
    assert Decimal(str(bills[0].pending_amount)) == Decimal("100.00")

    # Receipt voucher FIFO allocates oldest first
    recv = Voucher(
        tenant_id=tenant.id,
        voucher_number=f"RV-{uuid.uuid4().hex[:8]}",
        voucher_type="RECEIPT",
        voucher_date=date.today(),
        status="POSTED",
    )
    db.add(recv)
    await db.flush()
    recv_line = VoucherLine(
        tenant_id=tenant.id,
        voucher_id=recv.id,
        account_id=pl.ledger_account_id,
        entry_type="CREDIT",
        amount="120.00",
    )
    db.add(recv_line)
    await db.flush()

    allocs = await auto_allocate_payment(
        db, tenant.id, pl.id, recv, Decimal("120.00"), allocation_method="FIFO"
    )
    assert len(allocs) == 2
    await db.refresh(bills[0])
    await db.refresh(bills[1])
    assert bills[0].status == "SETTLED"
    assert Decimal(str(bills[0].pending_amount)) == Decimal("0")
    assert bills[1].status == "PARTIAL"
    assert Decimal(str(bills[1].pending_amount)) == Decimal("30.00")

    # Manual allocate remaining via second receipt
    recv2 = Voucher(
        tenant_id=tenant.id,
        voucher_number=f"RV2-{uuid.uuid4().hex[:8]}",
        voucher_type="RECEIPT",
        voucher_date=date.today(),
        status="POSTED",
    )
    db.add(recv2)
    await db.flush()
    db.add(
        VoucherLine(
            tenant_id=tenant.id,
            voucher_id=recv2.id,
            account_id=pl.ledger_account_id,
            entry_type="CREDIT",
            amount="30.00",
        )
    )
    await db.flush()
    await allocate_to_bill(
        db,
        tenant.id,
        bill_id=bills[1].id,
        voucher_id=recv2.id,
        allocated_amount=Decimal("30.00"),
    )
    await db.refresh(bills[1])
    assert bills[1].status == "SETTLED"

    await update_party_ledger_balance(db, pl.id, tenant_id=pl.tenant_id)
    await db.refresh(pl)
    assert Decimal(str(pl.current_balance)) == Decimal("0")


@pytest.mark.asyncio
async def test_purchase_payment_fifo(db_session_integration):
    db = db_session_integration
    tenant, _c, vendor, _g, _pg, _cash = await _seed_party_world(db)
    pl = await get_or_create_party_ledger(db, tenant.id, "VENDOR", vendor.id)

    v = Voucher(
        tenant_id=tenant.id,
        voucher_number=f"PJ-{uuid.uuid4().hex[:8]}",
        voucher_type="JOURNAL",
        voucher_date=date.today() - timedelta(days=5),
        status="POSTED",
        source_module="VENDOR_BILL",
    )
    db.add(v)
    await db.flush()
    line = VoucherLine(
        tenant_id=tenant.id,
        voucher_id=v.id,
        account_id=pl.ledger_account_id,
        entry_type="CREDIT",
        amount="200.00",
    )
    db.add(line)
    await db.flush()
    bill = await create_bill_from_voucher_line(db, tenant.id, v, line, party_ledger_id=pl.id)
    assert bill.amount_type == "CR"
    assert bill.bill_type == "PURCHASE"

    pay = Voucher(
        tenant_id=tenant.id,
        voucher_number=f"PV-{uuid.uuid4().hex[:8]}",
        voucher_type="PAYMENT",
        voucher_date=date.today(),
        status="POSTED",
    )
    db.add(pay)
    await db.flush()
    db.add(
        VoucherLine(
            tenant_id=tenant.id,
            voucher_id=pay.id,
            account_id=pl.ledger_account_id,
            entry_type="DEBIT",
            amount="200.00",
        )
    )
    await db.flush()
    await auto_allocate_payment(
        db, tenant.id, pl.id, pay, Decimal("200.00"), allocation_method="FIFO", target_amount_type="CR"
    )
    await db.refresh(bill)
    assert bill.status == "SETTLED"


@pytest.mark.asyncio
async def test_overdue_interest_statement_aging_cancel(db_session_integration):
    db = db_session_integration
    tenant, customer, *_ = await _seed_party_world(db)
    tenant.feature_flags = {
        PARTY_LEDGER_ENABLED: True,
        PARTY_LEDGER_INTEREST_CALC: True,
        PARTY_LEDGER_AUTO_ALLOCATE: True,
    }
    pl = await get_or_create_party_ledger(
        db, tenant.id, "CUSTOMER", customer.id, interest_rate_monthly=Decimal("3")
    )

    v = Voucher(
        tenant_id=tenant.id,
        voucher_number=f"OV-{uuid.uuid4().hex[:8]}",
        voucher_type="JOURNAL",
        voucher_date=date.today() - timedelta(days=40),
        status="POSTED",
    )
    db.add(v)
    await db.flush()
    line = VoucherLine(
        tenant_id=tenant.id,
        voucher_id=v.id,
        account_id=pl.ledger_account_id,
        entry_type="DEBIT",
        amount="1000.00",
    )
    db.add(line)
    await db.flush()
    bill = await create_bill_from_voucher_line(
        db,
        tenant.id,
        v,
        line,
        party_ledger_id=pl.id,
        due_date=date.today() - timedelta(days=10),
    )

    marked = await mark_overdue_bills(db, tenant.id)
    assert marked >= 1
    await db.refresh(bill)
    assert bill.status == "OVERDUE"

    interest = await calculate_bill_interest(db, bill.id, tenant_id=bill.tenant_id)
    assert interest > 0

    maint = await daily_party_ledger_maintenance(db, tenant.id, feature_flags=tenant.feature_flags)
    assert maint["skipped"] is False

    stmt = await get_party_ledger_statement(db, tenant.id, pl.id)
    assert "opening_balance" in stmt
    assert "closing_balance" in stmt
    assert len(stmt["transactions"]) >= 1

    aging = await get_party_aging_report(db, tenant.id, party_ledger_id=pl.id)
    assert "grand_total" in aging
    assert "days_1_30" in aging["grand_total"]

    cancelled = await cancel_bills_for_voucher(db, tenant.id, v.id)
    assert cancelled >= 1
    await db.refresh(bill)
    assert bill.status == "CANCELLED"


@pytest.mark.asyncio
async def test_hook_noop_when_flag_off(db_session_integration):
    db = db_session_integration
    tenant, customer, *_ = await _seed_party_world(db, enable_flag=False)
    pl = await get_or_create_party_ledger(db, tenant.id, "CUSTOMER", customer.id)

    v = Voucher(
        tenant_id=tenant.id,
        voucher_number=f"OFF-{uuid.uuid4().hex[:8]}",
        voucher_type="JOURNAL",
        voucher_date=date.today(),
        status="POSTED",
    )
    db.add(v)
    await db.flush()
    db.add(
        VoucherLine(
            tenant_id=tenant.id,
            voucher_id=v.id,
            account_id=pl.ledger_account_id,
            entry_type="DEBIT",
            amount="10.00",
        )
    )
    await db.flush()

    await on_voucher_posted(db, tenant.id, v, feature_flags={})
    bills = (
        await db.execute(select(PartyLedgerBill).where(PartyLedgerBill.party_ledger_id == pl.id))
    ).scalars().all()
    assert bills == []
