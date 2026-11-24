"""Finance gates for creating debit notes from Material Control writers (MC-SEC-01)."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.permissions import (
    PERMISSION_DEBIT_NOTE_CREATE,
    assert_soft_permission_allowed,
    get_user_role_scoped_to_tenant,
    internal_permission_granted,
)
from app.common.tenant_feature_keys import is_credit_debit_note_enabled
from app.models import Tenant, User


async def assert_can_post_landed_cost_gl(db: AsyncSession, user: User, tenant: Tenant) -> None:
    """Landed-cost GL posting needs finance access (same fail-closed rule as debit notes)."""
    from app.common.authority.module_access import assert_module_grant_for_permissions

    await assert_module_grant_for_permissions(
        db, user, ("finance.access",), feature_flags=tenant.feature_flags
    )
    role = await get_user_role_scoped_to_tenant(db, user, tenant.id)
    if not internal_permission_granted(role=role, permission_key="finance.access"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requires finance.access to post landed cost to the ledger",
        )


async def assert_can_create_debit_note(db: AsyncSession, user: User, tenant: Tenant) -> None:
    """Match Finance debit-note route: flag + finance.access + soft debit-note permission.

    When ``user_authority_classes_v1`` is ON, also require a finance module grant
    (same as ``require_internal_permission("finance.access")`` on finance routes).
    """
    if not is_credit_debit_note_enabled(tenant.feature_flags):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Debit notes are disabled for this company",
        )
    from app.common.authority.module_access import assert_module_grant_for_permissions

    await assert_module_grant_for_permissions(
        db, user, ("finance.access",), feature_flags=tenant.feature_flags
    )
    role = await get_user_role_scoped_to_tenant(db, user, tenant.id)
    if not internal_permission_granted(role=role, permission_key="finance.access"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requires finance.access to create debit notes",
        )
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_DEBIT_NOTE_CREATE
    )
