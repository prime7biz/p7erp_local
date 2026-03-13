from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Role, Tenant, User


_AI_ALLOWED_ROLES = {"admin", "manager", "owner", "super_admin", "superadmin", "analyst", "operator", "supervisor"}


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
    role = await db.get(Role, user.role_id)
    return (role.name if role else "").strip().lower()


async def can_use_ai_module(db: AsyncSession, user: User) -> bool:
    role = await db.get(Role, user.role_id)
    if not role:
        return False
    role_name = (role.name or "").strip().lower()
    if role_name in _AI_ALLOWED_ROLES:
        return True
    permissions = role.permissions or {}
    return _permission_truthy(permissions.get("ai.read")) or _permission_truthy(permissions.get("ai.chat"))


async def has_tool_permission(db: AsyncSession, user: User, permission_key: str) -> bool:
    role = await db.get(Role, user.role_id)
    if not role:
        return False
    role_name = (role.name or "").strip().lower()
    if role_name in {"admin", "manager", "owner", "super_admin", "superadmin"}:
        return True
    permissions = role.permissions or {}
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
