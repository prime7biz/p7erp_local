"""RBAC for vendor (supplier) AI — Role.permissions JSON; missing key => allow."""

from __future__ import annotations

from typing import Literal

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.modules.ai_tool.authz import can_use_ai_module, get_user_role_scoped_to_tenant

VendorAiCapability = Literal[
    "extract",
    "enrich",
    "validate",
    "dedupe",
    "summary",
    "next_actions",
    "audit",
    "apply_suggestions",
    "discard_suggestions",
]

_CAP_PERMISSION_KEY: dict[VendorAiCapability, str] = {
    "extract": "inventory.vendors.ai.extract",
    "enrich": "inventory.vendors.ai.enrich",
    "validate": "inventory.vendors.ai.validate",
    "dedupe": "inventory.vendors.ai.dedupe",
    "summary": "inventory.vendors.ai.summary",
    "next_actions": "inventory.vendors.ai.next_actions",
    "audit": "inventory.vendors.ai.audit",
    "apply_suggestions": "inventory.vendors.ai.apply_suggestions",
    "discard_suggestions": "inventory.vendors.ai.discard_suggestions",
}

_ROLE_ALLOW_ALL = {
    "admin",
    "manager",
    "owner",
    "super_admin",
    "superadmin",
}


def _permission_truthy(value: object) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"true", "1", "yes", "allow", "enabled", "read", "write"}
    if isinstance(value, (int, float)):
        return value > 0
    if isinstance(value, dict):
        if "enabled" in value:
            return _permission_truthy(value.get("enabled"))
        if "read" in value:
            return _permission_truthy(value.get("read"))
    return False


async def require_vendor_ai_capability(db: AsyncSession, user: User, capability: VendorAiCapability) -> None:
    if not await can_use_ai_module(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "AI_FORBIDDEN", "message": "Your role cannot use AI features."},
        )
    role = await get_user_role_scoped_to_tenant(db, user, user.tenant_id)
    if not role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "AI_FORBIDDEN", "message": "No role assigned for this tenant."},
        )
    role_name = (role.name or "").strip().lower()
    if role_name in _ROLE_ALLOW_ALL:
        return

    perms = role.permissions or {}
    pkey = _CAP_PERMISSION_KEY[capability]
    if pkey in perms and not _permission_truthy(perms[pkey]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "AI_CAPABILITY_DENIED", "message": f"Permission {pkey} is disabled for your role."},
        )

    scope = perms.get("inventory.vendors.ai")
    if isinstance(scope, dict):
        nested = scope.get(capability)
        if nested is not None and not _permission_truthy(nested):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "AI_CAPABILITY_DENIED", "message": "This vendor AI action is disabled for your role."},
            )
        if nested is not None and _permission_truthy(nested):
            return

    if isinstance(scope, dict) and "enabled" in scope and not _permission_truthy(scope.get("enabled")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "AI_CAPABILITY_DENIED", "message": "Vendor AI is disabled for your role."},
        )
