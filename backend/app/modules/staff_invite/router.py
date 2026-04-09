"""Staff invitation routes (mounted under /api/v1/settings)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.authz import ensure_user_is_tenant_admin
from app.common.email_service import send_staff_invitation_email
from app.common.tenant import require_tenant
from app.config import get_settings
from app.database import get_db
from app.models import Role, StaffInvitation, Tenant, User
from app.modules.audit.service import log_action
from app.modules.staff_invite.schemas import (
    StaffInviteCreateRequest,
    StaffInviteCreateResponse,
    StaffInviteRowResponse,
)
from app.modules.staff_invite.service import (
    cancel_staff_invitation,
    create_staff_invitation,
    list_staff_invitations,
)

router = APIRouter(tags=["staff-invite"])
logger = logging.getLogger(__name__)


def _is_dev_app_env() -> bool:
    s = get_settings()
    return s.app_env.lower() in {"dev", "development", "local", "test", "testing"}


def _ensure_user_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


async def _row_response(db: AsyncSession, inv: StaffInvitation) -> StaffInviteRowResponse:
    rr = await db.execute(select(Role).where(Role.id == inv.role_id).limit(1))
    role = rr.scalar_one_or_none()
    return StaffInviteRowResponse(
        id=inv.id,
        tenant_id=inv.tenant_id,
        email=inv.email,
        first_name=inv.first_name,
        last_name=inv.last_name,
        role_id=inv.role_id,
        role_name=role.display_name if role else "",
        status=inv.status,
        expires_at=inv.expires_at,
        accepted_at=inv.accepted_at,
        created_at=inv.created_at,
    )


@router.post("/users/invite", response_model=StaffInviteCreateResponse, status_code=status.HTTP_201_CREATED)
async def invite_staff_user(
    body: StaffInviteCreateRequest,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    await ensure_user_is_tenant_admin(db, user, tenant.id)

    inv, plain = await create_staff_invitation(
        db,
        tenant=tenant,
        invited_by=user,
        email=str(body.email),
        first_name=body.first_name,
        last_name=body.last_name,
        role_id=body.role_id,
    )
    rr = await db.execute(select(Role).where(Role.id == inv.role_id).limit(1))
    role = rr.scalar_one_or_none()
    role_display = role.display_name if role else "User"
    recipient = " ".join(x for x in [inv.first_name, inv.last_name] if x).strip() or inv.email

    token_for_response: str | None = None
    try:
        await send_staff_invitation_email(
            to_email=inv.email,
            recipient_name=recipient,
            tenant_name=tenant.name,
            company_code=tenant.company_code,
            role_display_name=role_display,
            invite_token=plain,
            expires_at_label=inv.expires_at.strftime("%Y-%m-%d %H:%M"),
        )
    except Exception as exc:
        logger.warning("Staff invite email failed for %s: %s", inv.email, exc)
        if _is_dev_app_env():
            token_for_response = plain

    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="STAFF_INVITE_CREATED",
        resource="settings.staff_invitation",
        details=f"email={inv.email}",
    )

    return StaffInviteCreateResponse(
        invitation=await _row_response(db, inv),
        invite_token_plain=token_for_response,
    )


@router.get("/users/invitations", response_model=list[StaffInviteRowResponse])
async def list_staff_invite_rows(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    await ensure_user_is_tenant_admin(db, user, tenant.id)
    rows = await list_staff_invitations(db, tenant_id=tenant.id)
    return [await _row_response(db, inv) for inv in rows]


@router.delete("/users/invitations/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_staff_invite(
    invitation_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    await ensure_user_is_tenant_admin(db, user, tenant.id)
    await cancel_staff_invitation(db, tenant_id=tenant.id, invitation_id=invitation_id)
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="STAFF_INVITE_CANCELLED",
        resource="settings.staff_invitation",
        details=f"id={invitation_id}",
    )
    return None
