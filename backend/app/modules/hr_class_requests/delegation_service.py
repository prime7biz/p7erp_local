"""HR approval delegation (hr_delegation_v1). No transitive chains; no self-approval."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.authority.hr_policy import hr_actor_role, is_hr_authority_enabled
from app.common.authority.policy import load_user_module_codes, user_has_module
from app.common.tenant_feature_keys import is_hr_delegation_v1_enabled
from app.models import Tenant, User
from app.models.hr_class_request import HrApprovalDelegation
from app.modules.audit.service import log_action


def _delegation_enabled(flags: Any) -> bool:
    return is_hr_delegation_v1_enabled(flags)


def _parse_dt(value: str | datetime) -> datetime:
    if isinstance(value, datetime):
        return value
    text = str(value).strip().replace("Z", "+00:00")
    return datetime.fromisoformat(text).replace(tzinfo=None)


async def create_delegation(
    db: AsyncSession,
    *,
    tenant: Tenant,
    actor: User,
    delegate_user_id: int,
    step: str,
    starts_at: str | datetime,
    ends_at: str | datetime,
    reason: str,
) -> HrApprovalDelegation:
    if not is_hr_authority_enabled(tenant.feature_flags) or not _delegation_enabled(tenant.feature_flags):
        raise HTTPException(status_code=409, detail="HR delegation is switched off")
    step = (step or "").upper()
    if step not in {"RECOMMEND", "APPROVE"}:
        raise HTTPException(status_code=400, detail="step must be RECOMMEND or APPROVE")
    if delegate_user_id == actor.id and not bool(getattr(actor, "is_tenant_super_admin", False)):
        raise HTTPException(status_code=400, detail="Cannot delegate to yourself")
    start = _parse_dt(starts_at)
    end = _parse_dt(ends_at)
    if end <= start:
        raise HTTPException(status_code=400, detail="ends_at must be after starts_at")

    actor_role = await hr_actor_role(db, actor, feature_flags=tenant.feature_flags)
    delegate = await db.get(User, delegate_user_id)
    if delegate is None or delegate.tenant_id != tenant.id or not delegate.is_active:
        raise HTTPException(status_code=404, detail="Delegate user not found or inactive")
    mods = await load_user_module_codes(db, tenant_id=tenant.id, user_id=delegate.id)
    if not user_has_module(mods, "hr") and not bool(getattr(delegate, "is_tenant_super_admin", False)):
        raise HTTPException(status_code=400, detail="Delegate must hold the hr module grant")

    # Same-class by delegator or Super; Class 2 acting for Class 1 by Super only
    if step == "APPROVE" and actor_role == "RECOMMEND" and not bool(getattr(actor, "is_tenant_super_admin", False)):
        raise HTTPException(status_code=403, detail="Class 2 cannot create an APPROVE delegation (Super Admin only)")
    if actor_role not in {"SUPER", "APPROVE", "RECOMMEND"}:
        raise HTTPException(status_code=403, detail="Only Class 1/2 or Super Admin can create delegations")

    # No transitive: refuse if the delegator is currently only acting via an incoming delegation
    # (they must be a natural holder of the step).
    if actor_role == "RECOMMEND" and step == "RECOMMEND":
        pass
    elif actor_role == "APPROVE" and step == "APPROVE":
        pass
    elif bool(getattr(actor, "is_tenant_super_admin", False)):
        pass
    else:
        raise HTTPException(status_code=403, detail="Delegator must naturally hold the step being delegated")

    row = HrApprovalDelegation(
        tenant_id=tenant.id,
        delegator_user_id=actor.id if not bool(getattr(actor, "is_tenant_super_admin", False)) else actor.id,
        delegate_user_id=delegate.id,
        step=step,
        starts_at=start,
        ends_at=end,
        reason=(reason or "").strip(),
        created_by=actor.id,
        created_at=datetime.utcnow(),
    )
    db.add(row)
    await db.flush()
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=actor.id,
        action="HR_DELEGATION_CREATED",
        resource=f"hr.delegation:{row.id}",
        details=f"step={step} delegate={delegate.id}",
    )
    return row


async def revoke_delegation(db: AsyncSession, *, tenant: Tenant, actor: User, delegation_id: int) -> HrApprovalDelegation:
    row = await db.get(HrApprovalDelegation, delegation_id)
    if row is None or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Delegation not found")
    if row.revoked_at is not None:
        return row
    if row.delegator_user_id != actor.id and not bool(getattr(actor, "is_tenant_super_admin", False)):
        raise HTTPException(status_code=403, detail="Only the delegator or Super Admin can revoke")
    row.revoked_at = datetime.utcnow()
    await log_action(
        db, tenant_id=tenant.id, user_id=actor.id, action="HR_DELEGATION_REVOKED", resource=f"hr.delegation:{row.id}"
    )
    return row


async def active_delegation_for(
    db: AsyncSession, *, tenant_id: int, delegate_user_id: int, step: str, at: datetime | None = None
) -> HrApprovalDelegation | None:
    """Direct (non-transitive) active delegation only."""
    now = at or datetime.utcnow()
    return (
        await db.execute(
            select(HrApprovalDelegation)
            .where(
                HrApprovalDelegation.tenant_id == tenant_id,
                HrApprovalDelegation.delegate_user_id == delegate_user_id,
                HrApprovalDelegation.step == step,
                HrApprovalDelegation.revoked_at.is_(None),
                HrApprovalDelegation.starts_at <= now,
                HrApprovalDelegation.ends_at >= now,
            )
            .order_by(HrApprovalDelegation.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def list_delegations(db: AsyncSession, *, tenant_id: int, active_only: bool = True) -> list[HrApprovalDelegation]:
    stmt = select(HrApprovalDelegation).where(HrApprovalDelegation.tenant_id == tenant_id)
    if active_only:
        now = datetime.utcnow()
        stmt = stmt.where(
            HrApprovalDelegation.revoked_at.is_(None),
            HrApprovalDelegation.starts_at <= now,
            HrApprovalDelegation.ends_at >= now,
        )
    return list((await db.execute(stmt.order_by(HrApprovalDelegation.id.desc()).limit(200))).scalars().all())
