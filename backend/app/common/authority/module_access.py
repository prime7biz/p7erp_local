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
    match_any: bool = False,
) -> None:
    """When authority classes are ON, require module grants for these permission keys.

    ``match_any=False`` (default): the user must hold every mapped module.
    ``match_any=True``: the user must hold at least one mapped module. This matches
    ``require_any_internal_permission``, which accepts any one of its keys. A single
    mapped key is the same either way.

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
    if match_any:
        if any(user_has_module(modules, module_code) for module_code in needed):
            return
        missing = sorted(needed)
    else:
        missing = sorted(module_code for module_code in needed if not user_has_module(modules, module_code))
    if missing:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Module grant required: {', '.join(missing)}",
        )
