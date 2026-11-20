"""KPI engine registry tables (docs/kpi-platform/). Empty until flag kpi_engine_v1 is ON."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class KpiDefinition(Base):
    __tablename__ = "kpi_definitions"
    __table_args__ = (UniqueConstraint("tenant_id", "code", name="uq_kpi_definitions_tenant_code"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    purpose: Mapped[str | None] = mapped_column(Text, nullable=True)
    module: Mapped[str] = mapped_column(String(32), nullable=False)
    metric_type: Mapped[str] = mapped_column(String(16), nullable=False, default="KPI")
    tier: Mapped[str] = mapped_column(String(16), nullable=False, default="CORE")
    numerator_definition: Mapped[str | None] = mapped_column(Text, nullable=True)
    denominator_definition: Mapped[str | None] = mapped_column(Text, nullable=True)
    formula_expression: Mapped[str | None] = mapped_column(Text, nullable=True)
    unit: Mapped[str] = mapped_column(String(32), nullable=False, default="%")
    direction: Mapped[str] = mapped_column(String(8), nullable=False, default="UP")
    leading_lagging: Mapped[str | None] = mapped_column(String(8), nullable=True)
    default_grain: Mapped[str | None] = mapped_column(String(64), nullable=True)
    refresh_frequency: Mapped[str | None] = mapped_column(String(8), nullable=True)
    owner_role: Mapped[str | None] = mapped_column(String(64), nullable=True)
    applicability: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, default=list)
    sensitivity: Mapped[str] = mapped_column(String(32), nullable=False, default="OPERATIONAL")
    adapter_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    dashboard_codes: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, default=list)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    definition_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    blocked_reason: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class KpiDefinitionVersion(Base):
    __tablename__ = "kpi_definition_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    kpi_definition_id: Mapped[int] = mapped_column(ForeignKey("kpi_definitions.id", ondelete="CASCADE"), nullable=False)
    definition_version: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


class KpiSourceMapping(Base):
    __tablename__ = "kpi_source_mappings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    kpi_definition_id: Mapped[int] = mapped_column(ForeignKey("kpi_definitions.id", ondelete="CASCADE"), nullable=False)
    source_fact_key: Mapped[str] = mapped_column(String(64), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class KpiTarget(Base):
    __tablename__ = "kpi_targets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    kpi_definition_id: Mapped[int] = mapped_column(ForeignKey("kpi_definitions.id", ondelete="CASCADE"), nullable=False)
    buyer_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    department_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    product_group: Mapped[str | None] = mapped_column(String(64), nullable=True)
    factory_unit: Mapped[str | None] = mapped_column(String(64), nullable=True)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    target_value: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    amber_lower: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    amber_upper: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    red_lower: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    red_upper: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    target_type: Mapped[str] = mapped_column(String(32), nullable=False)
    source_reference: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class KpiThreshold(Base):
    __tablename__ = "kpi_thresholds"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    kpi_definition_id: Mapped[int] = mapped_column(ForeignKey("kpi_definitions.id", ondelete="CASCADE"), nullable=False)
    amber_lower: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    amber_upper: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    red_lower: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    red_upper: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class KpiResult(Base):
    __tablename__ = "kpi_results"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "kpi_definition_id",
            "result_date",
            "dim_key",
            "computation_version",
            name="uq_kpi_results_partition",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    kpi_definition_id: Mapped[int] = mapped_column(ForeignKey("kpi_definitions.id", ondelete="CASCADE"), nullable=False)
    result_date: Mapped[date] = mapped_column(Date, nullable=False)
    dim_key: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    numerator_value: Mapped[Decimal | None] = mapped_column(Numeric(24, 6), nullable=True)
    denominator_value: Mapped[Decimal | None] = mapped_column(Numeric(24, 6), nullable=True)
    metric_value: Mapped[Decimal | None] = mapped_column(Numeric(24, 6), nullable=True)
    target_value: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="NO_DATA")
    missing_inputs: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, default=list)
    source_event_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    computed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    computation_version: Mapped[str] = mapped_column(String(32), nullable=False, default="1")


class KpiAlert(Base):
    __tablename__ = "kpi_alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    kpi_definition_id: Mapped[int] = mapped_column(ForeignKey("kpi_definitions.id", ondelete="CASCADE"), nullable=False)
    result_id: Mapped[int | None] = mapped_column(ForeignKey("kpi_results.id", ondelete="SET NULL"), nullable=True)
    severity: Mapped[str] = mapped_column(String(16), nullable=False, default="AMBER")
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    acked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class KpiRecalculationJob(Base):
    __tablename__ = "kpi_recalculation_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    kpi_definition_id: Mapped[int | None] = mapped_column(
        ForeignKey("kpi_definitions.id", ondelete="SET NULL"), nullable=True
    )
    date_from: Mapped[date] = mapped_column(Date, nullable=False)
    date_to: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING")
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class KpiDataQualityResult(Base):
    __tablename__ = "kpi_data_quality_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    kpi_definition_id: Mapped[int] = mapped_column(ForeignKey("kpi_definitions.id", ondelete="CASCADE"), nullable=False)
    check_code: Mapped[str] = mapped_column(String(64), nullable=False)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    detail: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    checked_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class OrderCommitmentRevision(Base):
    """Append-only committed delivery date/qty history for gaming-proof OTIF."""

    __tablename__ = "order_commitment_revisions"
    __table_args__ = (UniqueConstraint("tenant_id", "order_id", "revision_no", name="uq_order_commitment_rev"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    revision_no: Mapped[int] = mapped_column(Integer, nullable=False)
    committed_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    committed_qty: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="INTERNAL")
    changed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    changed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    backfilled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class KpiPrediction(Base):
    __tablename__ = "kpi_predictions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    prediction_code: Mapped[str] = mapped_column(String(64), nullable=False)
    subject_type: Mapped[str] = mapped_column(String(32), nullable=False)
    subject_id: Mapped[int] = mapped_column(Integer, nullable=False)
    model_version: Mapped[str] = mapped_column(String(32), nullable=False)
    score: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(8, 4), nullable=True)
    features: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    top_factors: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, default=list)
    predicted_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    actual_outcome: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    outcome_recorded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
