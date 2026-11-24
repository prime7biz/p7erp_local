"""Exit clearance checklist helpers. WAIVED = Class 1 / Super Admin only."""

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.authority.hr_policy import hr_actor_role
from app.models import Tenant, User
from app.models.hr_lifecycle import HrClearanceItem, HrSeparation
from app.modules.audit.service import log_action
from app.modules.hr_separation.separation_core import seed_standard_clearance


async def list_items(db: AsyncSession, *, tenant_id: int, separation_id: int) -> list[HrClearanceItem]:
    sep = await db.get(HrSeparation, separation_id)
    if sep is None or sep.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Separation not found")
    return list(
        (
            await db.execute(
                select(HrClearanceItem)
                .where(HrClearanceItem.tenant_id == tenant_id, HrClearanceItem.separation_id == separation_id)
                .order_by(HrClearanceItem.id)
            )
        ).scalars().all()
    )


async def ensure_seeded(db: AsyncSession, *, tenant_id: int, separation_id: int) -> list[HrClearanceItem]:
    await seed_standard_clearance(db, tenant_id=tenant_id, separation_id=separation_id)
    return await list_items(db, tenant_id=tenant_id, separation_id=separation_id)


async def waive_item(
    db: AsyncSession,
    *,
    tenant: Tenant,
    actor: User,
    item_id: int,
    note: str,
) -> HrClearanceItem:
    role = await hr_actor_role(db, actor, feature_flags=tenant.feature_flags)
    if role not in {"SUPER", "APPROVE"}:
        raise HTTPException(status_code=403, detail="Only Class 1 or Super Admin can waive clearance items")
    note = (note or "").strip()
    if len(note) < 3:
        raise HTTPException(status_code=400, detail="A note is required to waive clearance")
    item = await db.get(HrClearanceItem, item_id)
    if item is None or item.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Clearance item not found")
    item.status = "WAIVED"
    item.evidence_ref = note[:255]
    item.signed_off_by = actor.id
    item.signed_off_at = datetime.utcnow()
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=actor.id,
        action="HR_CLEARANCE_WAIVED",
        resource=f"hr.clearance:{item.id}",
        details=note[:200],
    )
    return item
