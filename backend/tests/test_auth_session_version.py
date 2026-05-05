"""Single-session enforcement integration tests for internal auth.

Run:
docker compose exec backend pytest tests/test_auth_session_version.py -q
"""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, text

from app.common.auth import create_access_token, hash_password
from app.database import get_db
from app.main import app
from app.models import Role, Tenant, User
from app.models.tenant import TenantType


async def _seed_user(db, *, single_session_enforced: bool) -> tuple[Tenant, User]:
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"Session Test {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"ss{slug}"[:18].upper(),
        feature_flags={"single_session_enforced": single_session_enforced},
    )
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="user", display_name="User", permissions={})
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        email=f"{slug}@example.com",
        username=f"user_{slug}",
        password_hash=await hash_password("StrongPass123!"),
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    await db.refresh(tenant)
    return tenant, user


async def _ensure_auth_session_version_column(db) -> None:
    await db.execute(
        text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_session_version INTEGER NOT NULL DEFAULT 0"
        )
    )
    await db.commit()


@pytest.mark.asyncio
async def test_single_session_new_login_invalidates_old_token(db_session_integration):
    db = db_session_integration
    await _ensure_auth_session_version_column(db)
    tenant, user = await _seed_user(db, single_session_enforced=True)

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            login_body = {
                "company_code": tenant.company_code,
                "email": user.email,
                "password": "StrongPass123!",
            }
            first_login = await ac.post("/api/v1/auth/login", json=login_body)
            assert first_login.status_code == 200, first_login.text
            first_token = first_login.json()["access_token"]

            second_login = await ac.post("/api/v1/auth/login", json=login_body)
            assert second_login.status_code == 200, second_login.text
            second_token = second_login.json()["access_token"]

            me_second = await ac.get(
                "/api/v1/auth/me",
                headers={
                    "Authorization": f"Bearer {second_token}",
                    "X-Tenant-Id": str(tenant.id),
                },
            )
            assert me_second.status_code == 200, me_second.text

            me_first = await ac.get(
                "/api/v1/auth/me",
                headers={
                    "Authorization": f"Bearer {first_token}",
                    "X-Tenant-Id": str(tenant.id),
                },
            )
            assert me_first.status_code == 401, me_first.text
            detail = me_first.json().get("detail") or {}
            assert isinstance(detail, dict)
            assert detail.get("code") == "session_superseded"
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_legacy_token_without_sv_remains_valid_during_grace_window(db_session_integration):
    db = db_session_integration
    await _ensure_auth_session_version_column(db)
    tenant, user = await _seed_user(db, single_session_enforced=True)
    legacy_token = create_access_token(subject=user.id)

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            me_response = await ac.get(
                "/api/v1/auth/me",
                headers={
                    "Authorization": f"Bearer {legacy_token}",
                    "X-Tenant-Id": str(tenant.id),
                },
            )
            assert me_response.status_code == 200, me_response.text
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_single_session_flag_off_keeps_previous_token_valid(db_session_integration):
    db = db_session_integration
    await _ensure_auth_session_version_column(db)
    tenant, user = await _seed_user(db, single_session_enforced=False)

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            login_body = {
                "company_code": tenant.company_code,
                "email": user.email,
                "password": "StrongPass123!",
            }
            first_login = await ac.post("/api/v1/auth/login", json=login_body)
            second_login = await ac.post("/api/v1/auth/login", json=login_body)
            assert first_login.status_code == 200, first_login.text
            assert second_login.status_code == 200, second_login.text

            first_token = first_login.json()["access_token"]
            me_first = await ac.get(
                "/api/v1/auth/me",
                headers={
                    "Authorization": f"Bearer {first_token}",
                    "X-Tenant-Id": str(tenant.id),
                },
            )
            assert me_first.status_code == 200, me_first.text

            refreshed_user = (
                await db.execute(select(User).where(User.id == user.id))
            ).scalar_one()
            assert int(refreshed_user.auth_session_version or 0) == 0
    finally:
        app.dependency_overrides.pop(get_db, None)
