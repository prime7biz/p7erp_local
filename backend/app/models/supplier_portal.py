"""Supplier portal (flag `supplier_portal_enabled`, default off).

- ExternalSupplierAccess: which vendors an external supplier login may see (like ExternalCustomerAccess).
- SupplierPoUpdate: confirmations, ship-date promises and notes a supplier posts on a purchase order.
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

UPDATE_CONFIRMED = "CONFIRMED"
UPDATE_DECLINED = "DECLINED"
UPDATE_SHIP_DATE = "SHIP_DATE"
UPDATE_NOTE = "NOTE"
UPDATE_KINDS = (UPDATE_CONFIRMED, UPDATE_DECLINED, UPDATE_SHIP_DATE, UPDATE_NOTE)


class ExternalSupplierAccess(Base):
    __tablename__ = "external_supplier_access"
    __table_args__ = (UniqueConstraint("external_principal_id", "vendor_id", name="uq_external_supplier_access"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    external_principal_id: Mapped[int] = mapped_column(
        ForeignKey("external_principals.id", ondelete="CASCADE"), nullable=False, index=True
    )
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class SupplierPoUpdate(Base):
    __tablename__ = "supplier_po_updates"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    purchase_order_id: Mapped[int] = mapped_column(
        ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    external_principal_id: Mapped[int | None] = mapped_column(
        ForeignKey("external_principals.id", ondelete="SET NULL"), nullable=True, index=True
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    expected_ship_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, index=True)
