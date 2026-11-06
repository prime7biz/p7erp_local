"""Checkout endpoint: Lemon Squeezy client mocked (no external API)."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.common.auth import create_access_token
from app.database import get_db
from app.main import app
from app.models import LemonsqueezyCheckoutSession, PlatformPlan, Role, Tenant, TenantType, User


async def _seed_admin(db, slug: str) -> tuple[Tenant, User]:
    tenant = Tenant(
        name=f"LS Co {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"ls{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    admin_role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    db.add(admin_role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        email=f"admin_{slug}@example.com",
        username=f"adm_{slug}",
        password_hash="dummy",
        role_id=admin_role.id,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return tenant, user


def _token_for(user: User) -> str:
    return create_access_token(subject=user.id, session_version=int(user.auth_session_version or 0))


@pytest.mark.asyncio
async def test_checkout_returns_url_when_client_succeeds(db_session_integration, monkeypatch: pytest.MonkeyPatch):
    db = db_session_integration
    monkeypatch.setenv("LEMONSQUEEZY_API_KEY", "test_api_key")
    monkeypatch.setenv("LEMONSQUEEZY_STORE_ID", "1")
    from app.config import get_settings

    get_settings.cache_clear()

    slug = uuid.uuid4().hex[:10]
    tenant, user = await _seed_admin(db, slug)
    variant_id = str(900000000 + uuid.uuid4().int % 100000000)
    plan = PlatformPlan(
        name=f"LS Plan {slug}",
        code=f"ls-plan-{slug}",
        max_users=5,
        price_monthly_usd=0,
        lemonsqueezy_variant_id_monthly=variant_id,
    )
    db.add(plan)
    await db.commit()
    token = _token_for(user)

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        with patch(
            "app.modules.billing_lemonsqueezy.router.ls_client.create_checkout",
            new_callable=AsyncMock,
        ) as mock_co:
            mock_co.return_value = "https://example.lemonsqueezy.com/checkout/custom/abc"
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                resp = await ac.post(
                    "/api/v1/billing/lemonsqueezy/checkout",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "X-Tenant-Id": str(tenant.id),
                    },
                    json={"variant_id": variant_id},
                )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["checkout_url"] == "https://example.lemonsqueezy.com/checkout/custom/abc"
        mock_co.assert_awaited_once()

        sessions = (
            await db.execute(
                select(LemonsqueezyCheckoutSession).where(LemonsqueezyCheckoutSession.tenant_id == tenant.id)
            )
        ).scalars().all()
        assert len(sessions) == 1
        session = sessions[0]
        assert session.user_id == user.id
        assert session.variant_id == variant_id
        assert session.completed_at is None
        assert len(session.checkout_ref) >= 24

        kwargs = mock_co.await_args.kwargs
        assert kwargs["checkout_ref"] == session.checkout_ref
        assert kwargs["tenant_id"] == tenant.id
        assert kwargs["variant_id"] == variant_id
    finally:
        app.dependency_overrides.pop(get_db, None)
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_checkout_400_when_variant_not_a_known_plan(db_session_integration, monkeypatch: pytest.MonkeyPatch):
    db = db_session_integration
    monkeypatch.setenv("LEMONSQUEEZY_API_KEY", "test_api_key")
    monkeypatch.setenv("LEMONSQUEEZY_STORE_ID", "1")
    from app.config import get_settings

    get_settings.cache_clear()

    slug = uuid.uuid4().hex[:10]
    tenant, user = await _seed_admin(db, slug)
    await db.commit()
    token = _token_for(user)

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        with patch(
            "app.modules.billing_lemonsqueezy.router.ls_client.create_checkout",
            new_callable=AsyncMock,
        ) as mock_co:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                resp = await ac.post(
                    "/api/v1/billing/lemonsqueezy/checkout",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "X-Tenant-Id": str(tenant.id),
                    },
                    json={"variant_id": f"no-such-variant-{slug}"},
                )
        assert resp.status_code == 400, resp.text
        mock_co.assert_not_awaited()
        sessions = (
            await db.execute(
                select(LemonsqueezyCheckoutSession).where(LemonsqueezyCheckoutSession.tenant_id == tenant.id)
            )
        ).scalars().all()
        assert sessions == []
    finally:
        app.dependency_overrides.pop(get_db, None)
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_checkout_503_when_api_key_missing(db_session_integration, monkeypatch: pytest.MonkeyPatch):
    db = db_session_integration
    # Empty string overrides any value from backend/.env when Settings reloads.
    monkeypatch.setenv("LEMONSQUEEZY_API_KEY", "")
    monkeypatch.setenv("LEMONSQUEEZY_STORE_ID", "1")
    from app.config import get_settings

    get_settings.cache_clear()

    tenant, user = await _seed_admin(db, uuid.uuid4().hex[:10])
    await db.commit()
    token = _token_for(user)

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post(
                "/api/v1/billing/lemonsqueezy/checkout",
                headers={
                    "Authorization": f"Bearer {token}",
                    "X-Tenant-Id": str(tenant.id),
                },
                json={"variant_id": "12345"},
            )
        assert resp.status_code == 503
    finally:
        app.dependency_overrides.pop(get_db, None)
        get_settings.cache_clear()
