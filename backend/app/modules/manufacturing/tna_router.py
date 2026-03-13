from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import (
    Item,
    ManufacturingTnaPlan,
    ManufacturingTnaPlanTask,
    ManufacturingTnaTemplate,
    ManufacturingTnaTemplateTask,
    Order,
    Role,
    Tenant,
    User,
)
from app.modules.manufacturing.schemas import (
    TnaDashboardSummary,
    TnaPlanCreate,
    TnaPlanResponse,
    TnaPlanTaskResponse,
    TnaPlanTaskUpdate,
    TnaTemplateCreate,
    TnaTemplateResponse,
    TnaTemplateTaskCreate,
    TnaTemplateTaskResponse,
)

router = APIRouter(prefix="/manufacturing/tna", tags=["manufacturing-tna"])


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


def _next_code(prefix: str, last_id: int | None) -> str:
    return f"{prefix}{(last_id or 0) + 1:04d}"


async def _role_name(db: AsyncSession, user: User) -> str:
    role = await db.get(Role, user.role_id)
    return (role.name if role else "").strip().lower()


async def _require_manage_role(db: AsyncSession, user: User) -> None:
    role_name = await _role_name(db, user)
    allowed = {"supervisor", "manager", "admin", "owner", "super_admin", "superadmin"}
    if role_name not in allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only supervisor/manager/admin can manage TNA")


def _to_template_response(row: ManufacturingTnaTemplate) -> TnaTemplateResponse:
    return TnaTemplateResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        template_code=row.template_code,
        name=row.name,
        applies_to=row.applies_to,
        version_no=row.version_no,
        is_active=row.is_active,
        notes=row.notes,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _to_template_task_response(row: ManufacturingTnaTemplateTask) -> TnaTemplateTaskResponse:
    return TnaTemplateTaskResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        template_id=row.template_id,
        seq_no=row.seq_no,
        task_code=row.task_code,
        task_name=row.task_name,
        department=row.department,
        offset_days=row.offset_days,
        duration_days=row.duration_days,
        depends_on_seq=row.depends_on_seq,
        owner_role=row.owner_role,
        is_milestone=row.is_milestone,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _to_plan_response(row: ManufacturingTnaPlan) -> TnaPlanResponse:
    return TnaPlanResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        plan_code=row.plan_code,
        template_id=row.template_id,
        order_id=row.order_id,
        item_id=row.item_id,
        start_date=row.start_date,
        target_end_date=row.target_end_date,
        status=row.status,
        created_by_user_id=row.created_by_user_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _to_plan_task_response(
    row: ManufacturingTnaPlanTask,
    depends_on_seq: int | None = None,
    dependency_status: str | None = None,
    dependency_ready: bool = True,
) -> TnaPlanTaskResponse:
    return TnaPlanTaskResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        plan_id=row.plan_id,
        template_task_id=row.template_task_id,
        seq_no=row.seq_no,
        depends_on_seq=depends_on_seq,
        dependency_status=dependency_status,
        dependency_ready=dependency_ready,
        task_name=row.task_name,
        department=row.department,
        planned_date=row.planned_date,
        actual_date=row.actual_date,
        status=row.status,
        owner_user_id=row.owner_user_id,
        remarks=row.remarks,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/templates", response_model=list[TnaTemplateResponse])
async def list_templates(
    active_only: bool = Query(default=False),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(ManufacturingTnaTemplate).where(ManufacturingTnaTemplate.tenant_id == tenant.id)
    if active_only:
        stmt = stmt.where(ManufacturingTnaTemplate.is_active.is_(True))
    rows = (await db.execute(stmt.order_by(ManufacturingTnaTemplate.id.desc()))).scalars().all()
    return [_to_template_response(row) for row in rows]


@router.post("/templates", response_model=TnaTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    body: TnaTemplateCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manage_role(db, user)
    if body.template_code and body.template_code.strip():
        template_code = body.template_code.strip()
    else:
        last_id = (
            await db.execute(select(func.max(ManufacturingTnaTemplate.id)).where(ManufacturingTnaTemplate.tenant_id == tenant.id))
        ).scalar()
        template_code = _next_code("TNA-TPL-", last_id)
    row = ManufacturingTnaTemplate(
        tenant_id=tenant.id,
        template_code=template_code,
        name=body.name.strip(),
        applies_to=body.applies_to.strip().lower(),
        version_no=body.version_no,
        is_active=body.is_active,
        notes=body.notes.strip() if body.notes else None,
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Template code/version already exists")
    await db.refresh(row)
    return _to_template_response(row)


@router.get("/templates/{template_id}/tasks", response_model=list[TnaTemplateTaskResponse])
async def list_template_tasks(
    template_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    template = await db.get(ManufacturingTnaTemplate, template_id)
    if not template or template.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Template not found")
    rows = (
        await db.execute(
            select(ManufacturingTnaTemplateTask)
            .where(
                ManufacturingTnaTemplateTask.tenant_id == tenant.id,
                ManufacturingTnaTemplateTask.template_id == template_id,
            )
            .order_by(ManufacturingTnaTemplateTask.seq_no)
        )
    ).scalars().all()
    return [_to_template_task_response(row) for row in rows]


@router.post("/templates/{template_id}/tasks", response_model=TnaTemplateTaskResponse, status_code=status.HTTP_201_CREATED)
async def add_template_task(
    template_id: int,
    body: TnaTemplateTaskCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manage_role(db, user)
    template = await db.get(ManufacturingTnaTemplate, template_id)
    if not template or template.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Template not found")
    row = ManufacturingTnaTemplateTask(
        tenant_id=tenant.id,
        template_id=template_id,
        seq_no=body.seq_no,
        task_code=body.task_code.strip() if body.task_code else None,
        task_name=body.task_name.strip(),
        department=body.department.strip() if body.department else None,
        offset_days=body.offset_days,
        duration_days=body.duration_days,
        depends_on_seq=body.depends_on_seq,
        owner_role=body.owner_role.strip().lower() if body.owner_role else None,
        is_milestone=body.is_milestone,
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Task sequence already exists for this template")
    await db.refresh(row)
    return _to_template_task_response(row)


@router.get("/plans", response_model=list[TnaPlanResponse])
async def list_plans(
    status_filter: str | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(ManufacturingTnaPlan).where(ManufacturingTnaPlan.tenant_id == tenant.id)
    if status_filter and status_filter.strip():
        stmt = stmt.where(ManufacturingTnaPlan.status == status_filter.strip().lower())
    rows = (await db.execute(stmt.order_by(ManufacturingTnaPlan.id.desc()))).scalars().all()
    return [_to_plan_response(row) for row in rows]


@router.get("/plans/{plan_id}", response_model=TnaPlanResponse)
async def get_plan(
    plan_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ManufacturingTnaPlan, plan_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Plan not found")
    return _to_plan_response(row)


@router.post("/plans", response_model=TnaPlanResponse, status_code=status.HTTP_201_CREATED)
async def create_plan(
    body: TnaPlanCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manage_role(db, user)
    template = await db.get(ManufacturingTnaTemplate, body.template_id)
    if not template or template.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Template not found")
    if body.order_id is not None:
        order = await db.get(Order, body.order_id)
        if not order or order.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Order not found")
    if body.item_id is not None:
        item = await db.get(Item, body.item_id)
        if not item or item.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Item not found")

    template_tasks = (
        await db.execute(
            select(ManufacturingTnaTemplateTask)
            .where(
                ManufacturingTnaTemplateTask.tenant_id == tenant.id,
                ManufacturingTnaTemplateTask.template_id == body.template_id,
            )
            .order_by(ManufacturingTnaTemplateTask.seq_no)
        )
    ).scalars().all()
    if not template_tasks:
        raise HTTPException(status_code=400, detail="Template has no tasks")

    if body.plan_code and body.plan_code.strip():
        plan_code = body.plan_code.strip()
    else:
        last_id = (
            await db.execute(select(func.max(ManufacturingTnaPlan.id)).where(ManufacturingTnaPlan.tenant_id == tenant.id))
        ).scalar()
        plan_code = _next_code("TNA-PLAN-", last_id)

    plan = ManufacturingTnaPlan(
        tenant_id=tenant.id,
        plan_code=plan_code,
        template_id=body.template_id,
        order_id=body.order_id,
        item_id=body.item_id,
        start_date=body.start_date,
        status=body.status.strip().lower(),
        created_by_user_id=user.id,
    )
    db.add(plan)
    await db.flush()

    latest_planned_date = body.start_date
    for task in template_tasks:
        planned = body.start_date + timedelta(days=task.offset_days)
        if planned > latest_planned_date:
            latest_planned_date = planned
        db.add(
            ManufacturingTnaPlanTask(
                tenant_id=tenant.id,
                plan_id=plan.id,
                template_task_id=task.id,
                seq_no=task.seq_no,
                task_name=task.task_name,
                department=task.department,
                planned_date=planned,
                status="not_started",
            )
        )

    plan.target_end_date = latest_planned_date
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Plan code already exists")
    await db.refresh(plan)
    return _to_plan_response(plan)


@router.get("/plans/{plan_id}/tasks", response_model=list[TnaPlanTaskResponse])
async def list_plan_tasks(
    plan_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    plan = await db.get(ManufacturingTnaPlan, plan_id)
    if not plan or plan.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Plan not found")
    rows = (
        await db.execute(
            select(ManufacturingTnaPlanTask)
            .where(
                ManufacturingTnaPlanTask.tenant_id == tenant.id,
                ManufacturingTnaPlanTask.plan_id == plan_id,
            )
            .order_by(ManufacturingTnaPlanTask.seq_no)
        )
    ).scalars().all()
    template_task_ids = [row.template_task_id for row in rows if row.template_task_id is not None]
    template_tasks: list[ManufacturingTnaTemplateTask] = []
    if template_task_ids:
        template_tasks = (
            await db.execute(
                select(ManufacturingTnaTemplateTask).where(
                    ManufacturingTnaTemplateTask.tenant_id == tenant.id,
                    ManufacturingTnaTemplateTask.id.in_(template_task_ids),
                )
            )
        ).scalars().all()
    template_map = {t.id: t for t in template_tasks}
    plan_task_by_seq = {row.seq_no: row for row in rows}
    response: list[TnaPlanTaskResponse] = []
    for row in rows:
        template_task = template_map.get(row.template_task_id) if row.template_task_id is not None else None
        depends_on_seq = template_task.depends_on_seq if template_task else None
        predecessor = plan_task_by_seq.get(depends_on_seq) if depends_on_seq is not None else None
        dependency_status = predecessor.status if predecessor else None
        dependency_ready = depends_on_seq is None or (predecessor is not None and predecessor.status == "done")
        response.append(_to_plan_task_response(row, depends_on_seq, dependency_status, dependency_ready))
    return response


@router.patch("/plan-tasks/{task_id}", response_model=TnaPlanTaskResponse)
async def update_plan_task(
    task_id: int,
    body: TnaPlanTaskUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manage_role(db, user)
    row = await db.get(ManufacturingTnaPlanTask, task_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Plan task not found")
    if body.owner_user_id is not None:
        owner = await db.get(User, body.owner_user_id)
        if not owner or owner.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Owner user not found")

    template_task = await db.get(ManufacturingTnaTemplateTask, row.template_task_id) if row.template_task_id is not None else None
    depends_on_seq = template_task.depends_on_seq if template_task else None
    predecessor = None
    dependency_status = None
    dependency_ready = True
    if depends_on_seq is not None:
        predecessor = (
            await db.execute(
                select(ManufacturingTnaPlanTask).where(
                    ManufacturingTnaPlanTask.tenant_id == tenant.id,
                    ManufacturingTnaPlanTask.plan_id == row.plan_id,
                    ManufacturingTnaPlanTask.seq_no == depends_on_seq,
                )
            )
        ).scalars().first()
        dependency_status = predecessor.status if predecessor else None
        dependency_ready = predecessor is not None and predecessor.status == "done"

    payload = body.model_dump(exclude_unset=True)
    next_status = (payload.get("status") or row.status or "").strip().lower()
    if next_status in {"in_progress", "done"} and not dependency_ready:
        raise HTTPException(
            status_code=400,
            detail=f"Dependency not complete. Task seq {depends_on_seq} must be done first.",
        )
    for key, value in payload.items():
        if isinstance(value, str):
            value = value.strip().lower()
        setattr(row, key, value)
    if next_status == "done" and row.actual_date is None:
        row.actual_date = datetime.utcnow().date()
    await db.commit()
    await db.refresh(row)
    return _to_plan_task_response(row, depends_on_seq, dependency_status, dependency_ready)


@router.get("/dashboard/summary", response_model=TnaDashboardSummary)
async def dashboard_summary(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    plan_rows = (
        await db.execute(select(ManufacturingTnaPlan).where(ManufacturingTnaPlan.tenant_id == tenant.id))
    ).scalars().all()
    task_rows = (
        await db.execute(select(ManufacturingTnaPlanTask).where(ManufacturingTnaPlanTask.tenant_id == tenant.id))
    ).scalars().all()
    today = datetime.utcnow().date()
    upcoming_end = today + timedelta(days=7)
    upcoming_rows = (
        await db.execute(
            select(ManufacturingTnaPlanTask).where(
                ManufacturingTnaPlanTask.tenant_id == tenant.id,
                ManufacturingTnaPlanTask.status != "done",
                ManufacturingTnaPlanTask.planned_date >= today,
                ManufacturingTnaPlanTask.planned_date <= upcoming_end,
            )
        )
    ).scalars().all()
    overdue_rows = (
        await db.execute(
            select(ManufacturingTnaPlanTask).where(
                ManufacturingTnaPlanTask.tenant_id == tenant.id,
                ManufacturingTnaPlanTask.status != "done",
                ManufacturingTnaPlanTask.planned_date < today,
            )
        )
    ).scalars().all()
    return TnaDashboardSummary(
        total_plans=len(plan_rows),
        active_plans=len([row for row in plan_rows if row.status == "active"]),
        done_tasks=len([row for row in task_rows if row.status == "done"]),
        delayed_tasks=len([row for row in task_rows if row.status == "delayed"]),
        upcoming_tasks_7d=len(upcoming_rows),
        overdue_tasks=len(overdue_rows),
    )
