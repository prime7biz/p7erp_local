"""Strict internal login: admin must use login_as admin; staff must not use admin.

Run:
docker compose exec backend pytest tests/test_auth_login_role_enforcement.py -q
"""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import hash_password
from app.database import get_db
from app.main import app
from app.models import Role, Tenant, User
from app.models.tenant import TenantType


async def _seed_tenant_with_users(db):
    slug = uuid.uuid4().hex[:10]
    cc = f"lr{slug}"[:18]
    tenant = Tenant(
        name=f"Role Login {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=cc,
    )
    db.add(tenant)
    await db.flush()
    admin_role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    staff_role = Role(tenant_id=tenant.id, name="user", display_name="User", permissions={})
    db.add(admin_role)
    db.add(staff_role)
    await db.flush()
    pwd = await hash_password("TestLoginRole123!")
    admin_user = User(
        tenant_id=tenant.id,
        role_id=admin_role.id,
        email=f"admin_{slug}@example.com",
        password_hash=pwd,
        is_active=True,
    )
    staff_user = User(
        tenant_id=tenant.id,
        role_id=staff_role.id,
        email=f"staff_{slug}@example.com",
        password_hash=pwd,
        is_active=True,
    )
    db.add(admin_user)
    db.add(staff_user)
    await db.commit()
    return tenant, admin_user, staff_user, "TestLoginRole123!"


@pytest.mark.asyncio
async def test_login_admin_must_use_tenant_admin_option(db_session_integration):
    db = db_session_integration
    tenant, admin_user, _staff_user, password = await _seed_tenant_with_users(db)

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post(
                "/api/v1/auth/login",
                json={
                    "company_code": tenant.company_code,
                    "email": admin_user.email,
                    "password": password,
                    "login_as": "staff",
                },
            )
        assert r.status_code == 403, r.text
        body = r.json()
        assert "detail" in body
        assert "Tenant admin" in body["detail"]
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_login_staff_cannot_use_admin_option(db_session_integration):
    db = db_session_integration
    tenant, _admin_user, staff_user, password = await _seed_tenant_with_users(db)

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post(
                "/api/v1/auth/login",
                json={
                    "company_code": tenant.company_code,
                    "email": staff_user.email,
                    "password": password,
                    "login_as": "admin",
                },
            )
        assert r.status_code == 403, r.text
        body = r.json()
        assert "detail" in body
        assert "admin privileges" in body["detail"].lower()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_login_happy_paths_admin_and_staff(db_session_integration):
    db = db_session_integration
    tenant, admin_user, staff_user, password = await _seed_tenant_with_users(db)

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            ra = await ac.post(
                "/api/v1/auth/login",
                json={
                    "company_code": tenant.company_code,
                    "email": admin_user.email,
                    "password": password,
                    "login_as": "admin",
                },
            )
            rs = await ac.post(
                "/api/v1/auth/login",
                json={
                    "company_code": tenant.company_code,
                    "email": staff_user.email,
                    "password": password,
                    "login_as": "staff",
                },
            )
        assert ra.status_code == 200, ra.text
        assert rs.status_code == 200, rs.text
        assert ra.json().get("access_token")
        assert rs.json().get("access_token")
    finally:
        app.dependency_overrides.pop(get_db, None)
