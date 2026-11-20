"""Module grants on require_any routes use any-module semantics.

A shared route such as merch.access | inventory.access must accept a user who
holds one of those modules. A one-key route still requires that one module.
Direct callers of assert_module_grant_for_permissions keep the all-modules default.

Run:
docker compose exec backend pytest tests/test_authority_module_grant_any.py -q
"""

from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.common.authority.module_access import assert_module_grant_for_permissions
from app.common.permissions import require_any_internal_permission, require_internal_permission
from app.common.tenant_feature_keys import RBAC_ENFORCEMENT, USER_AUTHORITY_CLASSES_V1
from app.models import Role, Tenant, User
from app.models.tenant import TenantType
from app.models.user_authority import UserModuleGrant

_SHARED = ("merch.access", "inventory.access")


def _request() -> Request:
    return Request({"type": "http", "method": "GET", "path": "/api/v1/procurement", "headers": []})


async def _seed(
    db,
    *,
    modules: list[str],
    permissions: dict | None = None,
    role_name: str = "user",
    flag_on: bool = True,
    rbac_mode: str = "off",
    inactive: bool = False,
    super_admin: bool = False,
) -> tuple[Tenant, User]:
    slug = uuid.uuid4().hex[:10]
    flags: dict = {}
    if flag_on:
        flags[USER_AUTHORITY_CLASSES_V1] = True
    if rbac_mode != "off":
        flags[RBAC_ENFORCEMENT] = rbac_mode
    tenant = Tenant(
        name=f"ModAny {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"MA{slug}"[:18].upper(),
        feature_flags=flags,
    )
    db.add(tenant)
    await db.flush()
    role = Role(
        tenant_id=tenant.id,
        name=role_name,
        display_name=role_name.title(),
        permissions=permissions or {},
    )
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        email=f"{slug}@example.com",
        username=f"u_{slug}",
        password_hash="x",
        is_active=not inactive,
        is_tenant_super_admin=super_admin,
    )
    db.add(user)
    await db.flush()
    for code in modules:
        db.add(UserModuleGrant(tenant_id=tenant.id, user_id=user.id, module_code=code))
    await db.commit()
    await db.refresh(user)
    await db.refresh(tenant)
    return tenant, user


@pytest.mark.asyncio
async def test_match_all_still_requires_every_mapped_module(db_session_integration):
    _, user = await _seed(db_session_integration, modules=["merch"])
    with pytest.raises(HTTPException) as exc:
        await assert_module_grant_for_permissions(
            db_session_integration,
            user,
            _SHARED,
            feature_flags={USER_AUTHORITY_CLASSES_V1: True},
            match_any=False,
        )
    assert exc.value.status_code == 403
    assert exc.value.detail == "Module grant required: inventory"


@pytest.mark.asyncio
async def test_match_any_allows_one_of_two_modules(db_session_integration):
    _, user = await _seed(db_session_integration, modules=["merch"])
    await assert_module_grant_for_permissions(
        db_session_integration,
        user,
        _SHARED,
        feature_flags={USER_AUTHORITY_CLASSES_V1: True},
        match_any=True,
    )


@pytest.mark.asyncio
async def test_match_any_denies_when_user_holds_neither_module(db_session_integration):
    _, user = await _seed(db_session_integration, modules=["finance"])
    with pytest.raises(HTTPException) as exc:
        await assert_module_grant_for_permissions(
            db_session_integration,
            user,
            _SHARED,
            feature_flags={USER_AUTHORITY_CLASSES_V1: True},
            match_any=True,
        )
    assert exc.value.status_code == 403
    assert exc.value.detail == "Module grant required: inventory, merch"


@pytest.mark.asyncio
async def test_flag_off_does_not_require_module_grants(db_session_integration):
    _, user = await _seed(db_session_integration, modules=[], flag_on=False)
    await assert_module_grant_for_permissions(
        db_session_integration,
        user,
        _SHARED,
        feature_flags={},
        match_any=False,
    )


@pytest.mark.asyncio
async def test_single_key_route_still_requires_that_module(db_session_integration):
    _, user = await _seed(db_session_integration, modules=["merch"], rbac_mode="off")
    dep = require_internal_permission("inventory.access")
    with pytest.raises(HTTPException) as exc:
        await dep(request=_request(), user=user, db=db_session_integration)
    assert exc.value.status_code == 403
    assert exc.value.detail == "Module grant required: inventory"


@pytest.mark.asyncio
async def test_shared_route_allows_one_module_when_rbac_is_off(db_session_integration):
    _, user = await _seed(db_session_integration, modules=["merch"], permissions={}, rbac_mode="off")
    dep = require_any_internal_permission(*_SHARED)
    await dep(request=_request(), user=user, db=db_session_integration)


@pytest.mark.asyncio
async def test_shared_route_enforce_allows_matching_permission_and_module(db_session_integration):
    _, user = await _seed(
        db_session_integration,
        modules=["merch"],
        permissions={"merch.access": True},
        rbac_mode="enforce",
    )
    dep = require_any_internal_permission(*_SHARED)
    await dep(request=_request(), user=user, db=db_session_integration)


@pytest.mark.asyncio
async def test_shared_route_enforce_denies_permission_for_a_module_the_user_lacks(db_session_integration):
    """inventory.access on the role cannot be satisfied by a merch module grant."""
    _, user = await _seed(
        db_session_integration,
        modules=["merch"],
        permissions={"inventory.access": True},
        rbac_mode="enforce",
    )
    dep = require_any_internal_permission(*_SHARED)
    with pytest.raises(HTTPException) as exc:
        await dep(request=_request(), user=user, db=db_session_integration)
    assert exc.value.status_code == 403
    assert exc.value.detail == "Module grant required: inventory"


@pytest.mark.asyncio
async def test_shared_route_enforce_denies_when_neither_permission_is_granted(db_session_integration):
    _, user = await _seed(
        db_session_integration,
        modules=["merch"],
        permissions={},
        rbac_mode="enforce",
    )
    dep = require_any_internal_permission(*_SHARED)
    with pytest.raises(HTTPException) as exc:
        await dep(request=_request(), user=user, db=db_session_integration)
    assert exc.value.status_code == 403
    assert "Permission denied" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_super_admin_bypasses_module_grants(db_session_integration):
    _, user = await _seed(db_session_integration, modules=[], super_admin=True)
    await assert_module_grant_for_permissions(
        db_session_integration,
        user,
        _SHARED,
        feature_flags={USER_AUTHORITY_CLASSES_V1: True},
        match_any=False,
    )


@pytest.mark.asyncio
async def test_inactive_user_is_denied(db_session_integration):
    _, user = await _seed(db_session_integration, modules=["merch", "inventory"], inactive=True)
    with pytest.raises(HTTPException) as exc:
        await assert_module_grant_for_permissions(
            db_session_integration,
            user,
            _SHARED,
            feature_flags={USER_AUTHORITY_CLASSES_V1: True},
            match_any=True,
        )
    assert exc.value.status_code == 403
    assert exc.value.detail == "Inactive user"
