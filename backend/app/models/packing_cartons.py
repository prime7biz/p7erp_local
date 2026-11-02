"""Carton detail lines of a packing list (flag `packing_list_cartons_enabled`, default on).

One line = carton number range × colour × size × pieces per carton. Several lines with the
same range describe an assorted (ratio) carton; weights/dimensions are per carton of the range.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PackingListCartonLine(Base):
    __tablename__ = "packing_list_carton_lines"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    packing_list_id: Mapped[int] = mapped_column(ForeignKey("packing_lists.id", ondelete="CASCADE"), nullable=False, index=True)
    carton_from: Mapped[int] = mapped_column(Integer, nullable=False)
    carton_to: Mapped[int] = mapped_column(Integer, nullable=False)
    color_name: Mapped[str] = mapped_column(String(100), nullable=False)
    size: Mapped[str] = mapped_column(String(16), nullable=False)
    pcs_per_carton: Mapped[int] = mapped_column(Integer, nullable=False)
    net_kg_per_carton: Mapped[Decimal | None] = mapped_column(Numeric(10, 3), nullable=True)
    gross_kg_per_carton: Mapped[Decimal | None] = mapped_column(Numeric(10, 3), nullable=True)
    length_cm: Mapped[Decimal | None] = mapped_column(Numeric(8, 2), nullable=True)
    width_cm: Mapped[Decimal | None] = mapped_column(Numeric(8, 2), nullable=True)
    height_cm: Mapped[Decimal | None] = mapped_column(Numeric(8, 2), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
