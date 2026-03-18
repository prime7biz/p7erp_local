"""Trade module models: trade cases, shipments, documents, and stage logs."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TradeCase(Base):
    __tablename__ = "trade_cases"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    direction: Mapped[str] = mapped_column(String(16), nullable=False, default="EXPORT", index=True)
    reference: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="DRAFT", index=True)
    current_stage: Mapped[str] = mapped_column(String(32), nullable=False, default="DRAFT", index=True)

    order_id: Mapped[int | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    customer_id: Mapped[int | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    vendor_id: Mapped[int | None] = mapped_column(
        ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True, index=True
    )
    proforma_invoice_id: Mapped[int | None] = mapped_column(
        ForeignKey("proforma_invoices.id", ondelete="SET NULL"), nullable=True, index=True
    )
    master_contract_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_contracts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    btb_lc_id: Mapped[int | None] = mapped_column(
        ForeignKey("btb_lcs.id", ondelete="SET NULL"), nullable=True, index=True
    )

    etd: Mapped[date | None] = mapped_column(Date, nullable=True)
    eta: Mapped[date | None] = mapped_column(Date, nullable=True)
    amount: Mapped[float | None] = mapped_column(nullable=True)
    currency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    cost_amount: Mapped[float | None] = mapped_column(nullable=True)
    margin_amount: Mapped[float | None] = mapped_column(nullable=True)
    margin_pct: Mapped[float | None] = mapped_column(nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class TradeCaseStage(Base):
    __tablename__ = "trade_case_stages"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    stage_key: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    required_doc_types: Mapped[list[Any] | None] = mapped_column(JSON, nullable=True)
    next_stage_keys: Mapped[list[Any] | None] = mapped_column(JSON, nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class TradeCaseStageLog(Base):
    __tablename__ = "trade_case_stage_log"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    trade_case_id: Mapped[int] = mapped_column(
        ForeignKey("trade_cases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_stage: Mapped[str | None] = mapped_column(String(32), nullable=True)
    to_stage: Mapped[str] = mapped_column(String(32), nullable=False)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class Shipment(Base):
    __tablename__ = "shipments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    trade_case_id: Mapped[int] = mapped_column(
        ForeignKey("trade_cases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    reference: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="PLANNED", index=True)
    carrier: Mapped[str | None] = mapped_column(String(255), nullable=True)
    booking_ref: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    bl_awb: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    etd: Mapped[date | None] = mapped_column(Date, nullable=True)
    eta: Mapped[date | None] = mapped_column(Date, nullable=True)
    origin_port: Mapped[str | None] = mapped_column(String(255), nullable=True)
    dest_port: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class TradeDocument(Base):
    __tablename__ = "trade_documents"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    trade_case_id: Mapped[int] = mapped_column(
        ForeignKey("trade_cases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    shipment_id: Mapped[int | None] = mapped_column(
        ForeignKey("shipments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    document_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(512), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    linked_entity_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    linked_entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    uploaded_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
