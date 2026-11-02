"""Traceability (flag `traceability_enabled`, default off).

- MaterialCertificate: GOTS / OEKO-TEX / GRS … held by a supplier and/or covering a material.
- CutTicketFabricLot: which received fabric lot (StockBatch) and rolls a cut ticket used,
  linking fabric -> cut ticket -> bundles -> order for the buyer-facing traceability report.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

CERTIFICATE_TYPES = ("GOTS", "OCS", "GRS", "RCS", "OEKO_TEX_100", "BCI", "FSC", "OTHER")


class MaterialCertificate(Base):
    __tablename__ = "material_certificates"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    cert_type: Mapped[str] = mapped_column(String(24), nullable=False)
    certificate_number: Mapped[str] = mapped_column(String(100), nullable=False)
    issuer: Mapped[str | None] = mapped_column(String(160), nullable=True)
    # Supplier holding the certificate (scope certificate) and/or the material it covers.
    vendor_id: Mapped[int | None] = mapped_column(ForeignKey("vendors.id", ondelete="CASCADE"), nullable=True, index=True)
    item_id: Mapped[int | None] = mapped_column(ForeignKey("items.id", ondelete="CASCADE"), nullable=True, index=True)
    valid_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    valid_until: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class CutTicketFabricLot(Base):
    __tablename__ = "cut_ticket_fabric_lots"
    __table_args__ = (UniqueConstraint("cut_ticket_id", "stock_batch_id", name="uq_cut_ticket_fabric_lot"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    cut_ticket_id: Mapped[int] = mapped_column(ForeignKey("cut_tickets.id", ondelete="CASCADE"), nullable=False, index=True)
    stock_batch_id: Mapped[int] = mapped_column(ForeignKey("stock_batches.id", ondelete="RESTRICT"), nullable=False, index=True)
    qty_used: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    roll_numbers: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
