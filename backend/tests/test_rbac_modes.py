"""RBAC mode behavior tests: off, shadow, enforce.

Run:
docker compose exec backend pytest tests/test_rbac_modes.py -q
"""

from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import text
from starlette.requests import Request

from app.common.permissions import require_internal_permission
from app.models import Role, Tenant, User
from app.models.tenant import TenantType


def _request(path: str = "/api/v1/inventory/items") -> Request:
    return Request({"type": "http", "method": "GET", "path": path, "headers": []})


async def _seed_user(db, *, role_name: str, role_permissions: dict, rbac_mode: str) -> tuple[Tenant, User]:
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"RBAC Mode {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"rb{slug}"[:18].upper(),
        feature_flags={"rbac_enforcement": rbac_mode},
    )
    db.add(tenant)
    await db.flush()
    role = Role(
        tenant_id=tenant.id,
        name=role_name,
        display_name=role_name.title(),
        permissions=role_permissions,
    )
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        email=f"{slug}@example.com",
        password_hash="x",
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
async def test_rbac_mode_off_allows_request_even_without_permission(db_session_integration):
    await _ensure_auth_session_version_column(db_session_integration)
    _, user = await _seed_user(
        db_session_integration,
        role_name="user",
        role_permissions={},
        rbac_mode="off",
    )
    dep = require_internal_permission("inventory.access")
    await dep(request=_request(), user=user, db=db_session_integration)


@pytest.mark.asyncio
async def test_rbac_mode_shadow_allows_and_logs_without_permission(db_session_integration, caplog):
    await _ensure_auth_session_version_column(db_session_integration)
    _, user = await _seed_user(
        db_session_integration,
        role_name="user",
        role_permissions={},
        rbac_mode="shadow",
    )
    dep = require_internal_permission("inventory.access")
    await dep(request=_request(), user=user, db=db_session_integration)
    assert "rbac_shadow_denial" in caplog.text


@pytest.mark.asyncio
async def test_rbac_mode_enforce_denies_without_permission(db_session_integration):
    await _ensure_auth_session_version_column(db_session_integration)
    _, user = await _seed_user(
        db_session_integration,
        role_name="user",
        role_permissions={},
        rbac_mode="enforce",
    )
    dep = require_internal_permission("inventory.access")
    with pytest.raises(HTTPException) as exc:
        await dep(request=_request(), user=user, db=db_session_integration)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_rbac_mode_enforce_allows_admin_bypass(db_session_integration):
    await _ensure_auth_session_version_column(db_session_integration)
    _, user = await _seed_user(
        db_session_integration,
        role_name="admin",
        role_permissions={},
        rbac_mode="enforce",
    )
    dep = require_internal_permission("inventory.access")
    await dep(request=_request(), user=user, db=db_session_integration)
