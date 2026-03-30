"""RBAC for commercial change-control and planning grounding (roles.permissions JSON)."""

from __future__ import annotations

from typing import Literal

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.common.authz import get_user_role_scoped_to_tenant

CommercialCapability = Literal[
    "propose_change",
    "approve_change",
    "reject_change",
    "apply_change",
    "view_changes",
    "view_planning_grounding",
]

_CAP_KEY: dict[CommercialCapability, str] = {
    "propose_change": "commercial.propose_change",
    "approve_change": "commercial.approve_change",
    "reject_change": "commercial.reject_change",
    "apply_change": "commercial.apply_change",
    "view_changes": "commercial.view_changes",
    "view_planning_grounding": "orders.view_planning_grounding",
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


async def require_commercial_capability(db: AsyncSession, user: User, capability: CommercialCapability) -> None:
    """Missing permission key => allow; explicit false => deny (same as order AI)."""
    role = await get_user_role_scoped_to_tenant(db, user, user.tenant_id)
    if not role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "No role assigned for this tenant."},
        )
    role_name = (role.name or "").strip().lower()
    if role_name in _ROLE_ALLOW_ALL:
        return

    perms = role.permissions or {}
    pkey = _CAP_KEY[capability]
    if pkey in perms and not _permission_truthy(perms[pkey]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "COMMERCIAL_CAPABILITY_DENIED", "message": f"Permission {pkey} is disabled."},
        )

    commercial_scope = perms.get("commercial")
    if isinstance(commercial_scope, dict):
        nested = commercial_scope.get(capability)
        if nested is not None and not _permission_truthy(nested):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "COMMERCIAL_CAPABILITY_DENIED", "message": "Commercial action disabled for your role."},
            )
        if nested is not None and _permission_truthy(nested):
            return
        if "enabled" in commercial_scope and not _permission_truthy(commercial_scope.get("enabled")):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "COMMERCIAL_CAPABILITY_DENIED", "message": "Commercial module disabled for your role."},
            )
