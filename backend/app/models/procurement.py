"""Procurement models: purchase requisition -> supplier quotations -> comparative statement -> PO.

Migration 244. Feature flag `procurement_cs_enabled` (default off).
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PurchaseRequisition(Base):
    __tablename__ = "purchase_requisitions"
    __table_args__ = (UniqueConstraint("tenant_id", "pr_code", name="uq_purchase_requisitions_tenant_pr_code"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    pr_code: Mapped[str] = mapped_column(String(32), nullable=False)
    department: Mapped[str | None] = mapped_column(String(128), nullable=True)
    purpose: Mapped[str | None] = mapped_column(Text, nullable=True)
    required_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # DRAFT -> SUBMITTED -> APPROVED -> CS_SELECTED -> PO_CREATED ; REJECTED / CANCELLED
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="DRAFT")
    requested_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    selected_quotation_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    selection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    selected_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    selected_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    purchase_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("purchase_orders.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class PurchaseRequisitionLine(Base):
    __tablename__ = "purchase_requisition_lines"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    requisition_id: Mapped[int] = mapped_column(
        ForeignKey("purchase_requisitions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False)
    warehouse_id: Mapped[int | None] = mapped_column(ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    estimated_unit_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class SupplierQuotation(Base):
    __tablename__ = "supplier_quotations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    requisition_id: Mapped[int] = mapped_column(
        ForeignKey("purchase_requisitions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id", ondelete="RESTRICT"), nullable=False)
    quote_ref: Mapped[str | None] = mapped_column(String(64), nullable=True)
    quote_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    valid_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    currency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    delivery_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    payment_terms: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class SupplierQuotationLine(Base):
    __tablename__ = "supplier_quotation_lines"
    __table_args__ = (
        UniqueConstraint("quotation_id", "requisition_line_id", name="uq_supplier_quotation_lines_quote_line"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    quotation_id: Mapped[int] = mapped_column(
        ForeignKey("supplier_quotations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    requisition_line_id: Mapped[int] = mapped_column(
        ForeignKey("purchase_requisition_lines.id", ondelete="CASCADE"), nullable=False
    )
    unit_price: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
