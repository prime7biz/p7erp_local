"""Finance gate for Manufacturing Intelligence money figures (Phase 3, plan doc 14 section 12 #10 / 13 Q5).

Least privilege in EVERY RBAC mode (off / shadow / enforce): cost, margin and cash figures are visible only to
- a user whose role (in this tenant) is admin or manager, or
- a role that explicitly grants BOTH `finance.access` and `finance.mis_report.view` (a `true` value, `finance.*`
  or `*`; a missing key is NOT enough here).
Everybody else gets 403 on the money endpoints (planners still see quantities and dates on the other tabs).
"""
from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.permissions import (
    MANAGER_ONLY_ROLES,
    PERMISSION_MIS_REPORT_VIEW,
    get_user_role_for_tenant,
    internal_permission_granted,
)
from app.models import Tenant, User

FINANCE_VIEW_KEYS: tuple[str, ...] = ("finance.access", PERMISSION_MIS_REPORT_VIEW)


async def may_view_mfg_finance(db: AsyncSession, user: User, tenant: Tenant) -> bool:
    if user.tenant_id != tenant.id:
        return False
    role = await get_user_role_for_tenant(db, user, tenant.id)
    if role is None:
        return False
    if (role.name or "").strip().lower() in MANAGER_ONLY_ROLES:
        return True
    return all(internal_permission_granted(role=role, permission_key=k) for k in FINANCE_VIEW_KEYS)


async def assert_mfg_finance_view(db: AsyncSession, user: User, tenant: Tenant) -> None:
    if not await may_view_mfg_finance(db, user, tenant):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requires admin or manager role, or both finance.access and finance.mis_report.view",
        )
