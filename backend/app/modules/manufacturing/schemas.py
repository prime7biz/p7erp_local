from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field


class WorkCenterCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=32)
    name: str = Field(..., min_length=1, max_length=128)
    capacity_minutes_per_day: int = Field(default=480, ge=1, le=24 * 60)
    is_active: bool = True


class WorkCenterUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=32)
    name: str | None = Field(default=None, min_length=1, max_length=128)
    capacity_minutes_per_day: int | None = Field(default=None, ge=1, le=24 * 60)
    is_active: bool | None = None


class WorkCenterResponse(BaseModel):
    id: int
    tenant_id: int
    code: str
    name: str
    capacity_minutes_per_day: int
    is_active: bool
    created_at: str
    updated_at: str


class OperationCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=32)
    name: str = Field(..., min_length=1, max_length=128)
    default_work_center_id: int | None = None
    process_area: str = Field(default="general", min_length=1, max_length=32)
    std_cycle_minutes: float | None = Field(default=None, ge=0)
    std_setup_minutes: float | None = Field(default=None, ge=0)
    is_active: bool = True


class OperationUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=32)
    name: str | None = Field(default=None, min_length=1, max_length=128)
    default_work_center_id: int | None = None
    process_area: str | None = Field(default=None, min_length=1, max_length=32)
    std_cycle_minutes: float | None = Field(default=None, ge=0)
    std_setup_minutes: float | None = Field(default=None, ge=0)
    is_active: bool | None = None


class OperationResponse(BaseModel):
    id: int
    tenant_id: int
    code: str
    name: str
    default_work_center_id: int | None
    process_area: str
    std_cycle_minutes: float | None
    std_setup_minutes: float | None
    is_active: bool
    created_at: str
    updated_at: str


class RoutingTemplateCreate(BaseModel):
    routing_code: str = Field(..., min_length=1, max_length=32)
    item_id: int
    version_no: int = Field(default=1, ge=1)
    is_active: bool = True
    notes: str | None = None


class RoutingTemplateResponse(BaseModel):
    id: int
    tenant_id: int
    routing_code: str
    item_id: int
    version_no: int
    is_active: bool
    notes: str | None
    created_at: str
    updated_at: str


class RoutingStepCreate(BaseModel):
    step_no: int = Field(..., ge=1)
    operation_id: int
    work_center_id: int | None = None
    std_minutes: float | None = Field(default=None, ge=0)
    qc_required: bool = False


class RoutingStepResponse(BaseModel):
    id: int
    tenant_id: int
    routing_id: int
    step_no: int
    operation_id: int
    work_center_id: int | None
    std_minutes: float | None
    qc_required: bool
    created_at: str
    updated_at: str


class ProductionPlanLineCreate(BaseModel):
    item_id: int
    order_id: int | None = None
    routing_id: int | None = None
    planned_qty: float = Field(..., gt=0)
    due_date: date | None = None
    priority: int = Field(default=5, ge=1, le=10)


class ProductionPlanCreate(BaseModel):
    plan_code: str | None = Field(default=None, min_length=1, max_length=32)
    period_start: date
    period_end: date
    lines: list[ProductionPlanLineCreate] = []


class ProductionPlanLineResponse(BaseModel):
    id: int
    tenant_id: int
    plan_id: int
    item_id: int
    order_id: int | None
    routing_id: int | None
    planned_qty: float
    due_date: date | None
    priority: int


class ProductionPlanResponse(BaseModel):
    id: int
    tenant_id: int
    plan_code: str
    period_start: date
    period_end: date
    status: str
    created_by_user_id: int | None
    created_at: str
    updated_at: str
    lines: list[ProductionPlanLineResponse]


class WorkOrderCreate(BaseModel):
    mo_number: str | None = Field(default=None, min_length=1, max_length=32)
    item_id: int
    plan_line_id: int | None = None
    routing_id: int | None = None
    qty_planned: float = Field(..., gt=0)
    notes: str | None = None


class WorkOrderStatusUpdate(BaseModel):
    status: str = Field(..., min_length=1, max_length=32)


class WorkOrderResponse(BaseModel):
    id: int
    tenant_id: int
    mo_number: str
    item_id: int
    plan_line_id: int | None
    routing_id: int | None
    qty_planned: float
    qty_completed: float
    status: str
    notes: str | None
    created_at: str
    updated_at: str


class WorkOrderOperationResponse(BaseModel):
    id: int
    tenant_id: int
    work_order_id: int
    step_no: int
    operation_id: int
    work_center_id: int | None
    status: str
    start_at: datetime | None
    end_at: datetime | None
    qty_in: float | None
    qty_out: float | None
    scrap_qty: float | None
    created_at: str
    updated_at: str


class WorkOrderOperationComplete(BaseModel):
    qty_in: float | None = Field(default=None, ge=0)
    qty_out: float | None = Field(default=None, ge=0)
    scrap_qty: float | None = Field(default=None, ge=0)


class MaterialIssueCreate(BaseModel):
    work_order_id: int
    work_order_operation_id: int | None = None
    item_id: int
    warehouse_id: int | None = None
    qty_issued: float = Field(..., gt=0)


class MaterialIssueResponse(BaseModel):
    id: int
    tenant_id: int
    work_order_id: int
    work_order_operation_id: int | None
    item_id: int
    warehouse_id: int | None
    qty_issued: float
    stock_movement_id: int | None
    issued_at: datetime


class MaterialReturnCreate(BaseModel):
    issue_id: int
    qty_returned: float = Field(..., gt=0)
    warehouse_id: int | None = None


class MaterialReturnResponse(BaseModel):
    id: int
    tenant_id: int
    issue_id: int
    qty_returned: float
    warehouse_id: int | None
    stock_movement_id: int | None
    returned_at: datetime


class QualityCheckCreate(BaseModel):
    work_order_id: int
    work_order_operation_id: int | None = None
    check_type: str = Field(default="in_process", min_length=1, max_length=64)
    result: str = Field(default="pass", min_length=1, max_length=16)
    defect_code: str | None = Field(default=None, max_length=32)
    remarks: str | None = None


class QualityCheckResponse(BaseModel):
    id: int
    tenant_id: int
    work_order_id: int
    work_order_operation_id: int | None
    check_type: str
    result: str
    defect_code: str | None
    remarks: str | None
    checked_by_user_id: int | None
    created_at: datetime


class FreezeCostSnapshotCreate(BaseModel):
    labor_cost: float = Field(default=0, ge=0)
    overhead_cost: float = Field(default=0, ge=0)
    standard_total_cost: float | None = Field(default=None, ge=0)
    snapshot_note: str | None = None


class CostSnapshotResponse(BaseModel):
    id: int
    tenant_id: int
    work_order_id: int
    material_cost: float
    labor_cost: float
    overhead_cost: float
    total_cost: float
    variance_amount: float
    snapshot_note: str | None
    created_by_user_id: int | None
    created_at: datetime


class MrpRunCreate(BaseModel):
    plan_id: int | None = None
    horizon_start: date
    horizon_end: date


class MrpRunResponse(BaseModel):
    id: int
    tenant_id: int
    run_code: str
    plan_id: int | None
    horizon_start: date
    horizon_end: date
    status: str
    created_by_user_id: int | None
    created_at: datetime


class MrpRecommendationResponse(BaseModel):
    id: int
    tenant_id: int
    run_id: int
    item_id: int
    recommendation_type: str
    suggested_qty: float
    due_date: date | None
    reason: str | None
    created_at: datetime


class CapacityLoadRow(BaseModel):
    work_center_id: int | None
    work_center_name: str
    total_orders: int
    total_qty_planned: float
    total_qty_completed: float
    load_percent: float


class OperationAssignCreate(BaseModel):
    work_order_operation_id: int
    assigned_user_id: int
    role_type: str = Field(default="operator", min_length=1, max_length=32)
    notes: str | None = None


class OperationAssignmentResponse(BaseModel):
    id: int
    tenant_id: int
    work_order_operation_id: int
    assigned_user_id: int
    role_type: str
    assigned_at: datetime
    notes: str | None


class DowntimeCreate(BaseModel):
    work_order_operation_id: int
    reason_code: str = Field(..., min_length=1, max_length=32)
    reason_note: str | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None


class DowntimeResponse(BaseModel):
    id: int
    tenant_id: int
    work_order_operation_id: int
    reason_code: str
    reason_note: str | None
    started_at: datetime
    ended_at: datetime | None
    duration_minutes: float | None
    recorded_by_user_id: int | None
    created_at: datetime


class DowntimeEndBody(BaseModel):
    ended_at: datetime | None = None


class ExecutionDashboardResponse(BaseModel):
    total_work_orders: int
    active_work_orders: int
    completed_work_orders: int
    total_operations: int
    completed_operations: int
    total_downtime_minutes: float
    oee_like_percent: float


class DowntimeReasonRow(BaseModel):
    reason_code: str
    total_events: int
    open_events: int
    total_minutes: float


class DowntimeTrendRow(BaseModel):
    trend_date: date
    total_events: int
    open_events: int
    total_minutes: float


class SampleRequestCreate(BaseModel):
    sample_no: str | None = Field(default=None, min_length=1, max_length=32)
    order_id: int | None = None
    item_id: int | None = None
    sample_type: str = Field(default="fit", min_length=1, max_length=32)
    priority: str = Field(default="medium", min_length=1, max_length=16)
    requested_date: date | None = None
    target_date: date | None = None
    assigned_user_id: int | None = None
    notes: str | None = None


class SampleRequestUpdate(BaseModel):
    sample_type: str | None = Field(default=None, min_length=1, max_length=32)
    priority: str | None = Field(default=None, min_length=1, max_length=16)
    requested_date: date | None = None
    target_date: date | None = None
    assigned_user_id: int | None = None
    notes: str | None = None


class SampleRequestStatusUpdate(BaseModel):
    status: str = Field(..., min_length=1, max_length=32)
    note: str | None = None


class SampleRequestResponse(BaseModel):
    id: int
    tenant_id: int
    sample_no: str
    order_id: int | None
    item_id: int | None
    sample_type: str
    priority: str
    requested_date: date | None
    target_date: date | None
    status: str
    assigned_user_id: int | None
    notes: str | None
    created_by_user_id: int | None
    created_at: datetime
    updated_at: datetime


class TnaTemplateCreate(BaseModel):
    template_code: str | None = Field(default=None, min_length=1, max_length=32)
    name: str = Field(..., min_length=1, max_length=128)
    applies_to: str = Field(default="order", min_length=1, max_length=32)
    version_no: int = Field(default=1, ge=1)
    is_active: bool = True
    notes: str | None = None


class TnaTemplateTaskCreate(BaseModel):
    seq_no: int = Field(..., ge=1)
    task_code: str | None = Field(default=None, max_length=32)
    task_name: str = Field(..., min_length=1, max_length=128)
    department: str | None = Field(default=None, max_length=64)
    offset_days: int = 0
    duration_days: int = Field(default=1, ge=1)
    depends_on_seq: int | None = Field(default=None, ge=1)
    owner_role: str | None = Field(default=None, max_length=32)
    is_milestone: bool = False


class TnaTemplateResponse(BaseModel):
    id: int
    tenant_id: int
    template_code: str
    name: str
    applies_to: str
    version_no: int
    is_active: bool
    notes: str | None
    created_at: datetime
    updated_at: datetime


class TnaTemplateTaskResponse(BaseModel):
    id: int
    tenant_id: int
    template_id: int
    seq_no: int
    task_code: str | None
    task_name: str
    department: str | None
    offset_days: int
    duration_days: int
    depends_on_seq: int | None
    owner_role: str | None
    is_milestone: bool
    created_at: datetime
    updated_at: datetime


class TnaPlanCreate(BaseModel):
    plan_code: str | None = Field(default=None, min_length=1, max_length=32)
    template_id: int
    order_id: int | None = None
    item_id: int | None = None
    start_date: date
    status: str = Field(default="active", min_length=1, max_length=32)


class TnaPlanTaskUpdate(BaseModel):
    actual_date: date | None = None
    status: str | None = Field(default=None, min_length=1, max_length=32)
    owner_user_id: int | None = None
    remarks: str | None = None


class TnaPlanResponse(BaseModel):
    id: int
    tenant_id: int
    plan_code: str
    template_id: int
    order_id: int | None
    item_id: int | None
    start_date: date
    target_end_date: date | None
    status: str
    created_by_user_id: int | None
    created_at: datetime
    updated_at: datetime


class TnaPlanTaskResponse(BaseModel):
    id: int
    tenant_id: int
    plan_id: int
    template_task_id: int | None
    seq_no: int
    depends_on_seq: int | None
    dependency_status: str | None
    dependency_ready: bool
    task_name: str
    department: str | None
    planned_date: date
    actual_date: date | None
    status: str
    owner_user_id: int | None
    remarks: str | None
    created_at: datetime
    updated_at: datetime


class TnaDashboardSummary(BaseModel):
    total_plans: int
    active_plans: int
    done_tasks: int
    delayed_tasks: int
    upcoming_tasks_7d: int
    overdue_tasks: int


class OperationQueueRow(BaseModel):
    work_order_operation_id: int
    work_order_id: int
    mo_number: str
    step_no: int
    operation_id: int
    operation_name: str
    work_center_id: int | None
    work_center_name: str
    status: str
    assigned_user_id: int | None
    open_downtime: bool
    qty_in: float | None
    qty_out: float | None
    scrap_qty: float | None


class NcrCreate(BaseModel):
    ncr_code: str | None = Field(default=None, min_length=1, max_length=32)
    work_order_id: int
    work_order_operation_id: int | None = None
    defect_code: str = Field(..., min_length=1, max_length=32)
    severity: str = Field(default="minor", min_length=1, max_length=16)
    description: str | None = None


class NcrStatusUpdate(BaseModel):
    status: str = Field(..., min_length=1, max_length=32)
    note: str | None = None


class NcrResponse(BaseModel):
    id: int
    tenant_id: int
    ncr_code: str
    work_order_id: int
    work_order_operation_id: int | None
    defect_code: str
    severity: str
    status: str
    description: str | None
    created_by_user_id: int | None
    created_at: datetime
    updated_at: datetime


class CapaCreate(BaseModel):
    ncr_id: int
    owner_user_id: int | None = None
    corrective_action: str = Field(..., min_length=1)
    preventive_action: str | None = None
    due_date: date | None = None


class CapaStatusUpdate(BaseModel):
    status: str = Field(..., min_length=1, max_length=32)
    closure_note: str | None = None
    note: str | None = None


class CapaResponse(BaseModel):
    id: int
    tenant_id: int
    ncr_id: int
    owner_user_id: int | None
    corrective_action: str
    preventive_action: str | None
    due_date: date | None
    status: str
    closure_note: str | None
    closed_at: datetime | None
    created_at: datetime
    updated_at: datetime
