from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import (
    Item,
    ManufacturingOperation,
    ManufacturingRoutingStep,
    ManufacturingRoutingTemplate,
    ManufacturingWorkCenter,
    Tenant,
    User,
)
from app.modules.manufacturing.schemas import (
    OperationCreate,
    OperationResponse,
    OperationUpdate,
    RoutingStepCreate,
    RoutingStepResponse,
    RoutingTemplateCreate,
    RoutingTemplateResponse,
    WorkCenterCreate,
    WorkCenterResponse,
    WorkCenterUpdate,
)

router = APIRouter(prefix="/manufacturing/master", tags=["manufacturing-master"])


ALLOWED_PROCESS_AREAS = {"cutting", "sewing", "finishing", "general"}


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


def _to_work_center_response(row: ManufacturingWorkCenter) -> WorkCenterResponse:
    return WorkCenterResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        code=row.code,
        name=row.name,
        capacity_minutes_per_day=row.capacity_minutes_per_day,
        is_active=row.is_active,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _to_operation_response(row: ManufacturingOperation) -> OperationResponse:
    return OperationResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        code=row.code,
        name=row.name,
        default_work_center_id=row.default_work_center_id,
        process_area=row.process_area,
        std_cycle_minutes=float(row.std_cycle_minutes) if row.std_cycle_minutes is not None else None,
        std_setup_minutes=float(row.std_setup_minutes) if row.std_setup_minutes is not None else None,
        is_active=row.is_active,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _to_routing_response(row: ManufacturingRoutingTemplate) -> RoutingTemplateResponse:
    return RoutingTemplateResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        routing_code=row.routing_code,
        item_id=row.item_id,
        version_no=row.version_no,
        is_active=row.is_active,
        notes=row.notes,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _to_routing_step_response(row: ManufacturingRoutingStep) -> RoutingStepResponse:
    return RoutingStepResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        routing_id=row.routing_id,
        step_no=row.step_no,
        operation_id=row.operation_id,
        work_center_id=row.work_center_id,
        std_minutes=float(row.std_minutes) if row.std_minutes is not None else None,
        qc_required=row.qc_required,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


@router.get("/work-centers", response_model=list[WorkCenterResponse])
async def list_work_centers(
    active_only: bool = Query(default=False),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(ManufacturingWorkCenter).where(ManufacturingWorkCenter.tenant_id == tenant.id)
    if active_only:
        stmt = stmt.where(ManufacturingWorkCenter.is_active.is_(True))
    result = await db.execute(stmt.order_by(ManufacturingWorkCenter.code))
    return [_to_work_center_response(r) for r in result.scalars().all()]


@router.post("/work-centers", response_model=WorkCenterResponse, status_code=status.HTTP_201_CREATED)
async def create_work_center(
    body: WorkCenterCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = ManufacturingWorkCenter(tenant_id=tenant.id, **body.model_dump())
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Work center code already exists")
    await db.refresh(row)
    return _to_work_center_response(row)


@router.patch("/work-centers/{work_center_id}", response_model=WorkCenterResponse)
async def update_work_center(
    work_center_id: int,
    body: WorkCenterUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ManufacturingWorkCenter, work_center_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Work center not found")
    payload = body.model_dump(exclude_unset=True)
    for key, value in payload.items():
        if isinstance(value, str):
            value = value.strip()
        setattr(row, key, value)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Work center code already exists")
    await db.refresh(row)
    return _to_work_center_response(row)


@router.get("/operations", response_model=list[OperationResponse])
async def list_operations(
    active_only: bool = Query(default=False),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(ManufacturingOperation).where(ManufacturingOperation.tenant_id == tenant.id)
    if active_only:
        stmt = stmt.where(ManufacturingOperation.is_active.is_(True))
    result = await db.execute(stmt.order_by(ManufacturingOperation.code))
    return [_to_operation_response(r) for r in result.scalars().all()]


@router.post("/operations", response_model=OperationResponse, status_code=status.HTTP_201_CREATED)
async def create_operation(
    body: OperationCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    process_area = body.process_area.strip().lower()
    if process_area not in ALLOWED_PROCESS_AREAS:
        raise HTTPException(status_code=400, detail="process_area must be one of: cutting, sewing, finishing, general")
    if body.default_work_center_id is not None:
        wc = await db.get(ManufacturingWorkCenter, body.default_work_center_id)
        if not wc or wc.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Default work center not found")
    payload = body.model_dump()
    payload["process_area"] = process_area
    row = ManufacturingOperation(tenant_id=tenant.id, **payload)
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Operation code already exists")
    await db.refresh(row)
    return _to_operation_response(row)


@router.patch("/operations/{operation_id}", response_model=OperationResponse)
async def update_operation(
    operation_id: int,
    body: OperationUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ManufacturingOperation, operation_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Operation not found")
    if body.default_work_center_id is not None:
        wc = await db.get(ManufacturingWorkCenter, body.default_work_center_id)
        if not wc or wc.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Default work center not found")
    payload = body.model_dump(exclude_unset=True)
    if "process_area" in payload and payload["process_area"] is not None:
        process_area = payload["process_area"].strip().lower()
        if process_area not in ALLOWED_PROCESS_AREAS:
            raise HTTPException(
                status_code=400,
                detail="process_area must be one of: cutting, sewing, finishing, general",
            )
        payload["process_area"] = process_area
    for key, value in payload.items():
        if isinstance(value, str):
            value = value.strip()
        setattr(row, key, value)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Operation code already exists")
    await db.refresh(row)
    return _to_operation_response(row)


@router.get("/routing-templates", response_model=list[RoutingTemplateResponse])
async def list_routing_templates(
    item_id: int | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(ManufacturingRoutingTemplate).where(ManufacturingRoutingTemplate.tenant_id == tenant.id)
    if item_id is not None:
        stmt = stmt.where(ManufacturingRoutingTemplate.item_id == item_id)
    result = await db.execute(stmt.order_by(ManufacturingRoutingTemplate.routing_code, ManufacturingRoutingTemplate.version_no))
    return [_to_routing_response(r) for r in result.scalars().all()]


@router.post("/routing-templates", response_model=RoutingTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_routing_template(
    body: RoutingTemplateCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    item = await db.get(Item, body.item_id)
    if not item or item.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Item not found")
    row = ManufacturingRoutingTemplate(tenant_id=tenant.id, **body.model_dump())
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Routing code/version already exists")
    await db.refresh(row)
    return _to_routing_response(row)


@router.get("/routing-templates/{routing_id}/steps", response_model=list[RoutingStepResponse])
async def list_routing_steps(
    routing_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    routing = await db.get(ManufacturingRoutingTemplate, routing_id)
    if not routing or routing.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Routing template not found")
    result = await db.execute(
        select(ManufacturingRoutingStep)
        .where(
            ManufacturingRoutingStep.tenant_id == tenant.id,
            ManufacturingRoutingStep.routing_id == routing_id,
        )
        .order_by(ManufacturingRoutingStep.step_no)
    )
    return [_to_routing_step_response(r) for r in result.scalars().all()]


@router.post("/routing-templates/{routing_id}/steps", response_model=RoutingStepResponse, status_code=status.HTTP_201_CREATED)
async def add_routing_step(
    routing_id: int,
    body: RoutingStepCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    routing = await db.get(ManufacturingRoutingTemplate, routing_id)
    if not routing or routing.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Routing template not found")
    op = await db.get(ManufacturingOperation, body.operation_id)
    if not op or op.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Operation not found")
    if body.work_center_id is not None:
        wc = await db.get(ManufacturingWorkCenter, body.work_center_id)
        if not wc or wc.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Work center not found")
    row = ManufacturingRoutingStep(tenant_id=tenant.id, routing_id=routing_id, **body.model_dump())
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Step number already exists for this routing")
    await db.refresh(row)
    return _to_routing_step_response(row)
