"""Who may see and do what (docs/management-performance/02-plan-audit-resolutions.md, "Authorization").

Fail closed in every RBAC mode (off / shadow / enforce), pattern of `mfg_intelligence/finance_gate.py`:
- company money (summary, finished goods, targets, cash, setup reads): admin / manager role, or an explicit `true`
  for `finance.mgmt_performance.view` (`finance.*` / `*` count; a missing key does NOT);
- a cost-centre owner without that key sees only the budget forecast and exceptions of the cost centres they own;
- payroll amounts on an owner's rows also need `hr.payroll.manage` (else shown as restricted);
- every action key below: admin / manager, or an explicit `true` grant.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.permissions import (
    HR_SETUP_BYPASS_ROLES,
    MANAGER_ONLY_ROLES,
    PERMISSION_HR_PAYROLL_MANAGE,
    PERMISSION_MGMT_PERFORMANCE_VIEW,
    get_user_role_for_tenant,
    internal_permission_granted,
)
from app.common.tenant_feature_keys import is_mgmt_performance_v1_enabled
from app.models import Tenant, User
from app.models.finance import CostCenter


@dataclass(frozen=True)
class ViewerScope:
    company: bool  # sees every cost centre and the company-level figures
    cost_center_ids: frozenset[int]  # owned cost centres (all rows when `company`)
    payroll_visible: bool
    is_manager: bool


def ensure_enabled(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    if not is_mgmt_performance_v1_enabled(tenant.feature_flags):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


async def _role(db: AsyncSession, user: User, tenant: Tenant):
    return await get_user_role_for_tenant(db, user, tenant.id)


def _role_name(role) -> str:
    return (role.name or "").strip().lower() if role is not None else ""


async def has_action(db: AsyncSession, user: User, tenant: Tenant, key: str) -> bool:
    role = await _role(db, user, tenant)
    if role is None:
        return False
    if _role_name(role) in MANAGER_ONLY_ROLES:
        return True
    return internal_permission_granted(role=role, permission_key=key)


async def assert_action(db: AsyncSession, user: User, tenant: Tenant, key: str) -> None:
    if not await has_action(db, user, tenant, key):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Requires admin or manager role, or permission '{key}'")


async def can_view_company(db: AsyncSession, user: User, tenant: Tenant) -> bool:
    return await has_action(db, user, tenant, PERMISSION_MGMT_PERFORMANCE_VIEW)


async def assert_company_view(db: AsyncSession, user: User, tenant: Tenant) -> None:
    if not await can_view_company(db, user, tenant):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Requires admin or manager role, or permission '{PERMISSION_MGMT_PERFORMANCE_VIEW}'",
        )


async def owned_cost_center_ids(db: AsyncSession, tenant_id: int, user_id: int) -> frozenset[int]:
    rows = await db.execute(
        select(CostCenter.id).where(CostCenter.tenant_id == tenant_id, CostCenter.owner_user_id == user_id)
    )
    return frozenset(int(r[0]) for r in rows.all())


async def viewer_scope(db: AsyncSession, user: User, tenant: Tenant) -> ViewerScope:
    """403 for a user who is neither a company viewer nor the owner of any cost centre."""
    role = await _role(db, user, tenant)
    manager = role is not None and _role_name(role) in MANAGER_ONLY_ROLES
    company = manager or (role is not None and internal_permission_granted(role=role, permission_key=PERMISSION_MGMT_PERFORMANCE_VIEW))
    if company:
        return ViewerScope(company=True, cost_center_ids=frozenset(), payroll_visible=True, is_manager=manager)
    owned = await owned_cost_center_ids(db, tenant.id, user.id)
    if not owned:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Requires admin or manager role, permission '{PERMISSION_MGMT_PERFORMANCE_VIEW}', or owning a cost centre",
        )
    payroll = role is not None and (
        _role_name(role) in HR_SETUP_BYPASS_ROLES
        or internal_permission_granted(role=role, permission_key=PERMISSION_HR_PAYROLL_MANAGE)
    )
    return ViewerScope(company=False, cost_center_ids=owned, payroll_visible=payroll, is_manager=False)
