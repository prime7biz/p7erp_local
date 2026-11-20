"""Phase 7: authority cutover dry-run / apply / restore (AC26).

Run: docker compose exec backend pytest tests/test_authority_cutover.py -q
"""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.common.auth import create_access_token, hash_password
from app.common.authority.constants import AUTHORITY_CLASS_1, AUTHORITY_CLASS_2, AUTHORITY_CLASS_4
from app.database import get_db
from app.main import app
from app.models import Role, Tenant, User
from app.models.authority_cutover import AuthorityCutoverSnapshot
from app.models.tenant import TenantType
from app.models.user_authority import UserModuleGrant


async def _seed(db):
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"Cutover {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"CO{slug}"[:18].upper(),
        feature_flags={},
    )
    db.add(tenant)
    await db.flush()
    admin_role = Role(
        tenant_id=tenant.id,
        name="admin",
        display_name="Admin",
        permissions={"finance.access": True, "inventory.access": True, "settings.access": True},
    )
    manager_role = Role(
        tenant_id=tenant.id,
        name="manager",
        display_name="Manager",
        permissions={"inventory.access": True, "merch.access": True},
    )
    user_role = Role(tenant_id=tenant.id, name="user", display_name="User", permissions={"inventory.access": True})
    db.add_all([admin_role, manager_role, user_role])
    await db.flush()

    async def _user(prefix: str, role: Role, *, super_admin: bool = False) -> User:
        u = User(
            tenant_id=tenant.id,
            role_id=role.id,
            email=f"{prefix}_{slug}@example.com",
            username=f"{prefix}_{slug}",
            password_hash=await hash_password("StrongPass123!"),
            is_active=True,
            is_tenant_super_admin=super_admin,
        )
        db.add(u)
        await db.flush()
        return u

    admin1 = await _user("adm1", admin_role)
    admin2 = await _user("adm2", admin_role)
    manager = await _user("mgr", manager_role)
    clerk = await _user("clk", user_role)
    return tenant, {"admin1": admin1, "admin2": admin2, "manager": manager, "clerk": clerk}


def _headers(user: User, tenant: Tenant) -> dict[str, str]:
    token = create_access_token(user.id, tenant_id=tenant.id, session_version=user.auth_session_version)
    return {"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant.id)}


@pytest.mark.asyncio
async def test_dry_run_apply_rerun_restore(db_session_integration):
    db = db_session_integration
    tenant, users = await _seed(db)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            h = _headers(users["admin1"], tenant)
            dry = await client.post("/api/v1/settings/authority-cutover/dry-run", headers=h)
            assert dry.status_code == 200, dry.text
            body = dry.json()
            assert body["blocked"] is False
            assert body["earliest_admin_user_id"] == users["admin1"].id
            by_user = {p["user_id"]: p for p in body["proposals"]}
            assert by_user[users["admin1"].id]["proposed_is_tenant_super_admin"] is True
            assert by_user[users["admin2"].id]["proposed_authority_class"] == AUTHORITY_CLASS_1
            assert by_user[users["manager"].id]["proposed_authority_class"] == AUTHORITY_CLASS_2
            assert by_user[users["clerk"].id]["proposed_authority_class"] == AUTHORITY_CLASS_4

            # Original role ids stored; re-run dry-run keeps originals
            snap = (
                await db.execute(
                    select(AuthorityCutoverSnapshot).where(
                        AuthorityCutoverSnapshot.tenant_id == tenant.id,
                        AuthorityCutoverSnapshot.user_id == users["clerk"].id,
                    )
                )
            ).scalar_one()
            original_role = snap.original_role_id
            dry2 = await client.post("/api/v1/settings/authority-cutover/dry-run", headers=h)
            assert dry2.status_code == 200, dry2.text
            await db.refresh(snap)
            assert snap.original_role_id == original_role

            apply = await client.post(
                "/api/v1/settings/authority-cutover/apply",
                headers=h,
                json={},
            )
            assert apply.status_code == 200, apply.text
            assert apply.json()["applied"] >= 3, apply.text

            await db.refresh(users["admin1"])
            await db.refresh(users["admin2"])
            await db.refresh(users["manager"])
            await db.refresh(users["clerk"])
            assert users["admin1"].is_tenant_super_admin is True
            assert users["admin2"].authority_class == AUTHORITY_CLASS_1
            assert users["manager"].authority_class == AUTHORITY_CLASS_2
            assert users["clerk"].authority_class == AUTHORITY_CLASS_4
            # Role unchanged
            assert users["clerk"].role_id == original_role

            grants = (
                await db.execute(
                    select(UserModuleGrant.module_code).where(
                        UserModuleGrant.tenant_id == tenant.id,
                        UserModuleGrant.user_id == users["clerk"].id,
                    )
                )
            ).scalars().all()
            assert "inventory" in {str(g).lower() for g in grants}

            # Refresh token after apply (other users' sessions were invalidated; actor kept)
            h = _headers(users["admin1"], tenant)

            # Idempotent re-apply
            apply2 = await client.post("/api/v1/settings/authority-cutover/apply", headers=h, json={})
            assert apply2.status_code == 200, apply2.text
            assert apply2.json()["applied"] == 0

            restore = await client.post("/api/v1/settings/authority-cutover/restore", headers=h)
            assert restore.status_code == 200, restore.text
            assert restore.json()["restored"] >= 3, restore.text
            await db.refresh(users["admin1"])
            await db.refresh(users["clerk"])
            assert users["admin1"].is_tenant_super_admin is False
            assert users["clerk"].authority_class is None
            assert users["clerk"].role_id == original_role
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_class1_non_admin_cannot_restore(db_session_integration):
    """H1: Class 1 without an admin role must not restore (demote Super Admin / brick flag-ON tenant)."""
    from app.common.authority.constants import AUTHORITY_CLASS_1
    from app.common.tenant_feature_keys import USER_AUTHORITY_CLASSES_V1
    from app.models.user_authority import UserModuleGrant

    db = db_session_integration
    tenant, users = await _seed(db)
    # Enable authority classes and promote admin1 as super; give clerk Class 1 + settings
    tenant.feature_flags = {**(tenant.feature_flags or {}), USER_AUTHORITY_CLASSES_V1: True}
    users["admin1"].is_tenant_super_admin = True
    users["clerk"].authority_class = AUTHORITY_CLASS_1
    db.add(UserModuleGrant(tenant_id=tenant.id, user_id=users["clerk"].id, module_code="settings"))
    await db.flush()

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            h_admin = _headers(users["admin1"], tenant)
            dry = await client.post("/api/v1/settings/authority-cutover/dry-run", headers=h_admin)
            assert dry.status_code == 200, dry.text
            apply = await client.post("/api/v1/settings/authority-cutover/apply", headers=h_admin, json={})
            assert apply.status_code == 200, apply.text

            denied = await client.post(
                "/api/v1/settings/authority-cutover/restore",
                headers=_headers(users["clerk"], tenant),
            )
            assert denied.status_code == 403, denied.text
            await db.refresh(users["admin1"])
            assert users["admin1"].is_tenant_super_admin is True
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_assert_cutover_actor_rejects_cross_tenant_admin_role(db_session_integration):
    """Actor whose role_id points at another tenant's admin role must not pass cutover gate."""
    from fastapi import HTTPException

    from app.common.authority.cutover import _assert_cutover_actor

    db = db_session_integration
    tenant_a, users_a = await _seed(db)
    tenant_b, users_b = await _seed(db)

    # Point tenant A clerk at tenant B's admin role (FK allows any roles.id; no tenant check on column).
    clerk = users_a["clerk"]
    clerk.role_id = users_b["admin1"].role_id
    clerk.is_tenant_super_admin = False
    await db.flush()
    db.expire(clerk, ["role"])

    with pytest.raises(HTTPException) as exc:
        await _assert_cutover_actor(db, clerk)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_unresolved_blocks_apply(db_session_integration):
    db = db_session_integration
    tenant, users = await _seed(db)

    # Force an unresolved proposal row without a matching dry-run path: inject UNRESOLVED status
    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            h = _headers(users["admin1"], tenant)
            dry = await client.post("/api/v1/settings/authority-cutover/dry-run", headers=h)
            assert dry.status_code == 200, dry.text
            snap = (
                await db.execute(
                    select(AuthorityCutoverSnapshot).where(
                        AuthorityCutoverSnapshot.tenant_id == tenant.id,
                        AuthorityCutoverSnapshot.user_id == users["clerk"].id,
                    )
                )
            ).scalar_one()
            snap.status = "UNRESOLVED"
            snap.reason = "Forced unresolved for test"
            await db.flush()

            blocked = await client.post(
                "/api/v1/settings/authority-cutover/apply",
                headers=h,
                json={},
            )
            assert blocked.status_code == 409, blocked.text
    finally:
        app.dependency_overrides.pop(get_db, None)
