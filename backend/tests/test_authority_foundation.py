"""Phase 1 foundation for fixed-class user authority.

Run: docker compose exec backend pytest tests/test_authority_foundation.py -q
"""

from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.common.auth import create_access_token, hash_password
from app.common.authority.constants import AUTHORITY_CLASS_1, AUTHORITY_SUPER
from app.common.authority.policy import (
    assert_super_admin_protected,
    is_class1_for_module,
    is_tenant_admin_equivalent,
    preflight_authority_activation,
)
from app.common.tenant_feature_keys import USER_AUTHORITY_CLASSES_V1, is_user_authority_classes_v1_enabled
from app.database import get_db
from app.main import app
from app.models import Role, Tenant, User
from app.models.tenant import TenantType
from app.models.user_authority import UserModuleGrant


def test_authority_flag_strict_off_by_default():
    assert is_user_authority_classes_v1_enabled({}) is False
    assert is_user_authority_classes_v1_enabled({USER_AUTHORITY_CLASSES_V1: True}) is True
    assert is_user_authority_classes_v1_enabled({USER_AUTHORITY_CLASSES_V1: "true"}) is False


async def _seed_tenant_admin(db, *, flag_on: bool = False) -> tuple[Tenant, User, Role]:
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"AuthZ {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"AZ{slug}"[:18].upper(),
        feature_flags={USER_AUTHORITY_CLASSES_V1: True} if flag_on else {},
    )
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        email=f"admin_{slug}@example.com",
        username=f"admin_{slug}",
        password_hash=await hash_password("StrongPass123!"),
        is_active=True,
        authority_class=AUTHORITY_SUPER,
        is_tenant_super_admin=True,
    )
    db.add(user)
    await db.flush()
    await db.refresh(tenant)
    await db.refresh(user)
    return tenant, user, role


@pytest.mark.asyncio
async def test_super_admin_protected_even_when_flag_off(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await _seed_tenant_admin(db, flag_on=False)
    with pytest.raises(HTTPException) as exc:
        assert_super_admin_protected(user, feature_flags=tenant.feature_flags, action="delete")
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_flag_on_super_admin_protected(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await _seed_tenant_admin(db, flag_on=True)
    with pytest.raises(HTTPException) as exc:
        assert_super_admin_protected(user, feature_flags=tenant.feature_flags, action="delete")
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_one_super_admin_unique_index(db_session_integration):
    db = db_session_integration
    tenant, user, role = await _seed_tenant_admin(db, flag_on=True)
    other = User(
        tenant_id=tenant.id,
        role_id=role.id,
        email=f"second_{uuid.uuid4().hex[:8]}@example.com",
        username=f"second_{uuid.uuid4().hex[:8]}",
        password_hash=await hash_password("StrongPass123!"),
        is_active=True,
        authority_class=AUTHORITY_SUPER,
        is_tenant_super_admin=True,
    )
    db.add(other)
    with pytest.raises(Exception):
        await db.flush()
    await db.rollback()


@pytest.mark.asyncio
async def test_class1_module_scope(db_session_integration):
    db = db_session_integration
    tenant, _, role = await _seed_tenant_admin(db, flag_on=True)
    class1_role = Role(tenant_id=tenant.id, name="user", display_name="User", permissions={})
    db.add(class1_role)
    await db.flush()
    class1 = User(
        tenant_id=tenant.id,
        role_id=class1_role.id,
        email=f"c1_{uuid.uuid4().hex[:8]}@example.com",
        username=f"c1_{uuid.uuid4().hex[:8]}",
        password_hash=await hash_password("StrongPass123!"),
        is_active=True,
        authority_class=AUTHORITY_CLASS_1,
        is_tenant_super_admin=False,
    )
    db.add(class1)
    await db.flush()
    db.add(UserModuleGrant(tenant_id=tenant.id, user_id=class1.id, module_code="finance"))
    await db.flush()
    assert await is_class1_for_module(db, class1, "finance", feature_flags=tenant.feature_flags)
    assert not await is_class1_for_module(db, class1, "hr", feature_flags=tenant.feature_flags)
    assert await is_tenant_admin_equivalent(db, class1, tenant.id, feature_flags=tenant.feature_flags)


@pytest.mark.asyncio
async def test_preflight_requires_super_admin(db_session_integration):
    db = db_session_integration
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"Pre {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"PF{slug}"[:18].upper(),
        feature_flags={},
    )
    db.add(tenant)
    await db.flush()
    result = await preflight_authority_activation(db, tenant.id)
    assert result.ok is False
    assert any("Super Admin" in e for e in result.errors)


@pytest.mark.asyncio
async def test_me_includes_authority_fields_when_flag_off(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await _seed_tenant_admin(db, flag_on=False)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    token = create_access_token(user.id, tenant_id=tenant.id, session_version=user.auth_session_version)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.get(
                "/api/v1/auth/me",
                headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant.id)},
            )
        assert res.status_code == 200
        body = res.json()
        assert body.get("authority_classes_enabled") is False
        assert body.get("module_grants") == []
        assert "available_modules" in body
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_settings_cannot_delete_super_admin_when_flag_on(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await _seed_tenant_admin(db, flag_on=True)
    token = create_access_token(user.id, tenant_id=tenant.id, session_version=user.auth_session_version)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.delete(
                f"/api/v1/settings/users/{user.id}",
                headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant.id)},
            )
        assert res.status_code == 403
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_user_module_grants_table_has_rls_policy(db_session_integration):
    db = db_session_integration
    row = (
        await db.execute(
            text(
                """
                SELECT c.relrowsecurity AS rls,
                       EXISTS (
                         SELECT 1 FROM pg_policies p
                         WHERE p.tablename = 'user_module_grants'
                           AND p.policyname = 'p7_tenant_isolation'
                       ) AS has_policy
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND c.relname = 'user_module_grants'
                """
            )
        )
    ).one_or_none()
    if row is None:
        pytest.skip("user_module_grants missing — run alembic upgrade head")
    assert row.rls is True
    assert row.has_policy is True
