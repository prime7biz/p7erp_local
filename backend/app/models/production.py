"""Garment production module: sewing lines, IE, plan board, hourly entries, cutting, cost, WIP."""
from __future__ import annotations

from datetime import date, datetime, time

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


# --- Foundation ---


class TenantProductionSettings(Base):
    __tablename__ = "tenant_production_settings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    # DB (092): NOT NULL JSON with server defaults — never NULL; ORM defaults match inserts when omitted.
    enabled_optional_units: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    weekend_days: Mapped[list] = mapped_column(
        JSON,
        nullable=False,
        default=lambda: ["friday", "saturday"],
    )
    cm_alert_threshold_pct: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False, default=10)
    # Optional override: {"enabled": true, "model": "gemini-2.0-flash-lite"} — API key stays in server env (GEMINI_API_KEY).
    ai_provider_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (UniqueConstraint("tenant_id", name="uq_tenant_production_settings_tenant_id"),)


class ProductionShift(Base):
    __tablename__ = "production_shifts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    shift_code: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    break_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (UniqueConstraint("tenant_id", "shift_code", name="uq_production_shifts_tenant_shift_code"),)


class FactoryCalendarOverride(Base):
    __tablename__ = "factory_calendar_overrides"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    override_date: Mapped[date] = mapped_column(Date, nullable=False)
    override_type: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(32), nullable=True)
    source: Mapped[str | None] = mapped_column(String(32), nullable=True)
    is_paid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    affects_hr: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("tenant_id", "override_date", name="uq_factory_calendar_tenant_date"),)


class DepartmentMachine(Base):
    __tablename__ = "department_machines"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    department_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    machine_code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    machine_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    specs: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (UniqueConstraint("tenant_id", "machine_code", name="uq_department_machines_tenant_code"),)


class SewingLine(Base):
    __tablename__ = "sewing_lines"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    line_code: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    default_machine_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    running_machine_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    default_operator_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    default_helper_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    supervisor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (UniqueConstraint("tenant_id", "line_code", name="uq_sewing_lines_tenant_line_code"),)


class ProductionCrewRole(Base):
    __tablename__ = "production_crew_roles"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    department_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    role_key: Mapped[str] = mapped_column(String(64), nullable=False)
    role_name: Mapped[str] = mapped_column(String(128), nullable=False)
    is_named: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    designation_id: Mapped[int | None] = mapped_column(
        ForeignKey("hr_designations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    designation_filter: Mapped[str | None] = mapped_column(String(128), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("tenant_id", "department_type", "role_key", name="uq_production_crew_roles_tenant_dept_role"),
    )


class LineCrewTemplate(Base):
    __tablename__ = "line_crew_template"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    sewing_line_id: Mapped[int] = mapped_column(ForeignKey("sewing_lines.id", ondelete="CASCADE"), nullable=False, index=True)
    crew_role_id: Mapped[int] = mapped_column(
        ForeignKey("production_crew_roles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    default_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    employee_id: Mapped[int | None] = mapped_column(ForeignKey("hr_employees.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("tenant_id", "sewing_line_id", "crew_role_id", name="uq_line_crew_template_tenant_line_role"),
    )


class UnitCrewTemplate(Base):
    __tablename__ = "unit_crew_template"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    department_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    machine_id: Mapped[int | None] = mapped_column(
        ForeignKey("department_machines.id", ondelete="SET NULL"), nullable=True, index=True
    )
    crew_role_id: Mapped[int] = mapped_column(
        ForeignKey("production_crew_roles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    default_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    employee_id: Mapped[int | None] = mapped_column(ForeignKey("hr_employees.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "department_type",
            "machine_id",
            "crew_role_id",
            name="uq_unit_crew_template_tenant_dept_machine_role",
        ),
    )


class LineCrewDaily(Base):
    __tablename__ = "line_crew_daily"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    sewing_line_id: Mapped[int] = mapped_column(ForeignKey("sewing_lines.id", ondelete="CASCADE"), nullable=False, index=True)
    shift_id: Mapped[int] = mapped_column(ForeignKey("production_shifts.id", ondelete="CASCADE"), nullable=False, index=True)
    production_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    crew_role_id: Mapped[int] = mapped_column(
        ForeignKey("production_crew_roles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    planned_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    actual_present: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    employee_id: Mapped[int | None] = mapped_column(ForeignKey("hr_employees.id", ondelete="SET NULL"), nullable=True, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "sewing_line_id",
            "shift_id",
            "production_date",
            "crew_role_id",
            name="uq_line_crew_daily_tenant_line_shift_date_role",
        ),
    )


class UnitCrewDaily(Base):
    __tablename__ = "unit_crew_daily"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    department_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    machine_id: Mapped[int | None] = mapped_column(
        ForeignKey("department_machines.id", ondelete="SET NULL"), nullable=True, index=True
    )
    shift_id: Mapped[int] = mapped_column(ForeignKey("production_shifts.id", ondelete="CASCADE"), nullable=False, index=True)
    production_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    crew_role_id: Mapped[int] = mapped_column(
        ForeignKey("production_crew_roles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    planned_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    actual_present: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    employee_id: Mapped[int | None] = mapped_column(ForeignKey("hr_employees.id", ondelete="SET NULL"), nullable=True, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "department_type",
            "machine_id",
            "shift_id",
            "production_date",
            "crew_role_id",
            name="uq_unit_crew_daily_tenant_dept_machine_shift_date_role",
        ),
    )


# --- IE ---


class IeOperationsLibrary(Base):
    __tablename__ = "ie_operations_library"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    operation_code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False, default="other")
    default_smv: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    machine_type_required: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (UniqueConstraint("tenant_id", "operation_code", name="uq_ie_ops_lib_tenant_code"),)


class OperationBulletin(Base):
    __tablename__ = "operation_bulletins"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    style_id: Mapped[int] = mapped_column(ForeignKey("garment_styles.id", ondelete="CASCADE"), nullable=False, index=True)
    ob_code: Mapped[str] = mapped_column(String(64), nullable=False)
    version_no: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    total_smv: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    approved_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (UniqueConstraint("tenant_id", "ob_code", name="uq_operation_bulletins_tenant_code"),)


class OperationBulletinOp(Base):
    __tablename__ = "operation_bulletin_ops"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    ob_id: Mapped[int] = mapped_column(ForeignKey("operation_bulletins.id", ondelete="CASCADE"), nullable=False, index=True)
    sequence_no: Mapped[int] = mapped_column(Integer, nullable=False)
    operation_id: Mapped[int | None] = mapped_column(ForeignKey("ie_operations_library.id", ondelete="SET NULL"), nullable=True)
    operation_name: Mapped[str] = mapped_column(String(255), nullable=False)
    smv: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    machine_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    attachment_needed: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_critical: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class LineBalanceRun(Base):
    __tablename__ = "line_balance_runs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    ob_id: Mapped[int] = mapped_column(ForeignKey("operation_bulletins.id", ondelete="CASCADE"), nullable=False, index=True)
    line_id: Mapped[int] = mapped_column(ForeignKey("sewing_lines.id", ondelete="CASCADE"), nullable=False)
    num_workstations: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    bottleneck_cycle_time: Mapped[float | None] = mapped_column(Numeric(12, 4), nullable=True)
    balance_efficiency_pct: Mapped[float | None] = mapped_column(Numeric(12, 4), nullable=True)
    predicted_output_per_hour: Mapped[float | None] = mapped_column(Numeric(12, 4), nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    workstation_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class LineBalanceWorkstation(Base):
    __tablename__ = "line_balance_workstations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    balance_run_id: Mapped[int] = mapped_column(ForeignKey("line_balance_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    workstation_no: Mapped[int] = mapped_column(Integer, nullable=False)
    assigned_op_ids: Mapped[list | None] = mapped_column(JSON, nullable=True)
    cycle_time: Mapped[float | None] = mapped_column(Numeric(12, 4), nullable=True)
    machine_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class SewingLineStyleConfig(Base):
    __tablename__ = "sewing_line_style_configs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    line_id: Mapped[int] = mapped_column(ForeignKey("sewing_lines.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    style_id: Mapped[int | None] = mapped_column(ForeignKey("garment_styles.id", ondelete="SET NULL"), nullable=True)
    ob_id: Mapped[int | None] = mapped_column(ForeignKey("operation_bulletins.id", ondelete="SET NULL"), nullable=True)
    machine_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    operator_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    helper_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    target_efficiency_pct: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False, default=65)
    shift_id: Mapped[int | None] = mapped_column(ForeignKey("production_shifts.id", ondelete="SET NULL"), nullable=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    planned_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    actual_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="planned")
    reservation_status: Mapped[str] = mapped_column(
        String(24), nullable=False, default="FIRM_BOOKED", index=True
    )  # DRAFT|SOFT_BOOKED|FIRM_BOOKED|IN_PROGRESS|COMPLETED|CANCELLED
    soft_booked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    firm_booked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    smv_per_piece: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    total_smv_minutes: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    planned_qty: Mapped[float] = mapped_column(Numeric(18, 3), nullable=False, default=0)
    completed_qty: Mapped[float] = mapped_column(Numeric(18, 3), nullable=False, default=0)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class HourlyProductionEntry(Base):
    __tablename__ = "hourly_production_entries"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    department_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    line_id: Mapped[int | None] = mapped_column(ForeignKey("sewing_lines.id", ondelete="SET NULL"), nullable=True, index=True)
    machine_id: Mapped[int | None] = mapped_column(ForeignKey("department_machines.id", ondelete="SET NULL"), nullable=True)
    line_style_config_id: Mapped[int | None] = mapped_column(
        ForeignKey("sewing_line_style_configs.id", ondelete="SET NULL"), nullable=True
    )
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    style_id: Mapped[int | None] = mapped_column(ForeignKey("garment_styles.id", ondelete="SET NULL"), nullable=True, index=True)
    shift_id: Mapped[int | None] = mapped_column(ForeignKey("production_shifts.id", ondelete="SET NULL"), nullable=True, index=True)
    production_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    hour_slot: Mapped[int] = mapped_column(Integer, nullable=False)
    target_qty: Mapped[float | None] = mapped_column(Numeric(18, 3), nullable=True)
    good_qty: Mapped[float | None] = mapped_column(Numeric(18, 3), nullable=True)
    reject_qty: Mapped[float | None] = mapped_column(Numeric(18, 3), nullable=True)
    rework_qty: Mapped[float | None] = mapped_column(Numeric(18, 3), nullable=True)
    input_qty: Mapped[float | None] = mapped_column(Numeric(18, 3), nullable=True)
    output_qty: Mapped[float | None] = mapped_column(Numeric(18, 3), nullable=True)
    uom: Mapped[str | None] = mapped_column(String(32), nullable=True)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    entered_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    entered_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


# --- Cutting ---


class MarkerPlan(Base):
    __tablename__ = "marker_plans"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    style_id: Mapped[int | None] = mapped_column(ForeignKey("garment_styles.id", ondelete="SET NULL"), nullable=True)
    marker_code: Mapped[str] = mapped_column(String(64), nullable=False)
    cad_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    marker_length: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    marker_width: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    marker_efficiency_pct: Mapped[float | None] = mapped_column(Numeric(8, 2), nullable=True)
    fabric_consumption_per_pcs: Mapped[float | None] = mapped_column(Numeric(18, 6), nullable=True)
    sizes_included: Mapped[list | None] = mapped_column(JSON, nullable=True)
    size_ratio: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    pcs_per_marker: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class LayPlan(Base):
    __tablename__ = "lay_plans"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    marker_plan_id: Mapped[int] = mapped_column(ForeignKey("marker_plans.id", ondelete="CASCADE"), nullable=False, index=True)
    lay_code: Mapped[str] = mapped_column(String(64), nullable=False)
    fabric_item_id: Mapped[int | None] = mapped_column(ForeignKey("items.id", ondelete="SET NULL"), nullable=True)
    fabric_lot_no: Mapped[str | None] = mapped_column(String(128), nullable=True)
    num_plies: Mapped[int | None] = mapped_column(Integer, nullable=True)
    lay_length: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    total_fabric_used: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    planned_pcs: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="planned")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class CutTicket(Base):
    __tablename__ = "cut_tickets"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    lay_plan_id: Mapped[int] = mapped_column(ForeignKey("lay_plans.id", ondelete="CASCADE"), nullable=False, index=True)
    ticket_code: Mapped[str] = mapped_column(String(64), nullable=False)
    cut_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    cutter_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    total_pcs_cut: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (UniqueConstraint("tenant_id", "ticket_code", name="uq_cut_tickets_tenant_code"),)


class CuttingBundle(Base):
    __tablename__ = "cutting_bundles"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    cut_ticket_id: Mapped[int] = mapped_column(ForeignKey("cut_tickets.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    style_id: Mapped[int | None] = mapped_column(ForeignKey("garment_styles.id", ondelete="SET NULL"), nullable=True, index=True)
    bundle_no: Mapped[str] = mapped_column(String(64), nullable=False)
    barcode: Mapped[str] = mapped_column(String(128), nullable=False)
    size: Mapped[str | None] = mapped_column(String(32), nullable=True)
    color: Mapped[str | None] = mapped_column(String(64), nullable=True)
    qty_in_bundle: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="cut")
    issued_to_line_id: Mapped[int | None] = mapped_column(ForeignKey("sewing_lines.id", ondelete="SET NULL"), nullable=True, index=True)
    issued_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("tenant_id", "barcode", name="uq_cutting_bundles_tenant_barcode"),)


# --- Cost / WIP ---


class ProductionCostInput(Base):
    __tablename__ = "production_cost_inputs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    department_type: Mapped[str] = mapped_column(String(32), nullable=False)
    line_id: Mapped[int | None] = mapped_column(ForeignKey("sewing_lines.id", ondelete="SET NULL"), nullable=True)
    cost_date: Mapped[date] = mapped_column(Date, nullable=False)
    shift_id: Mapped[int | None] = mapped_column(ForeignKey("production_shifts.id", ondelete="SET NULL"), nullable=True)
    labor_cost: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    helper_cost: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    supervision_cost: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    machine_depreciation: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    overhead_allocation: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    utility_cost: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    other_cost: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    total_cost: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class CmCostActual(Base):
    __tablename__ = "cm_cost_actuals"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    style_id: Mapped[int | None] = mapped_column(ForeignKey("garment_styles.id", ondelete="SET NULL"), nullable=True)
    line_id: Mapped[int | None] = mapped_column(ForeignKey("sewing_lines.id", ondelete="SET NULL"), nullable=True)
    period_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    total_production_cost: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    total_good_output: Mapped[float] = mapped_column(Numeric(18, 3), nullable=False, default=0)
    actual_cm_per_piece: Mapped[float | None] = mapped_column(Numeric(18, 6), nullable=True)
    quoted_cm_per_piece: Mapped[float | None] = mapped_column(Numeric(18, 6), nullable=True)
    variance_amount: Mapped[float | None] = mapped_column(Numeric(18, 6), nullable=True)
    variance_pct: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    is_over_budget: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    alert_triggered: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class WipJournal(Base):
    __tablename__ = "wip_journals"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    from_department: Mapped[str] = mapped_column(String(32), nullable=False)
    to_department: Mapped[str] = mapped_column(String(32), nullable=False)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    style_id: Mapped[int | None] = mapped_column(ForeignKey("garment_styles.id", ondelete="SET NULL"), nullable=True, index=True)
    quantity: Mapped[float] = mapped_column(Numeric(18, 3), nullable=False, default=0)
    uom: Mapped[str | None] = mapped_column(String(32), nullable=True)
    material_value: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    conversion_cost: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    total_value: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    voucher_id: Mapped[int | None] = mapped_column(ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True, index=True)
    cost_center_id: Mapped[int | None] = mapped_column(ForeignKey("cost_centers.id", ondelete="SET NULL"), nullable=True, index=True)
    journal_date: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class CmOverheadConfig(Base):
    __tablename__ = "cm_overhead_config"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    cost_category: Mapped[str] = mapped_column(String(64), nullable=False)
    account_id: Mapped[int | None] = mapped_column(
        ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    cost_center_id: Mapped[int | None] = mapped_column(
        ForeignKey("cost_centers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    allocation_method: Mapped[str] = mapped_column(String(32), nullable=False, default="equal")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (UniqueConstraint("tenant_id", "cost_category", name="uq_cm_overhead_config_tenant_category"),)


# --- Knitting / Dyeing / Dept plans ---


class KnittingPlan(Base):
    __tablename__ = "knitting_plans"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    machine_id: Mapped[int | None] = mapped_column(ForeignKey("department_machines.id", ondelete="SET NULL"), nullable=True)
    yarn_item_id: Mapped[int | None] = mapped_column(ForeignKey("items.id", ondelete="SET NULL"), nullable=True)
    target_output_kg: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    fabric_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    gauge: Mapped[str | None] = mapped_column(String(64), nullable=True)
    planned_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="planned")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class KnittingChargeRate(Base):
    """Effective-dated knitting conversion charge master (fabric type × unit basis)."""

    __tablename__ = "knitting_charge_rates"
    __table_args__ = ()

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    fabric_type_code: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    unit_basis: Mapped[str] = mapped_column(String(32), nullable=False, default="per_kg_greige")
    rate_per_unit: Mapped[float] = mapped_column(Numeric(18, 4), nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="BDT")
    effective_from: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    effective_to: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class KnittingWorkOrder(Base):
    """Operational knitting job: yarns → greige; links to inventory process orders and documents."""

    __tablename__ = "knitting_work_orders"
    __table_args__ = (UniqueConstraint("tenant_id", "wo_number", name="uq_knitting_work_orders_tenant_wo"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    wo_number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(String(32), nullable=False, default="in_house")
    customer_id: Mapped[int | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    vendor_id: Mapped[int | None] = mapped_column(ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True, index=True)
    machine_id: Mapped[int | None] = mapped_column(
        ForeignKey("department_machines.id", ondelete="SET NULL"), nullable=True, index=True
    )
    yarn_item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True)
    greige_item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True)
    fabric_type_code: Mapped[str | None] = mapped_column(String(128), nullable=True)
    gauge: Mapped[str | None] = mapped_column(String(64), nullable=True)
    planned_yarn_qty: Mapped[str | None] = mapped_column(String(32), nullable=True)
    planned_greige_qty: Mapped[str | None] = mapped_column(String(32), nullable=True)
    processing_charge_preview: Mapped[str | None] = mapped_column(String(32), nullable=True)
    warehouse_id: Mapped[int | None] = mapped_column(ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True, index=True)
    output_warehouse_id: Mapped[int | None] = mapped_column(ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True, index=True)
    knitting_plan_id: Mapped[int | None] = mapped_column(ForeignKey("knitting_plans.id", ondelete="SET NULL"), nullable=True, index=True)
    linked_order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    process_order_id: Mapped[int | None] = mapped_column(ForeignKey("process_orders.id", ondelete="SET NULL"), nullable=True, index=True)
    delivery_challan_id: Mapped[int | None] = mapped_column(
        ForeignKey("delivery_challans.id", ondelete="SET NULL"), nullable=True, index=True
    )
    gate_pass_id: Mapped[int | None] = mapped_column(
        ForeignKey("enhanced_gate_passes.id", ondelete="SET NULL"), nullable=True, index=True
    )
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="draft", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class DyeRecipe(Base):
    __tablename__ = "dye_recipes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    recipe_code: Mapped[str] = mapped_column(String(64), nullable=False)
    color_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    color_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    chemicals: Mapped[list | dict | None] = mapped_column(JSON, nullable=True)
    process_time_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    temperature: Mapped[str | None] = mapped_column(String(32), nullable=True)
    lab_dip_approved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (UniqueConstraint("tenant_id", "recipe_code", name="uq_dye_recipes_tenant_code"),)


class DyeBatch(Base):
    __tablename__ = "dye_batches"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    batch_code: Mapped[str] = mapped_column(String(64), nullable=False)
    machine_id: Mapped[int | None] = mapped_column(ForeignKey("department_machines.id", ondelete="SET NULL"), nullable=True)
    recipe_id: Mapped[int | None] = mapped_column(ForeignKey("dye_recipes.id", ondelete="SET NULL"), nullable=True)
    fabric_item_id: Mapped[int | None] = mapped_column(ForeignKey("items.id", ondelete="SET NULL"), nullable=True)
    input_qty_kg: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    output_qty_kg: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    planned_start: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    planned_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    actual_start: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    actual_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    shade_match_result: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="planned")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (UniqueConstraint("tenant_id", "batch_code", name="uq_dye_batches_tenant_code"),)


class DepartmentProductionPlan(Base):
    __tablename__ = "department_production_plans"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    department_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    machine_id: Mapped[int | None] = mapped_column(ForeignKey("department_machines.id", ondelete="SET NULL"), nullable=True)
    input_item_id: Mapped[int | None] = mapped_column(ForeignKey("items.id", ondelete="SET NULL"), nullable=True)
    target_output: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    target_uom: Mapped[str | None] = mapped_column(String(32), nullable=True)
    planned_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    style_id: Mapped[int | None] = mapped_column(ForeignKey("garment_styles.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="planned")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


# --- Shop floor QC / skills / roster ---


class ProductionDefectCode(Base):
    __tablename__ = "production_defect_codes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str | None] = mapped_column(String(64), nullable=True)
    severity: Mapped[str] = mapped_column(String(32), nullable=False, default="medium")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (UniqueConstraint("tenant_id", "code", name="uq_production_defect_codes_tenant_code"),)


class ProductionQcCheck(Base):
    __tablename__ = "production_qc_checks"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    sewing_line_id: Mapped[int] = mapped_column(ForeignKey("sewing_lines.id", ondelete="CASCADE"), nullable=False, index=True)
    shift_id: Mapped[int] = mapped_column(ForeignKey("production_shifts.id", ondelete="CASCADE"), nullable=False, index=True)
    production_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    hour_slot: Mapped[int] = mapped_column(Integer, nullable=False)
    check_type: Mapped[str] = mapped_column(String(32), nullable=False, default="inline")
    total_checked: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pass_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    fail_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    defect_codes: Mapped[list | dict | None] = mapped_column(JSON, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    entered_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "sewing_line_id",
            "shift_id",
            "production_date",
            "hour_slot",
            "check_type",
            name="uq_production_qc_checks_slot",
        ),
    )


class WorkerSkill(Base):
    __tablename__ = "worker_skills"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("hr_employees.id", ondelete="CASCADE"), nullable=False, index=True)
    ie_operation_id: Mapped[int] = mapped_column(
        ForeignKey("ie_operations_library.id", ondelete="CASCADE"), nullable=False, index=True
    )
    skill_level: Mapped[str] = mapped_column(String(32), nullable=False, default="trainee")
    certified_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (UniqueConstraint("tenant_id", "employee_id", "ie_operation_id", name="uq_worker_skills_tenant_emp_op"),)


class LineCrewSheetHeader(Base):
    __tablename__ = "line_crew_sheet_headers"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    sewing_line_id: Mapped[int] = mapped_column(ForeignKey("sewing_lines.id", ondelete="CASCADE"), nullable=False, index=True)
    shift_id: Mapped[int] = mapped_column(ForeignKey("production_shifts.id", ondelete="CASCADE"), nullable=False, index=True)
    production_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="draft", index=True)
    submitted_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "sewing_line_id",
            "shift_id",
            "production_date",
            name="uq_line_crew_sheet_headers_line_shift_date",
        ),
    )


class CrewRosterWeekly(Base):
    __tablename__ = "crew_roster_weekly"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    week_start_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    sewing_line_id: Mapped[int] = mapped_column(ForeignKey("sewing_lines.id", ondelete="CASCADE"), nullable=False, index=True)
    shift_id: Mapped[int] = mapped_column(ForeignKey("production_shifts.id", ondelete="CASCADE"), nullable=False, index=True)
    crew_role_id: Mapped[int] = mapped_column(ForeignKey("production_crew_roles.id", ondelete="CASCADE"), nullable=False, index=True)
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False)
    employee_id: Mapped[int | None] = mapped_column(ForeignKey("hr_employees.id", ondelete="SET NULL"), nullable=True, index=True)
    planned_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "week_start_date",
            "sewing_line_id",
            "shift_id",
            "crew_role_id",
            "day_of_week",
            name="uq_crew_roster_weekly_cell",
        ),
    )
