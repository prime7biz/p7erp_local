"""Knitting plans."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import KnittingPlan, Tenant, User
from app.modules.production.schemas import KnittingPlanCreate

router = APIRouter(prefix="/production/knitting", tags=["production-knitting"])


def _ensure(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


@router.get("/plans")
async def list_plans(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    r = await db.execute(select(KnittingPlan).where(KnittingPlan.tenant_id == tenant.id).order_by(KnittingPlan.id.desc()))
    rows = list(r.scalars().all())
    return {"items": [{"id": x.id, "status": x.status, "planned_date": x.planned_date.isoformat() if x.planned_date else None} for x in rows]}


@router.post("/plans")
async def create_plan(
    body: KnittingPlanCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    pd = date.fromisoformat(body.planned_date) if body.planned_date else None
    row = KnittingPlan(
        tenant_id=tenant.id,
        machine_id=body.machine_id,
        yarn_item_id=body.yarn_item_id,
        target_output_kg=body.target_output_kg,
        fabric_type=body.fabric_type,
        gauge=body.gauge,
        planned_date=pd,
        order_id=body.order_id,
        notes=body.notes,
        status="planned",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return {"id": row.id}
