"""Apply Class + module grants + optional employee link for Settings user admin."""

from __future__ import annotations

from typing import Any, Iterable

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.common.authority.constants import (
    AUTHORITY_CLASS_1,
    AUTHORITY_CLASS_2,
    AUTHORITY_CLASS_3,
    AUTHORITY_CLASS_4,
    AUTHORITY_MODULE_CODES,
    AUTHORITY_SUPER,
)
from app.common.authority.policy import bump_auth_session_version, is_authority_classes_enabled_for_tenant
from app.modules.auth.session_service import ENDED_AUTHORITY_CHANGED, close_open_sessions
from app.models import Role, User
from app.models.hr import Designation, Employee
from app.models.user_authority import UserModuleGrant

ASSIGNABLE_CLASSES: tuple[str, ...] = (
    AUTHORITY_CLASS_1,
    AUTHORITY_CLASS_2,
    AUTHORITY_CLASS_3,
    AUTHORITY_CLASS_4,
)


def _employee_display_name(emp: Employee) -> str:
    return f"{emp.first_name} {(emp.last_name or '').strip()}".strip()


def normalize_authority_class(value: str | None) -> str | None:
    if value is None:
        return None
    text = str(value).strip().upper()
    return text or None


def normalize_module_grants(modules: Iterable[str] | None) -> list[str]:
    if not modules:
        return []
    allowed = {m.lower() for m in AUTHORITY_MODULE_CODES}
    out: list[str] = []
    seen: set[str] = set()
    for raw in modules:
        code = str(raw or "").strip().lower()
        if not code or code in seen:
            continue
        if code not in allowed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown module '{code}'. Allowed: {', '.join(AUTHORITY_MODULE_CODES)}",
            )
        seen.add(code)
        out.append(code)
    return out


async def resolve_role_for_authority_class(
    db: AsyncSession,
    *,
    tenant_id: int,
    authority_class: str,
    role_id: int | None,
) -> Role:
    """Keep a real role_id for FK/rollback; prefer admin for Class 1, else user/manager."""
    if role_id is not None:
        role = (
            await db.execute(select(Role).where(Role.id == role_id, Role.tenant_id == tenant_id).limit(1))
        ).scalar_one_or_none()
        if role is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Role not found for this tenant")
        return role
    preferred = ("admin",) if authority_class == AUTHORITY_CLASS_1 else ("user", "manager", "admin")
    for name in preferred:
        role = (
            await db.execute(
                select(Role).where(Role.tenant_id == tenant_id, Role.name == name).limit(1)
            )
        ).scalar_one_or_none()
        if role is not None:
            return role
    any_role = (
        await db.execute(select(Role).where(Role.tenant_id == tenant_id).order_by(Role.id.asc()).limit(1))
    ).scalar_one_or_none()
    if any_role is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant has no roles")
    return any_role


async def replace_module_grants(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int,
    modules: list[str],
) -> None:
    existing = (
        await db.execute(
            select(UserModuleGrant).where(
                UserModuleGrant.tenant_id == tenant_id,
                UserModuleGrant.user_id == user_id,
            )
        )
    ).scalars().all()
    for row in existing:
        await db.delete(row)
    # Flush deletes before inserts so overlapping module codes cannot hit the unique key.
    await db.flush()
    for code in modules:
        db.add(UserModuleGrant(tenant_id=tenant_id, user_id=user_id, module_code=code))
    await db.flush()


async def link_employee_to_user(
    db: AsyncSession,
    *,
    tenant_id: int,
    user: User,
    employee_id: int | None,
    clear_link: bool = False,
) -> str | None:
    """Link/unlink employee.user_id; return designation title for display."""
    if clear_link or employee_id is None:
        linked = (
            await db.execute(
                select(Employee).where(Employee.tenant_id == tenant_id, Employee.user_id == user.id).limit(1)
            )
        ).scalar_one_or_none()
        if linked is not None:
            linked.user_id = None
            await db.flush()
        if employee_id is None and not clear_link:
            return None
        if clear_link and employee_id is None:
            return None

    emp = (
        await db.execute(
            select(Employee)
            .options(selectinload(Employee.designation))
            .where(Employee.id == employee_id, Employee.tenant_id == tenant_id)
            .limit(1)
        )
    ).scalar_one_or_none()
    if emp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    if not emp.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Employee is inactive")
    if emp.user_id is not None and emp.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Employee is already linked to another user",
        )
    # Clear previous link for this user if different employee.
    prev = (
        await db.execute(
            select(Employee).where(
                Employee.tenant_id == tenant_id,
                Employee.user_id == user.id,
                Employee.id != emp.id,
            )
        )
    ).scalars().all()
    for row in prev:
        row.user_id = None
    emp.user_id = user.id
    title = None
    if emp.designation is not None:
        title = emp.designation.title
    elif emp.designation_id is not None:
        des = await db.get(Designation, emp.designation_id)
        if des is not None and des.tenant_id == tenant_id:
            title = des.title
    if title:
        user.designation = title[:128]
    await db.flush()
    return title


async def load_linked_employee_info(
    db: AsyncSession, *, tenant_id: int, user_id: int
) -> tuple[int | None, str | None, str | None]:
    emp = (
        await db.execute(
            select(Employee)
            .options(selectinload(Employee.designation))
            .where(Employee.tenant_id == tenant_id, Employee.user_id == user_id)
            .limit(1)
        )
    ).scalar_one_or_none()
    if emp is None:
        return None, None, None
    title = emp.designation.title if emp.designation is not None else None
    label = f"{emp.employee_code} — {_employee_display_name(emp)}".strip(" —")
    return emp.id, title, label


async def apply_authority_on_create(
    db: AsyncSession,
    *,
    tenant_id: int,
    user: User,
    feature_flags: Any,
    authority_class: str | None,
    module_grants: list[str] | None,
    employee_id: int | None,
) -> None:
    if not is_authority_classes_enabled_for_tenant(feature_flags):
        return
    cls = normalize_authority_class(authority_class)
    if cls is None or cls not in ASSIGNABLE_CLASSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="authority_class must be CLASS_1, CLASS_2, CLASS_3 or CLASS_4",
        )
    if cls == AUTHORITY_SUPER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Super Admin cannot be assigned through normal user create",
        )
    modules = normalize_module_grants(module_grants)
    if not modules:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Select at least one module for this user",
        )
    user.authority_class = cls
    user.is_tenant_super_admin = False
    await replace_module_grants(db, tenant_id=tenant_id, user_id=user.id, modules=modules)
    if employee_id is not None:
        await link_employee_to_user(db, tenant_id=tenant_id, user=user, employee_id=employee_id)


async def apply_authority_on_update(
    db: AsyncSession,
    *,
    tenant_id: int,
    user: User,
    feature_flags: Any,
    authority_class: str | None,
    module_grants: list[str] | None,
    employee_id: int | None,
    clear_employee_link: bool,
    authority_fields_provided: bool,
) -> bool:
    """Returns True when session should be invalidated."""
    if not is_authority_classes_enabled_for_tenant(feature_flags):
        return False
    if bool(getattr(user, "is_tenant_super_admin", False)):
        # Caller should already have blocked via assert_super_admin_protected.
        return False
    changed = False
    if authority_class is not None:
        cls = normalize_authority_class(authority_class)
        if cls not in ASSIGNABLE_CLASSES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="authority_class must be CLASS_1, CLASS_2, CLASS_3 or CLASS_4",
            )
        if user.authority_class != cls:
            user.authority_class = cls
            changed = True
    if module_grants is not None:
        modules = normalize_module_grants(module_grants)
        if not modules:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Select at least one module for this user",
            )
        current = {
            r.module_code
            for r in (
                await db.execute(
                    select(UserModuleGrant).where(
                        UserModuleGrant.tenant_id == tenant_id,
                        UserModuleGrant.user_id == user.id,
                    )
                )
            ).scalars().all()
        }
        if set(modules) != current:
            await replace_module_grants(db, tenant_id=tenant_id, user_id=user.id, modules=modules)
            changed = True
    if clear_employee_link or employee_id is not None:
        before_emp_id, _, _ = await load_linked_employee_info(db, tenant_id=tenant_id, user_id=user.id)
        await link_employee_to_user(
            db,
            tenant_id=tenant_id,
            user=user,
            employee_id=None if clear_employee_link else employee_id,
            clear_link=clear_employee_link,
        )
        after_emp_id, _, _ = await load_linked_employee_info(db, tenant_id=tenant_id, user_id=user.id)
        if before_emp_id != after_emp_id:
            changed = True
    if changed:
        bump_auth_session_version(user)
        await close_open_sessions(
            db,
            tenant_id=tenant_id,
            user_id=user.id,
            reason=ENDED_AUTHORITY_CHANGED,
        )
    return changed


async def search_linkable_employees(
    db: AsyncSession,
    *,
    tenant_id: int,
    search: str | None,
    limit: int = 25,
) -> list[dict[str, Any]]:
    q = (
        select(Employee, Designation)
        .outerjoin(Designation, Designation.id == Employee.designation_id)
        .where(
            Employee.tenant_id == tenant_id,
            Employee.is_active.is_(True),
            Employee.user_id.is_(None),
        )
        .order_by(Employee.employee_code.asc())
        .limit(limit)
    )
    term = (search or "").strip()
    if term:
        like = f"%{term}%"
        q = q.where(
            or_(
                Employee.employee_code.ilike(like),
                Employee.first_name.ilike(like),
                Employee.last_name.ilike(like),
                Employee.email.ilike(like),
            )
        )
    rows = (await db.execute(q)).all()
    out: list[dict[str, Any]] = []
    for emp, des in rows:
        name = _employee_display_name(emp)
        out.append(
            {
                "id": emp.id,
                "employee_code": emp.employee_code,
                "full_name": name,
                "designation_title": des.title if des is not None else None,
                "label": f"{emp.employee_code} — {name}"
                + (f" ({des.title})" if des is not None and des.title else ""),
            }
        )
    return out
