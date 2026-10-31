"""Packing list + shipment container models (Phase 1.1 MVP)."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PackingList(Base):
    """Header packing list — lines deferred to a later phase."""

    __tablename__ = "packing_lists"
    __table_args__ = (
        UniqueConstraint("tenant_id", "packing_list_number", name="uq_packing_lists_tenant_number"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    packing_list_number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    shipment_id: Mapped[int | None] = mapped_column(
        ForeignKey("shipments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    order_id: Mapped[int | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    delivery_challan_id: Mapped[int | None] = mapped_column(
        ForeignKey("delivery_challans.id", ondelete="SET NULL"), nullable=True, index=True
    )
    packing_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    total_cartons: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    # Stored as kg (API may expose as gross_weight / gross_weight_kg).
    gross_weight: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    net_weight: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="DRAFT", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class ShipmentContainer(Base):
    __tablename__ = "shipment_containers"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "shipment_id",
            "container_number",
            name="uq_shipment_containers_tenant_shipment_number",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    shipment_id: Mapped[int] = mapped_column(
        ForeignKey("shipments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    packing_list_id: Mapped[int | None] = mapped_column(
        ForeignKey("packing_lists.id", ondelete="SET NULL"), nullable=True, index=True
    )
    container_number: Mapped[str] = mapped_column(String(64), nullable=False)
    container_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    seal_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    tare_weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    max_weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    loading_status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="EMPTY", index=True
    )  # EMPTY | LOADING | LOADED | CLOSED | SEALED (legacy)
    loaded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
