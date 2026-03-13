from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import (
    ManufacturingDowntimeEvent,
    ManufacturingMaterialIssue,
    ManufacturingMaterialReturn,
    ManufacturingOperation,
    ManufacturingOperationAssignment,
    ManufacturingWorkCenter,
    ManufacturingWorkOrder,
    ManufacturingWorkOrderOperation,
    Role,
    StockMovement,
    Tenant,
    User,
)
from app.modules.manufacturing.schemas import (
    DowntimeCreate,
    DowntimeEndBody,
    DowntimeReasonRow,
    DowntimeTrendRow,
    DowntimeResponse,
    ExecutionDashboardResponse,
    MaterialIssueCreate,
    MaterialIssueResponse,
    MaterialReturnCreate,
    MaterialReturnResponse,
    OperationAssignCreate,
    OperationAssignmentResponse,
    OperationQueueRow,
    WorkOrderCreate,
    WorkOrderOperationComplete,
    WorkOrderOperationResponse,
    WorkOrderResponse,
    WorkOrderStatusUpdate,
)

router = APIRouter(prefix="/manufacturing/execution", tags=["manufacturing-execution"])


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


async def _role_name(db: AsyncSession, user: User) -> str:
    role = await db.get(Role, user.role_id)
    return (role.name if role else "").strip().lower()


async def _require_any_role(
    db: AsyncSession,
    user: User,
    allowed_roles: set[str],
    message: str = "Permission denied for this action",
) -> None:
    role_name = await _role_name(db, user)
    if role_name not in allowed_roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=message)


def _next_code(prefix: str, last_id: int | None) -> str:
    return f"{prefix}{(last_id or 0) + 1:04d}"


def _to_float(value: str | float | int | None) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


async def _on_hand_qty(
    db: AsyncSession,
    tenant_id: int,
    item_id: int,
    warehouse_id: int | None,
) -> float:
    stmt = select(StockMovement).where(StockMovement.tenant_id == tenant_id, StockMovement.item_id == item_id)
    if warehouse_id is None:
        stmt = stmt.where(StockMovement.warehouse_id.is_(None))
    else:
        stmt = stmt.where(StockMovement.warehouse_id == warehouse_id)
    rows = (await db.execute(stmt)).scalars().all()
    in_qty = sum(_to_float(r.quantity) for r in rows if r.movement_type == "IN")
    out_qty = sum(_to_float(r.quantity) for r in rows if r.movement_type == "OUT")
    return round(in_qty - out_qty, 3)


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


def _to_operation_response(row: ManufacturingWorkOrderOperation) -> WorkOrderOperationResponse:
    return WorkOrderOperationResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        work_order_id=row.work_order_id,
        step_no=row.step_no,
        operation_id=row.operation_id,
        work_center_id=row.work_center_id,
        status=row.status,
        start_at=row.start_at,
        end_at=row.end_at,
        qty_in=float(row.qty_in) if row.qty_in is not None else None,
        qty_out=float(row.qty_out) if row.qty_out is not None else None,
        scrap_qty=float(row.scrap_qty) if row.scrap_qty is not None else None,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


@router.get("/work-orders", response_model=list[WorkOrderResponse])
async def list_work_orders(
    status_filter: str | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(ManufacturingWorkOrder).where(ManufacturingWorkOrder.tenant_id == tenant.id)
    if status_filter and status_filter.strip():
        stmt = stmt.where(ManufacturingWorkOrder.status == status_filter.strip().lower())
    result = await db.execute(stmt.order_by(ManufacturingWorkOrder.id.desc()))
    return [_to_work_order_response(row) for row in result.scalars().all()]


@router.post("/work-orders", response_model=WorkOrderResponse, status_code=status.HTTP_201_CREATED)
async def create_work_order(
    body: WorkOrderCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    if body.mo_number:
        mo_number = body.mo_number.strip()
    else:
        last_id = (await db.execute(select(func.max(ManufacturingWorkOrder.id)).where(ManufacturingWorkOrder.tenant_id == tenant.id))).scalar()
        mo_number = _next_code("MWO-", last_id)
    row = ManufacturingWorkOrder(
        tenant_id=tenant.id,
        mo_number=mo_number,
        item_id=body.item_id,
        plan_line_id=body.plan_line_id,
        routing_id=body.routing_id,
        qty_planned=body.qty_planned,
        qty_completed=0,
        status="draft",
        notes=body.notes.strip() if body.notes else None,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _to_work_order_response(row)


@router.post("/work-orders/{work_order_id}/status", response_model=WorkOrderResponse)
async def update_work_order_status(
    work_order_id: int,
    body: WorkOrderStatusUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ManufacturingWorkOrder, work_order_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Work order not found")
    next_status = body.status.strip().lower()
    allowed = {"draft", "planned", "released", "in_progress", "on_hold", "completed", "cancelled"}
    if next_status not in allowed:
        raise HTTPException(status_code=400, detail="Invalid status")
    row.status = next_status
    await db.commit()
    await db.refresh(row)
    return _to_work_order_response(row)


@router.get("/work-orders/{work_order_id}/operations", response_model=list[WorkOrderOperationResponse])
async def list_work_order_operations(
    work_order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    wo = await db.get(ManufacturingWorkOrder, work_order_id)
    if not wo or wo.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Work order not found")
    result = await db.execute(
        select(ManufacturingWorkOrderOperation)
        .where(
            ManufacturingWorkOrderOperation.tenant_id == tenant.id,
            ManufacturingWorkOrderOperation.work_order_id == work_order_id,
        )
        .order_by(ManufacturingWorkOrderOperation.step_no)
    )
    return [_to_operation_response(row) for row in result.scalars().all()]


@router.post("/operations/{work_order_operation_id}/start", response_model=WorkOrderOperationResponse)
async def start_operation(
    work_order_operation_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_any_role(
        db,
        user,
        {"operator", "supervisor", "manager", "admin", "owner", "super_admin", "superadmin"},
    )
    row = await db.get(ManufacturingWorkOrderOperation, work_order_operation_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Work order operation not found")
    if row.status not in {"pending", "on_hold"}:
        raise HTTPException(status_code=400, detail="Only pending/on_hold operation can be started")

    prev_result = await db.execute(
        select(ManufacturingWorkOrderOperation).where(
            ManufacturingWorkOrderOperation.tenant_id == tenant.id,
            ManufacturingWorkOrderOperation.work_order_id == row.work_order_id,
            ManufacturingWorkOrderOperation.step_no == row.step_no - 1,
        )
    )
    prev_op = prev_result.scalars().first()
    if prev_op and prev_op.status != "completed":
        raise HTTPException(status_code=400, detail="Previous operation must be completed first")

    row.status = "in_progress"
    row.start_at = datetime.utcnow()
    await db.commit()
    await db.refresh(row)
    return _to_operation_response(row)


@router.post("/operations/{work_order_operation_id}/complete", response_model=WorkOrderOperationResponse)
async def complete_operation(
    work_order_operation_id: int,
    body: WorkOrderOperationComplete,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_any_role(
        db,
        user,
        {"operator", "supervisor", "manager", "admin", "owner", "super_admin", "superadmin"},
    )
    row = await db.get(ManufacturingWorkOrderOperation, work_order_operation_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Work order operation not found")
    if row.status != "in_progress":
        raise HTTPException(status_code=400, detail="Only in-progress operation can be completed")
    if body.qty_in is not None:
        row.qty_in = body.qty_in
    if body.qty_out is not None:
        row.qty_out = body.qty_out
    if body.scrap_qty is not None:
        row.scrap_qty = body.scrap_qty
    if row.qty_in is not None and row.qty_out is not None and float(row.qty_out) > float(row.qty_in):
        raise HTTPException(status_code=400, detail="qty_out cannot be greater than qty_in")
    row.status = "completed"
    row.end_at = datetime.utcnow()

    wo = await db.get(ManufacturingWorkOrder, row.work_order_id)
    if wo and wo.tenant_id == tenant.id and row.qty_out is not None:
        wo.qty_completed = row.qty_out
        all_result = await db.execute(
            select(ManufacturingWorkOrderOperation).where(
                ManufacturingWorkOrderOperation.tenant_id == tenant.id,
                ManufacturingWorkOrderOperation.work_order_id == row.work_order_id,
            )
        )
        ops = list(all_result.scalars().all())
        if ops and all(op.status == "completed" for op in ops):
            wo.status = "completed"
    await db.commit()
    await db.refresh(row)
    return _to_operation_response(row)


@router.post("/material-issues", response_model=MaterialIssueResponse, status_code=status.HTTP_201_CREATED)
async def create_material_issue(
    body: MaterialIssueCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    wo = await db.get(ManufacturingWorkOrder, body.work_order_id)
    if not wo or wo.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Work order not found")
    if body.work_order_operation_id is not None:
        op_row = await db.get(ManufacturingWorkOrderOperation, body.work_order_operation_id)
        if not op_row or op_row.tenant_id != tenant.id or op_row.work_order_id != body.work_order_id:
            raise HTTPException(status_code=404, detail="Operation not found for work order")

    available = await _on_hand_qty(db, tenant.id, body.item_id, body.warehouse_id)
    if available < body.qty_issued:
        raise HTTPException(status_code=400, detail=f"Insufficient stock. Available={available}")

    movement = StockMovement(
        tenant_id=tenant.id,
        item_id=body.item_id,
        warehouse_id=body.warehouse_id,
        movement_type="OUT",
        quantity=str(body.qty_issued),
        reference_type="MFG_ISSUE",
        reference_id=body.work_order_id,
        notes=f"Issued against {wo.mo_number}",
    )
    db.add(movement)
    await db.flush()

    row = ManufacturingMaterialIssue(
        tenant_id=tenant.id,
        work_order_id=body.work_order_id,
        work_order_operation_id=body.work_order_operation_id,
        item_id=body.item_id,
        warehouse_id=body.warehouse_id,
        qty_issued=body.qty_issued,
        stock_movement_id=movement.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return MaterialIssueResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        work_order_id=row.work_order_id,
        work_order_operation_id=row.work_order_operation_id,
        item_id=row.item_id,
        warehouse_id=row.warehouse_id,
        qty_issued=float(row.qty_issued),
        stock_movement_id=row.stock_movement_id,
        issued_at=row.issued_at,
    )


@router.get("/material-returns", response_model=list[MaterialReturnResponse])
async def list_material_returns(
    work_order_id: int | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List material returns for the tenant, optionally filtered by work order."""
    _ensure_tenant(user, tenant)
    stmt = select(ManufacturingMaterialReturn).where(ManufacturingMaterialReturn.tenant_id == tenant.id)
    if work_order_id is not None:
        stmt = stmt.join(ManufacturingMaterialIssue, ManufacturingMaterialReturn.issue_id == ManufacturingMaterialIssue.id)
        stmt = stmt.where(ManufacturingMaterialIssue.work_order_id == work_order_id)
    result = await db.execute(stmt.order_by(ManufacturingMaterialReturn.id.desc()))
    rows = result.scalars().all()
    return [
        MaterialReturnResponse(
            id=row.id,
            tenant_id=row.tenant_id,
            issue_id=row.issue_id,
            qty_returned=float(row.qty_returned),
            warehouse_id=row.warehouse_id,
            stock_movement_id=row.stock_movement_id,
            returned_at=row.returned_at,
        )
        for row in rows
    ]


@router.post("/material-returns", response_model=MaterialReturnResponse, status_code=status.HTTP_201_CREATED)
async def create_material_return(
    body: MaterialReturnCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    issue = await db.get(ManufacturingMaterialIssue, body.issue_id)
    if not issue or issue.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Material issue not found")
    if body.qty_returned > float(issue.qty_issued):
        raise HTTPException(status_code=400, detail="Returned quantity cannot exceed issued quantity")

    movement = StockMovement(
        tenant_id=tenant.id,
        item_id=issue.item_id,
        warehouse_id=body.warehouse_id if body.warehouse_id is not None else issue.warehouse_id,
        movement_type="IN",
        quantity=str(body.qty_returned),
        reference_type="MFG_RETURN",
        reference_id=issue.work_order_id,
        notes=f"Material return against issue #{issue.id}",
    )
    db.add(movement)
    await db.flush()

    row = ManufacturingMaterialReturn(
        tenant_id=tenant.id,
        issue_id=body.issue_id,
        qty_returned=body.qty_returned,
        warehouse_id=body.warehouse_id if body.warehouse_id is not None else issue.warehouse_id,
        stock_movement_id=movement.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return MaterialReturnResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        issue_id=row.issue_id,
        qty_returned=float(row.qty_returned),
        warehouse_id=row.warehouse_id,
        stock_movement_id=row.stock_movement_id,
        returned_at=row.returned_at,
    )


@router.post("/operations/assignments", response_model=OperationAssignmentResponse, status_code=status.HTTP_201_CREATED)
async def assign_operation(
    body: OperationAssignCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_any_role(
        db,
        user,
        {"supervisor", "manager", "admin", "owner", "super_admin", "superadmin"},
        message="Only supervisor/manager/admin can assign operations",
    )
    op = await db.get(ManufacturingWorkOrderOperation, body.work_order_operation_id)
    if not op or op.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Work order operation not found")
    assigned_user = await db.get(User, body.assigned_user_id)
    if not assigned_user or assigned_user.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Assigned user not found")

    row = ManufacturingOperationAssignment(
        tenant_id=tenant.id,
        work_order_operation_id=body.work_order_operation_id,
        assigned_user_id=body.assigned_user_id,
        role_type=body.role_type.strip().lower(),
        notes=body.notes.strip() if body.notes else None,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return OperationAssignmentResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        work_order_operation_id=row.work_order_operation_id,
        assigned_user_id=row.assigned_user_id,
        role_type=row.role_type,
        assigned_at=row.assigned_at,
        notes=row.notes,
    )


@router.post("/operations/downtime", response_model=DowntimeResponse, status_code=status.HTTP_201_CREATED)
async def log_downtime(
    body: DowntimeCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_any_role(
        db,
        user,
        {"operator", "supervisor", "manager", "admin", "owner", "super_admin", "superadmin"},
    )
    op = await db.get(ManufacturingWorkOrderOperation, body.work_order_operation_id)
    if not op or op.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Work order operation not found")
    existing_open = (
        await db.execute(
            select(ManufacturingDowntimeEvent.id).where(
                ManufacturingDowntimeEvent.tenant_id == tenant.id,
                ManufacturingDowntimeEvent.work_order_operation_id == body.work_order_operation_id,
                ManufacturingDowntimeEvent.ended_at.is_(None),
            )
        )
    ).first()
    if existing_open:
        raise HTTPException(status_code=400, detail="An open downtime event already exists for this operation")
    started_at = body.started_at or datetime.utcnow()
    ended_at = body.ended_at
    if ended_at is not None and ended_at < started_at:
        raise HTTPException(status_code=400, detail="ended_at cannot be earlier than started_at")
    duration = None
    if ended_at is not None:
        duration = round((ended_at - started_at).total_seconds() / 60, 2)
    row = ManufacturingDowntimeEvent(
        tenant_id=tenant.id,
        work_order_operation_id=body.work_order_operation_id,
        reason_code=body.reason_code.strip().upper(),
        reason_note=body.reason_note.strip() if body.reason_note else None,
        started_at=started_at,
        ended_at=ended_at,
        duration_minutes=duration,
        recorded_by_user_id=user.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return DowntimeResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        work_order_operation_id=row.work_order_operation_id,
        reason_code=row.reason_code,
        reason_note=row.reason_note,
        started_at=row.started_at,
        ended_at=row.ended_at,
        duration_minutes=float(row.duration_minutes) if row.duration_minutes is not None else None,
        recorded_by_user_id=row.recorded_by_user_id,
        created_at=row.created_at,
    )


@router.get("/operations/downtime", response_model=list[DowntimeResponse])
async def list_downtime(
    work_order_operation_id: int | None = Query(default=None),
    open_only: bool = Query(default=False),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(ManufacturingDowntimeEvent).where(ManufacturingDowntimeEvent.tenant_id == tenant.id)
    if work_order_operation_id is not None:
        stmt = stmt.where(ManufacturingDowntimeEvent.work_order_operation_id == work_order_operation_id)
    if open_only:
        stmt = stmt.where(ManufacturingDowntimeEvent.ended_at.is_(None))
    rows = (await db.execute(stmt.order_by(ManufacturingDowntimeEvent.id.desc()))).scalars().all()
    return [
        DowntimeResponse(
            id=row.id,
            tenant_id=row.tenant_id,
            work_order_operation_id=row.work_order_operation_id,
            reason_code=row.reason_code,
            reason_note=row.reason_note,
            started_at=row.started_at,
            ended_at=row.ended_at,
            duration_minutes=float(row.duration_minutes) if row.duration_minutes is not None else None,
            recorded_by_user_id=row.recorded_by_user_id,
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.post("/operations/downtime/{downtime_id}/end", response_model=DowntimeResponse)
async def end_downtime(
    downtime_id: int,
    body: DowntimeEndBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_any_role(
        db,
        user,
        {"supervisor", "manager", "admin", "owner", "super_admin", "superadmin"},
        message="Only supervisor/manager/admin can close downtime",
    )
    row = await db.get(ManufacturingDowntimeEvent, downtime_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Downtime event not found")
    if row.ended_at is not None:
        raise HTTPException(status_code=400, detail="Downtime event already closed")
    ended_at = body.ended_at or datetime.utcnow()
    if ended_at < row.started_at:
        raise HTTPException(status_code=400, detail="ended_at cannot be earlier than started_at")
    row.ended_at = ended_at
    row.duration_minutes = round((ended_at - row.started_at).total_seconds() / 60, 2)
    await db.commit()
    await db.refresh(row)
    return DowntimeResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        work_order_operation_id=row.work_order_operation_id,
        reason_code=row.reason_code,
        reason_note=row.reason_note,
        started_at=row.started_at,
        ended_at=row.ended_at,
        duration_minutes=float(row.duration_minutes) if row.duration_minutes is not None else None,
        recorded_by_user_id=row.recorded_by_user_id,
        created_at=row.created_at,
    )


@router.get("/dashboard", response_model=ExecutionDashboardResponse)
async def execution_dashboard(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    wo_rows = (
        await db.execute(select(ManufacturingWorkOrder).where(ManufacturingWorkOrder.tenant_id == tenant.id))
    ).scalars().all()
    op_rows = (
        await db.execute(select(ManufacturingWorkOrderOperation).where(ManufacturingWorkOrderOperation.tenant_id == tenant.id))
    ).scalars().all()
    dt_rows = (
        await db.execute(select(ManufacturingDowntimeEvent).where(ManufacturingDowntimeEvent.tenant_id == tenant.id))
    ).scalars().all()
    total_work_orders = len(wo_rows)
    active_work_orders = len([r for r in wo_rows if r.status in {"released", "in_progress", "on_hold"}])
    completed_work_orders = len([r for r in wo_rows if r.status == "completed"])
    total_operations = len(op_rows)
    completed_operations = len([r for r in op_rows if r.status == "completed"])
    total_downtime_minutes = round(
        sum(float(r.duration_minutes or 0) for r in dt_rows),
        2,
    )
    completion_rate = (completed_operations / total_operations) if total_operations else 0.0
    availability_factor = max(0.0, 1.0 - (total_downtime_minutes / (total_operations * 60))) if total_operations else 0.0
    oee_like_percent = round(completion_rate * availability_factor * 100, 2)
    return ExecutionDashboardResponse(
        total_work_orders=total_work_orders,
        active_work_orders=active_work_orders,
        completed_work_orders=completed_work_orders,
        total_operations=total_operations,
        completed_operations=completed_operations,
        total_downtime_minutes=total_downtime_minutes,
        oee_like_percent=oee_like_percent,
    )


@router.get("/operations/queue", response_model=list[OperationQueueRow])
async def operation_queue(
    work_center_id: int | None = Query(default=None),
    status_filter: str | None = Query(default=None),
    area: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(ManufacturingWorkOrderOperation).where(ManufacturingWorkOrderOperation.tenant_id == tenant.id)
    if work_center_id is not None:
        stmt = stmt.where(ManufacturingWorkOrderOperation.work_center_id == work_center_id)
    if status_filter and status_filter.strip():
        stmt = stmt.where(ManufacturingWorkOrderOperation.status == status_filter.strip().lower())
    rows = (await db.execute(stmt.order_by(ManufacturingWorkOrderOperation.id.desc()).limit(limit))).scalars().all()
    if not rows:
        return []

    work_orders = (
        await db.execute(
            select(ManufacturingWorkOrder).where(ManufacturingWorkOrder.tenant_id == tenant.id)
        )
    ).scalars().all()
    wo_map = {row.id: row for row in work_orders}
    operations = (
        await db.execute(
            select(ManufacturingOperation).where(ManufacturingOperation.tenant_id == tenant.id)
        )
    ).scalars().all()
    op_map = {row.id: row for row in operations}
    work_centers = (
        await db.execute(
            select(ManufacturingWorkCenter).where(ManufacturingWorkCenter.tenant_id == tenant.id)
        )
    ).scalars().all()
    wc_map = {row.id: row for row in work_centers}

    area_filter = (area or "").strip().lower()
    allowed_areas = {"", "cutting", "sewing", "finishing"}
    if area_filter not in allowed_areas:
        raise HTTPException(status_code=400, detail="area must be one of: cutting, sewing, finishing")

    def _infer_area(operation_name: str, work_center_name: str) -> str:
        op = operation_name.lower()
        wc = work_center_name.lower()
        if "cut" in op or "cut" in wc:
            return "cutting"
        if "sew" in op or "stitch" in op or "sew" in wc or "line" in wc:
            return "sewing"
        if "finish" in op or "pack" in op or "wash" in op or "finish" in wc or "pack" in wc:
            return "finishing"
        return "other"

    response: list[OperationQueueRow] = []
    for row in rows:
        wo = wo_map.get(row.work_order_id)
        op_ref = op_map.get(row.operation_id)
        wc_ref = wc_map.get(row.work_center_id) if row.work_center_id is not None else None
        latest_assignment = (
            await db.execute(
                select(ManufacturingOperationAssignment)
                .where(
                    ManufacturingOperationAssignment.tenant_id == tenant.id,
                    ManufacturingOperationAssignment.work_order_operation_id == row.id,
                )
                .order_by(ManufacturingOperationAssignment.id.desc())
            )
        ).scalars().first()
        open_downtime = (
            await db.execute(
                select(ManufacturingDowntimeEvent.id).where(
                    ManufacturingDowntimeEvent.tenant_id == tenant.id,
                    ManufacturingDowntimeEvent.work_order_operation_id == row.id,
                    ManufacturingDowntimeEvent.ended_at.is_(None),
                )
            )
        ).first() is not None

        operation_name = op_ref.name if op_ref else f"Operation #{row.operation_id}"
        work_center_name = wc_ref.name if wc_ref else "Unassigned"
        explicit_area = (op_ref.process_area if op_ref else None) or ""
        inferred_area = explicit_area.strip().lower() or _infer_area(operation_name, work_center_name)
        if inferred_area == "general":
            inferred_area = _infer_area(operation_name, work_center_name)
        if area_filter and inferred_area != area_filter:
            continue
        response.append(
            OperationQueueRow(
                work_order_operation_id=row.id,
                work_order_id=row.work_order_id,
                mo_number=wo.mo_number if wo else f"WO-{row.work_order_id}",
                step_no=row.step_no,
                operation_id=row.operation_id,
                operation_name=operation_name,
                work_center_id=row.work_center_id,
                work_center_name=work_center_name,
                status=row.status,
                assigned_user_id=latest_assignment.assigned_user_id if latest_assignment else None,
                open_downtime=open_downtime,
                qty_in=float(row.qty_in) if row.qty_in is not None else None,
                qty_out=float(row.qty_out) if row.qty_out is not None else None,
                scrap_qty=float(row.scrap_qty) if row.scrap_qty is not None else None,
            )
        )
    return response


@router.get("/dashboard/downtime-reasons", response_model=list[DowntimeReasonRow])
async def downtime_reason_summary(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=400, detail="start_date cannot be after end_date")
    rows = (
        await db.execute(
            select(ManufacturingDowntimeEvent).where(ManufacturingDowntimeEvent.tenant_id == tenant.id)
        )
    ).scalars().all()
    bucket: dict[str, dict[str, float]] = {}
    for row in rows:
        started_on = row.started_at.date()
        if start_date and started_on < start_date:
            continue
        if end_date and started_on > end_date:
            continue
        code = (row.reason_code or "").strip().upper() or "UNKNOWN"
        if code not in bucket:
            bucket[code] = {"total_events": 0.0, "open_events": 0.0, "total_minutes": 0.0}
        bucket[code]["total_events"] += 1
        if row.ended_at is None:
            bucket[code]["open_events"] += 1
        bucket[code]["total_minutes"] += float(row.duration_minutes or 0)

    response = [
        DowntimeReasonRow(
            reason_code=code,
            total_events=int(vals["total_events"]),
            open_events=int(vals["open_events"]),
            total_minutes=round(vals["total_minutes"], 2),
        )
        for code, vals in bucket.items()
    ]
    response.sort(key=lambda r: (-r.total_minutes, -r.total_events, r.reason_code))
    return response


@router.get("/dashboard/downtime-trend", response_model=list[DowntimeTrendRow])
async def downtime_trend(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=400, detail="start_date cannot be after end_date")
    if start_date is None and end_date is None:
        end_date = datetime.utcnow().date()
        start_date = end_date - timedelta(days=13)
    elif start_date is None and end_date is not None:
        start_date = end_date - timedelta(days=13)
    elif start_date is not None and end_date is None:
        end_date = start_date + timedelta(days=13)

    assert start_date is not None
    assert end_date is not None
    if (end_date - start_date).days > 92:
        raise HTTPException(status_code=400, detail="Date range too large; max 93 days")

    rows = (
        await db.execute(
            select(ManufacturingDowntimeEvent).where(ManufacturingDowntimeEvent.tenant_id == tenant.id)
        )
    ).scalars().all()
    bucket: dict[date, dict[str, float]] = {}
    current = start_date
    while current <= end_date:
        bucket[current] = {"total_events": 0.0, "open_events": 0.0, "total_minutes": 0.0}
        current += timedelta(days=1)

    for row in rows:
        d = row.started_at.date()
        if d < start_date or d > end_date:
            continue
        bucket[d]["total_events"] += 1
        if row.ended_at is None:
            bucket[d]["open_events"] += 1
        bucket[d]["total_minutes"] += float(row.duration_minutes or 0)

    return [
        DowntimeTrendRow(
            trend_date=d,
            total_events=int(vals["total_events"]),
            open_events=int(vals["open_events"]),
            total_minutes=round(vals["total_minutes"], 2),
        )
        for d, vals in sorted(bucket.items(), key=lambda item: item[0])
    ]


@router.post("/operations/{work_order_operation_id}/hold", response_model=WorkOrderOperationResponse)
async def hold_operation(
    work_order_operation_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_any_role(
        db,
        user,
        {"operator", "supervisor", "manager", "admin", "owner", "super_admin", "superadmin"},
    )
    row = await db.get(ManufacturingWorkOrderOperation, work_order_operation_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Work order operation not found")
    if row.status != "in_progress":
        raise HTTPException(status_code=400, detail="Only in-progress operation can be put on hold")
    row.status = "on_hold"
    await db.commit()
    await db.refresh(row)
    return _to_operation_response(row)


@router.post("/operations/{work_order_operation_id}/resume", response_model=WorkOrderOperationResponse)
async def resume_operation(
    work_order_operation_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_any_role(
        db,
        user,
        {"operator", "supervisor", "manager", "admin", "owner", "super_admin", "superadmin"},
    )
    row = await db.get(ManufacturingWorkOrderOperation, work_order_operation_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Work order operation not found")
    if row.status != "on_hold":
        raise HTTPException(status_code=400, detail="Only on-hold operation can be resumed")
    row.status = "in_progress"
    await db.commit()
    await db.refresh(row)
    return _to_operation_response(row)
