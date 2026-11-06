"""Bill-wise party ledger (AR/AP) models — Sprint 1."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PartyLedger(Base):
    """Links a Customer OR Vendor to a ChartOfAccount ledger."""

    __tablename__ = "party_ledgers"
    __table_args__ = (
        CheckConstraint("party_type IN ('CUSTOMER', 'VENDOR')", name="ck_party_ledgers_party_type"),
        CheckConstraint(
            "(customer_id IS NOT NULL AND vendor_id IS NULL) OR "
            "(customer_id IS NULL AND vendor_id IS NOT NULL)",
            name="ck_party_ledgers_xor_party",
        ),
        UniqueConstraint("tenant_id", "customer_id", name="uq_party_ledgers_tenant_customer"),
        UniqueConstraint("tenant_id", "vendor_id", name="uq_party_ledgers_tenant_vendor"),
        Index("idx_party_ledgers_tenant_active_type", "tenant_id", "is_active", "party_type"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )

    party_type: Mapped[str] = mapped_column(String(16), nullable=False)
    customer_id: Mapped[int | None] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), nullable=True, index=True
    )
    vendor_id: Mapped[int | None] = mapped_column(
        ForeignKey("vendors.id", ondelete="CASCADE"), nullable=True, index=True
    )

    ledger_account_id: Mapped[int] = mapped_column(
        ForeignKey("chart_of_accounts.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    credit_limit: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True)
    credit_days: Mapped[int | None] = mapped_column(Integer, nullable=True, default=30)
    interest_rate_monthly: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)

    opening_balance: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), nullable=False, default=Decimal("0"), server_default="0"
    )
    opening_balance_type: Mapped[str] = mapped_column(String(6), nullable=False, default="DR")
    opening_balance_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    current_balance: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), nullable=False, default=Decimal("0"), server_default="0"
    )
    current_balance_type: Mapped[str] = mapped_column(String(6), nullable=False, default="DR")

    total_dr_amount: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), nullable=False, default=Decimal("0"), server_default="0"
    )
    total_cr_amount: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), nullable=False, default=Decimal("0"), server_default="0"
    )

    bill_wise_tracking: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    tds_section_id: Mapped[int | None] = mapped_column(
        ForeignKey("tds_sections.id", ondelete="SET NULL"), nullable=True, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    bills: Mapped[list["PartyLedgerBill"]] = relationship(
        "PartyLedgerBill", back_populates="party_ledger", lazy="raise"
    )


class PartyLedgerBill(Base):
    """One bill-wise AR/AP entry against a party ledger."""

    __tablename__ = "party_ledger_bills"
    __table_args__ = (
        CheckConstraint("amount_type IN ('DR', 'CR')", name="ck_party_ledger_bills_amount_type"),
        CheckConstraint(
            "status IN ('PENDING', 'PARTIAL', 'SETTLED', 'OVERDUE', 'CANCELLED')",
            name="ck_party_ledger_bills_status",
        ),
        UniqueConstraint("tenant_id", "bill_number", name="uq_party_ledger_bills_tenant_bill_number"),
        Index("idx_party_bills_status_due", "party_ledger_id", "status", "due_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    party_ledger_id: Mapped[int] = mapped_column(
        ForeignKey("party_ledgers.id", ondelete="CASCADE"), nullable=False, index=True
    )

    bill_number: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    bill_date: Mapped[date] = mapped_column(Date, nullable=False)
    bill_type: Mapped[str] = mapped_column(String(16), nullable=False)

    source_module: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    source_module_ref: Mapped[str | None] = mapped_column(String(128), nullable=True)
    voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    voucher_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("voucher_lines.id", ondelete="SET NULL"), nullable=True
    , index=True)

    commercial_invoice_id: Mapped[int | None] = mapped_column(
        ForeignKey("commercial_invoices.id", ondelete="SET NULL"), nullable=True, index=True
    )
    vendor_bill_id: Mapped[int | None] = mapped_column(
        ForeignKey("vendor_bills.id", ondelete="SET NULL"), nullable=True, index=True
    )

    original_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    amount_type: Mapped[str] = mapped_column(String(6), nullable=False)

    pending_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    settled_amount: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), nullable=False, default=Decimal("0"), server_default="0"
    )

    status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING", index=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)

    interest_rate_monthly: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    interest_accrued: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), nullable=False, default=Decimal("0"), server_default="0"
    )
    interest_last_calculated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    narration: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    party_ledger: Mapped["PartyLedger"] = relationship("PartyLedger", back_populates="bills")
    allocations: Mapped[list["PartyLedgerBillAllocation"]] = relationship(
        "PartyLedgerBillAllocation", back_populates="bill", lazy="raise"
    )


class PartyLedgerBillAllocation(Base):
    """Allocation of a payment/receipt voucher against a party ledger bill."""

    __tablename__ = "party_ledger_bill_allocations"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "bill_id",
            "voucher_id",
            name="uq_party_ledger_alloc_tenant_bill_voucher",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )

    bill_id: Mapped[int] = mapped_column(
        ForeignKey("party_ledger_bills.id", ondelete="CASCADE"), nullable=False, index=True
    )
    voucher_id: Mapped[int] = mapped_column(
        ForeignKey("vouchers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    voucher_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("voucher_lines.id", ondelete="SET NULL"), nullable=True
    , index=True)

    allocated_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    allocated_date: Mapped[date] = mapped_column(Date, nullable=False)
    bill_balance_after: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    bill: Mapped["PartyLedgerBill"] = relationship("PartyLedgerBill", back_populates="allocations")
