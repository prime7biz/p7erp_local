"""Phase 1a security: bootstrap lockdown, platform-admin JWT reject, password min length.

Run:
docker compose exec backend pytest tests/test_security_phase1a.py -q
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient
from app.common.jwt_compat import jwt

from app.common.auth import create_access_token, get_current_user
from app.config import get_settings
from app.database import get_db
from app.main import app
from app.models import Role, Tenant, User
from app.models.tenant import TenantType
from app.modules.admin.auth import ADMIN_AUDIENCE, ADMIN_TOKEN_TYPE
from app.modules.auth.legal_acceptance import CURRENT_LEGAL_ACCEPTANCE_VERSION


async def _seed_empty_tenant(db):
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"Sec1a {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"s1a{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    db.add(Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={}))
    db.add(Role(tenant_id=tenant.id, name="user", display_name="User", permissions={}))
    await db.flush()
    return tenant


@pytest.mark.asyncio
async def test_bootstrap_register_forbidden_in_production_without_key(db_session_integration):
    db = db_session_integration
    tenant = await _seed_empty_tenant(db)
    await db.commit()

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        with patch("app.modules.auth.router.get_settings") as mock_gs:
            settings = get_settings()
            # Force production-like env with empty bootstrap key.
            object.__setattr__(settings, "app_env", "production")
            object.__setattr__(settings, "bootstrap_registration_key", "")
            mock_gs.return_value = settings

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                response = await ac.post(
                    "/api/v1/auth/register",
                    json={
                        "tenant_id": tenant.id,
                        "email": f"{tenant.company_code.lower()}@example.com",
                        "username": f"u_{tenant.company_code.lower()}",
                        "password": "StrongPass123!",
                        "accepted_legal_terms": True,
                        "legal_acceptance_version": CURRENT_LEGAL_ACCEPTANCE_VERSION,
                    },
                )
        assert response.status_code == 403, response.text
        assert "bootstrap" in response.text.lower()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_register_password_min_length_rejected(db_session_integration):
    db = db_session_integration
    tenant = await _seed_empty_tenant(db)
    await db.commit()

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post(
                "/api/v1/auth/register",
                json={
                    "tenant_id": tenant.id,
                    "email": f"short_{tenant.company_code.lower()}@example.com",
                    "username": f"short_{tenant.company_code.lower()}",
                    "password": "short",
                    "accepted_legal_terms": True,
                    "legal_acceptance_version": CURRENT_LEGAL_ACCEPTANCE_VERSION,
                },
            )
        assert response.status_code == 422, response.text
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_platform_admin_jwt_rejected_on_internal_api(db_session_integration):
    db = db_session_integration
    slug = uuid.uuid4().hex[:8]
    tenant = Tenant(
        name=f"SecAdmin {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"sad{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        email=f"user_{slug}@example.com",
        username=f"user_{slug}",
        password_hash="x",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    await db.commit()

    settings = get_settings()
    # Craft a platform-admin style token whose sub collides with the staff user id.
    admin_token = jwt.encode(
        {
            "sub": str(user.id),
            "sid": 1,
            "aud": ADMIN_AUDIENCE,
            "typ": ADMIN_TOKEN_TYPE,
            "exp": datetime.utcnow() + timedelta(hours=1),
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.get(
                "/api/v1/auth/me",
                headers={"Authorization": f"Bearer {admin_token}", "X-Tenant-Id": str(tenant.id)},
            )
        assert response.status_code == 401, response.text
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_staff_jwt_still_accepted_on_me(db_session_integration):
    db = db_session_integration
    slug = uuid.uuid4().hex[:8]
    tenant = Tenant(
        name=f"SecStaff {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"sst{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="user", display_name="User", permissions={})
    db.add(role)
    await db.flush()
    from app.common.auth import hash_password

    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        email=f"staff_{slug}@example.com",
        username=f"staff_{slug}",
        password_hash=await hash_password("StrongPass123!"),
        is_active=True,
    )
    db.add(user)
    await db.flush()
    await db.commit()

    token = create_access_token(subject=user.id)

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.get(
                "/api/v1/auth/me",
                headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant.id)},
            )
        assert response.status_code == 200, response.text
        assert response.json().get("user_id") == user.id
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
