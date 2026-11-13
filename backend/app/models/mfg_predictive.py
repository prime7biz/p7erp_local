"""Manufacturing Intelligence Phase 4 tables (prediction snapshots, predictive findings). Migration 300.

Nothing reads or writes these tables while the strict tenant flag ``mfg_predictive_intelligence_v1`` is OFF.
No money is stored here (Phase 4 has no value weight). Rows never block order / line deletes.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, Numeric, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

FINDING_KINDS: tuple[str, ...] = (
    "DELIVERY_RISK",
    "LATE_MATERIAL",
    "CAPACITY_OVERLOAD",
    "LINE_IDLE",
    "OUTPUT_DROP",
    "QUALITY_SPIKE",
)
FINDING_SEVERITIES: tuple[str, ...] = ("critical", "high", "medium")
FINDING_OPEN = "OPEN"
FINDING_CLEARED = "CLEARED"
DECISION_STATUSES: tuple[str, ...] = ("ACCEPTED", "REJECTED", "IGNORED")
OUTCOME_STATUSES: tuple[str, ...] = ("MET", "NOT_MET", "UNKNOWN")


def _in(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{v}'" for v in values)


class MfgPredictionSnapshot(Base):
    """One delivery forecast per order per day (written by the daily job, read by calibration)."""

    __tablename__ = "mfg_prediction_snapshots"
    __table_args__ = (
        Index(
            "uq_mfg_prediction_snapshots_order_day",
            "tenant_id",
            "order_id",
            "as_of_date",
            "model_version",
            unique=True,
        ),
        Index("ix_mfg_prediction_snapshots_tenant_day", "tenant_id", "as_of_date"),
        Index(
            "ix_mfg_prediction_snapshots_open_outcome",
            "tenant_id",
            "order_id",
            postgresql_where=text("outcome_at IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    as_of_date: Mapped[date] = mapped_column(Date, nullable=False)
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    model_version: Mapped[str] = mapped_column(String(24), nullable=False)
    band: Mapped[str] = mapped_column(String(16), nullable=False)
    p50_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    p80_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    p90_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    on_time_probability: Mapped[Decimal | None] = mapped_column(Numeric(5, 4), nullable=True)
    efficiency_source: Mapped[str | None] = mapped_column(String(16), nullable=True)
    lateness_source: Mapped[str | None] = mapped_column(String(24), nullable=True)
    confidence: Mapped[str | None] = mapped_column(String(8), nullable=True)
    reason_codes: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    inputs_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    actual_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    on_time: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    outcome_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class MfgPredictiveFinding(Base):
    """A bottleneck / recommendation found by the daily job. One OPEN row per natural key (finding_key)."""

    __tablename__ = "mfg_predictive_findings"
    __table_args__ = (
        CheckConstraint(f"kind IN ({_in(FINDING_KINDS)})", name="ck_mfg_predictive_findings_kind"),
        CheckConstraint(f"severity IN ({_in(FINDING_SEVERITIES)})", name="ck_mfg_predictive_findings_severity"),
        CheckConstraint(
            f"status IN ('{FINDING_OPEN}', '{FINDING_CLEARED}')", name="ck_mfg_predictive_findings_status"
        ),
        CheckConstraint(
            f"decision_status IS NULL OR decision_status IN ({_in(DECISION_STATUSES)})",
            name="ck_mfg_predictive_findings_decision",
        ),
        CheckConstraint(
            f"outcome_status IS NULL OR outcome_status IN ({_in(OUTCOME_STATUSES)})",
            name="ck_mfg_predictive_findings_outcome",
        ),
        Index(
            "uq_mfg_predictive_findings_open_key",
            "tenant_id",
            "finding_key",
            unique=True,
            postgresql_where=text("status = 'OPEN'"),
        ),
        Index("ix_mfg_predictive_findings_status_priority", "tenant_id", "status", text("priority DESC")),
        Index(
            "ix_mfg_predictive_findings_deadline",
            "tenant_id",
            "deadline_date",
            postgresql_where=text("outcome_status IS NULL"),
        ),
        Index("ix_mfg_predictive_findings_order", "tenant_id", "order_id"),
        Index("ix_mfg_predictive_findings_line", "tenant_id", "line_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    finding_key: Mapped[str] = mapped_column(String(160), nullable=False)
    kind: Mapped[str] = mapped_column(String(24), nullable=False)
    severity: Mapped[str] = mapped_column(String(16), nullable=False)
    priority: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=Decimal("0"))
    department: Mapped[str | None] = mapped_column(String(48), nullable=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    line_id: Mapped[int | None] = mapped_column(ForeignKey("sewing_lines.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default=FINDING_OPEN)
    alert_eligible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    first_detected_on: Mapped[date] = mapped_column(Date, nullable=False)
    last_detected_on: Mapped[date] = mapped_column(Date, nullable=False)
    cleared_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    deadline_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    decision_status: Mapped[str | None] = mapped_column(String(12), nullable=True)
    outcome_status: Mapped[str | None] = mapped_column(String(12), nullable=True)
    outcome_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    outcome_measured_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
