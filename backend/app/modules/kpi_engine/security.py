"""Server-side KPI sensitivity and permission gates. UI hide is never the control."""

from __future__ import annotations

from typing import Any

from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.authz import get_user_role_scoped_to_tenant
from app.common.permissions import explicit_permission_granted, soft_permission_denied
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import (
    is_kpi_engine_v1_enabled,
    is_kpi_predictive_v1_enabled,
    is_user_authority_classes_v1_enabled,
)
from app.models import Role, Tenant, User

PERMISSION_KPI_READ = "kpi.read"
PERMISSION_KPI_EXECUTIVE_VIEW = "kpi.executive.view"
PERMISSION_KPI_MANAGE = "kpi.manage"

SENSITIVITY_RANK = {
    "OPERATIONAL": 1,
    "MANAGEMENT": 2,
    "CONFIDENTIAL": 3,
    "HIGHLY_CONFIDENTIAL": 4,
}


async def require_kpi_engine(
    tenant: Tenant = Depends(require_tenant),
) -> Tenant:
    if not is_kpi_engine_v1_enabled(tenant.feature_flags):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KPI engine is not enabled")
    return tenant


async def require_kpi_predictive(
    tenant: Tenant = Depends(require_kpi_engine),
) -> Tenant:
    if not is_kpi_predictive_v1_enabled(tenant.feature_flags):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KPI predictive is not enabled")
    return tenant


def _role_name(user: User, role: Role | None = None) -> str:
    r = role or getattr(user, "role", None)
    return (getattr(r, "name", None) or "").strip().lower()


def _is_privileged(user: User, role: Role | None = None) -> bool:
    if bool(getattr(user, "is_tenant_super_admin", False)):
        return True
    return _role_name(user, role) in {"admin", "manager", "super_admin", "superadmin", "owner"}


def user_max_sensitivity(user: User, tenant: Tenant, role: Role | None) -> int:
    if bool(getattr(user, "is_tenant_super_admin", False)):
        return SENSITIVITY_RANK["HIGHLY_CONFIDENTIAL"]
    cls = (getattr(user, "authority_class", None) or "").strip().upper()
    authority_on = is_user_authority_classes_v1_enabled(tenant.feature_flags)
    if authority_on:
        if cls in {"SUPER", "CLASS_1"}:
            return SENSITIVITY_RANK["HIGHLY_CONFIDENTIAL"]
        if cls == "CLASS_2":
            return SENSITIVITY_RANK["MANAGEMENT"]
        return SENSITIVITY_RANK["OPERATIONAL"]
    if _is_privileged(user, role):
        return SENSITIVITY_RANK["CONFIDENTIAL"]
    if explicit_permission_granted(role=role, permission_key=PERMISSION_KPI_EXECUTIVE_VIEW):
        return SENSITIVITY_RANK["MANAGEMENT"]
    return SENSITIVITY_RANK["OPERATIONAL"]


def can_view_definition(
    *,
    user: User,
    tenant: Tenant,
    role: Role | None,
    sensitivity: str,
    dashboard: str | None = None,
) -> bool:
    rank = SENSITIVITY_RANK.get((sensitivity or "OPERATIONAL").upper(), 1)
    if rank > user_max_sensitivity(user, tenant, role):
        return False
    if rank >= SENSITIVITY_RANK["CONFIDENTIAL"]:
        if not _is_privileged(user, role) and not bool(getattr(user, "is_tenant_super_admin", False)):
            if not (
                explicit_permission_granted(role=role, permission_key="finance.mis_report.view")
                or explicit_permission_granted(role=role, permission_key="finance.mgmt_performance.view")
                or explicit_permission_granted(role=role, permission_key=PERMISSION_KPI_EXECUTIVE_VIEW)
            ):
                return False
    if dashboard == "executive" and soft_permission_denied(role=role, permission_key=PERMISSION_KPI_EXECUTIVE_VIEW):
        return False
    if soft_permission_denied(role=role, permission_key=PERMISSION_KPI_READ):
        return False
    return True


def applicability_for_tenant(tenant: Tenant) -> set[str]:
    t = (getattr(tenant, "tenant_type", None) or "manufacturer").strip().lower()
    if t == "buying_house":
        return {"A", "B"}
    if t == "both":
        return {"F", "A", "B"}
    return {"F"}


async def get_user_role(db: AsyncSession, user: User, tenant: Tenant) -> Role | None:
    return await get_user_role_scoped_to_tenant(db, user, tenant.id)
