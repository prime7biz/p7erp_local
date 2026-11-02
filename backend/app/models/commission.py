"""Commission engine (flag `commission_engine_enabled`, default off).

Two directions:
- RECEIVABLE: commission we earn from a factory (vendor) or buyer (customer) on each shipment.
- PAYABLE: commission we pay an agent (intermediary) on each shipment of their orders.

Flow: record a shipment (shipped FOB value) -> entries are calculated from rules ->
group pending entries into a statement -> issuing a statement creates a DRAFT voucher.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

DIRECTION_RECEIVABLE = "RECEIVABLE"
DIRECTION_PAYABLE = "PAYABLE"
DIRECTIONS = (DIRECTION_RECEIVABLE, DIRECTION_PAYABLE)

COUNTERPARTY_CUSTOMER = "CUSTOMER"
COUNTERPARTY_VENDOR = "VENDOR"
COUNTERPARTY_INTERMEDIARY = "INTERMEDIARY"

RATE_PERCENTAGE = "PERCENTAGE"
# Fixed amount per shipped piece (needs shipped_qty on the shipment).
RATE_FIXED = "FIXED"


class CommissionSettings(Base):
    __tablename__ = "commission_settings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, unique=True)
    tds_rate_pct: Mapped[Decimal] = mapped_column(Numeric(6, 3), nullable=False, default=Decimal("0"))
    vds_rate_pct: Mapped[Decimal] = mapped_column(Numeric(6, 3), nullable=False, default=Decimal("0"))
    income_account_id: Mapped[int | None] = mapped_column(ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True)
    receivable_account_id: Mapped[int | None] = mapped_column(ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True)
    expense_account_id: Mapped[int | None] = mapped_column(ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True)
    payable_account_id: Mapped[int | None] = mapped_column(ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True)
    tds_receivable_account_id: Mapped[int | None] = mapped_column(ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True)
    tds_payable_account_id: Mapped[int | None] = mapped_column(ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True)
    vds_receivable_account_id: Mapped[int | None] = mapped_column(ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True)
    vds_payable_account_id: Mapped[int | None] = mapped_column(ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class CommissionRule(Base):
    """Rate for a direction; most specific scope wins (VENDOR/CUSTOMER/INTERMEDIARY before DEFAULT)."""

    __tablename__ = "commission_rules"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    direction: Mapped[str] = mapped_column(String(16), nullable=False)
    # DEFAULT | CUSTOMER | VENDOR | INTERMEDIARY
    scope: Mapped[str] = mapped_column(String(16), nullable=False)
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), nullable=True, index=True)
    vendor_id: Mapped[int | None] = mapped_column(ForeignKey("vendors.id", ondelete="CASCADE"), nullable=True, index=True)
    intermediary_id: Mapped[int | None] = mapped_column(ForeignKey("intermediaries.id", ondelete="CASCADE"), nullable=True, index=True)
    rate_type: Mapped[str] = mapped_column(String(16), nullable=False, default=RATE_PERCENTAGE)
    rate: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class CommissionShipment(Base):
    """One shipment's shipped (FOB) value — the base every commission entry is calculated on."""

    __tablename__ = "commission_shipments"
    __table_args__ = (UniqueConstraint("tenant_id", "order_id", "shipment_ref", name="uq_commission_shipment_ref"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="RESTRICT"), nullable=False, index=True)
    # Factory that produced the shipment (buying-house flow); used for RECEIVABLE vendor rules.
    vendor_id: Mapped[int | None] = mapped_column(ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True, index=True)
    shipment_ref: Mapped[str] = mapped_column(String(64), nullable=False)
    shipment_date: Mapped[date] = mapped_column(Date, nullable=False)
    shipped_qty: Mapped[int | None] = mapped_column(Integer, nullable=True)
    shipped_value: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="USD")
    exchange_rate_to_base: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False, default=Decimal("1"))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class CommissionEntry(Base):
    __tablename__ = "commission_entries"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    shipment_id: Mapped[int] = mapped_column(ForeignKey("commission_shipments.id", ondelete="CASCADE"), nullable=False, index=True)
    direction: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    counterparty_type: Mapped[str] = mapped_column(String(16), nullable=False)
    counterparty_id: Mapped[int] = mapped_column(Integer, nullable=False)
    rate_type: Mapped[str] = mapped_column(String(16), nullable=False)
    rate: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    # Where the rate came from, e.g. "order", "customer_intermediary", "rule:12".
    rate_source: Mapped[str] = mapped_column(String(40), nullable=False)
    base_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    gross_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    tds_rate_pct: Mapped[Decimal] = mapped_column(Numeric(6, 3), nullable=False, default=Decimal("0"))
    tds_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    vds_rate_pct: Mapped[Decimal] = mapped_column(Numeric(6, 3), nullable=False, default=Decimal("0"))
    vds_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    net_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False)
    # PENDING (not on a statement) | STATEMENTED
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING", index=True)
    statement_id: Mapped[int | None] = mapped_column(ForeignKey("commission_statements.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class CommissionStatement(Base):
    """Commission invoice (RECEIVABLE) or agent commission statement (PAYABLE)."""

    __tablename__ = "commission_statements"
    __table_args__ = (UniqueConstraint("tenant_id", "statement_code", name="uq_commission_statement_code"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    statement_code: Mapped[str] = mapped_column(String(32), nullable=False)
    direction: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    counterparty_type: Mapped[str] = mapped_column(String(16), nullable=False)
    counterparty_id: Mapped[int] = mapped_column(Integer, nullable=False)
    statement_date: Mapped[date] = mapped_column(Date, nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False)
    gross_total: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    tds_total: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    vds_total: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    net_total: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    # Totals converted to the company's base currency (BDT) — what the draft voucher uses.
    base_gross_total: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    # DRAFT | ISSUED | CANCELLED
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="DRAFT", index=True)
    voucher_id: Mapped[int | None] = mapped_column(ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    issued_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
