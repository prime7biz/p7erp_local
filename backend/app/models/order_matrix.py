"""Colour × size quantity breakdown of an order (feature flag `order_color_size_matrix_enabled`)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class OrderColorSizeLine(Base):
    __tablename__ = "order_color_size_lines"
    __table_args__ = (UniqueConstraint("order_id", "color_name", "size", name="uq_order_color_size_cell"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    color_name: Mapped[str] = mapped_column(String(100), nullable=False)
    color_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    size: Mapped[str] = mapped_column(String(16), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Display order of the colour row and size column in the grid.
    color_sort: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    size_sort: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
