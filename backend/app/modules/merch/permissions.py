"""
Merchandising RBAC: permissions are stored on Role.permissions (JSON dict).
Missing key => allowed (backward compatible). Set permission to false to deny.
"""

from typing import Any

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Role, Tenant, User

from .deps import ensure_tenant

MERCH_PERMISSION_STYLE_MANAGE = "merch.style.manage"
MERCH_PERMISSION_BOM_APPROVE = "merch.bom.approve"
MERCH_PERMISSION_BOM_FREEZE = "merch.bom.freeze"
MERCH_PERMISSION_PO_GENERATE = "merch.po.generate"
MERCH_PERMISSION_ALERT_SCAN = "merch.alert.scan"
MERCH_PERMISSION_ALERT_ASSIGN = "merch.alert.assign"
MERCH_PERMISSION_TNA_MANAGE = "merch.tna.manage"
MERCH_PERMISSION_WASTAGE_MANAGE = "merch.wastage.manage"
MERCH_PERMISSION_ALERT_DEFINITIONS = "merch.alert.definitions"

ALL_MERCH_KEYS = frozenset(
    {
        MERCH_PERMISSION_STYLE_MANAGE,
        MERCH_PERMISSION_BOM_APPROVE,
        MERCH_PERMISSION_BOM_FREEZE,
        MERCH_PERMISSION_PO_GENERATE,
        MERCH_PERMISSION_ALERT_SCAN,
        MERCH_PERMISSION_ALERT_ASSIGN,
        MERCH_PERMISSION_TNA_MANAGE,
        MERCH_PERMISSION_WASTAGE_MANAGE,
        MERCH_PERMISSION_ALERT_DEFINITIONS,
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


async def user_has_merch_permission_async(db: AsyncSession, user: User, permission_key: str) -> bool:
    if permission_key not in ALL_MERCH_KEYS:
        return True
    role = await load_user_role(db, user)
    perms = _permissions_dict_for_role(role)
    if perms.get(permission_key) is False:
        return False
    if perms.get("merch.*") is True or perms.get("*") is True:
        return True
    if permission_key not in perms:
        return True
    return bool(perms.get(permission_key))


def require_merch_permission(permission_key: str):
    async def _dep(
        tenant: Tenant = Depends(require_tenant),
        user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> None:
        ensure_tenant(user, tenant)
        ok = await user_has_merch_permission_async(db, user, permission_key)
        if not ok:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing permission: {permission_key}",
            )

    return _dep
