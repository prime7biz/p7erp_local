"""Trade module RBAC: keys on Role.permissions (JSON). Missing key => allowed; explicit false denies."""

from __future__ import annotations

from typing import Any

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Role, Tenant, User

TRADE_PERMISSION_CREATE = "trade.create"
TRADE_PERMISSION_TRANSITION = "trade.transition"
TRADE_PERMISSION_DOCUMENT_UPLOAD = "trade.document.upload"

ALL_TRADE_KEYS = frozenset(
    {
        TRADE_PERMISSION_CREATE,
        TRADE_PERMISSION_TRANSITION,
        TRADE_PERMISSION_DOCUMENT_UPLOAD,
    }
)


def _permissions_dict_for_role(role: Role | None) -> dict[str, Any]:
    if role is None:
        return {}
    raw = role.permissions
    if isinstance(raw, dict):
        return raw
    return {}


async def load_user_role(db: AsyncSession, user: User) -> Role | None:
    result = await db.execute(select(Role).where(Role.id == user.role_id))
    return result.scalar_one_or_none()


async def user_has_trade_permission_async(db: AsyncSession, user: User, permission_key: str) -> bool:
    if permission_key not in ALL_TRADE_KEYS:
        return True
    role = await load_user_role(db, user)
    perms = _permissions_dict_for_role(role)
    if perms.get(permission_key) is False:
        return False
    if perms.get("trade.*") is True or perms.get("*") is True:
        return True
    if permission_key not in perms:
        return True
    return bool(perms.get(permission_key))


def require_trade_permission(permission_key: str):
    async def _dep(
        tenant: Tenant = Depends(require_tenant),
        user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> None:
        if user.tenant_id != tenant.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
        ok = await user_has_trade_permission_async(db, user, permission_key)
        if not ok:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing permission: {permission_key}",
            )

    return _dep
