"""Sprint 4: voucher classes and recurring templates."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class VoucherClass(Base):
    __tablename__ = "voucher_classes"
    __table_args__ = (UniqueConstraint("tenant_id", "name", name="uq_voucher_classes_tenant_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    voucher_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    default_ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True
    )
    default_narration: Mapped[str | None] = mapped_column(Text, nullable=True)
    default_cost_center_id: Mapped[int | None] = mapped_column(
        ForeignKey("cost_centers.id", ondelete="SET NULL"), nullable=True
    )
    line_templates: Mapped[Any | None] = mapped_column(JSONB, nullable=True)
    auto_tax: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    auto_round_off: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    auto_bill_allocation: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class RecurringVoucherTemplate(Base):
    __tablename__ = "recurring_voucher_templates"
    __table_args__ = (
        UniqueConstraint("tenant_id", "name", name="uq_recurring_voucher_templates_tenant_name"),
        Index("ix_recurring_voucher_templates_active", "is_active"),
        Index("ix_recurring_voucher_templates_next_due", "next_due_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    voucher_type: Mapped[str] = mapped_column(String(32), nullable=False)
    voucher_class_id: Mapped[int | None] = mapped_column(
        ForeignKey("voucher_classes.id", ondelete="SET NULL"), nullable=True
    )
    frequency: Mapped[str] = mapped_column(String(16), nullable=False)  # DAILY|WEEKLY|...
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    next_due_date: Mapped[date] = mapped_column(Date, nullable=False)
    last_generated_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    voucher_template: Mapped[Any] = mapped_column(JSONB, nullable=False)
    generate_as_status: Mapped[str] = mapped_column(String(16), nullable=False, default="DRAFT")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
