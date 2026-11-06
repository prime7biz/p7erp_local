"""Memorandum / optional / post-dated vouchers enter the books once, through normal posting rules.

Run:
docker compose exec backend pytest tests/test_accounting_held_vouchers.py -q
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.common.tenant_feature_keys import MEMORANDUM_VOUCHER_ENABLED
from app.main import app
from app.models import User
from app.models.finance import AccountingPeriod, Voucher, VoucherLine
from app.models.user import Role
from app.modules.finance.advanced_voucher_service import activate_due_post_dated, convert_memorandum_to_regular
from app.modules.finance.auto_posting_service import AutoPostingLine, create_system_voucher

from tests.go_live_fixtures import create_admin_tenant_with_user
from tests.test_accounting_posting_integrity import _account, _override


async def _setup(db, *, period_open: bool = True):
    tenant, user, _ = await create_admin_tenant_with_user(db)
    today = date.today()
    db.add(
        AccountingPeriod(
            tenant_id=tenant.id,
            period_name=f"P{uuid.uuid4().hex[:4]}",
            start_date=today - timedelta(days=60),
            end_date=today + timedelta(days=60),
            is_closed=not period_open,
        )
    )
    expense = await _account(db, tenant.id, "Expense")
    cash = await _account(db, tenant.id, "Cash")
    await db.flush()
    return tenant, user, expense, cash


async def _posted_voucher(db, tenant, expense, cash, **flags) -> Voucher:
    v = Voucher(
        tenant_id=tenant.id,
        voucher_number=f"V-{uuid.uuid4().hex[:6]}",
        voucher_type=flags.pop("voucher_type", "JOURNAL"),
        voucher_date=flags.pop("voucher_date", date.today()),
        status="POSTED",
        books_applied=False,
        **flags,
    )
    db.add(v)
    await db.flush()
    db.add_all(
        [
            VoucherLine(tenant_id=tenant.id, voucher_id=v.id, account_id=expense.id, entry_type="DEBIT", amount=Decimal("75"), base_amount=Decimal("75")),
            VoucherLine(tenant_id=tenant.id, voucher_id=v.id, account_id=cash.id, entry_type="CREDIT", amount=Decimal("75"), base_amount=Decimal("75")),
        ]
    )
    await db.flush()
    return v


async def _bal(db, acct) -> Decimal:
    await db.refresh(acct)
    return Decimal(str(acct.balance))


@pytest.mark.asyncio
async def test_auto_posted_voucher_marks_books_applied_and_cannot_be_converted(db_session_integration):
    db = db_session_integration
    tenant, user, expense, cash = await _setup(db)
    v = await create_system_voucher(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        voucher_type="JOURNAL",
        voucher_date=date.today(),
        lines=[
            AutoPostingLine(entry_type="DEBIT", amount=Decimal("40"), account_id=expense.id),
            AutoPostingLine(entry_type="CREDIT", amount=Decimal("40"), account_id=cash.id),
        ],
        description="auto",
        source_module="TEST",
        auto_post=True,
    )
    assert v.status == "POSTED"
    assert v.books_applied is True
    assert await _bal(db, expense) == Decimal("40")

    with pytest.raises(HTTPException) as exc:
        await convert_memorandum_to_regular(db, tenant.id, v.id)
    assert exc.value.status_code == 400
    assert await _bal(db, expense) == Decimal("40")


@pytest.mark.asyncio
async def test_post_dated_activation_applies_once(db_session_integration):
    db = db_session_integration
    tenant, user, expense, cash = await _setup(db)
    v = await _posted_voucher(db, tenant, expense, cash, is_post_dated=True, voucher_date=date.today() - timedelta(days=1))

    assert v.id in await activate_due_post_dated(db, tenant.id)
    assert await activate_due_post_dated(db, tenant.id) == []
    await db.refresh(v)
    assert v.books_applied is True and v.is_post_dated is False
    assert await _bal(db, expense) == Decimal("75")
    assert await _bal(db, cash) == Decimal("-75")


@pytest.mark.asyncio
async def test_post_dated_activation_respects_closed_period(db_session_integration):
    db = db_session_integration
    tenant, user, expense, cash = await _setup(db, period_open=False)
    v = await _posted_voucher(db, tenant, expense, cash, is_post_dated=True, voucher_date=date.today() - timedelta(days=1))

    assert await activate_due_post_dated(db, tenant.id) == []
    await db.refresh(v)
    assert v.is_post_dated is True
    assert v.books_applied is False
    assert await _bal(db, expense) == Decimal("0")


@pytest.mark.asyncio
async def test_convert_memorandum_requires_manager(db_session_integration):
    db = db_session_integration
    tenant, admin, expense, cash = await _setup(db)
    tenant.feature_flags = {**(tenant.feature_flags or {}), MEMORANDUM_VOUCHER_ENABLED: True}
    memo = await _posted_voucher(db, tenant, expense, cash, voucher_type="MEMORANDUM", is_memorandum=True, include_in_books=False)
    role = Role(tenant_id=tenant.id, name="user", display_name="User", permissions={"*": True})
    db.add(role)
    await db.flush()
    clerk = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"clerk{uuid.uuid4().hex[:6]}",
        email=f"clerk{uuid.uuid4().hex[:6]}@example.com",
        password_hash="x",
        is_active=True,
    )
    db.add(clerk)
    await db.commit()

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            h = {"X-Tenant-Id": str(tenant.id)}
            _override(db, clerk, tenant)
            denied = await ac.post(f"/api/v1/finance/vouchers/{memo.id}/convert-memorandum", headers=h)
            assert denied.status_code == 403, denied.text
            _override(db, admin, tenant)
            ok = await ac.post(f"/api/v1/finance/vouchers/{memo.id}/convert-memorandum", headers=h)
            assert ok.status_code == 200, ok.text
            assert ok.json()["books_applied"] is True
            again = await ac.post(f"/api/v1/finance/vouchers/{memo.id}/convert-memorandum", headers=h)
            assert again.status_code == 400, again.text
    finally:
        app.dependency_overrides.clear()
    assert await _bal(db, expense) == Decimal("75")
