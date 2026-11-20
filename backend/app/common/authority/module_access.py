"""Map ERP permission keys to authority module grants when the flag is ON."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.authority.constants import AUTHORITY_MODULE_CODES
from app.common.authority.policy import (
    is_authority_classes_enabled_for_tenant,
    load_user_module_codes,
    user_has_module,
)
from app.models import User

_MODULE_SET = {c.lower() for c in AUTHORITY_MODULE_CODES}


def module_code_for_permission(permission_key: str | None) -> str | None:
    """``inventory.access`` / ``inventory.items.read`` → ``inventory``; unknown prefix → None."""
    if not permission_key:
        return None
    prefix = permission_key.strip().lower().split(".", 1)[0]
    return prefix if prefix in _MODULE_SET else None


async def assert_module_grant_for_permissions(
    db: AsyncSession,
    user: User,
    permission_keys: tuple[str, ...],
    *,
    feature_flags: Any,
) -> None:
    """When authority classes are ON, the user must hold every mapped module for the route keys.

    Super Admin bypasses. Keys that do not map to a known module are ignored here
    (legacy soft RBAC still applies separately).
    """
    if not is_authority_classes_enabled_for_tenant(feature_flags):
        return
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")
    if bool(getattr(user, "is_tenant_super_admin", False)):
        return
    needed = {module_code_for_permission(k) for k in permission_keys}
    needed.discard(None)
    if not needed:
        return
    modules = await load_user_module_codes(db, tenant_id=user.tenant_id, user_id=user.id)
    missing = sorted(m for m in needed if not user_has_module(modules, m))
    if missing:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Module grant required: {', '.join(missing)}",
        )
