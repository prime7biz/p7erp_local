"""Bangladesh RMG starter preset (Phase A).

GET  /hr/localization/bd-rmg/status   any HR user: manifest-derived completeness and capability badges
POST /hr/localization/bd-rmg/apply    manager/admin or ``hr.payroll.manage``: add missing rows only
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.permissions import PERMISSION_HR_PAYROLL_MANAGE, assert_hr_manager_or_permission
from app.common.tenant import require_tenant
from app.database import get_db, safe_async_session_rollback
from app.models import Tenant, User
from app.modules.audit.service import log_action
from app.modules.hr_localization import bd_rmg_catalog as cat
from app.modules.hr_localization.enforcement_flags import enforcement_state
from app.modules.hr_localization.preset_service import apply_preset, capabilities, compute_status

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/hr/localization/bd-rmg", tags=["hr-localization"])


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


async def _can_apply(db: AsyncSession, user: User, tenant_id: int) -> bool:
    try:
        await assert_hr_manager_or_permission(db, user, tenant_id, permission_key=PERMISSION_HR_PAYROLL_MANAGE)
    except HTTPException:
        return False
    return True


def catalog_info() -> dict:
    return {
        "catalog_version": cat.CATALOG_VERSION,
        "wage_gazette": cat.WAGE_GAZETTE,
        "labour_act": cat.LABOUR_ACT,
        "privacy_act": cat.PRIVACY_ACT,
        "pending_sources": list(cat.PENDING_SOURCES),
    }


async def _status_payload(db: AsyncSession, user: User, tenant: Tenant) -> dict:
    st = await compute_status(db, tenant)
    flags = tenant.feature_flags if isinstance(tenant.feature_flags, dict) else {}
    return {
        "catalog": catalog_info(),
        "complete": st.complete,
        "counts": st.counts(),
        "items": [i.as_dict() for i in st.items],
        "marker": st.marker,
        "capabilities": capabilities(flags),
        "enforcement": enforcement_state(flags),
        "can_apply": await _can_apply(db, user, tenant.id),
    }


@router.get("/status")
async def get_status(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    return await _status_payload(db, user, tenant)


@router.post("/apply")
async def apply(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    tenant_id, user_id = tenant.id, user.id
    await assert_hr_manager_or_permission(db, user, tenant_id, permission_key=PERMISSION_HR_PAYROLL_MANAGE)
    try:
        # Lock first: a parallel apply waits here, then sees every row already present.
        locked = (
            await db.execute(
                select(Tenant).where(Tenant.id == tenant_id).with_for_update().execution_options(populate_existing=True)
            )
        ).scalar_one()
        result = await apply_preset(db, locked, user_id=user_id)
        await log_action(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="HR_BD_PRESET_APPLIED",
            resource="hr.localization.bd_rmg",
            details=(
                f"catalog {cat.CATALOG_VERSION}: created {len(result.created)}, "
                f"skipped {len(result.skipped)}, conflicts {len(result.conflicts)}"
            ),
        )
        await db.commit()
    except HTTPException:
        raise
    except Exception:
        await safe_async_session_rollback(db)
        logger.exception("hr_bd_preset_apply_failed tenant=%s", tenant_id)
        raise HTTPException(status_code=500, detail="Bangladesh preset could not be applied; nothing was changed")
    await db.refresh(tenant)
    return {
        "created": result.created,
        "skipped_count": len(result.skipped),
        "conflicts": result.conflicts,
        "status": await _status_payload(db, user, tenant),
    }
