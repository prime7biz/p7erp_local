"""Wastage & Loss Analysis: reason taxonomy, transactions, thresholds, order summary, saved views."""
from __future__ import annotations

from datetime import datetime, date
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, JSON, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class WastageReason(Base):
    """Master list of wastage reason codes (fabric, trim, process, store, commercial)."""
    __tablename__ = "wastage_reasons"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(32), nullable=False)  # fabric | trim | process | store | commercial
    recoverable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    recyclable: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class WastageTransaction(Base):
    """Recorded wastage event by order/item, process stage, and reason."""
    __tablename__ = "wastage_transactions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_id: Mapped[int | None] = mapped_column(
        ForeignKey("items.id", ondelete="SET NULL"), nullable=True, index=True
    )
    process_stage: Mapped[str] = mapped_column(String(32), nullable=False)  # cutting, sewing, washing, etc.
    reason_id: Mapped[int | None] = mapped_column(
        ForeignKey("wastage_reasons.id", ondelete="SET NULL"), nullable=True, index=True
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"), server_default="0")
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"), server_default="0")
    value: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"), server_default="0")
    recoverable_value: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"), server_default="0")
    reference_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    reference_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )


class WastageThresholdRule(Base):
    """Configurable wastage threshold by tenant, buyer, order_type, or material_type."""
    __tablename__ = "wastage_threshold_rules"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    scope_type: Mapped[str] = mapped_column(String(32), nullable=False)  # tenant | buyer | order_type | material_type
    scope_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # customer_id, or null for tenant-wide
    allowed_pct: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    critical_pct: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class WastageOrderSummary(Base):
    """Materialized order-level wastage summary for performance and management view."""
    __tablename__ = "wastage_order_summaries"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    period_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    period_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    planned_fabric_cons: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"), server_default="0")
    actual_fabric_cons: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"), server_default="0")
    fabric_variance_pct: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False, default=Decimal("0"), server_default="0")
    trim_wastage_value: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"), server_default="0")
    total_wastage_value: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"), server_default="0")
    above_threshold: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    snapshot_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class WastageSavedView(Base):
    """User saved filter presets for wastage report."""
    __tablename__ = "wastage_saved_views"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    filter_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
