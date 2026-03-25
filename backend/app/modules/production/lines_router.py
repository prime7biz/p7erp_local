"""Sewing lines and department machines."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import DepartmentMachine, SewingLine, Tenant, User
from app.modules.production.schemas import (
    DepartmentMachineCreate,
    DepartmentMachineResponse,
    SewingLineCreate,
    SewingLineResponse,
    SewingLineUpdate,
)

router = APIRouter(prefix="/production", tags=["production-lines"])


def _ensure(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


@router.get("/sewing-lines", response_model=list[SewingLineResponse])
async def list_sewing_lines(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    r = await db.execute(select(SewingLine).where(SewingLine.tenant_id == tenant.id).order_by(SewingLine.line_code))
    rows = list(r.scalars().all())
    return [_line_resp(x) for x in rows]


def _line_resp(x: SewingLine) -> SewingLineResponse:
    return SewingLineResponse(
        id=x.id,
        tenant_id=x.tenant_id,
        line_code=x.line_code,
        name=x.name,
        default_machine_count=x.default_machine_count,
        running_machine_count=x.running_machine_count,
        default_operator_count=x.default_operator_count,
        default_helper_count=x.default_helper_count,
        supervisor_user_id=x.supervisor_user_id,
        is_active=x.is_active,
    )


@router.post("/sewing-lines", response_model=SewingLineResponse)
async def create_sewing_line(
    body: SewingLineCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    row = SewingLine(
        tenant_id=tenant.id,
        line_code=body.line_code,
        name=body.name,
        default_machine_count=body.default_machine_count,
        running_machine_count=body.running_machine_count,
        default_operator_count=body.default_operator_count,
        default_helper_count=body.default_helper_count,
        supervisor_user_id=body.supervisor_user_id,
        is_active=body.is_active,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _line_resp(row)


@router.patch("/sewing-lines/{line_id}", response_model=SewingLineResponse)
async def update_sewing_line(
    line_id: int,
    body: SewingLineUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    row = await db.get(SewingLine, line_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(404, "Sewing line not found")
    for field, val in body.model_dump(exclude_unset=True).items():
        setattr(row, field, val)
    await db.commit()
    await db.refresh(row)
    return _line_resp(row)


@router.delete("/sewing-lines/{line_id}", status_code=204)
async def delete_sewing_line(
    line_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    row = await db.get(SewingLine, line_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(404, "Sewing line not found")
    await db.delete(row)
    await db.commit()


@router.get("/machines", response_model=list[DepartmentMachineResponse])
async def list_machines(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    department_type: str | None = Query(None),
):
    _ensure(user, tenant)
    q = select(DepartmentMachine).where(DepartmentMachine.tenant_id == tenant.id)
    if department_type:
        q = q.where(DepartmentMachine.department_type == department_type)
    q = q.order_by(DepartmentMachine.machine_code)
    r = await db.execute(q)
    rows = list(r.scalars().all())
    return [
        DepartmentMachineResponse(
            id=x.id,
            tenant_id=x.tenant_id,
            department_type=x.department_type,
            machine_code=x.machine_code,
            name=x.name,
            machine_type=x.machine_type,
            status=x.status,
            is_active=x.is_active,
        )
        for x in rows
    ]


@router.post("/machines", response_model=DepartmentMachineResponse)
async def create_machine(
    body: DepartmentMachineCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    row = DepartmentMachine(
        tenant_id=tenant.id,
        department_type=body.department_type,
        machine_code=body.machine_code,
        name=body.name,
        machine_type=body.machine_type,
        specs=body.specs,
        status=body.status,
        is_active=body.is_active,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return DepartmentMachineResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        department_type=row.department_type,
        machine_code=row.machine_code,
        name=row.name,
        machine_type=row.machine_type,
        status=row.status,
        is_active=row.is_active,
    )
