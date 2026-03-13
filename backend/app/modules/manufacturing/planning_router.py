from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import (
    Item,
    ManufacturingMrpRecommendation,
    ManufacturingMrpRun,
    ManufacturingProductionPlan,
    ManufacturingProductionPlanLine,
    ManufacturingRoutingTemplate,
    ManufacturingWorkCenter,
    ManufacturingWorkOrder,
    ManufacturingWorkOrderOperation,
    ManufacturingRoutingStep,
    Tenant,
    User,
)
from app.modules.manufacturing.schemas import (
    CapacityLoadRow,
    MrpRecommendationResponse,
    MrpRunCreate,
    MrpRunResponse,
    ProductionPlanCreate,
    ProductionPlanLineResponse,
    ProductionPlanResponse,
    WorkOrderResponse,
)

router = APIRouter(prefix="/manufacturing/planning", tags=["manufacturing-planning"])


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


def _next_code(prefix: str, last_id: int | None) -> str:
    return f"{prefix}{(last_id or 0) + 1:04d}"


def _to_plan_line_response(row: ManufacturingProductionPlanLine) -> ProductionPlanLineResponse:
    return ProductionPlanLineResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        plan_id=row.plan_id,
        item_id=row.item_id,
        order_id=row.order_id,
        routing_id=row.routing_id,
        planned_qty=float(row.planned_qty),
        due_date=row.due_date,
        priority=row.priority,
    )


def _to_plan_response(row: ManufacturingProductionPlan, lines: list[ManufacturingProductionPlanLine]) -> ProductionPlanResponse:
    return ProductionPlanResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        plan_code=row.plan_code,
        period_start=row.period_start,
        period_end=row.period_end,
        status=row.status,
        created_by_user_id=row.created_by_user_id,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
        lines=[_to_plan_line_response(line) for line in lines],
    )


def _to_work_order_response(row: ManufacturingWorkOrder) -> WorkOrderResponse:
    return WorkOrderResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        mo_number=row.mo_number,
        item_id=row.item_id,
        plan_line_id=row.plan_line_id,
        routing_id=row.routing_id,
        qty_planned=float(row.qty_planned),
        qty_completed=float(row.qty_completed),
        status=row.status,
        notes=row.notes,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _to_mrp_run_response(row: ManufacturingMrpRun) -> MrpRunResponse:
    return MrpRunResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        run_code=row.run_code,
        plan_id=row.plan_id,
        horizon_start=row.horizon_start,
        horizon_end=row.horizon_end,
        status=row.status,
        created_by_user_id=row.created_by_user_id,
        created_at=row.created_at,
    )


@router.get("/production-plans", response_model=list[ProductionPlanResponse])
async def list_production_plans(
    status_filter: str | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(ManufacturingProductionPlan).where(ManufacturingProductionPlan.tenant_id == tenant.id)
    if status_filter and status_filter.strip():
        stmt = stmt.where(ManufacturingProductionPlan.status == status_filter.strip().lower())
    result = await db.execute(stmt.order_by(ManufacturingProductionPlan.id.desc()))
    plans = result.scalars().all()
    response: list[ProductionPlanResponse] = []
    for plan in plans:
        lines_result = await db.execute(
            select(ManufacturingProductionPlanLine)
            .where(
                ManufacturingProductionPlanLine.tenant_id == tenant.id,
                ManufacturingProductionPlanLine.plan_id == plan.id,
            )
            .order_by(ManufacturingProductionPlanLine.priority, ManufacturingProductionPlanLine.id)
        )
        response.append(_to_plan_response(plan, list(lines_result.scalars().all())))
    return response


@router.post("/production-plans", response_model=ProductionPlanResponse, status_code=status.HTTP_201_CREATED)
async def create_production_plan(
    body: ProductionPlanCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    if body.period_end < body.period_start:
        raise HTTPException(status_code=400, detail="period_end cannot be earlier than period_start")

    if body.plan_code:
        plan_code = body.plan_code.strip()
    else:
        last_id = (
            await db.execute(select(func.max(ManufacturingProductionPlan.id)).where(ManufacturingProductionPlan.tenant_id == tenant.id))
        ).scalar()
        plan_code = _next_code("PLAN-", last_id)

    row = ManufacturingProductionPlan(
        tenant_id=tenant.id,
        plan_code=plan_code,
        period_start=body.period_start,
        period_end=body.period_end,
        status="draft",
        created_by_user_id=user.id,
    )
    db.add(row)
    await db.flush()

    for line in body.lines:
        item = await db.get(Item, line.item_id)
        if not item or item.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail=f"Item not found for line item_id={line.item_id}")
        if line.routing_id is not None:
            routing = await db.get(ManufacturingRoutingTemplate, line.routing_id)
            if not routing or routing.tenant_id != tenant.id:
                raise HTTPException(status_code=404, detail=f"Routing not found for routing_id={line.routing_id}")
        db.add(
            ManufacturingProductionPlanLine(
                tenant_id=tenant.id,
                plan_id=row.id,
                item_id=line.item_id,
                order_id=line.order_id,
                routing_id=line.routing_id,
                planned_qty=line.planned_qty,
                due_date=line.due_date,
                priority=line.priority,
            )
        )
    await db.commit()
    await db.refresh(row)
    lines_result = await db.execute(
        select(ManufacturingProductionPlanLine).where(
            ManufacturingProductionPlanLine.tenant_id == tenant.id,
            ManufacturingProductionPlanLine.plan_id == row.id,
        )
    )
    return _to_plan_response(row, list(lines_result.scalars().all()))


@router.post("/production-plans/{plan_id}/generate-work-orders", response_model=list[WorkOrderResponse])
async def generate_work_orders(
    plan_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    plan = await db.get(ManufacturingProductionPlan, plan_id)
    if not plan or plan.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Production plan not found")

    lines_result = await db.execute(
        select(ManufacturingProductionPlanLine).where(
            ManufacturingProductionPlanLine.tenant_id == tenant.id,
            ManufacturingProductionPlanLine.plan_id == plan_id,
        )
    )
    lines = list(lines_result.scalars().all())
    if not lines:
        raise HTTPException(status_code=400, detail="Production plan has no lines")

    created_orders: list[ManufacturingWorkOrder] = []
    for line in lines:
        existing = await db.execute(
            select(ManufacturingWorkOrder).where(
                ManufacturingWorkOrder.tenant_id == tenant.id,
                ManufacturingWorkOrder.plan_line_id == line.id,
            )
        )
        if existing.scalars().first():
            continue
        last_id = (
            await db.execute(select(func.max(ManufacturingWorkOrder.id)).where(ManufacturingWorkOrder.tenant_id == tenant.id))
        ).scalar()
        mo_number = _next_code("MWO-", last_id)
        wo = ManufacturingWorkOrder(
            tenant_id=tenant.id,
            mo_number=mo_number,
            item_id=line.item_id,
            plan_line_id=line.id,
            routing_id=line.routing_id,
            qty_planned=line.planned_qty,
            qty_completed=0,
            status="planned",
        )
        db.add(wo)
        await db.flush()
        if line.routing_id is not None:
            steps_result = await db.execute(
                select(ManufacturingRoutingStep).where(
                    ManufacturingRoutingStep.tenant_id == tenant.id,
                    ManufacturingRoutingStep.routing_id == line.routing_id,
                ).order_by(ManufacturingRoutingStep.step_no)
            )
            for step in steps_result.scalars().all():
                db.add(
                    ManufacturingWorkOrderOperation(
                        tenant_id=tenant.id,
                        work_order_id=wo.id,
                        step_no=step.step_no,
                        operation_id=step.operation_id,
                        work_center_id=step.work_center_id,
                        status="pending",
                    )
                )
        created_orders.append(wo)

    plan.status = "planned"
    await db.commit()
    for row in created_orders:
        await db.refresh(row)
    return [_to_work_order_response(row) for row in created_orders]


@router.post("/mrp/runs", response_model=MrpRunResponse, status_code=status.HTTP_201_CREATED)
async def run_mrp(
    body: MrpRunCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    if body.horizon_end < body.horizon_start:
        raise HTTPException(status_code=400, detail="horizon_end cannot be earlier than horizon_start")
    if body.plan_id is not None:
        plan = await db.get(ManufacturingProductionPlan, body.plan_id)
        if not plan or plan.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Production plan not found")

    last_id = (await db.execute(select(func.max(ManufacturingMrpRun.id)).where(ManufacturingMrpRun.tenant_id == tenant.id))).scalar()
    run_code = _next_code("MRP-", last_id)
    run = ManufacturingMrpRun(
        tenant_id=tenant.id,
        run_code=run_code,
        plan_id=body.plan_id,
        horizon_start=body.horizon_start,
        horizon_end=body.horizon_end,
        status="completed",
        created_by_user_id=user.id,
    )
    db.add(run)
    await db.flush()

    lines_stmt = select(ManufacturingProductionPlanLine).where(ManufacturingProductionPlanLine.tenant_id == tenant.id)
    if body.plan_id is not None:
        lines_stmt = lines_stmt.where(ManufacturingProductionPlanLine.plan_id == body.plan_id)
    lines_result = await db.execute(lines_stmt)
    for line in lines_result.scalars().all():
        existing_qty = (
            await db.execute(
                select(func.coalesce(func.sum(ManufacturingWorkOrder.qty_planned), 0)).where(
                    ManufacturingWorkOrder.tenant_id == tenant.id,
                    ManufacturingWorkOrder.plan_line_id == line.id,
                )
            )
        ).scalar() or 0
        gap_qty = float(line.planned_qty) - float(existing_qty)
        if gap_qty <= 0:
            continue
        recommendation = ManufacturingMrpRecommendation(
            tenant_id=tenant.id,
            run_id=run.id,
            item_id=line.item_id,
            recommendation_type="manufacture",
            suggested_qty=round(gap_qty, 3),
            due_date=line.due_date,
            reason="Planned demand exceeds released work orders",
        )
        db.add(recommendation)

    await db.commit()
    await db.refresh(run)
    return _to_mrp_run_response(run)


@router.get("/mrp/runs/{run_id}/recommendations", response_model=list[MrpRecommendationResponse])
async def get_mrp_recommendations(
    run_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    run = await db.get(ManufacturingMrpRun, run_id)
    if not run or run.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="MRP run not found")
    result = await db.execute(
        select(ManufacturingMrpRecommendation)
        .where(
            ManufacturingMrpRecommendation.tenant_id == tenant.id,
            ManufacturingMrpRecommendation.run_id == run_id,
        )
        .order_by(ManufacturingMrpRecommendation.id)
    )
    rows = result.scalars().all()
    return [
        MrpRecommendationResponse(
            id=row.id,
            tenant_id=row.tenant_id,
            run_id=row.run_id,
            item_id=row.item_id,
            recommendation_type=row.recommendation_type,
            suggested_qty=float(row.suggested_qty),
            due_date=row.due_date,
            reason=row.reason,
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.get("/capacity/loads", response_model=list[CapacityLoadRow])
async def get_capacity_loads(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    wc_rows = (
        await db.execute(
            select(ManufacturingWorkCenter).where(ManufacturingWorkCenter.tenant_id == tenant.id)
        )
    ).scalars().all()
    wc_map = {row.id: row for row in wc_rows}
    ops = (
        await db.execute(
            select(ManufacturingWorkOrderOperation).where(ManufacturingWorkOrderOperation.tenant_id == tenant.id)
        )
    ).scalars().all()
    wo_rows = (
        await db.execute(select(ManufacturingWorkOrder).where(ManufacturingWorkOrder.tenant_id == tenant.id))
    ).scalars().all()
    wo_map = {row.id: row for row in wo_rows}

    bucket: dict[int | None, dict[str, float]] = {}
    for op in ops:
        key = op.work_center_id
        if key not in bucket:
            bucket[key] = {"orders": 0, "planned": 0.0, "completed": 0.0}
        bucket[key]["orders"] += 1
        wo = wo_map.get(op.work_order_id)
        if wo:
            bucket[key]["planned"] += float(wo.qty_planned)
            bucket[key]["completed"] += float(wo.qty_completed)

    rows: list[CapacityLoadRow] = []
    for work_center_id, values in bucket.items():
        wc = wc_map.get(work_center_id) if work_center_id is not None else None
        planned = values["planned"]
        completed = values["completed"]
        load_percent = round((completed / planned) * 100, 2) if planned > 0 else 0.0
        rows.append(
            CapacityLoadRow(
                work_center_id=work_center_id,
                work_center_name=wc.name if wc else "Unassigned",
                total_orders=int(values["orders"]),
                total_qty_planned=round(planned, 3),
                total_qty_completed=round(completed, 3),
                load_percent=load_percent,
            )
        )
    rows.sort(key=lambda r: r.work_center_name)
    return rows
