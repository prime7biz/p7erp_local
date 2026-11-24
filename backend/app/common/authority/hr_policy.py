"""HR Class 1-4 voucher-style authority helpers.

Behaviour is inert while ``user_authority_classes_v1`` is OFF. When ON, gates read
``users.authority_class`` + ``user_module_grants`` only — never legacy role names.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Literal

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.authority.constants import (
    AUTHORITY_CLASS_1,
    AUTHORITY_CLASS_2,
    AUTHORITY_CLASS_3,
    AUTHORITY_CLASS_4,
    AUTHORITY_SUPER,
    ERP_AUTHORITY_MODULE_CODES,
)
from app.common.authority.policy import (
    is_authority_classes_enabled_for_tenant,
    load_user_module_codes,
    user_has_module,
)
from app.common.business_date import today_local
from app.common.tenant_feature_keys import get_tenant_rbac_mode
from app.database import get_db
from app.models import Tenant, User
from app.models.hr import Employee

HR_REQUEST_REQUIRED = "HR_REQUEST_REQUIRED"

HrActorRole = Literal["SUPER", "ENTRY", "RECOMMEND", "APPROVE", "NONE"]
SystemAccessMode = Literal["NONE", "ESS_ONLY", "ERP_USER"]


def _norm_class(value: str | None) -> str | None:
    if value is None:
        return None
    text = str(value).strip().upper()
    return text or None


def is_hr_authority_enabled(feature_flags: Any) -> bool:
    return is_authority_classes_enabled_for_tenant(feature_flags)


async def hr_actor_role(
    db: AsyncSession,
    user: User,
    *,
    feature_flags: Any,
    require_hr_module: bool = True,
) -> HrActorRole:
    """Map the user to an HR workflow role when the authority flag is ON.

    Returns ``NONE`` when the flag is OFF (callers should fall back to legacy behaviour),
    or when the user is inactive / lacks the ``hr`` grant (unless Super Admin).
    """
    if not is_hr_authority_enabled(feature_flags):
        return "NONE"
    if not user.is_active:
        return "NONE"
    if bool(getattr(user, "is_tenant_super_admin", False)):
        return "SUPER"
    cls = _norm_class(getattr(user, "authority_class", None))
    if cls is None:
        return "NONE"
    modules = await load_user_module_codes(db, tenant_id=user.tenant_id, user_id=user.id)
    if require_hr_module and not user_has_module(modules, "hr") and cls != AUTHORITY_SUPER:
        return "NONE"
    if cls in {AUTHORITY_SUPER, AUTHORITY_CLASS_1}:
        return "APPROVE"
    if cls == AUTHORITY_CLASS_2:
        return "RECOMMEND"
    if cls in {AUTHORITY_CLASS_3, AUTHORITY_CLASS_4}:
        return "ENTRY"
    return "NONE"


def auto_recommend_on_entry(role: HrActorRole) -> bool:
    """Only Class 2 entry auto-records the recommend step."""
    return role == "RECOMMEND"


async def assert_hr_sod(
    db: AsyncSession,
    *,
    tenant: Tenant,
    actor: User,
    entered_by: int | None,
    recommended_by: int | None = None,
    employee_id: int | None = None,
    step: Literal["recommend", "approve"],
) -> None:
    """Separation of duties + self-target block (Super Admin exempt)."""
    if bool(getattr(actor, "is_tenant_super_admin", False)):
        return
    if entered_by is not None and actor.id == entered_by:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot recommend or approve a request you entered",
        )
    if step == "approve" and recommended_by is not None and actor.id == recommended_by:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The recommender cannot also give the final approval",
        )
    if employee_id is None:
        return
    emp = (
        await db.execute(
            select(Employee.id, Employee.user_id).where(
                Employee.id == employee_id,
                Employee.tenant_id == tenant.id,
            ).limit(1)
        )
    ).one_or_none()
    if emp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    if emp.user_id is not None and emp.user_id == actor.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot recommend or approve a request about your own employee record",
        )


async def assert_hr_master_write_allowed(
    db: AsyncSession,
    user: User,
    tenant: Tenant,
    *,
    allow_delete: bool = False,
) -> None:
    """Department / section / designation create+edit: Class 1/2 or Super. Delete: Class 1 or Super."""
    if not is_hr_authority_enabled(tenant.feature_flags):
        return
    role = await hr_actor_role(db, user, feature_flags=tenant.feature_flags)
    if role == "SUPER":
        return
    if allow_delete:
        if role == "APPROVE":
            return
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Class 1 or Super Admin can delete departments, sections or designations",
        )
    if role in {"APPROVE", "RECOMMEND"}:
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Only Class 1, Class 2 or Super Admin can create or edit departments, sections or designations",
    )


async def assert_hr_request_required(db: AsyncSession, user: User, tenant: Tenant) -> None:
    """409 for every non–Super Admin when the flag is ON (including null authority_class)."""
    if not is_hr_authority_enabled(tenant.feature_flags):
        return
    if bool(getattr(user, "is_tenant_super_admin", False)):
        return
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=(
            f"{HR_REQUEST_REQUIRED}: while fixed-class authority is on, this change must go "
            "through an HR Request (Class 3/4 enter → Class 2 recommend → Class 1 approve)."
        ),
    )


async def assert_final_settlement_class1(db: AsyncSession, user: User, tenant: Tenant) -> None:
    if not is_hr_authority_enabled(tenant.feature_flags):
        return
    role = await hr_actor_role(db, user, feature_flags=tenant.feature_flags)
    if role in {"SUPER", "APPROVE"}:
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Final settlement approve, post, pay and reverse need Class 1 or Super Admin",
    )


@dataclass(frozen=True)
class InviteApprovalDecision:
    allowed: bool
    detail: str = ""


async def assert_erp_user_invite_approver(
    db: AsyncSession,
    *,
    tenant: Tenant,
    actor: User,
    system_access: SystemAccessMode,
    authority_class: str | None,
    module_grants: Iterable[str] | None,
) -> None:
    """Option A: who may approve the login part of a NEW_EMPLOYEE request."""
    if not is_hr_authority_enabled(tenant.feature_flags):
        return
    if bool(getattr(actor, "is_tenant_super_admin", False)):
        return

    role = await hr_actor_role(db, actor, feature_flags=tenant.feature_flags)
    if system_access in {"NONE", "ESS_ONLY"}:
        if role in {"SUPER", "APPROVE"}:
            return
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ESS-only or no-login employee requests need Class 1 (with HR) or Super Admin approval",
        )

    # ERP_USER
    cls = _norm_class(authority_class)
    if cls is None or cls == AUTHORITY_SUPER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ERP system user invites need CLASS_1..CLASS_4 (SUPER cannot be requested from HR)",
        )
    modules = sorted({str(m).strip().lower() for m in (module_grants or []) if str(m).strip()})
    if not modules:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Select at least one module")
    unknown = [m for m in modules if m not in set(ERP_AUTHORITY_MODULE_CODES) | {"ess"}]
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown module(s): {', '.join(unknown)}",
        )

    needs_super = cls == AUTHORITY_CLASS_1 or "settings" in modules
    if needs_super:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Granting Class 1 or the Settings module needs Super Admin approval",
        )

    if role != "APPROVE":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ERP user invites need Class 1 (with HR and Settings) or Super Admin approval",
        )
    actor_modules = await load_user_module_codes(db, tenant_id=actor.tenant_id, user_id=actor.id)
    if not user_has_module(actor_modules, "hr") or not user_has_module(actor_modules, "settings"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ERP user invites need a Class 1 approver who holds both HR and Settings",
        )
    missing = [m for m in modules if m != "ess" and not user_has_module(actor_modules, m)]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You can only grant modules you hold yourself. Missing: "
                + ", ".join(missing)
                + ". Ask Super Admin to approve this invite."
            ),
        )


async def load_linked_employee_for_ess(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
) -> Employee:
    """Active linked employee with ESS enabled and exit date not before today (flag ON)."""
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(Employee)
        .options(selectinload(Employee.department), selectinload(Employee.designation))
        .where(Employee.tenant_id == tenant.id, Employee.user_id == user.id)
        .limit(1)
    )
    employee = result.scalar_one_or_none()
    if employee is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee profile not linked with current user",
        )
    if not is_hr_authority_enabled(tenant.feature_flags):
        return employee
    if not employee.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Employee record is inactive")
    if not bool(getattr(employee, "ess_enabled", False)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Employee self-service (ESS) is not enabled for this login",
        )
    today = today_local(tenant)
    if employee.exit_date is not None and employee.exit_date < today:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Employee exit date has passed; ESS access is closed",
        )
    return employee


def require_ess_access():
    """FastAPI Depends for My HR routes when authority classes are ON.

    Flag OFF: same as ``hr.access`` (legacy soft/enforce RBAC). Flag ON: needs ``ess`` or
    ``hr`` module grant plus an active linked ESS-enabled employee. Attaches
    ``permission_keys`` for the route inventory test.
    """
    from app.common.authority.module_access import assert_module_grant_for_permissions
    from app.common.permissions import (
        RBAC_MODE_ENFORCE,
        get_user_role_for_tenant,
        internal_permission_granted,
    )

    keys = ("hr.access", "ess.access")

    async def _dep(
        request: Request,
        user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> None:
        if getattr(request.state, "tenant_feature_flags_cached", False):
            tenant_feature_flags = getattr(request.state, "tenant_feature_flags", None)
            tenant = getattr(request.state, "tenant", None)
        else:
            tenant_result = await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))
            tenant = tenant_result.scalar_one_or_none()
            tenant_feature_flags = tenant.feature_flags if tenant else None
            request.state.tenant_feature_flags = tenant_feature_flags
            request.state.tenant_feature_flags_cached = True
            request.state.tenant = tenant

        if tenant is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

        rbac_mode = get_tenant_rbac_mode(tenant_feature_flags)

        if not is_hr_authority_enabled(tenant_feature_flags):
            # Legacy: hr.access only (same soft/enforce behaviour as other HR routes).
            if rbac_mode == "off":
                return
            role = await get_user_role_for_tenant(db, user, user.tenant_id)
            if internal_permission_granted(role=role, permission_key="hr.access"):
                return
            if rbac_mode != RBAC_MODE_ENFORCE:
                return
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing permission: hr.access")

        await assert_module_grant_for_permissions(
            db,
            user,
            ("ess.access", "hr.access"),
            feature_flags=tenant_feature_flags,
            match_any=True,
        )
        # Module grant is the control under authority classes; soft RBAC keys are not required
        # for CLASS_4 ESS-only users (they typically have neither hr.access nor ess.access).
        del rbac_mode
        await load_linked_employee_for_ess(db, tenant=tenant, user=user)

    _dep.permission_keys = keys  # type: ignore[attr-defined]
    return _dep
