"""Phase 7 cutover: dry-run proposals, apply, restore for user_authority_classes_v1.

Does NOT enable the tenant flag. Human confirmation required per tenant.
Original role_id / permissions are never rewritten — only class + module grants
and is_tenant_super_admin are applied/restored from immutable snapshots.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.common.authority.constants import (
    AUTHORITY_CLASS_1,
    AUTHORITY_CLASS_2,
    AUTHORITY_CLASS_3,
    AUTHORITY_CLASS_4,
    AUTHORITY_MODULE_CODES,
)
from app.common.authority.module_access import module_code_for_permission
from app.common.authority.policy import bump_auth_session_version
from app.common.authority.user_admin import replace_module_grants
from app.models import Role, User
from app.models.authority_cutover import AuthorityCutoverSnapshot
from app.models.user_authority import UserModuleGrant

STATUS_PROPOSED = "PROPOSED"
STATUS_APPLIED = "APPLIED"
STATUS_SKIPPED = "SKIPPED"
STATUS_UNRESOLVED = "UNRESOLVED"

_ADMIN_NAMES = {"admin", "owner", "super_admin", "superadmin"}
_MANAGER_NAMES = {"manager", "supervisor"}


def _role_name(role: Role | None) -> str:
    return (getattr(role, "name", None) or "").strip().lower()


def _loaded_role(user: User) -> Role | None:
    """Return User.role only if already present in memory (never trigger lazy IO)."""
    return user.__dict__.get("role")


async def _load_role_for_tenant(
    db: AsyncSession, *, role_id: int | None, tenant_id: int
) -> Role | None:
    """Load a Role by id only when it belongs to the given tenant (never bare db.get)."""
    if not role_id:
        return None
    return (
        await db.execute(
            select(Role).where(Role.id == role_id, Role.tenant_id == tenant_id).limit(1)
        )
    ).scalar_one_or_none()


def modules_from_role_permissions(permissions: Any) -> list[str]:
    """Map Role.permissions keys to authority module codes (never mutate the role)."""
    if not isinstance(permissions, dict):
        return []
    allowed = {m.lower() for m in AUTHORITY_MODULE_CODES}
    found: set[str] = set()
    for key, val in permissions.items():
        if val is False:
            continue
        code = module_code_for_permission(str(key))
        if code and code in allowed:
            found.add(code)
        # Bare module key or "*" style
        raw = str(key).strip().lower()
        if raw in allowed:
            found.add(raw)
        if raw in {"*", "all"} and val:
            found.update(allowed)
    return sorted(found)


async def _current_module_grants(db: AsyncSession, *, tenant_id: int, user_id: int) -> list[str]:
    rows = (
        await db.execute(
            select(UserModuleGrant.module_code).where(
                UserModuleGrant.tenant_id == tenant_id,
                UserModuleGrant.user_id == user_id,
            )
        )
    ).scalars().all()
    return sorted({str(c).strip().lower() for c in rows if c})


def _propose_for_user(
    *,
    user: User,
    role: Role | None,
    earliest_admin_id: int | None,
) -> tuple[str | None, bool, list[str], str, str]:
    """Return (class, is_super, modules, status, reason)."""
    if not user.is_active:
        return None, False, [], STATUS_SKIPPED, "Inactive user — left unchanged"
    rname = _role_name(role)
    modules = modules_from_role_permissions(getattr(role, "permissions", None) if role else None)
    if not modules and rname in _ADMIN_NAMES | _MANAGER_NAMES:
        modules = sorted({m.lower() for m in AUTHORITY_MODULE_CODES})

    if rname in _ADMIN_NAMES and earliest_admin_id is not None and user.id == earliest_admin_id:
        return None, True, modules or sorted({m.lower() for m in AUTHORITY_MODULE_CODES}), STATUS_PROPOSED, (
            "Earliest admin suggested as Super Admin (human must confirm)"
        )
    if rname in _ADMIN_NAMES:
        return AUTHORITY_CLASS_1, False, modules or ["settings", "finance", "inventory", "merch", "hr", "production"], STATUS_PROPOSED, (
            "Other admin → Class 1"
        )
    if rname in _MANAGER_NAMES:
        return AUTHORITY_CLASS_2, False, modules or ["inventory", "merch", "production", "hr"], STATUS_PROPOSED, (
            "Manager → Class 2"
        )
    if role is None:
        return None, False, [], STATUS_UNRESOLVED, "No role assigned — blocked until resolved"
    # Soft permission hints for Class 3 vs 4
    perms = getattr(role, "permissions", None) if role else {}
    perm_keys = {str(k).lower() for k in (perms or {})} if isinstance(perms, dict) else set()
    if any("check" in k or "verify" in k for k in perm_keys):
        return AUTHORITY_CLASS_3, False, modules, STATUS_PROPOSED, "Verifier-style permissions → Class 3"
    if modules:
        return AUTHORITY_CLASS_4, False, modules, STATUS_PROPOSED, "Standard user → Class 4 with mapped modules"
    return AUTHORITY_CLASS_4, False, [], STATUS_PROPOSED, "Standard user → Class 4 (no module grants inferred)"


async def dry_run_cutover(db: AsyncSession, *, tenant_id: int) -> dict[str, Any]:
    """Create/refresh PROPOSED rows. Never changes users. Idempotent for originals."""
    users = (
        await db.execute(
            select(User)
            .where(User.tenant_id == tenant_id)
            .options(selectinload(User.role))
            .order_by(User.id.asc())
            .execution_options(populate_existing=True)
        )
    ).scalars().all()

    admin_ids = [
        u.id
        for u in users
        if u.is_active
        and _role_name(_loaded_role(u)) in _ADMIN_NAMES
        and getattr(_loaded_role(u), "tenant_id", None) == tenant_id
    ]
    earliest_admin_id = admin_ids[0] if admin_ids else None

    existing = {
        row.user_id: row
        for row in (
            await db.execute(
                select(AuthorityCutoverSnapshot).where(AuthorityCutoverSnapshot.tenant_id == tenant_id)
            )
        ).scalars().all()
    }

    proposals: list[dict[str, Any]] = []
    unresolved = 0
    for user in users:
        role = _loaded_role(user)
        if role is None or getattr(role, "tenant_id", None) != tenant_id:
            role = await _load_role_for_tenant(db, role_id=user.role_id, tenant_id=tenant_id)
        cls, is_super, modules, st, reason = _propose_for_user(
            user=user, role=role, earliest_admin_id=earliest_admin_id
        )
        if st == STATUS_UNRESOLVED:
            unresolved += 1

        current_grants = await _current_module_grants(db, tenant_id=tenant_id, user_id=user.id)
        row = existing.get(user.id)
        if row is None:
            if role is None:
                # Cannot snapshot without role_id FK — mark unresolved without insert
                proposals.append(
                    {
                        "user_id": user.id,
                        "username": user.username,
                        "status": STATUS_UNRESOLVED,
                        "reason": reason,
                        "proposed_authority_class": None,
                        "proposed_is_tenant_super_admin": False,
                        "proposed_module_grants": [],
                    }
                )
                continue
            row = AuthorityCutoverSnapshot(
                tenant_id=tenant_id,
                user_id=user.id,
                original_role_id=user.role_id,
                original_role_name=_role_name(role) or None,
                original_authority_class=getattr(user, "authority_class", None),
                original_is_tenant_super_admin=bool(getattr(user, "is_tenant_super_admin", False)),
                original_module_grants=current_grants,
            )
            db.add(row)
        else:
            # Originals stay immutable once written; only refresh proposals unless APPLIED
            if row.status == STATUS_APPLIED and row.restored_at is None:
                proposals.append(_row_out(row, user))
                continue

        row.proposed_authority_class = cls
        row.proposed_is_tenant_super_admin = is_super
        row.proposed_module_grants = modules
        row.status = st
        row.reason = reason
        row.updated_at = datetime.utcnow()
        proposals.append(_row_out(row, user))

    await db.flush()
    return {
        "tenant_id": tenant_id,
        "earliest_admin_user_id": earliest_admin_id,
        "unresolved_count": unresolved,
        "blocked": unresolved > 0,
        "proposals": proposals,
    }


def _row_out(row: AuthorityCutoverSnapshot, user: User | None = None) -> dict[str, Any]:
    return {
        "id": row.id,
        "user_id": row.user_id,
        "username": getattr(user, "username", None),
        "original_role_id": row.original_role_id,
        "original_role_name": row.original_role_name,
        "original_authority_class": row.original_authority_class,
        "original_is_tenant_super_admin": row.original_is_tenant_super_admin,
        "original_module_grants": list(row.original_module_grants or []),
        "proposed_authority_class": row.proposed_authority_class,
        "proposed_is_tenant_super_admin": row.proposed_is_tenant_super_admin,
        "proposed_module_grants": list(row.proposed_module_grants or []),
        "status": row.status,
        "reason": row.reason,
        "applied_at": row.applied_at.isoformat() if row.applied_at else None,
        "restored_at": row.restored_at.isoformat() if row.restored_at else None,
    }


async def apply_cutover(
    db: AsyncSession,
    *,
    tenant_id: int,
    actor: User,
    confirm_user_ids: list[int] | None = None,
    allow_unresolved: bool = False,
) -> dict[str, Any]:
    """Apply confirmed proposals under row locks. Does not enable the feature flag.

    ``allow_unresolved`` is retained for internal/scripts only; HTTP apply always passes False.
    """
    await _assert_cutover_actor(db, actor)

    rows = (
        await db.execute(
            select(AuthorityCutoverSnapshot)
            .where(AuthorityCutoverSnapshot.tenant_id == tenant_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalars().all()
    if not rows:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Run dry-run first")

    unresolved = [r for r in rows if r.status == STATUS_UNRESOLVED]
    if unresolved and not allow_unresolved:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cutover blocked: {len(unresolved)} unresolved user(s). Resolve or re-run dry-run.",
        )

    confirm_set = set(confirm_user_ids) if confirm_user_ids is not None else None
    applied = 0
    skipped = 0
    now = datetime.utcnow()
    for row in rows:
        if row.status in {STATUS_SKIPPED, STATUS_UNRESOLVED}:
            skipped += 1
            continue
        if row.status == STATUS_APPLIED and row.restored_at is None:
            skipped += 1
            continue
        if confirm_set is not None and row.user_id not in confirm_set:
            skipped += 1
            continue
        user = (
            await db.execute(
                select(User)
                .where(User.id == row.user_id, User.tenant_id == tenant_id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalar_one_or_none()
        if user is None:
            skipped += 1
            continue

        # Never rewrite role_id — only class / super / modules
        user.authority_class = row.proposed_authority_class
        user.is_tenant_super_admin = bool(row.proposed_is_tenant_super_admin)
        await replace_module_grants(
            db,
            tenant_id=tenant_id,
            user_id=user.id,
            modules=list(row.proposed_module_grants or []),
        )
        # Invalidate other sessions; keep the applying admin able to finish restore/enable in this request chain.
        if user.id != actor.id:
            bump_auth_session_version(user)
        row.status = STATUS_APPLIED
        row.applied_at = now
        row.restored_at = None
        row.updated_at = now
        applied += 1

    await db.flush()
    return {"tenant_id": tenant_id, "applied": applied, "skipped": skipped}


async def _assert_cutover_actor(db: AsyncSession, actor: User) -> None:
    """Super Admin or legacy admin-named role only (stricter than Class 1 admin-equivalent)."""
    if bool(getattr(actor, "is_tenant_super_admin", False)):
        return
    role = _loaded_role(actor)
    if role is None or getattr(role, "tenant_id", None) != actor.tenant_id:
        role = await _load_role_for_tenant(db, role_id=actor.role_id, tenant_id=actor.tenant_id)
    if _role_name(role) not in _ADMIN_NAMES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Super Admin or an admin role can run authority cutover",
        )


async def restore_cutover(db: AsyncSession, *, tenant_id: int, actor: User) -> dict[str, Any]:
    """Restore class/modules/super from immutable originals. Leaves Role untouched."""
    await _assert_cutover_actor(db, actor)
    rows = (
        await db.execute(
            select(AuthorityCutoverSnapshot)
            .where(
                AuthorityCutoverSnapshot.tenant_id == tenant_id,
                AuthorityCutoverSnapshot.status == STATUS_APPLIED,
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalars().all()
    restored = 0
    now = datetime.utcnow()
    for row in rows:
        if row.restored_at is not None:
            continue
        user = (
            await db.execute(
                select(User)
                .where(User.id == row.user_id, User.tenant_id == tenant_id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalar_one_or_none()
        if user is None:
            continue
        user.authority_class = row.original_authority_class
        user.is_tenant_super_admin = bool(row.original_is_tenant_super_admin)
        await replace_module_grants(
            db,
            tenant_id=tenant_id,
            user_id=user.id,
            modules=list(row.original_module_grants or []),
        )
        bump_auth_session_version(user)
        row.restored_at = now
        row.status = STATUS_PROPOSED
        row.updated_at = now
        restored += 1
    await db.flush()
    return {"tenant_id": tenant_id, "restored": restored}
