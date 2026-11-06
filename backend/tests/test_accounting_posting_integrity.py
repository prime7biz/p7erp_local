"""Posting integrity: debits must equal credits, and FX vouchers post base-currency amounts.

Run:
docker compose exec backend pytest tests/test_accounting_posting_integrity.py -q
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.common.tenant_feature_keys import MEMORANDUM_VOUCHER_ENABLED
from app.main import app
from app.models.advanced_vouchers import RecurringVoucherTemplate
from app.models.finance import AccountGroup, AccountingPeriod, ChartOfAccount, Voucher, VoucherLine
from app.modules.finance.advanced_voucher_service import generate_from_recurring_template
from app.modules.finance.posting_core import assert_dict_lines_balanced, voucher_balance_basis

from tests.go_live_fixtures import create_admin_tenant_with_user


def _override(db, user, tenant):
    async def override_db():
        yield db

    async def override_user():
        return user

    async def override_tenant():
        return tenant

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant


async def _account(db, tenant_id: int, name: str, *, normal: str = "debit") -> ChartOfAccount:
    slug = uuid.uuid4().hex[:8]
    grp = AccountGroup(
        tenant_id=tenant_id,
        name=f"G-{name}-{slug}",
        code=f"G{slug}"[:12],
        nature="Asset" if normal == "debit" else "Liability",
        default_normal_balance=normal,
        allow_posting=True,
    )
    db.add(grp)
    await db.flush()
    acct = ChartOfAccount(
        tenant_id=tenant_id,
        account_number=f"T-{slug}",
        name=f"{name} {slug}",
        group_id=grp.id,
        normal_balance=normal,
        balance=Decimal("0"),
        is_active=True,
    )
    db.add(acct)
    await db.flush()
    return acct


async def _setup(db):
    tenant, user, _ = await create_admin_tenant_with_user(db)
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
    receivable = await _account(db, tenant.id, "Receivable")
    income = await _account(db, tenant.id, "Income", normal="credit")
    await db.flush()
    return tenant, user, receivable, income


async def _voucher(db, tenant, user, lines, *, currency="BDT", rate="1") -> Voucher:
    v = Voucher(
        tenant_id=tenant.id,
        voucher_number=f"JV-{uuid.uuid4().hex[:6]}",
        voucher_type="JOURNAL",
        voucher_date=date.today(),
        status="APPROVED",
        description="posting integrity test",
        currency=currency,
        base_currency="BDT",
        exchange_rate=Decimal(rate),
        books_applied=False,
        created_by=user.id,
    )
    db.add(v)
    await db.flush()
    for account_id, entry, amount, base in lines:
        db.add(
            VoucherLine(
                tenant_id=tenant.id,
                voucher_id=v.id,
                account_id=account_id,
                entry_type=entry,
                amount=Decimal(amount),
                base_amount=Decimal(base),
                currency=currency,
                exchange_rate=Decimal(rate),
            )
        )
    await db.flush()
    await db.commit()
    return v


@pytest.mark.asyncio
async def test_unbalanced_voucher_cannot_be_posted(db_session_integration):
    db = db_session_integration
    tenant, user, receivable, income = await _setup(db)
    v = await _voucher(
        db,
        tenant,
        user,
        [(receivable.id, "DEBIT", "100", "100"), (income.id, "CREDIT", "90", "90")],
    )
    _override(db, user, tenant)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post(f"/api/v1/finance/vouchers/{v.id}/post", headers={"X-Tenant-Id": str(tenant.id)}, json={})
        assert r.status_code == 400, r.text
        assert "not balanced" in r.text
    finally:
        app.dependency_overrides.clear()
    await db.refresh(receivable)
    await db.refresh(income)
    assert Decimal(str(receivable.balance)) == Decimal("0")
    assert Decimal(str(income.balance)) == Decimal("0")


@pytest.mark.asyncio
async def test_fx_voucher_posts_base_amounts_and_cancel_restores(db_session_integration):
    db = db_session_integration
    tenant, user, receivable, income = await _setup(db)
    # 100 USD at 110 = 11,000 BDT
    v = await _voucher(
        db,
        tenant,
        user,
        [(receivable.id, "DEBIT", "100", "11000"), (income.id, "CREDIT", "100", "11000")],
        currency="USD",
        rate="110",
    )
    _override(db, user, tenant)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            h = {"X-Tenant-Id": str(tenant.id)}
            r = await ac.post(f"/api/v1/finance/vouchers/{v.id}/post", headers=h, json={})
            assert r.status_code == 200, r.text
            await db.refresh(receivable)
            await db.refresh(income)
            assert Decimal(str(receivable.balance)) == Decimal("11000")
            assert Decimal(str(income.balance)) == Decimal("11000")

            tb = await ac.get(f"/api/v1/finance/reports/trial-balance?account_id={receivable.id}", headers=h)
            assert tb.status_code == 200, tb.text
            assert tb.json()["rows"][0]["debit"] == 11000.0

            # Response keeps the transaction amount unchanged.
            body = r.json()
            assert any(Decimal(str(ln["amount"])) == Decimal("100") for ln in body["lines"])

            c = await ac.post(f"/api/v1/finance/vouchers/{v.id}/cancel-posting", headers=h)
            assert c.status_code == 200, c.text
        await db.refresh(receivable)
        await db.refresh(income)
        assert Decimal(str(receivable.balance)) == Decimal("0")
        assert Decimal(str(income.balance)) == Decimal("0")
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_fx_voucher_reverse_nets_to_zero(db_session_integration):
    db = db_session_integration
    tenant, user, receivable, income = await _setup(db)
    v = await _voucher(
        db,
        tenant,
        user,
        [(receivable.id, "DEBIT", "50", "5500"), (income.id, "CREDIT", "50", "5500")],
        currency="USD",
        rate="110",
    )
    _override(db, user, tenant)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            h = {"X-Tenant-Id": str(tenant.id)}
            assert (await ac.post(f"/api/v1/finance/vouchers/{v.id}/post", headers=h, json={})).status_code == 200
            r = await ac.post(f"/api/v1/finance/vouchers/{v.id}/reverse", headers=h, json={"reason": "test"})
            assert r.status_code == 200, r.text
    finally:
        app.dependency_overrides.clear()
    await db.refresh(receivable)
    await db.refresh(income)
    assert Decimal(str(receivable.balance)) == Decimal("0")
    assert Decimal(str(income.balance)) == Decimal("0")


@pytest.mark.asyncio
async def test_legacy_posted_voucher_cancel_uses_original_amounts(db_session_integration):
    """A voucher posted before the base-currency fix (no basis marker) is undone with `amount`."""
    db = db_session_integration
    tenant, user, receivable, income = await _setup(db)
    v = await _voucher(
        db,
        tenant,
        user,
        [(receivable.id, "DEBIT", "100", "11000"), (income.id, "CREDIT", "100", "11000")],
        currency="USD",
        rate="110",
    )
    # Simulate the old posting: status POSTED, balances moved by the transaction amount.
    v.status = "POSTED"
    v.books_applied = True
    receivable.balance = Decimal("100")
    income.balance = Decimal("100")
    await db.commit()
    assert voucher_balance_basis(v) == "amount"
    _override(db, user, tenant)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            c = await ac.post(f"/api/v1/finance/vouchers/{v.id}/cancel-posting", headers={"X-Tenant-Id": str(tenant.id)})
            assert c.status_code == 200, c.text
    finally:
        app.dependency_overrides.clear()
    await db.refresh(receivable)
    await db.refresh(income)
    assert Decimal(str(receivable.balance)) == Decimal("0")
    assert Decimal(str(income.balance)) == Decimal("0")


def test_dict_lines_balance_check():
    assert_dict_lines_balanced(
        [{"entry_type": "DEBIT", "amount": "10"}, {"entry_type": "CREDIT", "amount": "10.00"}]
    )
    with pytest.raises(HTTPException) as exc:
        assert_dict_lines_balanced(
            [{"entry_type": "DEBIT", "amount": "10"}, {"entry_type": "CREDIT", "amount": "9"}]
        )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_unbalanced_recurring_template_is_rejected(db_session_integration):
    db = db_session_integration
    tenant, user, receivable, income = await _setup(db)
    tpl = RecurringVoucherTemplate(
        tenant_id=tenant.id,
        name=f"Bad tpl {uuid.uuid4().hex[:6]}",
        voucher_type="JOURNAL",
        frequency="MONTHLY",
        start_date=date.today(),
        next_due_date=date.today(),
        voucher_template={
            "lines": [
                {"account_id": receivable.id, "entry_type": "DEBIT", "amount": "500"},
                {"account_id": income.id, "entry_type": "CREDIT", "amount": "400"},
            ]
        },
        generate_as_status="DRAFT",
        is_active=True,
    )
    db.add(tpl)
    await db.flush()
    with pytest.raises(HTTPException) as exc:
        await generate_from_recurring_template(db, tenant.id, tpl, as_of=date.today())
    assert exc.value.status_code == 400

    tenant.feature_flags = {**(tenant.feature_flags or {}), MEMORANDUM_VOUCHER_ENABLED: True}
    await db.commit()
    _override(db, user, tenant)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post(
                "/api/v1/finance/special-vouchers",
                headers={"X-Tenant-Id": str(tenant.id)},
                json={
                    "voucher_type": "MEMORANDUM",
                    "voucher_date": date.today().isoformat(),
                    "lines": [
                        {"account_id": receivable.id, "entry_type": "DEBIT", "amount": "10"},
                        {"account_id": income.id, "entry_type": "CREDIT", "amount": "7"},
                    ],
                },
            )
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 400, r.text
    assert "not balanced" in r.text
