"""System vouchers keep money in Decimal and balance in both currencies (RC-03).

Run:
    docker compose exec backend pytest tests/test_system_voucher_decimal_integrity.py -q
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from app.models import AccountingPeriod, Voucher, VoucherLine
from app.modules.facility.gl_service import create_repayment_draft
from app.modules.finance.auto_posting_service import AutoPostingLine, create_system_voucher
from tests.go_live_fixtures import create_admin_tenant_with_user
from tests.test_accounting_posting_integrity import _account


async def _setup(db, *, open_period: bool = True):
    tenant, user, _ = await create_admin_tenant_with_user(db)
    if open_period:
        today = date.today()
        db.add(
            AccountingPeriod(
                tenant_id=tenant.id,
                period_name=f"P{uuid.uuid4().hex[:4]}",
                start_date=today - timedelta(days=30),
                end_date=today + timedelta(days=30),
                is_closed=False,
            )
        )
    a = await _account(db, tenant.id, "Bank")
    b = await _account(db, tenant.id, "Revenue", normal="credit")
    c = await _account(db, tenant.id, "Fees", normal="credit")
    await db.flush()
    return tenant, user, a, b, c


async def _lines(db, voucher_id: int) -> list[VoucherLine]:
    return list((await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == voucher_id))).scalars().all())


def _sum(lines, attr: str, side: str) -> Decimal:
    return sum((Decimal(getattr(x, attr)) for x in lines if x.entry_type == side), Decimal("0"))


async def _create(db, tenant, user, lines, **kw):
    return await create_system_voucher(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        voucher_type="JOURNAL",
        voucher_date=kw.pop("voucher_date", date.today()),
        lines=lines,
        description="decimal integrity",
        source_module="TEST_DECIMAL",
        source_module_ref=f"t:{uuid.uuid4().hex[:8]}",
        **kw,
    )


@pytest.mark.asyncio
async def test_fx_voucher_stores_exact_4dp_amounts_and_balances_in_base(db_session_integration):
    db = db_session_integration
    tenant, user, bank, rev, _fees = await _setup(db)
    v = await _create(
        db,
        tenant,
        user,
        [
            AutoPostingLine(entry_type="DEBIT", amount=Decimal("1234.5678"), account_id=bank.id),
            AutoPostingLine(entry_type="CREDIT", amount=Decimal("1234.5678"), account_id=rev.id),
        ],
        currency="USD",
        base_currency="BDT",
        exchange_rate=Decimal("117.123456"),
    )
    await db.flush()
    lines = await _lines(db, v.id)
    assert {Decimal(x.amount) for x in lines} == {Decimal("1234.5678")}
    # 1234.5678 * 117.123456 = 144596.84737... rounded half-up once to 4 dp
    assert {Decimal(x.base_amount) for x in lines} == {Decimal("144596.8474")}
    assert Decimal(v.exchange_rate) == Decimal("117.123456")
    assert _sum(lines, "amount", "DEBIT") == _sum(lines, "amount", "CREDIT")
    assert _sum(lines, "base_amount", "DEBIT") == _sum(lines, "base_amount", "CREDIT")


@pytest.mark.asyncio
async def test_float_input_is_read_through_str_not_binary(db_session_integration):
    db = db_session_integration
    tenant, user, bank, rev, _fees = await _setup(db)
    v = await _create(
        db,
        tenant,
        user,
        [
            AutoPostingLine(entry_type="DEBIT", amount=0.1 + 0.2, account_id=bank.id),  # 0.30000000000000004
            AutoPostingLine(entry_type="CREDIT", amount=Decimal("0.3"), account_id=rev.id),
        ],
        exchange_rate=1.0,
    )
    await db.flush()
    assert {Decimal(x.amount) for x in await _lines(db, v.id)} == {Decimal("0.3000")}


@pytest.mark.asyncio
async def test_rejects_when_base_currency_does_not_balance_after_rounding(db_session_integration):
    db = db_session_integration
    tenant, user, bank, rev, fees = await _setup(db)
    before = (await db.execute(select(func.count()).select_from(Voucher).where(Voucher.tenant_id == tenant.id))).scalar_one()
    with pytest.raises(HTTPException) as exc:
        await _create(
            db,
            tenant,
            user,
            [
                AutoPostingLine(entry_type="DEBIT", amount=Decimal("1.0000"), account_id=bank.id),
                AutoPostingLine(entry_type="CREDIT", amount=Decimal("0.3333"), account_id=rev.id),
                AutoPostingLine(entry_type="CREDIT", amount=Decimal("0.3333"), account_id=fees.id),
                AutoPostingLine(entry_type="CREDIT", amount=Decimal("0.3334"), account_id=fees.id),
            ],
            currency="USD",
            base_currency="BDT",
            exchange_rate=Decimal("1.5"),  # base: 1.5000 vs 0.5000 + 0.5000 + 0.5001 = 1.5001
        )
    assert exc.value.status_code == 400
    assert "base currency" in exc.value.detail
    after = (await db.execute(select(func.count()).select_from(Voucher).where(Voucher.tenant_id == tenant.id))).scalar_one()
    assert after == before, "a rejected voucher must not be written (no balancing line invented)"


@pytest.mark.asyncio
async def test_rejects_when_rounded_transaction_lines_do_not_balance(db_session_integration):
    db = db_session_integration
    tenant, user, bank, rev, fees = await _setup(db)
    with pytest.raises(HTTPException) as exc:
        await _create(
            db,
            tenant,
            user,
            [
                AutoPostingLine(entry_type="DEBIT", amount=Decimal("0.33333"), account_id=bank.id),
                AutoPostingLine(entry_type="DEBIT", amount=Decimal("0.33333"), account_id=bank.id),
                AutoPostingLine(entry_type="DEBIT", amount=Decimal("0.33334"), account_id=bank.id),
                AutoPostingLine(entry_type="CREDIT", amount=Decimal("1"), account_id=rev.id),
            ],
        )
    assert exc.value.status_code == 400
    assert "not balanced" in exc.value.detail


@pytest.mark.asyncio
async def test_rejects_non_positive_rate(db_session_integration):
    db = db_session_integration
    tenant, user, bank, rev, _fees = await _setup(db)
    with pytest.raises(HTTPException) as exc:
        await _create(
            db,
            tenant,
            user,
            [
                AutoPostingLine(entry_type="DEBIT", amount=Decimal("1"), account_id=bank.id),
                AutoPostingLine(entry_type="CREDIT", amount=Decimal("1"), account_id=rev.id),
            ],
            exchange_rate=Decimal("0"),
        )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_auto_post_needs_an_open_period(db_session_integration):
    db = db_session_integration
    tenant, user, bank, rev, _fees = await _setup(db, open_period=False)
    with pytest.raises(HTTPException) as exc:
        await _create(
            db,
            tenant,
            user,
            [
                AutoPostingLine(entry_type="DEBIT", amount=Decimal("10"), account_id=bank.id),
                AutoPostingLine(entry_type="CREDIT", amount=Decimal("10"), account_id=rev.id),
            ],
            auto_post=True,
        )
    assert exc.value.status_code == 400
    assert "period" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_another_tenants_account_is_refused(db_session_integration):
    db = db_session_integration
    tenant, user, bank, _rev, _fees = await _setup(db)
    other, _ou, _o1, other_rev, _o3 = await _setup(db)
    with pytest.raises(HTTPException) as exc:
        await _create(
            db,
            tenant,
            user,
            [
                AutoPostingLine(entry_type="DEBIT", amount=Decimal("5"), account_id=bank.id),
                AutoPostingLine(entry_type="CREDIT", amount=Decimal("5"), account_id=other_rev.id),
            ],
        )
    assert exc.value.status_code == 400
    assert "not found" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_facility_repayment_draft_always_balances(db_session_integration):
    """Principal and interest are rounded first and the bank credit is built from them."""
    from app.models import VoucherType
    from tests.test_accounting_facility import _seed

    db = db_session_integration
    tenant, user, _fac, util, liability, payable, bank = await _seed(db)
    db.add(VoucherType(tenant_id=tenant.id, code="PAYMENT", name="Payment", is_active=True))
    await db.flush()
    v = await create_repayment_draft(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        util_id=util.id,
        schedule_line_id=999999,
        principal_part=Decimal("10.005"),
        interest_part=Decimal("5.005"),
        liability_account_id=liability.id,
        interest_payable_account_id=payable.id,
        bank_account_id=bank.id,
        voucher_date=date.today(),
    )
    lines = await _lines(db, v.id)
    assert _sum(lines, "amount", "DEBIT") == _sum(lines, "amount", "CREDIT") == Decimal("15.02")
    assert _sum(lines, "base_amount", "DEBIT") == _sum(lines, "base_amount", "CREDIT") == Decimal("15.02")
