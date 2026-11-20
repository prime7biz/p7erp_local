"""Phase 6 production: module grants + admin-equivalent gates (user_authority_classes_v1).

Run: docker compose exec backend pytest tests/test_authority_production.py -q
"""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import create_access_token, hash_password
from app.common.authority.constants import AUTHORITY_CLASS_1, AUTHORITY_CLASS_4
from app.common.permissions import assert_manager_role_only
from app.common.tenant_feature_keys import USER_AUTHORITY_CLASSES_V1
from app.database import get_db
from app.main import app
from app.models import Role, Tenant, User
from app.models.tenant import TenantType
from app.models.user_authority import UserModuleGrant
from fastapi import HTTPException


async def _seed(db, *, flag_on: bool = True):
    slug = uuid.uuid4().hex[:10]
    flags = {USER_AUTHORITY_CLASSES_V1: True} if flag_on else {}
    tenant = Tenant(
        name=f"ProdAuth {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"PA{slug}"[:18].upper(),
        feature_flags=flags,
    )
    db.add(tenant)
    await db.flush()
    admin_role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    user_role = Role(tenant_id=tenant.id, name="user", display_name="User", permissions={})
    db.add_all([admin_role, user_role])
    await db.flush()

    async def _user(prefix: str, cls: str, *, modules: list[str], admin: bool = False) -> User:
        u = User(
            tenant_id=tenant.id,
            role_id=admin_role.id if admin else user_role.id,
            email=f"{prefix}_{slug}@example.com",
            username=f"{prefix}_{slug}",
            password_hash=await hash_password("StrongPass123!"),
            is_active=True,
            authority_class=cls,
        )
        db.add(u)
        await db.flush()
        for code in modules:
            db.add(UserModuleGrant(tenant_id=tenant.id, user_id=u.id, module_code=code))
        await db.flush()
        return u

    users = {
        "c1_prod": await _user("c1p", AUTHORITY_CLASS_1, modules=["production"]),
        "c4_prod": await _user("c4p", AUTHORITY_CLASS_4, modules=["production"]),
        "c4_fin": await _user("c4f", AUTHORITY_CLASS_4, modules=["finance"]),
        "c1_merch": await _user("c1m", AUTHORITY_CLASS_1, modules=["merch"]),
        "admin_legacy": await _user("adm", AUTHORITY_CLASS_4, modules=[], admin=True),
    }
    return tenant, users


def _headers(user: User, tenant: Tenant) -> dict[str, str]:
    token = create_access_token(user.id, tenant_id=tenant.id, session_version=user.auth_session_version)
    return {"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant.id)}


@pytest.mark.asyncio
async def test_module_grant_blocks_production_without_production(db_session_integration):
    db = db_session_integration
    tenant, users = await _seed(db, flag_on=True)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            denied = await client.get(
                "/api/v1/production/sewing-lines",
                headers=_headers(users["c4_fin"], tenant),
            )
            assert denied.status_code == 403, denied.text
            allowed = await client.get(
                "/api/v1/production/sewing-lines",
                headers=_headers(users["c4_prod"], tenant),
            )
            assert allowed.status_code == 200, allowed.text
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_class1_can_read_ai_planning_settings_when_flag_on(db_session_integration):
    db = db_session_integration
    tenant, users = await _seed(db, flag_on=True)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            denied = await client.get(
                "/api/v1/production/planning/ai/settings",
                headers=_headers(users["c4_prod"], tenant),
            )
            assert denied.status_code == 403, denied.text

            ok = await client.get(
                "/api/v1/production/planning/ai/settings",
                headers=_headers(users["c1_prod"], tenant),
            )
            assert ok.status_code == 200, ok.text
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_flag_off_class1_cannot_read_ai_planning_settings(db_session_integration):
    db = db_session_integration
    tenant, users = await _seed(db, flag_on=False)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            denied = await client.get(
                "/api/v1/production/planning/ai/settings",
                headers=_headers(users["c1_prod"], tenant),
            )
            assert denied.status_code == 403, denied.text

            ok = await client.get(
                "/api/v1/production/planning/ai/settings",
                headers=_headers(users["admin_legacy"], tenant),
            )
            assert ok.status_code == 200, ok.text
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_assert_manager_role_only_class1_production_when_flag_on(db_session_integration):
    db = db_session_integration
    tenant, users = await _seed(db, flag_on=True)

    await assert_manager_role_only(db, users["c1_prod"], tenant.id)

    with pytest.raises(HTTPException) as exc:
        await assert_manager_role_only(db, users["c4_prod"], tenant.id)
    assert exc.value.status_code == 403

    with pytest.raises(HTTPException):
        await assert_manager_role_only(db, users["c1_merch"], tenant.id)


@pytest.mark.asyncio
async def test_assert_manager_role_only_flag_off_keeps_role_names(db_session_integration):
    db = db_session_integration
    tenant, users = await _seed(db, flag_on=False)

    with pytest.raises(HTTPException):
        await assert_manager_role_only(db, users["c1_prod"], tenant.id)

    await assert_manager_role_only(db, users["admin_legacy"], tenant.id)
