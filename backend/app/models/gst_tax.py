"""Sprint 3: GST / tax ledger ORM models."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TaxLedger(Base):
    __tablename__ = "tax_ledgers"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "tax_type",
            "tax_rate",
            "gst_type",
            name="uq_tax_ledgers_tenant_type_rate_gst",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    chart_account_id: Mapped[int] = mapped_column(
        ForeignKey("chart_of_accounts.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    tax_type: Mapped[str] = mapped_column(String(16), nullable=False, index=True)  # CGST|SGST|IGST|...
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    gst_type: Mapped[str] = mapped_column(String(16), nullable=False, default="GOODS")
    nature_of_transaction: Mapped[str | None] = mapped_column(String(128), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    effective_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    effective_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class VoucherTaxLine(Base):
    __tablename__ = "voucher_tax_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    voucher_id: Mapped[int] = mapped_column(ForeignKey("vouchers.id", ondelete="CASCADE"), nullable=False, index=True)
    voucher_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("voucher_lines.id", ondelete="SET NULL"), nullable=True
    )
    tax_ledger_id: Mapped[int] = mapped_column(
        ForeignKey("tax_ledgers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    taxable_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    tax_rate_applied: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    hsn_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    is_itc_eligible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    direction: Mapped[str] = mapped_column(String(16), nullable=False, default="OUTWARD")  # OUTWARD|INWARD
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
