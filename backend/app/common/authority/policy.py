"""Server-side authority policy helpers (deny-by-default when the class flag is ON)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.authority.constants import (
    AUTHORITY_CLASS_1,
    AUTHORITY_CLASS_2,
    AUTHORITY_CLASS_3,
    AUTHORITY_CLASS_4,
    AUTHORITY_MODULE_CODES,
    AUTHORITY_SUPER,
)
from app.common.tenant_feature_keys import is_user_authority_classes_v1_enabled
from app.models import Role, User
from app.models.user_authority import UserModuleGrant


def is_authority_classes_enabled_for_tenant(feature_flags: Any) -> bool:
    return is_user_authority_classes_v1_enabled(feature_flags)


def _norm_class(value: str | None) -> str | None:
    if value is None:
        return None
    text = str(value).strip().upper()
    return text or None


async def load_user_module_codes(db: AsyncSession, *, tenant_id: int, user_id: int) -> set[str]:
    result = await db.execute(
        select(UserModuleGrant.module_code).where(
            UserModuleGrant.tenant_id == tenant_id,
            UserModuleGrant.user_id == user_id,
        )
    )
    return {str(row[0]).strip().lower() for row in result.all() if row[0]}


def user_has_module(modules: Iterable[str], module_code: str | None) -> bool:
    if not module_code:
        return False
    wanted = module_code.strip().lower()
    return wanted in {m.strip().lower() for m in modules}


async def is_class1_for_module(
    db: AsyncSession,
    user: User,
    module_code: str,
    *,
    feature_flags: Any,
) -> bool:
    """True when the user may act as Class 1 (or Super) for this module under the flag."""
    if not is_authority_classes_enabled_for_tenant(feature_flags):
        return False
    if not user.is_active:
        return False
    if bool(getattr(user, "is_tenant_super_admin", False)):
        return True
    cls = _norm_class(getattr(user, "authority_class", None))
    if cls not in {AUTHORITY_SUPER, AUTHORITY_CLASS_1}:
        return False
    modules = await load_user_module_codes(db, tenant_id=user.tenant_id, user_id=user.id)
    return user_has_module(modules, module_code)


async def can_view_pnl_balance_sheet(
    db: AsyncSession,
    user: User,
    *,
    feature_flags: Any,
) -> bool:
    """P&L / Balance Sheet: Class 1 or Super with the finance module (or Super Admin).

    When the authority flag is OFF, returns True so legacy RBAC alone decides.
    """
    if not is_authority_classes_enabled_for_tenant(feature_flags):
        return True
    if not user.is_active:
        return False
    if bool(getattr(user, "is_tenant_super_admin", False)):
        return True
    cls = _norm_class(getattr(user, "authority_class", None))
    if cls not in {AUTHORITY_SUPER, AUTHORITY_CLASS_1}:
        return False
    modules = await load_user_module_codes(db, tenant_id=user.tenant_id, user_id=user.id)
    return user_has_module(modules, "finance")


async def assert_pnl_balance_sheet_allowed(
    db: AsyncSession,
    user: User,
    *,
    feature_flags: Any,
) -> None:
    """403 when the authority flag is ON and the caller may not see P&L / Balance Sheet."""
    if await can_view_pnl_balance_sheet(db, user, feature_flags=feature_flags):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Profit & Loss and Balance Sheet are limited to Class 1 (with Finance) and Super Admin.",
    )


async def is_tenant_admin_equivalent(
    db: AsyncSession,
    user: User,
    tenant_id: int,
    *,
    feature_flags: Any,
) -> bool:
    """Legacy admin role, or Class 1 / Super when the authority flag is ON."""
    if user.tenant_id != tenant_id:
        return False
    role_result = await db.execute(
        select(Role).where(Role.id == user.role_id, Role.tenant_id == tenant_id).limit(1)
    )
    role = role_result.scalar_one_or_none()
    if role is not None and (role.name or "").strip().lower() == "admin":
        return True
    if not is_authority_classes_enabled_for_tenant(feature_flags):
        return False
    # Only the marked Super Admin identity, or Class 1 (admin-equivalent for ordinary admin work).
    if bool(getattr(user, "is_tenant_super_admin", False)):
        return True
    return _norm_class(getattr(user, "authority_class", None)) == AUTHORITY_CLASS_1


async def is_manager_equivalent_for_module(
    db: AsyncSession,
    user: User,
    tenant_id: int,
    module_code: str,
    *,
    feature_flags: Any,
) -> bool:
    """Legacy admin/manager role, or Class 1 / Super with the module when the authority flag is ON."""
    if user.tenant_id != tenant_id:
        return False
    role_result = await db.execute(
        select(Role).where(Role.id == user.role_id, Role.tenant_id == tenant_id).limit(1)
    )
    role = role_result.scalar_one_or_none()
    role_name = (role.name or "").strip().lower() if role is not None else ""
    if role_name in {"admin", "manager"}:
        return True
    if not is_authority_classes_enabled_for_tenant(feature_flags):
        return False
    return await is_class1_for_module(db, user, module_code, feature_flags=feature_flags)


async def elevated_role_or_manager_equivalent(
    db: AsyncSession,
    user: User,
    *,
    module_code: str,
    feature_flags: Any,
    elevated_role_names: Iterable[str] = ("admin", "manager", "owner", "super_admin", "superadmin"),
) -> bool:
    """True when the user's role name is elevated, or Class 1/Super holds the module (flag ON).

    Used to replace hardcoded admin/manager allow-lists in merch/sales capability gates
    without changing behaviour while ``user_authority_classes_v1`` is OFF.
    """
    if user.tenant_id is None:
        return False
    role_result = await db.execute(
        select(Role).where(Role.id == user.role_id, Role.tenant_id == user.tenant_id).limit(1)
    )
    role = role_result.scalar_one_or_none()
    role_name = (role.name or "").strip().lower() if role is not None else ""
    allowed = {n.strip().lower() for n in elevated_role_names if n}
    if role_name in allowed:
        return True
    return await is_manager_equivalent_for_module(
        db, user, user.tenant_id, module_code, feature_flags=feature_flags
    )


def assert_super_admin_protected(
    target: User,
    *,
    feature_flags: Any = None,
    actor: User | None = None,
    action: str = "modify",
) -> None:
    """Refuse delete / deactivate / demote / edit of the protected Super Admin identity.

    Protection follows ``is_tenant_super_admin`` and does **not** depend on the feature flag,
    so turning the flag off cannot unlock deletion. Platform break-glass resets credentials
    without calling this helper.
    """
    del feature_flags, actor  # reserved for future allow-lists; identity lock is absolute here
    if not bool(getattr(target, "is_tenant_super_admin", False)):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=(
            f"The company Super Admin cannot be {action}d through normal user management. "
            "Use the platform break-glass recovery procedure if credentials must be reset."
        ),
    )


def bump_auth_session_version(user: User) -> None:
    user.auth_session_version = int(user.auth_session_version or 0) + 1


async def effective_authority_payload(
    db: AsyncSession,
    user: User,
    *,
    feature_flags: Any,
) -> dict[str, Any]:
    """Fields returned on ``/auth/me`` (null-friendly when flag OFF)."""
    enabled = is_authority_classes_enabled_for_tenant(feature_flags)
    modules = sorted(await load_user_module_codes(db, tenant_id=user.tenant_id, user_id=user.id))
    can_pnl = True
    if enabled:
        can_pnl = await can_view_pnl_balance_sheet(db, user, feature_flags=feature_flags)
    return {
        "authority_classes_enabled": enabled,
        "authority_class": _norm_class(getattr(user, "authority_class", None)) if enabled else None,
        "is_tenant_super_admin": bool(getattr(user, "is_tenant_super_admin", False)) if enabled else False,
        "module_grants": modules if enabled else [],
        "available_modules": list(AUTHORITY_MODULE_CODES),
        "can_view_pnl_balance_sheet": can_pnl,
    }


@dataclass(frozen=True)
class AuthorityPreflightResult:
    ok: bool
    errors: tuple[str, ...]
    warnings: tuple[str, ...]


async def preflight_authority_activation(
    db: AsyncSession,
    tenant_id: int,
    *,
    required_modules: Iterable[str] | None = None,
) -> AuthorityPreflightResult:
    """Check Super Admin + enough distinct Class 1-4 users before enabling the flag."""
    errors: list[str] = []
    warnings: list[str] = []

    super_q = await db.execute(
        select(func.count())
        .select_from(User)
        .where(
            User.tenant_id == tenant_id,
            User.is_tenant_super_admin.is_(True),
            User.is_active.is_(True),
        )
    )
    super_count = int(super_q.scalar_one() or 0)
    if super_count != 1:
        errors.append(
            f"Exactly one active Super Admin is required before enabling authority classes "
            f"(found {super_count})."
        )

    modules = [m.strip().lower() for m in (required_modules or AUTHORITY_MODULE_CODES) if m]
    # Users with any grant, or Super Admin (treated as all modules).
    users_result = await db.execute(
        select(User).where(User.tenant_id == tenant_id, User.is_active.is_(True))
    )
    users = list(users_result.scalars().all())
    grants_result = await db.execute(
        select(UserModuleGrant.user_id, UserModuleGrant.module_code).where(
            UserModuleGrant.tenant_id == tenant_id
        )
    )
    grants_by_user: dict[int, set[str]] = {}
    for uid, code in grants_result.all():
        grants_by_user.setdefault(int(uid), set()).add(str(code).strip().lower())

    def _modules_for(u: User) -> set[str]:
        if bool(getattr(u, "is_tenant_super_admin", False)):
            return set(modules)
        cls = _norm_class(getattr(u, "authority_class", None))
        if cls == AUTHORITY_SUPER:
            return set(modules)
        return grants_by_user.get(u.id, set())

    for module in modules:
        by_class: dict[str, list[User]] = {
            AUTHORITY_CLASS_1: [],
            AUTHORITY_CLASS_2: [],
            AUTHORITY_CLASS_3: [],
            AUTHORITY_CLASS_4: [],
        }
        for u in users:
            if module not in _modules_for(u):
                continue
            cls = _norm_class(getattr(u, "authority_class", None))
            if bool(getattr(u, "is_tenant_super_admin", False)):
                cls = AUTHORITY_SUPER
            if cls == AUTHORITY_SUPER:
                by_class[AUTHORITY_CLASS_1].append(u)
            elif cls in by_class:
                by_class[cls].append(u)

        missing = [
            label
            for label, key in (
                ("Class 1", AUTHORITY_CLASS_1),
                ("Class 2", AUTHORITY_CLASS_2),
                ("Class 3", AUTHORITY_CLASS_3),
                ("Class 4", AUTHORITY_CLASS_4),
            )
            if not by_class[key]
        ]
        if missing:
            # Only require staffing for modules that already have at least one grant,
            # so empty unused modules do not block activation.
            anyone = any(by_class[k] for k in by_class)
            if anyone or any(module in g for g in grants_by_user.values()):
                errors.append(
                    f"Module '{module}' needs active users for: {', '.join(missing)}."
                )
            continue

        # Distinct people across Class 1-4 for this module (Super counts as Class 1).
        ids = {
            u.id
            for key in (AUTHORITY_CLASS_1, AUTHORITY_CLASS_2, AUTHORITY_CLASS_3, AUTHORITY_CLASS_4)
            for u in by_class[key]
        }
        if len(ids) < 4:
            errors.append(
                f"Module '{module}' needs four different people covering Class 1-4 "
                f"(found {len(ids)} distinct users)."
            )
        if len(by_class[AUTHORITY_CLASS_1]) == 1 and not any(
            bool(getattr(u, "is_tenant_super_admin", False)) for u in by_class[AUTHORITY_CLASS_1]
        ):
            warnings.append(
                f"Module '{module}' has only one Class 1 user; their own direct entries "
                "will stay pending Class 1 approval."
            )
        elif len(by_class[AUTHORITY_CLASS_1]) == 1:
            warnings.append(
                f"Module '{module}' has only one Class 1 / Super Admin actor; "
                "entries they create will stay pending until another Class 1 is added."
            )

    return AuthorityPreflightResult(ok=not errors, errors=tuple(errors), warnings=tuple(warnings))
