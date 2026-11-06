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
    btb_lc_id: Mapped[int | None] = mapped_column(nullable=True)
    # Optional link to a UD permitted-import line (BD bond registers); NULL = matched by ud_no + description.
    ud_entitlement_id: Mapped[int | None] = mapped_column(
        ForeignKey("bd_ud_entitlements.id", ondelete="SET NULL"), nullable=True, index=True
    )
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


class UtilizationDeclaration(Base):
    """Bangladesh UD (Utilization Declaration) issued by BGMEA/BKMEA/BEPZA against an export LC / contract.

    Generic register — field names follow the common UD form; e-UD portal file formats are not modelled.
    """

    __tablename__ = "bd_utilization_declarations"
    __table_args__ = (UniqueConstraint("tenant_id", "ud_no", "amendment_no", name="uq_bd_ud_tenant_no_amendment"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    ud_no: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    amendment_no: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ud_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    issuer: Mapped[str] = mapped_column(String(16), nullable=False, default="BGMEA")  # BGMEA | BKMEA | BEPZA | OTHER
    trade_case_id: Mapped[int | None] = mapped_column(ForeignKey("trade_cases.id", ondelete="SET NULL"), nullable=True)
    export_lc_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    buyer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    export_value_usd: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    garment_qty: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="DRAFT")  # DRAFT | APPROVED | CLOSED
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class UdEntitlement(Base):
    """Permitted import line on a UD (fabric, trims, …) with entitled quantity / value."""

    __tablename__ = "bd_ud_entitlements"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    ud_id: Mapped[int] = mapped_column(
        ForeignKey("bd_utilization_declarations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_description: Mapped[str] = mapped_column(String(255), nullable=False)
    hs_code: Mapped[str | None] = mapped_column(String(16), nullable=True)
    uom: Mapped[str | None] = mapped_column(String(16), nullable=True)
    entitled_qty: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=0)
    entitled_value_usd: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
