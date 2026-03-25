"""Dyeing recipes and batches."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import DyeBatch, DyeRecipe, Tenant, User
from app.modules.production.schemas import DyeBatchCreate, DyeRecipeCreate

router = APIRouter(prefix="/production/dyeing", tags=["production-dyeing"])


def _ensure(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


@router.get("/recipes")
async def list_recipes(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    r = await db.execute(select(DyeRecipe).where(DyeRecipe.tenant_id == tenant.id))
    rows = list(r.scalars().all())
    return {"items": [{"id": x.id, "recipe_code": x.recipe_code, "status": x.status} for x in rows]}


@router.post("/recipes")
async def create_recipe(
    body: DyeRecipeCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    row = DyeRecipe(
        tenant_id=tenant.id,
        recipe_code=body.recipe_code,
        color_name=body.color_name,
        color_code=body.color_code,
        chemicals=body.chemicals,
        process_time_minutes=body.process_time_minutes,
        temperature=body.temperature,
        status="draft",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return {"id": row.id}


@router.get("/batches")
async def list_batches(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    r = await db.execute(select(DyeBatch).where(DyeBatch.tenant_id == tenant.id).order_by(DyeBatch.id.desc()))
    rows = list(r.scalars().all())
    return {"items": [{"id": x.id, "batch_code": x.batch_code, "status": x.status} for x in rows]}


@router.post("/batches")
async def create_batch(
    body: DyeBatchCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    ps = datetime.fromisoformat(body.planned_start) if body.planned_start else None
    pe = datetime.fromisoformat(body.planned_end) if body.planned_end else None
    row = DyeBatch(
        tenant_id=tenant.id,
        batch_code=body.batch_code,
        machine_id=body.machine_id,
        recipe_id=body.recipe_id,
        fabric_item_id=body.fabric_item_id,
        input_qty_kg=body.input_qty_kg,
        order_id=body.order_id,
        planned_start=ps,
        planned_end=pe,
        status="planned",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return {"id": row.id}
