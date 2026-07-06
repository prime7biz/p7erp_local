"""Bangladesh statutory compliance models (VAT/VDS/TDS, bonded warehouse, payroll tax)."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TenantStatutoryTaxConfig(Base):
    """Per-tenant VAT / VDS / TDS rate tables and registration numbers."""

    __tablename__ = "tenant_statutory_tax_configs"
    __table_args__ = (UniqueConstraint("tenant_id", "tax_code", name="uq_tenant_statutory_tax_code"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    tax_code: Mapped[str] = mapped_column(String(16), nullable=False)  # VAT | VDS | TDS | AIT
    rate_pct: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False, default=0)
    registration_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    effective_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    effective_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class BondedWarehouseEntry(Base):
    """Bonded warehouse / customs register line (UD/UP linkage)."""

    __tablename__ = "bonded_warehouse_entries"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    reference_no: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    entry_type: Mapped[str] = mapped_column(String(32), nullable=False, default="IMPORT")  # IMPORT | EXPORT
    ud_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    up_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    trade_case_id: Mapped[int | None] = mapped_column(ForeignKey("trade_cases.id", ondelete="SET NULL"), nullable=True)
    btb_lc_id: Mapped[int | None] = mapped_column(nullable=True, index=True)
    item_description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    quantity: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    value_bdt: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="OPEN")
    entry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class PayrollStatutorySummary(Base):
    """Monthly payroll statutory deductions snapshot per tenant."""

    __tablename__ = "payroll_statutory_summaries"
    __table_args__ = (UniqueConstraint("tenant_id", "period_year", "period_month", name="uq_payroll_statutory_period"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    payroll_run_id: Mapped[int | None] = mapped_column(ForeignKey("hr_payroll_runs.id", ondelete="SET NULL"), nullable=True)
    period_year: Mapped[int] = mapped_column(Integer, nullable=False)
    period_month: Mapped[int] = mapped_column(Integer, nullable=False)
    gross_total: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=0)
    ait_total: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=0)
    pf_employee_total: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=0)
    pf_employer_total: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=0)
    net_payable: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
