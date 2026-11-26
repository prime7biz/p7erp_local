"""Phase 3: finance voucher class gates under user_authority_classes_v1.

Run: docker compose exec backend pytest tests/test_authority_voucher_workflow.py -q
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import create_access_token, hash_password
from app.common.authority.constants import (
    AUTHORITY_CLASS_1,
    AUTHORITY_CLASS_2,
    AUTHORITY_CLASS_3,
    AUTHORITY_CLASS_4,
    AUTHORITY_SUPER,
    CLASS1_APPROVAL_APPROVED,
    CLASS1_APPROVAL_PENDING,
    CLASS1_APPROVAL_REJECTED,
)
from app.common.business_date import today_local
from app.common.tenant_feature_keys import USER_AUTHORITY_CLASSES_V1
from app.database import get_db
from app.main import app
from app.models import Role, Tenant, User
from app.models.finance import AccountGroup, AccountingPeriod, ChartOfAccount
from app.models.tenant import TenantType
from app.models.user_authority import UserModuleGrant


async def _seed_flagged_tenant(db):
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"VW {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"VW{slug}"[:18].upper(),
        feature_flags={USER_AUTHORITY_CLASSES_V1: True},
    )
    db.add(tenant)
    await db.flush()
    admin_role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    user_role = Role(tenant_id=tenant.id, name="user", display_name="User", permissions={})
    db.add_all([admin_role, user_role])
    await db.flush()

    async def _user(email_prefix: str, cls: str, *, super_admin: bool = False) -> User:
        u = User(
            tenant_id=tenant.id,
            role_id=admin_role.id if cls in {AUTHORITY_SUPER, AUTHORITY_CLASS_1} else user_role.id,
            email=f"{email_prefix}_{slug}@example.com",
            username=f"{email_prefix}_{slug}",
            password_hash=await hash_password("StrongPass123!"),
            is_active=True,
            authority_class=cls,
            is_tenant_super_admin=super_admin,
        )
        db.add(u)
        await db.flush()
        if not super_admin:
            db.add(UserModuleGrant(tenant_id=tenant.id, user_id=u.id, module_code="finance"))
            await db.flush()
        return u

    super_u = await _user("super", AUTHORITY_SUPER, super_admin=True)
    c1 = await _user("c1", AUTHORITY_CLASS_1)
    c1b = await _user("c1b", AUTHORITY_CLASS_1)
    c2 = await _user("c2", AUTHORITY_CLASS_2)
    c3 = await _user("c3", AUTHORITY_CLASS_3)
    c4 = await _user("c4", AUTHORITY_CLASS_4)

    today = date.today()
    db.add(
        AccountingPeriod(
            tenant_id=tenant.id,
            period_name="FY",
            start_date=date(today.year, 1, 1),
            end_date=date(today.year, 12, 31),
            is_closed=False,
        )
    )
    exp = AccountGroup(tenant_id=tenant.id, name="Exp", code=f"E{slug[:6]}", nature="Expense")
    asset = AccountGroup(tenant_id=tenant.id, name="CashG", code=f"C{slug[:6]}", nature="Asset")
    db.add_all([exp, asset])
    await db.flush()
    rent = ChartOfAccount(
        tenant_id=tenant.id, account_number=f"R{slug[:6]}", name="Rent", group_id=exp.id, normal_balance="debit"
    )
    cash = ChartOfAccount(
        tenant_id=tenant.id, account_number=f"A{slug[:6]}", name="Cash", group_id=asset.id, normal_balance="debit"
    )
    db.add_all([rent, cash])
    await db.flush()
    return tenant, {"super": super_u, "c1": c1, "c1b": c1b, "c2": c2, "c3": c3, "c4": c4}, rent, cash


def _headers(user: User, tenant: Tenant) -> dict[str, str]:
    token = create_access_token(user.id, tenant_id=tenant.id, session_version=user.auth_session_version)
    return {"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant.id)}


def _voucher_body(rent_id: int, cash_id: int, voucher_date: date | None = None):
    return {
        "voucher_type": "JOURNAL",
        # Business "today" (tenant/app timezone, Asia/Dhaka by default), the same clock the voucher
        # workflow uses. date.today() is UTC on CI and flips to "yesterday" after 18:00 UTC.
        "voucher_date": (voucher_date or today_local()).isoformat(),
        "description": "Authority workflow test",
        "lines": [
            {"account_id": rent_id, "entry_type": "DEBIT", "amount": "50"},
            {"account_id": cash_id, "entry_type": "CREDIT", "amount": "50"},
        ],
    }


@pytest.mark.asyncio
async def test_flag_off_unchanged_manager_path(db_session_integration):
    """Acceptance #1 / #13 neighbour: without authority flag, direct-post still gated by its own flag."""
    db = db_session_integration
    slug = uuid.uuid4().hex[:8]
    tenant = Tenant(
        name=f"Off {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"OF{slug}"[:18].upper(),
        feature_flags={},
    )
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        email=f"off_{slug}@example.com",
        username=f"off_{slug}",
        password_hash=await hash_password("StrongPass123!"),
        is_active=True,
    )
    db.add(user)
    await db.flush()

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                "/api/v1/finance/vouchers/1/direct-post",
                headers=_headers(user, tenant),
            )
        # Flag off for authority; direct_post_vouchers also off → 404
        assert res.status_code == 404
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_direct_post_blocked_when_authority_on(db_session_integration):
    db = db_session_integration
    tenant, users, rent, cash = await _seed_flagged_tenant(db)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            created = await client.post(
                "/api/v1/finance/vouchers",
                headers=_headers(users["c4"], tenant),
                json=_voucher_body(rent.id, cash.id),
            )
            assert created.status_code == 200, created.text
            vid = created.json()["id"]
            res = await client.post(
                f"/api/v1/finance/vouchers/{vid}/direct-post",
                headers=_headers(users["c1"], tenant),
            )
        assert res.status_code == 409
        assert "authority" in res.json()["detail"].lower()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_same_day_recommend_posts_pending_class1(db_session_integration):
    db = db_session_integration
    tenant, users, rent, cash = await _seed_flagged_tenant(db)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            created = await client.post(
                "/api/v1/finance/vouchers",
                headers=_headers(users["c4"], tenant),
                json=_voucher_body(rent.id, cash.id),
            )
            assert created.status_code == 200, created.text
            vid = created.json()["id"]
            assert (
                await client.post(
                    f"/api/v1/finance/vouchers/{vid}/status",
                    headers=_headers(users["c4"], tenant),
                    json={"status": "SUBMITTED"},
                )
            ).status_code == 200
            assert (
                await client.post(
                    f"/api/v1/finance/vouchers/{vid}/status",
                    headers=_headers(users["c3"], tenant),
                    json={"status": "CHECKED"},
                )
            ).status_code == 200
            # Same person cannot recommend
            sod = await client.post(
                f"/api/v1/finance/vouchers/{vid}/status",
                headers=_headers(users["c3"], tenant),
                json={"status": "RECOMMENDED"},
            )
            assert sod.status_code == 403
            rec = await client.post(
                f"/api/v1/finance/vouchers/{vid}/status",
                headers=_headers(users["c2"], tenant),
                json={"status": "RECOMMENDED"},
            )
            assert rec.status_code == 200, rec.text
            body = rec.json()
            assert body["status"] == "POSTED"
            assert body["class1_approval_status"] == CLASS1_APPROVAL_PENDING
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_class1_direct_and_other_class1_approves(db_session_integration):
    db = db_session_integration
    tenant, users, rent, cash = await _seed_flagged_tenant(db)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            created = await client.post(
                "/api/v1/finance/vouchers",
                headers=_headers(users["c1"], tenant),
                json=_voucher_body(rent.id, cash.id),
            )
            assert created.status_code == 200, created.text
            vid = created.json()["id"]
            posted = await client.post(
                f"/api/v1/finance/vouchers/{vid}/status",
                headers=_headers(users["c1"], tenant),
                json={"status": "POSTED", "reason": "Class 1 direct"},
            )
            assert posted.status_code == 200, posted.text
            assert posted.json()["status"] == "POSTED"
            assert posted.json()["class1_approval_status"] == CLASS1_APPROVAL_PENDING
            # Creator cannot self-ratify
            self_app = await client.post(
                f"/api/v1/finance/vouchers/{vid}/class1-approve",
                headers=_headers(users["c1"], tenant),
                json={},
            )
            assert self_app.status_code == 403
            ok = await client.post(
                f"/api/v1/finance/vouchers/{vid}/class1-approve",
                headers=_headers(users["c1b"], tenant),
                json={"reason": "Reviewed"},
            )
            assert ok.status_code == 200, ok.text
            assert ok.json()["class1_approval_status"] == CLASS1_APPROVAL_APPROVED
            # Idempotent second approve
            again = await client.post(
                f"/api/v1/finance/vouchers/{vid}/class1-approve",
                headers=_headers(users["c1b"], tenant),
                json={},
            )
            assert again.status_code == 409
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_past_dated_needs_class1_before_post(db_session_integration):
    db = db_session_integration
    tenant, users, rent, cash = await _seed_flagged_tenant(db)
    past = date.today() - timedelta(days=2)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            created = await client.post(
                "/api/v1/finance/vouchers",
                headers=_headers(users["c4"], tenant),
                json=_voucher_body(rent.id, cash.id, past),
            )
            assert created.status_code == 200, created.text
            vid = created.json()["id"]
            for actor, st in (
                (users["c4"], "SUBMITTED"),
                (users["c3"], "CHECKED"),
                (users["c2"], "RECOMMENDED"),
            ):
                r = await client.post(
                    f"/api/v1/finance/vouchers/{vid}/status",
                    headers=_headers(actor, tenant),
                    json={"status": st},
                )
                assert r.status_code == 200, r.text
            # Recommend must NOT auto-post past-dated
            assert (await client.get(f"/api/v1/finance/vouchers/{vid}", headers=_headers(users["c1"], tenant))).json()[
                "status"
            ] == "RECOMMENDED"
            # Class 2 cannot approve
            bad = await client.post(
                f"/api/v1/finance/vouchers/{vid}/status",
                headers=_headers(users["c2"], tenant),
                json={"status": "APPROVED"},
            )
            assert bad.status_code == 403
            # Creator Class1 cannot approve past own entry if they created - use c1 who didn't create
            appr = await client.post(
                f"/api/v1/finance/vouchers/{vid}/status",
                headers=_headers(users["c1"], tenant),
                json={"status": "APPROVED"},
            )
            assert appr.status_code == 200, appr.text
            body = appr.json()
            assert body["status"] == "POSTED"
            assert body["class1_approval_status"] == CLASS1_APPROVAL_APPROVED
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_class4_cannot_check(db_session_integration):
    db = db_session_integration
    tenant, users, rent, cash = await _seed_flagged_tenant(db)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            vid = (
                await client.post(
                    "/api/v1/finance/vouchers",
                    headers=_headers(users["c4"], tenant),
                    json=_voucher_body(rent.id, cash.id),
                )
            ).json()["id"]
            await client.post(
                f"/api/v1/finance/vouchers/{vid}/status",
                headers=_headers(users["c4"], tenant),
                json={"status": "SUBMITTED"},
            )
            denied = await client.post(
                f"/api/v1/finance/vouchers/{vid}/status",
                headers=_headers(users["c4"], tenant),
                json={"status": "CHECKED"},
            )
        assert denied.status_code == 403
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_class1_poster_cannot_self_ratify(db_session_integration):
    """F-01: Class 1 who direct-posts cannot also Class1-approve the same voucher."""
    db = db_session_integration
    tenant, users, rent, cash = await _seed_flagged_tenant(db)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # c4 creates; c1 posts (not creator) then must not ratify
            vid = (
                await client.post(
                    "/api/v1/finance/vouchers",
                    headers=_headers(users["c4"], tenant),
                    json=_voucher_body(rent.id, cash.id),
                )
            ).json()["id"]
            posted = await client.post(
                f"/api/v1/finance/vouchers/{vid}/status",
                headers=_headers(users["c1"], tenant),
                json={"status": "POSTED", "reason": "Class 1 direct"},
            )
            assert posted.status_code == 200, posted.text
            denied = await client.post(
                f"/api/v1/finance/vouchers/{vid}/class1-approve",
                headers=_headers(users["c1"], tenant),
                json={},
            )
            assert denied.status_code == 403
            ok = await client.post(
                f"/api/v1/finance/vouchers/{vid}/class1-approve",
                headers=_headers(users["c1b"], tenant),
                json={},
            )
            assert ok.status_code == 200, ok.text
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_class1_reject_creates_reversal(db_session_integration):
    db = db_session_integration
    tenant, users, rent, cash = await _seed_flagged_tenant(db)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            vid = (
                await client.post(
                    "/api/v1/finance/vouchers",
                    headers=_headers(users["c1"], tenant),
                    json=_voucher_body(rent.id, cash.id),
                )
            ).json()["id"]
            await client.post(
                f"/api/v1/finance/vouchers/{vid}/status",
                headers=_headers(users["c1"], tenant),
                json={"status": "POSTED"},
            )
            rej = await client.post(
                f"/api/v1/finance/vouchers/{vid}/class1-reject",
                headers=_headers(users["c1b"], tenant),
                json={"reason": "Wrong amount"},
            )
            assert rej.status_code == 200, rej.text
            body = rej.json()
            assert body["class1_approval_status"] == CLASS1_APPROVAL_REJECTED
            assert body["status"] == "REVERSED"
            assert body["reversed_by_voucher_id"] is not None
            # Second reject blocked
            again = await client.post(
                f"/api/v1/finance/vouchers/{vid}/class1-reject",
                headers=_headers(users["c1b"], tenant),
                json={"reason": "again"},
            )
            assert again.status_code in (400, 409)
    finally:
        app.dependency_overrides.pop(get_db, None)
