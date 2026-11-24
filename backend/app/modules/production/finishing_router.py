"""Finishing stage WIP API (flag ``finishing_stage_wip_v1``)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import is_finishing_stage_wip_v1_enabled
from app.database import get_db
from app.models import Tenant, User
from app.modules.production.finishing_service import FinishingEntryIn, order_funnel, upsert_entry

router = APIRouter(prefix="/production/finishing", tags=["production-finishing"])


def _ensure(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


@router.post("/entries", status_code=201)
async def create_finishing_entry(
    body: FinishingEntryIn,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    if not is_finishing_stage_wip_v1_enabled(tenant.feature_flags):
        raise HTTPException(status_code=404, detail="Not found")
    out = await upsert_entry(db, tenant=tenant, user=user, body=body)
    await db.commit()
    return out


@router.get("/orders/{order_id}/funnel")
async def get_funnel(
    order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    return await order_funnel(db, tenant=tenant, order_id=order_id)
