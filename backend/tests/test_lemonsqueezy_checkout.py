"""Checkout endpoint: Lemon Squeezy client mocked (no external API)."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from jose import jwt

from app.database import get_db
from app.main import app
from app.models import Role, Tenant, TenantType, User


@pytest.mark.asyncio
async def test_checkout_returns_url_when_client_succeeds(db_session_integration, monkeypatch: pytest.MonkeyPatch):
    db = db_session_integration
    monkeypatch.setenv("LEMONSQUEEZY_API_KEY", "test_api_key")
    monkeypatch.setenv("LEMONSQUEEZY_STORE_ID", "1")
    from app.config import get_settings

    get_settings.cache_clear()

    slug = "lscheckout01"
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
    await db.commit()

    from app.config import get_settings as gs

    settings = gs()
    token = jwt.encode(
        {"sub": str(user.id), "exp": 9999999999},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )

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
                    json={"variant_id": "12345"},
                )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["checkout_url"] == "https://example.lemonsqueezy.com/checkout/custom/abc"
        mock_co.assert_awaited_once()
    finally:
        app.dependency_overrides.pop(get_db, None)
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_checkout_503_when_api_key_missing(db_session_integration, monkeypatch: pytest.MonkeyPatch):
    db = db_session_integration
    monkeypatch.delenv("LEMONSQUEEZY_API_KEY", raising=False)
    monkeypatch.setenv("LEMONSQUEEZY_STORE_ID", "1")
    from app.config import get_settings

    get_settings.cache_clear()

    tenant = Tenant(
        name="LS No Key",
        tenant_type=TenantType.both,
        is_active=True,
        company_code="lsnokey01",
    )
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        email="nok@example.com",
        username="nok",
        password_hash="dummy",
        role_id=role.id,
        is_active=True,
    )
    db.add(user)
    await db.commit()

    from app.config import get_settings as gs

    settings = gs()
    token = jwt.encode(
        {"sub": str(user.id), "exp": 9999999999},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )

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
