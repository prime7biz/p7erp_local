"""Material control governance: permission registry keys and delegation helper.

Run:
docker compose exec backend pytest tests/test_material_control_governance.py -q
"""

from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.permissions import (
    MATERIAL_CONTROL_GOVERNANCE_KEYS,
    PERMISSION_FINANCE_AP_POSTING_APPROVE,
    assert_delegate_manager_or_permission,
    internal_permission_granted,
    permissions_registry_api_payload,
)
from app.models import Role, Tenant, User
from app.models.tenant import TenantType


def test_permissions_registry_exports_governance_toggle_keys() -> None:
    payload = permissions_registry_api_payload()
    assert "governance_toggle_keys" in payload
    assert len(payload["governance_toggle_keys"]) == len(MATERIAL_CONTROL_GOVERNANCE_KEYS)


def test_internal_permission_granted_respects_boolean_key() -> None:
    role = Role(name="custom", permissions={PERMISSION_FINANCE_AP_POSTING_APPROVE: True})
    assert internal_permission_granted(role=role, permission_key=PERMISSION_FINANCE_AP_POSTING_APPROVE)

    role2 = Role(name="custom", permissions={PERMISSION_FINANCE_AP_POSTING_APPROVE: False})
    assert not internal_permission_granted(role=role2, permission_key=PERMISSION_FINANCE_AP_POSTING_APPROVE)


@pytest.mark.asyncio
async def test_assert_delegate_allows_manager_without_explicit_key(db_session_integration: AsyncSession) -> None:
    db = db_session_integration
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"MCG {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"mc{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    mgr_role = Role(tenant_id=tenant.id, name="manager", display_name="Mgr", permissions={})
    db.add(mgr_role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=mgr_role.id,
        email=f"m_{slug}@example.com",
        password_hash="x",
        is_active=True,
    )
    db.add(user)
    await db.commit()

    await assert_delegate_manager_or_permission(
        db, user, tenant.id, permission_key=PERMISSION_FINANCE_AP_POSTING_APPROVE
    )


@pytest.mark.asyncio
async def test_assert_delegate_denies_plain_user_without_key(db_session_integration: AsyncSession) -> None:
    db = db_session_integration
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"MCG2 {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"m2{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    r = Role(tenant_id=tenant.id, name="user", display_name="U", permissions={})
    db.add(r)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=r.id,
        email=f"u_{slug}@example.com",
        password_hash="x",
        is_active=True,
    )
    db.add(user)
    await db.commit()

    with pytest.raises(HTTPException) as exc:
        await assert_delegate_manager_or_permission(
            db, user, tenant.id, permission_key=PERMISSION_FINANCE_AP_POSTING_APPROVE
        )
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_assert_delegate_allows_custom_role_with_key(db_session_integration: AsyncSession) -> None:
    db = db_session_integration
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"MCG3 {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"m3{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    r = Role(
        tenant_id=tenant.id,
        name="ap_clerk",
        display_name="AP",
        permissions={PERMISSION_FINANCE_AP_POSTING_APPROVE: True},
    )
    db.add(r)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=r.id,
        email=f"ap_{slug}@example.com",
        password_hash="x",
        is_active=True,
    )
    db.add(user)
    await db.commit()

    await assert_delegate_manager_or_permission(
        db, user, tenant.id, permission_key=PERMISSION_FINANCE_AP_POSTING_APPROVE
    )
