"""Staff invitation business logic."""

from __future__ import annotations

import hashlib
import hmac
import secrets

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import hash_password, verify_password
from app.common.db_datetime import utc_naive_plus, utc_now_naive
from app.common.username import generate_unique_username_for_tenant
from app.models import Role, StaffInvitation, Tenant, User

INVITE_EXPIRE_DAYS = 7
# Invitations created before selector tokens (revision 251) are matched by checking at most this
# many of the newest still-pending ones; they all expire within INVITE_EXPIRE_DAYS of the upgrade.
LEGACY_INVITE_SCAN_LIMIT = 50
_VERIFIER_HASH_PREFIX = "sha256$"


def _hash_verifier(verifier: str) -> str:
    return _VERIFIER_HASH_PREFIX + hashlib.sha256(verifier.encode("utf-8")).hexdigest()


async def _find_pending_invitation(db: AsyncSession, token_plain: str) -> StaffInvitation | None:
    now = utc_now_naive()
    if "." in token_plain:
        selector, verifier = token_plain.split(".", 1)
        result = await db.execute(
            select(StaffInvitation).where(
                StaffInvitation.token_selector == selector,
                StaffInvitation.status == "pending",
                StaffInvitation.expires_at > now,
            ).limit(1)
        )
        inv = result.scalar_one_or_none()
        if inv is None or not verifier:
            return None
        if hmac.compare_digest(inv.token_hash, _hash_verifier(verifier)):
            return inv
        return None

    result = await db.execute(
        select(StaffInvitation)
        .where(
            StaffInvitation.token_selector.is_(None),
            StaffInvitation.status == "pending",
            StaffInvitation.expires_at > now,
        )
        .order_by(StaffInvitation.created_at.desc())
        .limit(LEGACY_INVITE_SCAN_LIMIT)
    )
    for inv in result.scalars().all():
        if await verify_password(token_plain, inv.token_hash):
            return inv
    return None


async def create_staff_invitation(
    db: AsyncSession,
    *,
    tenant: Tenant,
    invited_by: User,
    email: str,
    first_name: str | None,
    last_name: str | None,
    role_id: int | None,
    authority_class: str | None = None,
    module_grants: list[str] | None = None,
    employee_id: int | None = None,
) -> tuple[StaffInvitation, str]:
    from app.common.authority.policy import is_authority_classes_enabled_for_tenant
    from app.common.authority.user_admin import (
        ASSIGNABLE_CLASSES,
        normalize_authority_class,
        normalize_module_grants,
        resolve_role_for_authority_class,
    )

    em = email.strip().lower()
    flag_on = is_authority_classes_enabled_for_tenant(tenant.feature_flags)
    modules: list[str] | None = None
    cls = normalize_authority_class(authority_class)
    if flag_on:
        if cls is None or cls not in ASSIGNABLE_CLASSES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="authority_class must be CLASS_1, CLASS_2, CLASS_3 or CLASS_4",
            )
        modules = normalize_module_grants(module_grants)
        if not modules:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Select at least one module for this invitation",
            )
        # Ignore client role_id when authority classes are ON (no stealth admin role).
        role = await resolve_role_for_authority_class(
            db, tenant_id=tenant.id, authority_class=cls, role_id=None
        )
        if employee_id is not None:
            from app.models.hr import Employee

            emp = (
                await db.execute(
                    select(Employee).where(Employee.id == employee_id, Employee.tenant_id == tenant.id).limit(1)
                )
            ).scalar_one_or_none()
            if emp is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
            if not emp.is_active:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Employee is inactive")
            if emp.user_id is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Employee is already linked to another user",
                )
    else:
        if role_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="role_id is required")
        role_result = await db.execute(select(Role).where(Role.id == role_id, Role.tenant_id == tenant.id).limit(1))
        role = role_result.scalar_one_or_none()
        if not role:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Role not found for this tenant")
        employee_id = None

    existing_user = await db.execute(
        select(User).where(User.tenant_id == tenant.id, func.lower(User.email) == em).limit(1)
    )
    if existing_user.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A user with this email already exists")

    pending = await db.execute(
        select(StaffInvitation).where(
            StaffInvitation.tenant_id == tenant.id,
            func.lower(StaffInvitation.email) == em,
            StaffInvitation.status == "pending",
            StaffInvitation.expires_at > utc_now_naive(),
        ).limit(1)
    )
    if pending.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A pending invitation already exists for this email")

    selector = secrets.token_urlsafe(12)
    verifier = secrets.token_urlsafe(32)
    plain = f"{selector}.{verifier}"
    inv = StaffInvitation(
        tenant_id=tenant.id,
        email=em,
        first_name=(first_name or "").strip() or None,
        last_name=(last_name or "").strip() or None,
        role_id=role.id,
        authority_class=cls if flag_on else None,
        module_grants=modules if flag_on else None,
        employee_id=employee_id if flag_on else None,
        token_hash=_hash_verifier(verifier),
        token_selector=selector,
        invited_by_user_id=invited_by.id,
        status="pending",
        expires_at=utc_naive_plus(days=INVITE_EXPIRE_DAYS),
    )
    db.add(inv)
    await db.flush()
    await db.refresh(inv)
    return inv, plain


async def list_staff_invitations(db: AsyncSession, *, tenant_id: int) -> list[StaffInvitation]:
    result = await db.execute(
        select(StaffInvitation)
        .where(StaffInvitation.tenant_id == tenant_id)
        .order_by(StaffInvitation.created_at.desc())
    )
    rows = list(result.scalars().all())
    now = utc_now_naive()
    changed = False
    for inv in rows:
        if inv.status == "pending" and inv.expires_at <= now:
            inv.status = "expired"
            changed = True
    if changed:
        await db.flush()
    return rows


async def cancel_staff_invitation(db: AsyncSession, *, tenant_id: int, invitation_id: int) -> StaffInvitation:
    result = await db.execute(
        select(StaffInvitation).where(StaffInvitation.id == invitation_id, StaffInvitation.tenant_id == tenant_id).limit(1)
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")
    if inv.status != "pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending invitations can be cancelled")
    inv.status = "cancelled"
    await db.flush()
    await db.refresh(inv)
    return inv


async def accept_staff_invitation(
    db: AsyncSession,
    *,
    token: str,
    password: str,
    first_name: str | None,
    last_name: str | None,
) -> tuple[User, Tenant]:
    token_plain = (token or "").strip()
    if len(token_plain) < 16:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token")

    matched = await _find_pending_invitation(db, token_plain)
    if not matched:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired invitation")

    tenant_result = await db.execute(select(Tenant).where(Tenant.id == matched.tenant_id))
    tenant = tenant_result.scalar_one_or_none()
    if not tenant or not tenant.is_active or tenant.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Organization not available")

    em = matched.email.strip().lower()
    existing = await db.execute(select(User).where(User.tenant_id == tenant.id, func.lower(User.email) == em).limit(1))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Account already exists")

    role_result = await db.execute(select(Role).where(Role.id == matched.role_id, Role.tenant_id == tenant.id).limit(1))
    role = role_result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation misconfigured")

    uname = await generate_unique_username_for_tenant(db, tenant.id, em)
    fn = (first_name or matched.first_name or "").strip() or None
    ln = (last_name or matched.last_name or "").strip() or None

    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        email=em,
        username=uname,
        password_hash=await hash_password(password),
        first_name=fn,
        last_name=ln,
        is_active=True,
        invited_by_user_id=matched.invited_by_user_id,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    from app.common.authority.user_admin import apply_authority_on_create

    grants = matched.module_grants if isinstance(matched.module_grants, list) else None
    await apply_authority_on_create(
        db,
        tenant_id=tenant.id,
        user=user,
        feature_flags=tenant.feature_flags,
        authority_class=matched.authority_class,
        module_grants=grants,
        employee_id=matched.employee_id,
    )

    matched.status = "accepted"
    matched.accepted_at = utc_now_naive()
    await db.flush()

    return user, tenant
