"""Inbound Job Work (CMT) — customer-supplied materials, CM billing, no valued stock."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class JobWorkContract(Base):
    __tablename__ = "job_work_contracts"
    __table_args__ = (
        UniqueConstraint("tenant_id", "contract_no", name="uq_job_work_contracts_tenant_no"),
        Index("ix_job_work_contracts_tenant_status", "tenant_id", "status"),
        Index("ix_job_work_contracts_tenant_customer", "tenant_id", "customer_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    contract_no: Mapped[str] = mapped_column(String(32), nullable=False)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False, index=True)
    final_customer_id: Mapped[int | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    final_customer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    master_contract_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_contracts.id", ondelete="SET NULL"), nullable=True
    )
    proforma_invoice_id: Mapped[int | None] = mapped_column(
        ForeignKey("proforma_invoices.id", ondelete="SET NULL"), nullable=True
    )
    principal_ud_ref: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="DRAFT", index=True)
    cm_rate: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="BDT")
    exchange_rate_default: Mapped[str] = mapped_column(String(32), nullable=False, default="1")
    vat_rate_pct: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    do_cutting: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    do_sewing: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    do_finishing: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    location_label: Mapped[str | None] = mapped_column(String(128), nullable=True)
    contract_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    qty_ordered_total: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    qty_produced_total: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    qty_delivered_accepted: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    qty_rejected_total: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    qty_billed: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    amount_billed: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    amount_received: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    updated_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class JobWorkDeliverable(Base):
    __tablename__ = "job_work_deliverables"
    __table_args__ = (Index("ix_job_work_deliverables_contract", "tenant_id", "contract_id"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    contract_id: Mapped[int] = mapped_column(
        ForeignKey("job_work_contracts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    style_ref: Mapped[str | None] = mapped_column(String(128), nullable=True)
    color: Mapped[str | None] = mapped_column(String(64), nullable=True)
    size: Mapped[str | None] = mapped_column(String(32), nullable=True)
    style_id: Mapped[int | None] = mapped_column(
        ForeignKey("garment_styles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    colorway_id: Mapped[int | None] = mapped_column(
        ForeignKey("style_colorways.id", ondelete="SET NULL"), nullable=True
    )
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    qty_ordered: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    qty_produced: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    qty_delivered: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    qty_rejected: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class JobWorkMaterial(Base):
    __tablename__ = "job_work_materials"
    __table_args__ = (Index("ix_job_work_materials_contract", "tenant_id", "contract_id"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    contract_id: Mapped[int] = mapped_column(
        ForeignKey("job_work_contracts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True)
    style_id: Mapped[int | None] = mapped_column(
        ForeignKey("garment_styles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    colorway_id: Mapped[int | None] = mapped_column(
        ForeignKey("style_colorways.id", ondelete="SET NULL"), nullable=True
    )
    consumption_per_unit: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    qty_planned: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    qty_received: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    qty_consumed: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    qty_returned: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class JobWorkMaterialLedger(Base):
    """Qty-only ledger for customer materials. Never posts stock_movements / FIFO / inventory GL."""

    __tablename__ = "job_work_material_ledger"
    __table_args__ = (
        Index("ix_job_work_mat_ledger_contract", "tenant_id", "contract_id"),
        Index("ix_job_work_mat_ledger_material", "tenant_id", "material_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    contract_id: Mapped[int] = mapped_column(
        ForeignKey("job_work_contracts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    material_id: Mapped[int] = mapped_column(
        ForeignKey("job_work_materials.id", ondelete="CASCADE"), nullable=False, index=True
    )
    movement_kind: Mapped[str] = mapped_column(String(16), nullable=False)  # RECEIVE|CONSUME|RETURN|ADJUST
    qty: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    doc_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    movement_date: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class JobWorkDelivery(Base):
    __tablename__ = "job_work_deliveries"
    __table_args__ = (
        UniqueConstraint("tenant_id", "delivery_no", name="uq_job_work_deliveries_tenant_no"),
        Index("ix_job_work_deliveries_contract", "tenant_id", "contract_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    contract_id: Mapped[int] = mapped_column(
        ForeignKey("job_work_contracts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    delivery_no: Mapped[str] = mapped_column(String(32), nullable=False)
    delivery_date: Mapped[date] = mapped_column(Date, nullable=False)
    reference_doc: Mapped[str | None] = mapped_column(String(128), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    qty_delivered: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    qty_rejected: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    qty_accepted: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class JobWorkDeliveryLine(Base):
    __tablename__ = "job_work_delivery_lines"
    __table_args__ = (Index("ix_job_work_delivery_lines_delivery", "tenant_id", "delivery_id"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    delivery_id: Mapped[int] = mapped_column(
        ForeignKey("job_work_deliveries.id", ondelete="CASCADE"), nullable=False, index=True
    )
    deliverable_id: Mapped[int | None] = mapped_column(
        ForeignKey("job_work_deliverables.id", ondelete="SET NULL"), nullable=True, index=True
    )
    style_ref: Mapped[str | None] = mapped_column(String(128), nullable=True)
    color: Mapped[str | None] = mapped_column(String(64), nullable=True)
    size: Mapped[str | None] = mapped_column(String(32), nullable=True)
    qty_delivered: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    qty_rejected: Mapped[str] = mapped_column(String(32), nullable=False, default="0")


class JobWorkBill(Base):
    __tablename__ = "job_work_bills"
    __table_args__ = (
        UniqueConstraint("tenant_id", "bill_no", name="uq_job_work_bills_tenant_no"),
        Index("ix_job_work_bills_contract", "tenant_id", "contract_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    contract_id: Mapped[int] = mapped_column(
        ForeignKey("job_work_contracts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    bill_no: Mapped[str] = mapped_column(String(32), nullable=False)
    bill_date: Mapped[date] = mapped_column(Date, nullable=False)
    qty_billed: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    cm_rate: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="BDT")
    exchange_rate: Mapped[str] = mapped_column(String(32), nullable=False, default="1")
    vat_rate_pct: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    vat_amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    net_amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    gross_amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    amount_received: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="OPEN")  # OPEN|PARTIAL|PAID|CANCELLED
    voucher_id: Mapped[int | None] = mapped_column(ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True, index=True)
    reverse_voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    outstanding_bill_id: Mapped[int | None] = mapped_column(
        ForeignKey("outstanding_bills.id", ondelete="SET NULL"), nullable=True, index=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class JobWorkReceipt(Base):
    __tablename__ = "job_work_receipts"
    __table_args__ = (
        UniqueConstraint("tenant_id", "receipt_no", name="uq_job_work_receipts_tenant_no"),
        Index("ix_job_work_receipts_bill", "tenant_id", "bill_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    contract_id: Mapped[int] = mapped_column(
        ForeignKey("job_work_contracts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    bill_id: Mapped[int] = mapped_column(
        ForeignKey("job_work_bills.id", ondelete="CASCADE"), nullable=False, index=True
    )
    receipt_no: Mapped[str] = mapped_column(String(32), nullable=False)
    receipt_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="BDT")
    exchange_rate: Mapped[str] = mapped_column(String(32), nullable=False, default="1")
    cash_or_bank_account_id: Mapped[int] = mapped_column(
        ForeignKey("chart_of_accounts.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="POSTED")  # POSTED|REVERSED
    voucher_id: Mapped[int | None] = mapped_column(ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True, index=True)
    reverse_voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
