"""Manufacturing Intelligence Phase 2 tables (supply pegs, tentative bookings, plan revisions, line assignments)."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

PEG_HARD = "HARD"
PEG_TENTATIVE = "TENTATIVE"
PEG_STATUS_ACTIVE = "ACTIVE"
PEG_STATUS_RELEASED = "RELEASED"
PEG_STATUS_CONSUMED = "CONSUMED"


class MfgMaterialSupplyPegging(Base):
    """A promise of (not yet received) open purchase-order quantity to one order. Never moves stock (migration 296)."""

    __tablename__ = "mfg_material_supply_peggings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    purchase_order_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("purchase_order_items.id", ondelete="SET NULL"), nullable=True
    )
    purchase_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("purchase_orders.id", ondelete="SET NULL"), nullable=True
    )
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="RESTRICT"), nullable=False, index=True)
    bom_item_id: Mapped[int | None] = mapped_column(ForeignKey("bom_items.id", ondelete="SET NULL"), nullable=True)
    peg_kind: Mapped[str] = mapped_column(String(12), nullable=False)
    pegged_qty: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default=PEG_STATUS_ACTIVE, server_default="ACTIVE")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    release_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    lock_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    released_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    released_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


TENTATIVE_ACTIVE = "ACTIVE"
TENTATIVE_EXPIRED = "EXPIRED"
TENTATIVE_CANCELLED = "CANCELLED"
TENTATIVE_CONVERTED = "CONVERTED"

REVISION_PROPOSED = "PROPOSED"
REVISION_APPLIED = "APPLIED"
REVISION_REJECTED = "REJECTED"
REVISION_CANCELLED = "CANCELLED"


class MfgTentativeLineBooking(Base):
    """Inquiry / quotation demand on a sewing line (migration 297). Legacy line readers never see this table."""

    __tablename__ = "mfg_tentative_line_bookings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    line_id: Mapped[int] = mapped_column(ForeignKey("sewing_lines.id", ondelete="RESTRICT"), nullable=False)
    inquiry_id: Mapped[int | None] = mapped_column(ForeignKey("inquiries.id", ondelete="SET NULL"), nullable=True)
    quotation_id: Mapped[int | None] = mapped_column(ForeignKey("quotations.id", ondelete="SET NULL"), nullable=True)
    style_id: Mapped[int | None] = mapped_column(ForeignKey("garment_styles.id", ondelete="SET NULL"), nullable=True)
    ob_id: Mapped[int | None] = mapped_column(ForeignKey("operation_bulletins.id", ondelete="SET NULL"), nullable=True)
    shift_id: Mapped[int | None] = mapped_column(ForeignKey("production_shifts.id", ondelete="SET NULL"), nullable=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    planned_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    planned_qty: Mapped[Decimal] = mapped_column(Numeric(18, 3), nullable=False)
    smv_per_piece: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    source_smv_type: Mapped[str | None] = mapped_column(String(24), nullable=True)
    confidence_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default=TENTATIVE_ACTIVE, server_default="ACTIVE")
    converted_order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    lock_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class MfgPlanRevision(Base):
    """A proposed change to order-linked line bookings; applied only by an approver (migration 297)."""

    __tablename__ = "mfg_plan_revisions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    revision_no: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default=REVISION_PROPOSED, server_default="PROPOSED")
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    payload_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    proposed_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    proposed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    decided_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    decision_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    impact_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    lock_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class MfgPlanRevisionItem(Base):
    __tablename__ = "mfg_plan_revision_items"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    revision_id: Mapped[int] = mapped_column(
        ForeignKey("mfg_plan_revisions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    action: Mapped[str] = mapped_column(String(8), nullable=False)
    config_id: Mapped[int | None] = mapped_column(
        ForeignKey("sewing_line_style_configs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    before_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    after_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    before_lock_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    applied_config_id: Mapped[int | None] = mapped_column(
        ForeignKey("sewing_line_style_configs.id", ondelete="SET NULL"), nullable=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")


# Sewing crew roles (production/crew_router.py seeds): line in-charge = SUPERVISOR, folding / packing = FINISHING.
ASSIGNMENT_ROLES = ("OPERATOR", "HELPER", "SUPERVISOR", "QC", "IRON", "FINISHING")
ROLE_OPERATOR = "OPERATOR"


class ProductionEmployeeLineAssignment(Base):
    """An employee works on a sewing line from valid_from to valid_to (NULL = open ended). Migration 298."""

    __tablename__ = "production_employee_line_assignments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("hr_employees.id", ondelete="RESTRICT"), nullable=False)
    sewing_line_id: Mapped[int] = mapped_column(ForeignKey("sewing_lines.id", ondelete="RESTRICT"), nullable=False)
    shift_id: Mapped[int | None] = mapped_column(ForeignKey("production_shifts.id", ondelete="SET NULL"), nullable=True)
    role: Mapped[str] = mapped_column(String(16), nullable=False, default=ROLE_OPERATOR, server_default="OPERATOR")
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    valid_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    lock_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class ProductionMachineLineAssignment(Base):
    """A machine (department_machines) stands on a sewing line from valid_from to valid_to. Migration 298."""

    __tablename__ = "production_machine_line_assignments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    machine_id: Mapped[int] = mapped_column(ForeignKey("department_machines.id", ondelete="RESTRICT"), nullable=False)
    sewing_line_id: Mapped[int] = mapped_column(ForeignKey("sewing_lines.id", ondelete="RESTRICT"), nullable=False)
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    valid_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    lock_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )