"""Forgot-password endpoint should not 500 when SMTP/email fails.

Run:
docker compose exec backend pytest tests/test_auth_forgot_password_integration.py -q
"""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import get_db
from app.main import app
from app.models import Tenant, User
from app.models.tenant import TenantType
from app.models.user import Role


async def _seed_tenant_user(db):
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"Fp {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"fp{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"fp{slug}",
        email=f"fp{slug}@example.com",
        password_hash="x",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return tenant, user


@pytest.mark.asyncio
async def test_forgot_password_returns_200_when_email_send_fails(db_session_integration, monkeypatch):
    db = db_session_integration
    tenant, user = await _seed_tenant_user(db)
    await db.commit()

    async def _boom(*_a, **_kw):
        raise RuntimeError("SMTP unavailable (test)")

    monkeypatch.setattr("app.modules.auth.router.send_forgot_password_email", _boom)

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post(
                "/api/v1/auth/forgot-password",
                json={"email": user.email, "company_code": tenant.company_code},
            )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "message" in data
    finally:
        app.dependency_overrides.pop(get_db, None)
