"""Colour × size quantity breakdown of a purchase-order line (feature flag `po_color_size_matrix_enabled`)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PurchaseOrderColorSizeLine(Base):
    __tablename__ = "purchase_order_color_size_lines"
    __table_args__ = (UniqueConstraint("po_item_id", "color_name", "size", name="uq_po_item_color_size_cell"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    purchase_order_id: Mapped[int] = mapped_column(
        ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    po_item_id: Mapped[int] = mapped_column(
        ForeignKey("purchase_order_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    color_name: Mapped[str] = mapped_column(String(100), nullable=False)
    color_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    size: Mapped[str] = mapped_column(String(16), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    color_sort: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    size_sort: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
