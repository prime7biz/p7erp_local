from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ManufacturingWorkCenter(Base):
    __tablename__ = "mfg_work_centers"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    capacity_minutes_per_day: Mapped[int] = mapped_column(Integer, nullable=False, default=480)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class ManufacturingOperation(Base):
    __tablename__ = "mfg_operations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    default_work_center_id: Mapped[int | None] = mapped_column(
        ForeignKey("mfg_work_centers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    process_area: Mapped[str] = mapped_column(String(32), nullable=False, default="general", index=True)
    std_cycle_minutes: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    std_setup_minutes: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class ManufacturingRoutingTemplate(Base):
    __tablename__ = "mfg_routing_templates"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    routing_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True)
    version_no: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class ManufacturingRoutingStep(Base):
    __tablename__ = "mfg_routing_steps"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    routing_id: Mapped[int] = mapped_column(ForeignKey("mfg_routing_templates.id", ondelete="CASCADE"), nullable=False, index=True)
    step_no: Mapped[int] = mapped_column(Integer, nullable=False)
    operation_id: Mapped[int] = mapped_column(ForeignKey("mfg_operations.id", ondelete="RESTRICT"), nullable=False, index=True)
    work_center_id: Mapped[int | None] = mapped_column(ForeignKey("mfg_work_centers.id", ondelete="SET NULL"), nullable=True, index=True)
    std_minutes: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    qc_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class ManufacturingProductionPlan(Base):
    __tablename__ = "mfg_production_plans"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    plan_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft", index=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class ManufacturingProductionPlanLine(Base):
    __tablename__ = "mfg_production_plan_lines"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("mfg_production_plans.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    routing_id: Mapped[int | None] = mapped_column(
        ForeignKey("mfg_routing_templates.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    planned_qty: Mapped[float] = mapped_column(Numeric(18, 3), nullable=False, default=0)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class ManufacturingWorkOrder(Base):
    __tablename__ = "mfg_work_orders"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    mo_number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True)
    plan_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("mfg_production_plan_lines.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    routing_id: Mapped[int | None] = mapped_column(
        ForeignKey("mfg_routing_templates.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    qty_planned: Mapped[float] = mapped_column(Numeric(18, 3), nullable=False, default=0)
    qty_completed: Mapped[float] = mapped_column(Numeric(18, 3), nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class ManufacturingWorkOrderOperation(Base):
    __tablename__ = "mfg_work_order_operations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    work_order_id: Mapped[int] = mapped_column(ForeignKey("mfg_work_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    step_no: Mapped[int] = mapped_column(Integer, nullable=False)
    operation_id: Mapped[int] = mapped_column(ForeignKey("mfg_operations.id", ondelete="RESTRICT"), nullable=False, index=True)
    work_center_id: Mapped[int | None] = mapped_column(ForeignKey("mfg_work_centers.id", ondelete="SET NULL"), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending", index=True)
    start_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    end_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    qty_in: Mapped[float | None] = mapped_column(Numeric(18, 3), nullable=True)
    qty_out: Mapped[float | None] = mapped_column(Numeric(18, 3), nullable=True)
    scrap_qty: Mapped[float | None] = mapped_column(Numeric(18, 3), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class ManufacturingMaterialIssue(Base):
    __tablename__ = "mfg_material_issues"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    work_order_id: Mapped[int] = mapped_column(ForeignKey("mfg_work_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    work_order_operation_id: Mapped[int | None] = mapped_column(
        ForeignKey("mfg_work_order_operations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True)
    warehouse_id: Mapped[int | None] = mapped_column(ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True, index=True)
    qty_issued: Mapped[float] = mapped_column(Numeric(18, 3), nullable=False, default=0)
    stock_movement_id: Mapped[int | None] = mapped_column(
        ForeignKey("stock_movements.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    issued_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class ManufacturingMaterialReturn(Base):
    __tablename__ = "mfg_material_returns"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    issue_id: Mapped[int] = mapped_column(ForeignKey("mfg_material_issues.id", ondelete="CASCADE"), nullable=False, index=True)
    qty_returned: Mapped[float] = mapped_column(Numeric(18, 3), nullable=False, default=0)
    warehouse_id: Mapped[int | None] = mapped_column(ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True, index=True)
    stock_movement_id: Mapped[int | None] = mapped_column(
        ForeignKey("stock_movements.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    returned_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class ManufacturingQualityCheck(Base):
    __tablename__ = "mfg_quality_checks"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    work_order_id: Mapped[int] = mapped_column(ForeignKey("mfg_work_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    work_order_operation_id: Mapped[int | None] = mapped_column(
        ForeignKey("mfg_work_order_operations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    check_type: Mapped[str] = mapped_column(String(64), nullable=False, default="in_process")
    result: Mapped[str] = mapped_column(String(16), nullable=False, default="pass", index=True)
    defect_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    checked_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class ManufacturingCostSnapshot(Base):
    __tablename__ = "mfg_cost_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    work_order_id: Mapped[int] = mapped_column(ForeignKey("mfg_work_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    material_cost: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    labor_cost: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    overhead_cost: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    total_cost: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    variance_amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    snapshot_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class ManufacturingMrpRun(Base):
    __tablename__ = "mfg_mrp_runs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    run_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    plan_id: Mapped[int | None] = mapped_column(
        ForeignKey("mfg_production_plans.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    horizon_start: Mapped[date] = mapped_column(Date, nullable=False)
    horizon_end: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="completed", index=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class ManufacturingMrpRecommendation(Base):
    __tablename__ = "mfg_mrp_recommendations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("mfg_mrp_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True)
    recommendation_type: Mapped[str] = mapped_column(String(32), nullable=False, default="manufacture")
    suggested_qty: Mapped[float] = mapped_column(Numeric(18, 3), nullable=False, default=0)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class ManufacturingOperationAssignment(Base):
    __tablename__ = "mfg_operation_assignments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    work_order_operation_id: Mapped[int] = mapped_column(
        ForeignKey("mfg_work_order_operations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    assigned_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    role_type: Mapped[str] = mapped_column(String(32), nullable=False, default="operator")
    assigned_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class ManufacturingDowntimeEvent(Base):
    __tablename__ = "mfg_downtime_events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    work_order_operation_id: Mapped[int] = mapped_column(
        ForeignKey("mfg_work_order_operations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    reason_code: Mapped[str] = mapped_column(String(32), nullable=False)
    reason_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    duration_minutes: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    recorded_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class ManufacturingNcr(Base):
    __tablename__ = "mfg_ncrs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    ncr_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    work_order_id: Mapped[int] = mapped_column(ForeignKey("mfg_work_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    work_order_operation_id: Mapped[int | None] = mapped_column(
        ForeignKey("mfg_work_order_operations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    defect_code: Mapped[str] = mapped_column(String(32), nullable=False)
    severity: Mapped[str] = mapped_column(String(16), nullable=False, default="minor")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="open", index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class ManufacturingCapa(Base):
    __tablename__ = "mfg_capas"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    ncr_id: Mapped[int] = mapped_column(ForeignKey("mfg_ncrs.id", ondelete="CASCADE"), nullable=False, index=True)
    owner_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    corrective_action: Mapped[str] = mapped_column(Text, nullable=False)
    preventive_action: Mapped[str | None] = mapped_column(Text, nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="open", index=True)
    closure_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class ManufacturingSampleRequest(Base):
    __tablename__ = "mfg_sample_requests"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    sample_no: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    item_id: Mapped[int | None] = mapped_column(ForeignKey("items.id", ondelete="SET NULL"), nullable=True, index=True)
    sample_type: Mapped[str] = mapped_column(String(32), nullable=False, default="fit")
    priority: Mapped[str] = mapped_column(String(16), nullable=False, default="medium")
    requested_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft", index=True)
    assigned_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class ManufacturingTnaTemplate(Base):
    __tablename__ = "mfg_tna_templates"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    template_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    applies_to: Mapped[str] = mapped_column(String(32), nullable=False, default="order")
    version_no: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class ManufacturingTnaTemplateTask(Base):
    __tablename__ = "mfg_tna_template_tasks"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    template_id: Mapped[int] = mapped_column(ForeignKey("mfg_tna_templates.id", ondelete="CASCADE"), nullable=False, index=True)
    seq_no: Mapped[int] = mapped_column(Integer, nullable=False)
    task_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    task_name: Mapped[str] = mapped_column(String(128), nullable=False)
    department: Mapped[str | None] = mapped_column(String(64), nullable=True)
    offset_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    duration_days: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    depends_on_seq: Mapped[int | None] = mapped_column(Integer, nullable=True)
    owner_role: Mapped[str | None] = mapped_column(String(32), nullable=True)
    is_milestone: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class ManufacturingTnaPlan(Base):
    __tablename__ = "mfg_tna_plans"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    plan_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    template_id: Mapped[int] = mapped_column(ForeignKey("mfg_tna_templates.id", ondelete="RESTRICT"), nullable=False, index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    item_id: Mapped[int | None] = mapped_column(ForeignKey("items.id", ondelete="SET NULL"), nullable=True, index=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    target_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active", index=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class ManufacturingTnaPlanTask(Base):
    __tablename__ = "mfg_tna_plan_tasks"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("mfg_tna_plans.id", ondelete="CASCADE"), nullable=False, index=True)
    template_task_id: Mapped[int | None] = mapped_column(
        ForeignKey("mfg_tna_template_tasks.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    seq_no: Mapped[int] = mapped_column(Integer, nullable=False)
    task_name: Mapped[str] = mapped_column(String(128), nullable=False)
    department: Mapped[str | None] = mapped_column(String(64), nullable=True)
    planned_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    actual_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="not_started", index=True)
    owner_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
