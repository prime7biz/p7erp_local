"""Sprint 5: TDS sections and deductions."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TdsSection(Base):
    __tablename__ = "tds_sections"
    __table_args__ = (UniqueConstraint("tenant_id", "section_code", name="uq_tds_sections_tenant_code"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    section_code: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    threshold_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False, default=Decimal("0"))
    tds_rate: Mapped[Decimal] = mapped_column(Numeric(8, 4), nullable=False, default=Decimal("0"))
    rate_company: Mapped[Decimal | None] = mapped_column(Numeric(8, 4), nullable=True)
    rate_non_company: Mapped[Decimal | None] = mapped_column(Numeric(8, 4), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class TdsDeduction(Base):
    __tablename__ = "tds_deductions"
    __table_args__ = (
        CheckConstraint(
            "status IN ('PENDING', 'DEPOSITED', 'CERTIFICATE_ISSUED')",
            name="ck_tds_deductions_status",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    party_ledger_id: Mapped[int] = mapped_column(
        ForeignKey("party_ledgers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    tds_section_id: Mapped[int] = mapped_column(
        ForeignKey("tds_sections.id", ondelete="RESTRICT"), nullable=False
    )
    taxable_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    tds_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    net_payment: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True)
    tds_liability_voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True
    , index=True)
    certificate_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    certificate_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="PENDING", index=True)
    deduction_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
