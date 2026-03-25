"""Worker skills matrix (IE operations)."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Employee, IeOperationsLibrary, Tenant, User, WorkerSkill
from app.modules.production.schemas import WorkerSkillCreate, WorkerSkillResponse, WorkerSkillUpdate

router = APIRouter(prefix="/production/skills", tags=["production-skills"])


def _ensure(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


@router.get("", response_model=list[WorkerSkillResponse])
async def list_worker_skills(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    employee_id: int | None = Query(None),
):
    _ensure(user, tenant)
    q = select(WorkerSkill, IeOperationsLibrary).join(
        IeOperationsLibrary, IeOperationsLibrary.id == WorkerSkill.ie_operation_id
    ).where(WorkerSkill.tenant_id == tenant.id)
    if employee_id is not None:
        q = q.where(WorkerSkill.employee_id == employee_id)
    q = q.order_by(WorkerSkill.employee_id, IeOperationsLibrary.operation_code)
    rows = list((await db.execute(q)).all())
    return [
        WorkerSkillResponse(
            id=ws.id,
            tenant_id=ws.tenant_id,
            employee_id=ws.employee_id,
            ie_operation_id=ws.ie_operation_id,
            operation_code=op.operation_code,
            operation_name=op.name,
            skill_level=ws.skill_level,
            certified_at=ws.certified_at.isoformat() if ws.certified_at else None,
            is_active=ws.is_active,
        )
        for ws, op in rows
    ]


@router.post("", response_model=WorkerSkillResponse)
async def create_worker_skill(
    body: WorkerSkillCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    emp = await db.get(Employee, body.employee_id)
    if not emp or emp.tenant_id != tenant.id:
        raise HTTPException(400, "Invalid employee")
    op = await db.get(IeOperationsLibrary, body.ie_operation_id)
    if not op or op.tenant_id != tenant.id:
        raise HTTPException(400, "Invalid IE operation")
    cert = date.fromisoformat(body.certified_at) if body.certified_at else None
    row = WorkerSkill(
        tenant_id=tenant.id,
        employee_id=body.employee_id,
        ie_operation_id=body.ie_operation_id,
        skill_level=body.skill_level,
        certified_at=cert,
        is_active=body.is_active,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return WorkerSkillResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        employee_id=row.employee_id,
        ie_operation_id=row.ie_operation_id,
        operation_code=op.operation_code,
        operation_name=op.name,
        skill_level=row.skill_level,
        certified_at=row.certified_at.isoformat() if row.certified_at else None,
        is_active=row.is_active,
    )


@router.patch("/{skill_id}", response_model=WorkerSkillResponse)
async def patch_worker_skill(
    skill_id: int,
    body: WorkerSkillUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    row = await db.get(WorkerSkill, skill_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(404, "Not found")
    if body.skill_level is not None:
        row.skill_level = body.skill_level
    if body.certified_at is not None:
        row.certified_at = date.fromisoformat(body.certified_at) if body.certified_at else None
    if body.is_active is not None:
        row.is_active = body.is_active
    await db.commit()
    await db.refresh(row)
    op = await db.get(IeOperationsLibrary, row.ie_operation_id)
    return WorkerSkillResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        employee_id=row.employee_id,
        ie_operation_id=row.ie_operation_id,
        operation_code=op.operation_code if op else None,
        operation_name=op.name if op else None,
        skill_level=row.skill_level,
        certified_at=row.certified_at.isoformat() if row.certified_at else None,
        is_active=row.is_active,
    )


@router.delete("/{skill_id}", status_code=204)
async def delete_worker_skill(
    skill_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    row = await db.get(WorkerSkill, skill_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(404, "Not found")
    await db.delete(row)
    await db.commit()
