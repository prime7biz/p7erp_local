"""Generic department production plans."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import DepartmentProductionPlan, Tenant, User
from app.modules.production.schemas import DeptPlanCreate

router = APIRouter(prefix="/production/departments", tags=["production-departments"])


def _ensure(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


@router.get("/plans")
async def list_plans(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    department_type: str | None = Query(None),
):
    _ensure(user, tenant)
    q = select(DepartmentProductionPlan).where(DepartmentProductionPlan.tenant_id == tenant.id)
    if department_type:
        q = q.where(DepartmentProductionPlan.department_type == department_type)
    r = await db.execute(q.order_by(DepartmentProductionPlan.id.desc()))
    rows = list(r.scalars().all())
    return {"items": [{"id": x.id, "department_type": x.department_type, "status": x.status} for x in rows]}


@router.post("/plans")
async def create_plan(
    body: DeptPlanCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    pd = date.fromisoformat(body.planned_date) if body.planned_date else None
    row = DepartmentProductionPlan(
        tenant_id=tenant.id,
        department_type=body.department_type,
        machine_id=body.machine_id,
        input_item_id=body.input_item_id,
        target_output=body.target_output,
        target_uom=body.target_uom,
        planned_date=pd,
        order_id=body.order_id,
        style_id=body.style_id,
        notes=body.notes,
        status="planned",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return {"id": row.id}
