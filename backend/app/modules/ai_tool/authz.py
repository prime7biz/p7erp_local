from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.authz import get_user_role_scoped_to_tenant
from app.common.permissions import HR_SETUP_BYPASS_ROLES
from app.models import Tenant, User

# AI permission matrix: use `app.modules.ai_tool.policy_eval.evaluate_ai_policy` /
# `evaluate_ai_safety_for_user` (kept out of this module to avoid import cycles).

_AI_ALLOWED_ROLES = {"admin", "manager", "owner", "super_admin", "superadmin", "analyst", "operator", "supervisor"}

# Tool keys under these prefixes need an explicit grant (no fallback to ai.read / ai.chat).
FAIL_CLOSED_TOOL_PREFIXES: tuple[str, ...] = ("ai.tools.finance.", "ai.tools.hr.", "ai.tools.payroll.")


def ensure_tenant_access(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


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


async def get_role_name(db: AsyncSession, user: User) -> str:
    role = await get_user_role_scoped_to_tenant(db, user, user.tenant_id)
    return (role.name if role else "").strip().lower()


async def can_use_ai_module(db: AsyncSession, user: User) -> bool:
    role = await get_user_role_scoped_to_tenant(db, user, user.tenant_id)
    if not role:
        return False
    role_name = (role.name or "").strip().lower()
    if role_name in _AI_ALLOWED_ROLES:
        return True
    permissions = role.permissions or {}
    return _permission_truthy(permissions.get("ai.read")) or _permission_truthy(permissions.get("ai.chat"))


def is_fail_closed_tool_key(permission_key: str) -> bool:
    return any(permission_key.startswith(prefix) for prefix in FAIL_CLOSED_TOOL_PREFIXES)


def _fail_closed_granted(permissions: dict, permission_key: str) -> bool:
    if _permission_truthy(permissions.get(permission_key)):
        return True
    prefix = next(p for p in FAIL_CLOSED_TOOL_PREFIXES if permission_key.startswith(p))
    for wildcard in (f"{prefix}*", "ai.*", "*"):
        if permissions.get(wildcard) is True:
            return True
    return False


async def has_tool_permission(db: AsyncSession, user: User, permission_key: str) -> bool:
    role = await get_user_role_scoped_to_tenant(db, user, user.tenant_id)
    if not role:
        return False
    role_name = (role.name or "").strip().lower()
    if role_name in HR_SETUP_BYPASS_ROLES:
        return True
    permissions = role.permissions if isinstance(role.permissions, dict) else {}
    if is_fail_closed_tool_key(permission_key):
        return _fail_closed_granted(permissions, permission_key)
    value = permissions.get(permission_key)
    if value is not None:
        return _permission_truthy(value)
    if isinstance(permissions.get("ai"), dict):
        ai_scope = permissions.get("ai") or {}
        if isinstance(ai_scope, dict):
            if permission_key.endswith(".read") and "read" in ai_scope:
                return _permission_truthy(ai_scope.get("read"))
    return _permission_truthy(permissions.get("ai.read")) or _permission_truthy(permissions.get("ai.chat"))


async def require_ai_access(db: AsyncSession, user: User) -> None:
    if not await can_use_ai_module(db, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No permission to use AI Tool")
