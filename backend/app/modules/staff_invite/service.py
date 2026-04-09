"""Staff invitation business logic."""

from __future__ import annotations

import secrets

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import hash_password, verify_password
from app.common.db_datetime import utc_naive_plus, utc_now_naive
from app.common.username import generate_unique_username_for_tenant
from app.models import Role, StaffInvitation, Tenant, User

INVITE_EXPIRE_DAYS = 7


async def create_staff_invitation(
    db: AsyncSession,
    *,
    tenant: Tenant,
    invited_by: User,
    email: str,
    first_name: str | None,
    last_name: str | None,
    role_id: int,
) -> tuple[StaffInvitation, str]:
    em = email.strip().lower()
    role_result = await db.execute(select(Role).where(Role.id == role_id, Role.tenant_id == tenant.id).limit(1))
    role = role_result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Role not found for this tenant")

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

    plain = secrets.token_urlsafe(48)
    token_hash = await hash_password(plain)
    inv = StaffInvitation(
        tenant_id=tenant.id,
        email=em,
        first_name=(first_name or "").strip() or None,
        last_name=(last_name or "").strip() or None,
        role_id=role.id,
        token_hash=token_hash,
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

    result = await db.execute(
        select(StaffInvitation).where(
            StaffInvitation.status == "pending",
            StaffInvitation.expires_at > utc_now_naive(),
        )
    )
    invitations = result.scalars().all()
    matched: StaffInvitation | None = None
    for inv in invitations:
        if await verify_password(token_plain, inv.token_hash):
            matched = inv
            break
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

    matched.status = "accepted"
    matched.accepted_at = utc_now_naive()
    await db.flush()

    return user, tenant
