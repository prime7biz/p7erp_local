"""P2 finance integrity: no bare REVERSED flip, manager-only reject, no double post,
one-sided bill amounts, off-book vouchers cannot be "reversed".

Run:
docker compose exec backend pytest tests/test_finance_p2_integrity.py -q
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
from app.database import get_db
from app.main import app
from app.models import User
from app.models.finance import AccountingPeriod, ChartOfAccount, Voucher, VoucherLine
from app.models.user import Role
from app.modules.finance.system_coa_seeding_service import seed_tenant_system_coa

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


async def _seed(db, *, status: str = "APPROVED", memorandum: bool = False):
    tenant, user, _ = await create_admin_tenant_with_user(db)
    await seed_tenant_system_coa(db, tenant.id)
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
    accts = list(
        (await db.execute(select(ChartOfAccount).where(ChartOfAccount.tenant_id == tenant.id).limit(2)))
        .scalars()
        .all()
    )
    v = Voucher(
        tenant_id=tenant.id,
        voucher_number=f"JV-{uuid.uuid4().hex[:6]}",
        voucher_type="JOURNAL",
        voucher_date=today,
        status=status,
        is_memorandum=memorandum,
        books_applied=False,
        created_by=user.id,
    )
    db.add(v)
    await db.flush()
    for acct, entry in ((accts[0], "DEBIT"), (accts[1], "CREDIT")):
        db.add(
            VoucherLine(
                tenant_id=tenant.id,
                voucher_id=v.id,
                account_id=acct.id,
                entry_type=entry,
                amount=Decimal("100"),
                base_amount=Decimal("100"),
            )
        )
    await db.flush()
    await db.commit()
    return tenant, user, v


@pytest.mark.asyncio
async def test_posted_voucher_cannot_be_flipped_to_reversed_by_status(db_session_integration):
    db = db_session_integration
    tenant, user, v = await _seed(db)
    _override(db, user, tenant)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            h = {"X-Tenant-Id": str(tenant.id)}
            r = await ac.post(f"/api/v1/finance/vouchers/{v.id}/post", headers=h, json={})
            assert r.status_code == 200, r.text
            again = await ac.post(f"/api/v1/finance/vouchers/{v.id}/post", headers=h, json={})
            assert again.status_code == 409, again.text
            flip = await ac.post(f"/api/v1/finance/vouchers/{v.id}/status", headers=h, json={"status": "REVERSED"})
            assert flip.status_code == 400, flip.text
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_non_manager_cannot_reject(db_session_integration):
    db = db_session_integration
    tenant, admin, v = await _seed(db, status="SUBMITTED")
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
    _override(db, clerk, tenant)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post(
                f"/api/v1/finance/vouchers/{v.id}/status",
                headers={"X-Tenant-Id": str(tenant.id)},
                json={"status": "REJECTED"},
            )
        assert r.status_code == 403, r.text
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_bill_from_voucher_uses_one_side(db_session_integration):
    db = db_session_integration
    tenant, user, v = await _seed(db, status="POSTED")
    _override(db, user, tenant)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post(
                f"/api/v1/finance/bills/auto-create-from-voucher/{v.id}",
                headers={"X-Tenant-Id": str(tenant.id)},
                json={"party_name": "Buyer A"},
            )
        assert r.status_code == 200, r.text
        assert Decimal(str(r.json()["amount"])) == Decimal("100")
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_memorandum_voucher_cannot_be_reversed(db_session_integration):
    db = db_session_integration
    tenant, user, v = await _seed(db, status="POSTED", memorandum=True)
    _override(db, user, tenant)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post(
                f"/api/v1/finance/vouchers/{v.id}/reverse",
                headers={"X-Tenant-Id": str(tenant.id)},
                json={"reason": "test"},
            )
        assert r.status_code == 400, r.text
    finally:
        app.dependency_overrides.clear()
