"""IE: operations library, operation bulletins, line balance."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import (
    IeOperationsLibrary,
    LineBalanceRun,
    LineBalanceWorkstation,
    OperationBulletin,
    OperationBulletinOp,
    Tenant,
    User,
)
from app.modules.production.line_balance_service import run_line_balance
from app.modules.production.schemas import (
    IeOperationCreate,
    IeOperationResponse,
    LineBalanceRequest,
    ObOpCreate,
    OperationBulletinCreate,
    OperationBulletinResponse,
)

router = APIRouter(prefix="/production/ie", tags=["production-ie"])


def _ensure(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


@router.get("/operations", response_model=list[IeOperationResponse])
async def list_ie_operations(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    r = await db.execute(
        select(IeOperationsLibrary)
        .where(IeOperationsLibrary.tenant_id == tenant.id, IeOperationsLibrary.is_active.is_(True))
        .order_by(IeOperationsLibrary.operation_code)
    )
    rows = list(r.scalars().all())
    return [
        IeOperationResponse(
            id=x.id,
            operation_code=x.operation_code,
            name=x.name,
            category=x.category,
            default_smv=float(x.default_smv or 0),
            machine_type_required=x.machine_type_required,
            is_active=x.is_active,
        )
        for x in rows
    ]


@router.post("/operations", response_model=IeOperationResponse)
async def create_ie_operation(
    body: IeOperationCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    row = IeOperationsLibrary(
        tenant_id=tenant.id,
        operation_code=body.operation_code,
        name=body.name,
        category=body.category,
        default_smv=body.default_smv,
        machine_type_required=body.machine_type_required,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return IeOperationResponse(
        id=row.id,
        operation_code=row.operation_code,
        name=row.name,
        category=row.category,
        default_smv=float(row.default_smv or 0),
        machine_type_required=row.machine_type_required,
        is_active=row.is_active,
    )


@router.post("/bulletins", response_model=OperationBulletinResponse)
async def create_ob(
    body: OperationBulletinCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    total = sum(o.smv for o in body.operations)
    ob = OperationBulletin(
        tenant_id=tenant.id,
        style_id=body.style_id,
        ob_code=body.ob_code,
        version_no=body.version_no,
        total_smv=total,
        status="draft",
        notes=body.notes,
    )
    db.add(ob)
    await db.flush()
    for op in body.operations:
        db.add(
            OperationBulletinOp(
                tenant_id=tenant.id,
                ob_id=ob.id,
                sequence_no=op.sequence_no,
                operation_id=op.operation_id,
                operation_name=op.operation_name,
                smv=op.smv,
                machine_type=op.machine_type,
                attachment_needed=op.attachment_needed,
                is_critical=op.is_critical,
            )
        )
    await db.commit()
    await db.refresh(ob)
    return OperationBulletinResponse(
        id=ob.id,
        style_id=ob.style_id,
        ob_code=ob.ob_code,
        version_no=ob.version_no,
        total_smv=float(ob.total_smv or 0),
        status=ob.status,
    )


@router.get("/bulletins", response_model=list[OperationBulletinResponse])
async def list_obs(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    style_id: int | None = None,
):
    _ensure(user, tenant)
    q = select(OperationBulletin).where(OperationBulletin.tenant_id == tenant.id)
    if style_id:
        q = q.where(OperationBulletin.style_id == style_id)
    r = await db.execute(q.order_by(OperationBulletin.ob_code))
    rows = list(r.scalars().all())
    return [
        OperationBulletinResponse(
            id=x.id,
            style_id=x.style_id,
            ob_code=x.ob_code,
            version_no=x.version_no,
            total_smv=float(x.total_smv or 0),
            status=x.status,
        )
        for x in rows
    ]


@router.post("/line-balance")
async def line_balance(
    body: LineBalanceRequest,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    result = await run_line_balance(db, tenant.id, body.ob_id, body.num_workstations)
    run = LineBalanceRun(
        tenant_id=tenant.id,
        ob_id=body.ob_id,
        line_id=body.line_id,
        num_workstations=body.num_workstations,
        bottleneck_cycle_time=result["bottleneck_cycle_time"],
        balance_efficiency_pct=result["balance_efficiency_pct"],
        predicted_output_per_hour=result["predicted_output_per_hour"],
        created_by_user_id=user.id,
        status="draft",
        workstation_payload=result,
    )
    db.add(run)
    await db.flush()
    for ws in result["workstations"]:
        db.add(
            LineBalanceWorkstation(
                tenant_id=tenant.id,
                balance_run_id=run.id,
                workstation_no=ws["workstation_no"],
                assigned_op_ids=[o["id"] for o in ws.get("assigned_ops", [])],
                cycle_time=ws.get("cycle_time"),
                machine_type=None,
            )
        )
    await db.commit()
    return {"balance_run_id": run.id, **result}
