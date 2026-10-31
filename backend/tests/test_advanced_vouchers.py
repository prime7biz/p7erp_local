"""Sprint 4: advanced vouchers (CN/DN, memo, optional, post-dated, recurring, classes).

Run:
    docker compose exec backend pytest tests/test_advanced_vouchers.py -q
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.common.tenant_feature_keys import (
    CREDIT_DEBIT_NOTE_ENABLED,
    MEMORANDUM_VOUCHER_ENABLED,
    OPTIONAL_VOUCHER_ENABLED,
    POST_DATED_VOUCHER_ENABLED,
    RECURRING_VOUCHER_ENABLED,
    STOCK_TRANSFER_VOUCHER_ENABLED,
    VOUCHER_CLASS_ENABLED,
)
from app.models import Customer, Tenant
from app.models.advanced_vouchers import RecurringVoucherTemplate, VoucherClass
from app.models.finance import AccountGroup, ChartOfAccount, Voucher, VoucherLine
from app.models.party_ledger import PartyLedger, PartyLedgerBill
from app.models.tenant import TenantType
from app.modules.finance.advanced_voucher_service import (
    activate_due_post_dated,
    convert_memorandum_to_regular,
    convert_optional_to_books,
    create_note_voucher,
    generate_from_recurring_template,
    next_frequency_date,
    voucher_should_affect_books,
    voucher_visible_in_day_book,
)


async def _seed_tenant(db, *, flags: dict | None = None) -> Tenant:
    code = f"AV{uuid.uuid4().hex[:8].upper()}"
    t = Tenant(
        name=f"Adv Voucher {code}",
        company_code=code[:18],
        tenant_type=TenantType.manufacturer,
        is_active=True,
        feature_flags=flags
        or {
            CREDIT_DEBIT_NOTE_ENABLED: True,
            MEMORANDUM_VOUCHER_ENABLED: True,
            OPTIONAL_VOUCHER_ENABLED: True,
            POST_DATED_VOUCHER_ENABLED: True,
            RECURRING_VOUCHER_ENABLED: True,
            VOUCHER_CLASS_ENABLED: True,
            STOCK_TRANSFER_VOUCHER_ENABLED: True,
        },
    )
    db.add(t)
    await db.flush()
    return t


async def _coa(db, tenant_id: int, number: str, name: str, *, normal: str = "debit") -> ChartOfAccount:
    slug = uuid.uuid4().hex[:8]
    grp = AccountGroup(
        tenant_id=tenant_id,
        name=f"G-{number}-{slug}",
        code=f"G{slug}"[:12],
        nature="Asset" if normal == "debit" else "Liability",
        system_code=f"AV_{slug}",
        default_normal_balance=normal,
        allow_posting=True,
    )
    db.add(grp)
    await db.flush()
    acct = ChartOfAccount(
        tenant_id=tenant_id,
        account_number=f"{number}-{slug}"[:32],
        name=name,
        group_id=grp.id,
        normal_balance=normal,
        balance=Decimal("0"),
        is_active=True,
    )
    db.add(acct)
    await db.flush()
    return acct


@pytest.mark.asyncio
async def test_voucher_should_affect_books_rules(db_session_integration):
    db = db_session_integration
    t = await _seed_tenant(db)
    memo = Voucher(
        tenant_id=t.id,
        voucher_number="M1",
        voucher_type="MEMORANDUM",
        voucher_date=date.today(),
        status="POSTED",
        is_memorandum=True,
        include_in_books=False,
    )
    opt = Voucher(
        tenant_id=t.id,
        voucher_number="O1",
        voucher_type="OPTIONAL",
        voucher_date=date.today(),
        status="POSTED",
        is_optional=True,
        include_in_books=False,
    )
    opt_in = Voucher(
        tenant_id=t.id,
        voucher_number="O2",
        voucher_type="OPTIONAL",
        voucher_date=date.today(),
        status="POSTED",
        is_optional=True,
        include_in_books=True,
    )
    pd = Voucher(
        tenant_id=t.id,
        voucher_number="PD1",
        voucher_type="JOURNAL",
        voucher_date=date.today() + timedelta(days=10),
        status="POSTED",
        is_post_dated=True,
        include_in_books=True,
    )
    db.add_all([memo, opt, opt_in, pd])
    await db.flush()

    assert voucher_should_affect_books(memo) is False
    assert voucher_should_affect_books(opt) is False
    assert voucher_should_affect_books(opt_in) is True
    assert voucher_should_affect_books(pd) is False
    assert voucher_visible_in_day_book(memo) is False
    assert voucher_visible_in_day_book(opt) is False
    assert voucher_visible_in_day_book(opt_in) is True
    assert voucher_visible_in_day_book(pd) is False


@pytest.mark.asyncio
async def test_credit_note_creates_bill_and_allocation(db_session_integration):
    db = db_session_integration
    t = await _seed_tenant(db)
    slug = uuid.uuid4().hex[:8]
    customer = Customer(tenant_id=t.id, customer_code=f"C{slug}"[:10], name=f"Buyer {slug}")
    db.add(customer)
    await db.flush()

    ar = await _coa(db, t.id, "AR", "Customer AR", normal="debit")
    sales = await _coa(db, t.id, "SR", "Sales Return", normal="debit")
    tax = await _coa(db, t.id, "GST", "GST Output", normal="credit")

    ledger = PartyLedger(
        tenant_id=t.id,
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
        tenant_id=t.id,
        party_ledger_id=ledger.id,
        bill_number=f"INV-{slug}"[:20],
        bill_date=date.today() - timedelta(days=5),
        bill_type="INVOICE",
        original_amount=Decimal("1180"),
        amount_type="DR",
        pending_amount=Decimal("1180"),
        settled_amount=Decimal("0"),
        status="PENDING",
        due_date=date.today() + timedelta(days=10),
    )
    db.add(original)
    await db.flush()

    voucher = await create_note_voucher(
        db,
        t.id,
        note_kind="CREDIT_NOTE",
        voucher_date=date.today(),
        description="Return",
        party_ledger_id=ledger.id,
        original_bill_id=original.id,
        amount=Decimal("1000"),
        revenue_or_purchase_account_id=sales.id,
        tax_account_id=tax.id,
        tax_amount=Decimal("180"),
    )
    await db.flush()

    assert voucher.voucher_type == "CREDIT_NOTE"
    lines = list((await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == voucher.id))).scalars().all())
    debits = sum(Decimal(str(ln.amount)) for ln in lines if ln.entry_type == "DEBIT")
    credits = sum(Decimal(str(ln.amount)) for ln in lines if ln.entry_type == "CREDIT")
    assert debits == credits
    assert debits == Decimal("1180.0000")

    note_bills = list(
        (
            await db.execute(
                select(PartyLedgerBill).where(
                    PartyLedgerBill.party_ledger_id == ledger.id,
                    PartyLedgerBill.bill_type == "CREDIT_NOTE",
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(note_bills) == 1
    await db.refresh(original)
    assert Decimal(str(original.pending_amount)) < Decimal("1180")


@pytest.mark.asyncio
async def test_memorandum_convert_and_optional_toggle(db_session_integration):
    db = db_session_integration
    t = await _seed_tenant(db)
    cash = await _coa(db, t.id, "CASH", "Cash", normal="debit")
    expense = await _coa(db, t.id, "EXP", "Expense", normal="debit")

    memo = Voucher(
        tenant_id=t.id,
        voucher_number="MEM-1",
        voucher_type="MEMORANDUM",
        voucher_date=date.today(),
        status="POSTED",
        is_memorandum=True,
        include_in_books=False,
        books_applied=False,
    )
    db.add(memo)
    await db.flush()
    db.add(
        VoucherLine(
            tenant_id=t.id,
            voucher_id=memo.id,
            account_id=expense.id,
            entry_type="DEBIT",
            amount=Decimal("50"),
            base_amount=Decimal("50"),
        )
    )
    db.add(
        VoucherLine(
            tenant_id=t.id,
            voucher_id=memo.id,
            account_id=cash.id,
            entry_type="CREDIT",
            amount=Decimal("50"),
            base_amount=Decimal("50"),
        )
    )
    await db.flush()

    assert voucher_should_affect_books(memo) is False
    converted = await convert_memorandum_to_regular(db, t.id, memo.id)
    assert converted.is_memorandum is False
    assert converted.voucher_type == "JOURNAL"
    assert converted.books_applied is True
    await db.flush()
    await db.refresh(cash)
    assert Decimal(str(cash.balance)) == Decimal("-50.0000")

    opt = Voucher(
        tenant_id=t.id,
        voucher_number="OPT-1",
        voucher_type="OPTIONAL",
        voucher_date=date.today(),
        status="POSTED",
        is_optional=True,
        include_in_books=False,
        books_applied=False,
    )
    db.add(opt)
    await db.flush()
    db.add(
        VoucherLine(
            tenant_id=t.id,
            voucher_id=opt.id,
            account_id=expense.id,
            entry_type="DEBIT",
            amount=Decimal("10"),
            base_amount=Decimal("10"),
        )
    )
    db.add(
        VoucherLine(
            tenant_id=t.id,
            voucher_id=opt.id,
            account_id=cash.id,
            entry_type="CREDIT",
            amount=Decimal("10"),
            base_amount=Decimal("10"),
        )
    )
    await db.flush()
    await convert_optional_to_books(db, t.id, opt.id)
    await db.refresh(opt)
    assert opt.include_in_books is True
    assert opt.books_applied is True


@pytest.mark.asyncio
async def test_post_dated_activation(db_session_integration):
    db = db_session_integration
    t = await _seed_tenant(db)
    cash = await _coa(db, t.id, "CASH2", "Cash", normal="debit")
    bank = await _coa(db, t.id, "BANK", "Bank", normal="debit")
    v = Voucher(
        tenant_id=t.id,
        voucher_number="PD-ACT",
        voucher_type="JOURNAL",
        voucher_date=date.today() - timedelta(days=1),
        status="POSTED",
        is_post_dated=True,
        include_in_books=True,
        books_applied=False,
    )
    db.add(v)
    await db.flush()
    db.add(
        VoucherLine(
            tenant_id=t.id,
            voucher_id=v.id,
            account_id=bank.id,
            entry_type="DEBIT",
            amount=Decimal("100"),
            base_amount=Decimal("100"),
        )
    )
    db.add(
        VoucherLine(
            tenant_id=t.id,
            voucher_id=v.id,
            account_id=cash.id,
            entry_type="CREDIT",
            amount=Decimal("100"),
            base_amount=Decimal("100"),
        )
    )
    await db.flush()

    ids = await activate_due_post_dated(db, t.id, as_of=date.today())
    assert v.id in ids
    await db.flush()
    await db.refresh(v)
    assert v.is_post_dated is False
    assert v.books_applied is True


@pytest.mark.asyncio
async def test_recurring_and_voucher_class(db_session_integration):
    db = db_session_integration
    t = await _seed_tenant(db)
    cash = await _coa(db, t.id, "C3", "Cash", normal="debit")
    sal = await _coa(db, t.id, "SAL", "Salary", normal="debit")

    vc = VoucherClass(
        tenant_id=t.id,
        name=f"Salary Payment {uuid.uuid4().hex[:6]}",
        voucher_type="PAYMENT",
        default_ledger_id=cash.id,
        default_narration="Monthly salary",
        line_templates=[
            {"account_id": sal.id, "entry_type": "DEBIT", "amount": "5000"},
            {"account_id": cash.id, "entry_type": "CREDIT", "amount": "5000"},
        ],
        auto_tax=False,
        auto_round_off=False,
        auto_bill_allocation=False,
        is_active=True,
    )
    db.add(vc)
    await db.flush()

    tpl = RecurringVoucherTemplate(
        tenant_id=t.id,
        name=f"Monthly salary {uuid.uuid4().hex[:6]}",
        voucher_type="PAYMENT",
        voucher_class_id=vc.id,
        frequency="MONTHLY",
        start_date=date.today() - timedelta(days=40),
        next_due_date=date.today(),
        voucher_template={
            "description": "Salary",
            "lines": [
                {"account_id": sal.id, "entry_type": "DEBIT", "amount": "5000"},
                {"account_id": cash.id, "entry_type": "CREDIT", "amount": "5000"},
            ],
        },
        generate_as_status="DRAFT",
        is_active=True,
    )
    db.add(tpl)
    await db.flush()

    voucher = await generate_from_recurring_template(db, t.id, tpl, as_of=date.today())
    assert voucher is not None
    assert voucher.source_module == "RECURRING"
    assert tpl.last_generated_date == date.today()
    assert tpl.next_due_date == next_frequency_date(date.today(), "MONTHLY")

    nxt = await generate_from_recurring_template(db, t.id, tpl, as_of=date.today())
    assert nxt is None
