"""Merchandising control tower — aggregated summary for merchandiser dashboard."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Tenant, User
from app.modules.merch.deps import ensure_tenant
from app.modules.merch.merch_control_tower_schemas import MerchControlTowerSummaryOut
from app.modules.merch.merch_control_tower_service import build_merch_control_tower_summary

router = APIRouter(prefix="/merch", tags=["merchandising-control-tower"])


@router.get("/control-tower/summary", response_model=MerchControlTowerSummaryOut)
async def merch_control_tower_summary(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ensure_tenant(user, tenant)
    return await build_merch_control_tower_summary(db, tenant_id=tenant.id)
