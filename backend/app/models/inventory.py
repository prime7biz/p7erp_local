from __future__ import annotations

from datetime import datetime, date
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Warehouse(Base):
    __tablename__ = "warehouses"
    __table_args__ = (
        UniqueConstraint("tenant_id", "warehouse_code", name="uq_warehouses_tenant_warehouse_code"),
        Index("ix_warehouses_code", "warehouse_code"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_code: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_production_floor: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_store: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_rejected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_quarantine: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class StockGroup(Base):
    __tablename__ = "stock_groups"
    __table_args__ = (UniqueConstraint("tenant_id", "group_code", name="uq_stock_groups_tenant_group_code"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    group_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("stock_groups.id", ondelete="SET NULL"), nullable=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # GL mapping (optional; falls back to tenant coa_config inventory accounts)
    inventory_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    wip_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    cogs_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    adjustment_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    grni_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    sales_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    purchase_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    default_valuation_method: Mapped[str] = mapped_column(String(8), nullable=False, default="FIFO")
    # RAW_MATERIAL | WORK_IN_PROCESS | FINISHED_GOODS | OTHER (PLAN 2B). NULL = unclassified stock.
    stock_nature: Mapped[str | None] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class Vendor(Base):
    __tablename__ = "vendors"
    __table_args__ = (
        UniqueConstraint("tenant_id", "vendor_code", name="uq_vendors_tenant_vendor_code"),
        Index("ix_vendors_name_trgm", "name", postgresql_using="gin", postgresql_ops={"name": "gin_trgm_ops"}),
        Index(
            "ix_vendors_vendor_code_trgm",
            "vendor_code",
            postgresql_using="gin",
            postgresql_ops={"vendor_code": "gin_trgm_ops"},
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    vendor_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    contact_person: Mapped[str | None] = mapped_column(String(128), nullable=True)
    email: Mapped[str | None] = mapped_column(String(128), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Advanced fields: ledger link and currency basics
    ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    default_currency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    payment_terms_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    vendor_type: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)  # local | foreign
    country: Mapped[str | None] = mapped_column(String(128), nullable=True)
    city: Mapped[str | None] = mapped_column(String(128), nullable=True)
    tax_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    bank_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    bank_account_no: Mapped[str | None] = mapped_column(String(128), nullable=True)
    swift_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    credit_limit: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    # Supplier master extensions (nullable; see docs/SUPPLIER_AI_FOUNDATION.md)
    legal_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    trade_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    website: Mapped[str | None] = mapped_column(String(512), nullable=True)
    mobile: Mapped[str | None] = mapped_column(String(64), nullable=True)
    designation: Mapped[str | None] = mapped_column(String(128), nullable=True)
    address_line1: Mapped[str | None] = mapped_column(String(512), nullable=True)
    state_or_region: Mapped[str | None] = mapped_column(String(128), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    registration_number: Mapped[str | None] = mapped_column(String(128), nullable=True)
    bank_account_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    iban: Mapped[str | None] = mapped_column(String(64), nullable=True)
    payment_terms: Mapped[str | None] = mapped_column(String(255), nullable=True)
    incoterms: Mapped[str | None] = mapped_column(String(64), nullable=True)
    shipping_terms: Mapped[str | None] = mapped_column(String(255), nullable=True)
    lead_time_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    compliance_status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    compliance_reference_numbers: Mapped[str | None] = mapped_column(Text, nullable=True)
    certifications_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    onboarding_status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    internal_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"
    __table_args__ = (
        UniqueConstraint("tenant_id", "po_code", name="uq_purchase_orders_tenant_po_code"),
        Index(
            "ix_purchase_orders_po_code_trgm",
            "po_code",
            postgresql_using="gin",
            postgresql_ops={"po_code": "gin_trgm_ops"},
        ),
        Index(
            "ix_purchase_orders_supplier_name_trgm",
            "supplier_name",
            postgresql_using="gin",
            postgresql_ops={"supplier_name": "gin_trgm_ops"},
        ),
        Index("ix_purchase_orders_tenant_source_order", "tenant_id", "source_order_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    po_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    vendor_id: Mapped[int | None] = mapped_column(
        ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True, index=True
    )
    supplier_name: Mapped[str] = mapped_column(String(128), nullable=False)
    order_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expected_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="DRAFT", index=True)
    currency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    exchange_rate_to_base: Mapped[float | None] = mapped_column(Numeric(18, 6), nullable=True)
    base_total_amount: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    btb_lc_id: Mapped[int | None] = mapped_column(
        ForeignKey("btb_lcs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source_bom_id: Mapped[int | None] = mapped_column(
        ForeignKey("boms.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"
    __table_args__ = (
        Index("ix_poi_source_bom_id", "source_bom_id"),
        Index("ix_poi_source_bom_line_id", "source_bom_line_id"),
        Index("ix_poi_source_order_id", "source_order_id"),
        Index("ix_poi_source_quotation_line_id", "source_quotation_line_id"),
        Index("ix_purchase_order_items_po_id", "purchase_order_id"),
        Index("ix_purchase_order_items_tenant_item", "tenant_id", "item_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    purchase_order_id: Mapped[int] = mapped_column(
        ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False
    )
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True)
    warehouse_id: Mapped[int | None] = mapped_column(ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"), server_default="0")
    unit_price: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"), server_default="0")
    source_bom_id: Mapped[int | None] = mapped_column(
        ForeignKey("boms.id", ondelete="SET NULL"), nullable=True
    )
    source_bom_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("bom_items.id", ondelete="SET NULL"), nullable=True
    )
    source_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), nullable=True
    )
    source_quotation_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("quotation_materials.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class GoodsReceiving(Base):
    __tablename__ = "goods_receiving"
    __table_args__ = (
        UniqueConstraint("tenant_id", "grn_code", name="uq_goods_receiving_tenant_grn_code"),
        Index("ix_grn_acknowledged_by_user_id", "acknowledged_by_user_id"),
        Index("ix_grn_approved_by_user_id", "approved_by_user_id"),
        Index("ix_grn_btb_lc_id", "btb_lc_id"),
        Index("ix_grn_default_warehouse_id", "default_warehouse_id"),
        Index("ix_grn_export_case_id", "export_case_id"),
        Index("ix_grn_master_contract_id", "master_contract_id"),
        Index("ix_grn_source_bom_id", "source_bom_id"),
        Index("ix_grn_source_order_id", "source_order_id"),
        Index("ix_grn_vendor_id", "vendor_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    grn_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    purchase_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("purchase_orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    received_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="DRAFT", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    vendor_id: Mapped[int | None] = mapped_column(ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True)
    default_warehouse_id: Mapped[int | None] = mapped_column(
        ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True
    )
    source_type: Mapped[str | None] = mapped_column(String(16), nullable=True)  # PO | NON_PO
    approval_status: Mapped[str | None] = mapped_column(String(24), nullable=True)
    supplier_delivery_challan_no: Mapped[str | None] = mapped_column(String(128), nullable=True)
    supplier_invoice_no: Mapped[str | None] = mapped_column(String(128), nullable=True)
    vehicle_info: Mapped[str | None] = mapped_column(String(255), nullable=True)
    non_po_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    approved_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    acknowledgement_issued: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    acknowledgement_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    acknowledged_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    source_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), nullable=True
    )
    source_bom_id: Mapped[int | None] = mapped_column(
        ForeignKey("boms.id", ondelete="SET NULL"), nullable=True
    )
    btb_lc_id: Mapped[int | None] = mapped_column(
        ForeignKey("btb_lcs.id", ondelete="SET NULL"), nullable=True
    )
    master_contract_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_contracts.id", ondelete="SET NULL"), nullable=True
    )
    export_case_id: Mapped[int | None] = mapped_column(
        ForeignKey("export_cases.id", ondelete="SET NULL"), nullable=True
    )
    verification_id: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True, index=True)
    signature_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    signed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    signed_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class GoodsReceivingItem(Base):
    __tablename__ = "goods_receiving_items"
    __table_args__ = (
        Index("ix_goods_receiving_items_grn_id", "goods_receiving_id"),
        Index("ix_gri_btb_lc_id", "btb_lc_id"),
        Index("ix_gri_export_case_id", "export_case_id"),
        Index("ix_gri_master_contract_id", "master_contract_id"),
        Index("ix_gri_purchase_order_line_id", "purchase_order_line_id"),
        Index("ix_gri_source_bom_id", "source_bom_id"),
        Index("ix_gri_source_bom_line_id", "source_bom_line_id"),
        Index("ix_gri_source_order_id", "source_order_id"),
        Index("ix_gri_vendor_id", "vendor_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    goods_receiving_id: Mapped[int] = mapped_column(
        ForeignKey("goods_receiving.id", ondelete="CASCADE"), nullable=False
    )
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True)
    warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"), server_default="0")
    lot_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    purchase_order_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("purchase_order_items.id", ondelete="SET NULL"), nullable=True
    )
    ordered_qty: Mapped[str | None] = mapped_column(String(32), nullable=True)
    previously_received_qty: Mapped[str | None] = mapped_column(String(32), nullable=True)
    received_qty: Mapped[str | None] = mapped_column(String(32), nullable=True)
    accepted_qty: Mapped[str | None] = mapped_column(String(32), nullable=True)
    rejected_qty: Mapped[str | None] = mapped_column(String(32), nullable=True)
    pending_qty: Mapped[str | None] = mapped_column(String(32), nullable=True)
    unit_price: Mapped[str | None] = mapped_column(String(32), nullable=True)
    accepted_value: Mapped[str | None] = mapped_column(String(32), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), nullable=True
    )
    source_bom_id: Mapped[int | None] = mapped_column(
        ForeignKey("boms.id", ondelete="SET NULL"), nullable=True
    )
    source_bom_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("bom_items.id", ondelete="SET NULL"), nullable=True
    )
    master_contract_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_contracts.id", ondelete="SET NULL"), nullable=True
    )
    export_case_id: Mapped[int | None] = mapped_column(
        ForeignKey("export_cases.id", ondelete="SET NULL"), nullable=True
    )
    btb_lc_id: Mapped[int | None] = mapped_column(
        ForeignKey("btb_lcs.id", ondelete="SET NULL"), nullable=True
    )
    vendor_id: Mapped[int | None] = mapped_column(ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True)
    line_remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class GoodsReceivingAcknowledgement(Base):
    __tablename__ = "goods_receiving_acknowledgements"
    __table_args__ = (
        UniqueConstraint("tenant_id", "gra_code", name="uq_gra_tenant_code"),
        Index("ix_gra_tenant_grn", "tenant_id", "goods_receiving_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    goods_receiving_id: Mapped[int] = mapped_column(
        ForeignKey("goods_receiving.id", ondelete="CASCADE"), nullable=False, index=True
    )
    gra_code: Mapped[str] = mapped_column(String(32), nullable=False)
    issue_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="ISSUED")
    issued_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class StockReservation(Base):
    """Soft/hard quantity holds against inventory for orders/BOM planning (ATP)."""

    __tablename__ = "stock_reservations"
    __table_args__ = (
        Index("ix_stock_reservations_tenant_item_status", "tenant_id", "item_id", "status"),
        Index("ix_stock_reservations_tenant_order", "tenant_id", "order_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True)
    warehouse_id: Mapped[int | None] = mapped_column(
        ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True
    )
    order_id: Mapped[int | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    bom_id: Mapped[int | None] = mapped_column(ForeignKey("boms.id", ondelete="SET NULL"), nullable=True)
    reserved_qty: Mapped[float] = mapped_column(Numeric(18, 4), nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="HARD", index=True)  # SOFT|HARD|RELEASED
    reserved_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    released_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class StockMovement(Base):
    __tablename__ = "stock_movements"
    __table_args__ = (
        Index("ix_sm_bom_id", "bom_id"),
        Index("ix_sm_bom_line_id", "bom_line_id"),
        Index("ix_sm_btb_lc_id", "btb_lc_id"),
        Index("ix_sm_export_case_id", "export_case_id"),
        Index("ix_sm_goods_receiving_id", "goods_receiving_id"),
        Index("ix_sm_goods_receiving_item_id", "goods_receiving_item_id"),
        Index("ix_sm_master_contract_id", "master_contract_id"),
        Index("ix_sm_order_id", "order_id"),
        Index("ix_sm_process_order_id", "process_order_id"),
        Index("ix_sm_production_material_issue_id", "production_material_issue_id"),
        Index("ix_sm_purchase_order_id", "purchase_order_id"),
        Index("ix_sm_purchase_order_line_id", "purchase_order_line_id"),
        Index("ix_sm_tenant_kind", "tenant_id", "movement_kind"),
        Index("ix_sm_vendor_id", "vendor_id"),
        Index("ix_stock_movements_tenant_item_warehouse", "tenant_id", "item_id", "warehouse_id", "movement_type"),
        Index("ix_stock_movements_tenant_item_wh", "tenant_id", "item_id", "warehouse_id"),
        Index("ix_stock_movements_type", "movement_type"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True)
    warehouse_id: Mapped[int | None] = mapped_column(ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True, index=True)
    movement_type: Mapped[str] = mapped_column(String(16), nullable=False)  # IN|OUT|ADJUST
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"), server_default="0")
    reference_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    reference_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    movement_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    lot_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    batch_id: Mapped[int | None] = mapped_column(
        ForeignKey("stock_batches.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    unit_cost: Mapped[str | None] = mapped_column(String(32), nullable=True)
    movement_value: Mapped[str | None] = mapped_column(String(32), nullable=True)
    movement_kind: Mapped[str | None] = mapped_column(String(48), nullable=True)
    source_line_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    bom_id: Mapped[int | None] = mapped_column(ForeignKey("boms.id", ondelete="SET NULL"), nullable=True)
    bom_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("bom_items.id", ondelete="SET NULL"), nullable=True
    )
    purchase_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("purchase_orders.id", ondelete="SET NULL"), nullable=True
    )
    purchase_order_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("purchase_order_items.id", ondelete="SET NULL"), nullable=True
    )
    goods_receiving_id: Mapped[int | None] = mapped_column(
        ForeignKey("goods_receiving.id", ondelete="SET NULL"), nullable=True
    )
    goods_receiving_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("goods_receiving_items.id", ondelete="SET NULL"), nullable=True
    )
    process_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("process_orders.id", ondelete="SET NULL"), nullable=True
    )
    vendor_id: Mapped[int | None] = mapped_column(ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True)
    master_contract_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_contracts.id", ondelete="SET NULL"), nullable=True
    )
    btb_lc_id: Mapped[int | None] = mapped_column(
        ForeignKey("btb_lcs.id", ondelete="SET NULL"), nullable=True
    )
    export_case_id: Mapped[int | None] = mapped_column(
        ForeignKey("export_cases.id", ondelete="SET NULL"), nullable=True
    )
    production_material_issue_id: Mapped[int | None] = mapped_column(
        ForeignKey("production_material_issues.id", ondelete="SET NULL"), nullable=True
    )


class StockBalanceSnapshot(Base):
    """Precomputed (tenant, item, warehouse_dim) balances for optional fast reads.

    ``warehouse_dim_id`` uses ``0`` when the live movement row has ``warehouse_id IS NULL`` so a single
    unique constraint can be enforced (PostgreSQL treats NULLs as distinct in UNIQUE).
    """

    __tablename__ = "inventory_stock_balance_snapshots"
    __table_args__ = (
        UniqueConstraint("tenant_id", "item_id", "warehouse_dim_id", name="uq_inv_stock_snap_tenant_item_wh"),
        Index("ix_inv_stock_snapshots_tenant_id", "tenant_id"),
        Index("ix_inv_stock_snapshots_tenant_item", "tenant_id", "item_id"),
        Index("ix_inv_stock_snapshots_wh_dim", "warehouse_dim_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="CASCADE"), nullable=False)
    warehouse_dim_id: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    in_qty: Mapped[float] = mapped_column(Numeric(24, 6), nullable=False, default=0)
    out_qty: Mapped[float] = mapped_column(Numeric(24, 6), nullable=False, default=0)
    on_hand_qty: Mapped[float] = mapped_column(Numeric(24, 6), nullable=False, default=0)
    computed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class InventoryCostLayer(Base):
    """FIFO cost layer: one row per inbound stock_movements.id (IN)."""
    __tablename__ = "inventory_cost_layers"
    __table_args__ = (
        UniqueConstraint("source_movement_id", name="uq_inventory_cost_layers_source_movement_id"),
        Index("ix_inventory_cost_layers_tenant_item_wh_id", "tenant_id", "item_id", "warehouse_id", "id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="CASCADE"), nullable=False)
    warehouse_id: Mapped[int | None] = mapped_column(ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True)
    source_movement_id: Mapped[int] = mapped_column(
        ForeignKey("stock_movements.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    qty_original: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    qty_remaining: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    layer_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class StockItemPrice(Base):
    """Multiple named price lists per stock item (Wholesale / Retail / Distributor)."""

    __tablename__ = "stock_item_prices"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "stock_item_id",
            "price_list_name",
            "effective_from",
            name="uq_stock_item_prices_list_effective",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    stock_item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="CASCADE"), nullable=False, index=True)
    price_list_name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    price: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="BDT")
    effective_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    effective_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class StockBatch(Base):
    """Physical batch / lot per item and godown (warehouse)."""

    __tablename__ = "stock_batches"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "stock_item_id",
            "batch_number",
            "godown_id",
            name="uq_stock_batches_item_batch_godown",
        ),
        Index("idx_stock_batches_item_godown_status", "stock_item_id", "godown_id", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    stock_item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="CASCADE"), nullable=False, index=True)
    batch_number: Mapped[str] = mapped_column(String(64), nullable=False)
    manufacturing_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    opening_qty: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    received_qty: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    issued_qty: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    current_qty: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    cost_per_unit: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False, default=Decimal("0"))
    godown_id: Mapped[int | None] = mapped_column(
        ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source_movement_id: Mapped[int | None] = mapped_column(
        ForeignKey("stock_movements.id", ondelete="SET NULL"), nullable=True
    )
    goods_receiving_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("goods_receiving_items.id", ondelete="SET NULL"), nullable=True
    , index=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="ACTIVE", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class InventoryGlPosting(Base):
    """Idempotency: one posted voucher per (tenant, source document, action)."""
    __tablename__ = "inventory_gl_postings"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "source_system",
            "source_id",
            "action",
            name="uq_inventory_gl_postings_tenant_source_action",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    source_system: Mapped[str] = mapped_column(String(32), nullable=False)
    source_id: Mapped[int] = mapped_column(Integer, nullable=False)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    voucher_id: Mapped[int] = mapped_column(ForeignKey("vouchers.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class PhysicalInventorySession(Base):
    __tablename__ = "physical_inventory_sessions"
    __table_args__ = (UniqueConstraint("tenant_id", "session_code", name="uq_physical_inventory_sessions_tenant_code"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False, index=True)
    session_code: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="DRAFT")
    count_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class PhysicalInventoryLine(Base):
    __tablename__ = "physical_inventory_lines"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("physical_inventory_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False)
    expected_qty: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"), server_default="0")
    counted_qty: Mapped[str | None] = mapped_column(String(32), nullable=True)


class DeliveryChallan(Base):
    __tablename__ = "delivery_challans"
    __table_args__ = (UniqueConstraint("tenant_id", "challan_code", name="uq_delivery_challans_tenant_challan_code"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    challan_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    customer_name: Mapped[str] = mapped_column(String(128), nullable=False)
    delivery_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="DRAFT", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    verification_id: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True, index=True)
    signature_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    signed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    signed_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class DeliveryChallanItem(Base):
    __tablename__ = "delivery_challan_items"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    challan_id: Mapped[int] = mapped_column(
        ForeignKey("delivery_challans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True)
    warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"), server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class DeliveryChallanOrder(Base):
    """Many-to-many link: outbound delivery challan ↔ sales orders (pipeline SHIPPED)."""

    __tablename__ = "delivery_challan_orders"
    __table_args__ = (
        UniqueConstraint(
            "delivery_challan_id",
            "order_id",
            name="uq_delivery_challan_orders_challan_order",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    delivery_challan_id: Mapped[int] = mapped_column(
        ForeignKey("delivery_challans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class EnhancedGatePass(Base):
    __tablename__ = "enhanced_gate_passes"
    __table_args__ = (
        UniqueConstraint("tenant_id", "gate_pass_code", name="uq_enhanced_gate_passes_tenant_gate_pass_code"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    gate_pass_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    challan_id: Mapped[int | None] = mapped_column(
        ForeignKey("delivery_challans.id", ondelete="SET NULL"), nullable=True, index=True
    )
    purpose: Mapped[str] = mapped_column(String(128), nullable=False)
    destination: Mapped[str | None] = mapped_column(String(255), nullable=True)
    vehicle_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="DRAFT", index=True)
    guard_acknowledged: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    verification_id: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True, index=True)
    signature_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    signed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    signed_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class ProcessOrder(Base):
    __tablename__ = "process_orders"
    __table_args__ = (
        UniqueConstraint("tenant_id", "process_number", name="uq_process_orders_tenant_process_number"),
        Index("ix_po_btb_lc_id", "btb_lc_id"),
        Index("ix_po_master_contract_id", "master_contract_id"),
        Index("ix_po_output_warehouse_id", "output_warehouse_id"),
        Index("ix_po_prior_process_order_id", "prior_process_order_id"),
        Index("ix_po_source_bom_id", "source_bom_id"),
        Index("ix_po_source_order_id", "source_order_id"),
        Index("ix_po_vendor_id", "vendor_id"),
        Index("ix_process_orders_number", "process_number"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    process_number: Mapped[str] = mapped_column(String(32), nullable=False)
    process_type: Mapped[str] = mapped_column(String(32), nullable=False)
    process_method: Mapped[str] = mapped_column(String(24), nullable=False, default="in_house")
    customer_id: Mapped[int | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    knitting_service_voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    linked_order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    warehouse_id: Mapped[int | None] = mapped_column(ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True)
    input_item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False)
    output_item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False)
    input_quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"), server_default="0")
    expected_output_qty: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"), server_default="0")
    actual_output_qty: Mapped[str | None] = mapped_column(String(32), nullable=True)
    processing_charges: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"), server_default="0")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="DRAFT", index=True)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    process_stage: Mapped[str | None] = mapped_column(String(64), nullable=True)
    prior_process_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("process_orders.id", ondelete="SET NULL"), nullable=True
    )
    vendor_id: Mapped[int | None] = mapped_column(ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True)
    output_warehouse_id: Mapped[int | None] = mapped_column(
        ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True
    )
    source_bom_id: Mapped[int | None] = mapped_column(
        ForeignKey("boms.id", ondelete="SET NULL"), nullable=True
    )
    source_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), nullable=True
    )
    btb_lc_id: Mapped[int | None] = mapped_column(
        ForeignKey("btb_lcs.id", ondelete="SET NULL"), nullable=True
    )
    master_contract_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_contracts.id", ondelete="SET NULL"), nullable=True
    )
    export_case_id: Mapped[int | None] = mapped_column(
        ForeignKey("export_cases.id", ondelete="SET NULL"), nullable=True
    )
    planned_loss_pct: Mapped[str | None] = mapped_column(String(32), nullable=True)
    actual_loss_qty: Mapped[str | None] = mapped_column(String(32), nullable=True)
    output_grade: Mapped[str | None] = mapped_column(String(64), nullable=True)
    output_lot_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    output_same_as_input: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    approval_status: Mapped[str | None] = mapped_column(String(24), nullable=True)
    verification_id: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True, index=True)
    signature_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    signed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    signed_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class ProcessOrderCostLine(Base):
    __tablename__ = "process_order_cost_lines"
    __table_args__ = (
        Index("ix_pocl_po", "process_order_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    process_order_id: Mapped[int] = mapped_column(
        ForeignKey("process_orders.id", ondelete="CASCADE"), nullable=False
    )
    cost_type: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    vendor_id: Mapped[int | None] = mapped_column(ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"), server_default="0")
    currency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)


class ManufacturingOrder(Base):
    __tablename__ = "manufacturing_orders"
    __table_args__ = (
        UniqueConstraint("tenant_id", "mo_number", name="uq_manufacturing_orders_tenant_mo_number"),
        Index("ix_manufacturing_orders_number", "mo_number"),
        Index("ix_manufacturing_orders_tenant_id_id", "tenant_id", "id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    mo_number: Mapped[str] = mapped_column(String(32), nullable=False)
    finished_item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False)
    planned_quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"), server_default="0")
    completed_quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"), server_default="0")
    current_stage: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    migrated_mfg_work_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("mfg_work_orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    legacy_deprecated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class ManufacturingStage(Base):
    __tablename__ = "manufacturing_stages"
    __table_args__ = (
        Index("ix_manufacturing_stages_order_id", "manufacturing_order_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    manufacturing_order_id: Mapped[int] = mapped_column(
        ForeignKey("manufacturing_orders.id", ondelete="CASCADE"), nullable=False
    )
    stage_name: Mapped[str] = mapped_column(String(64), nullable=False)
    stage_order: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending", index=True)
    input_quantity: Mapped[str | None] = mapped_column(String(32), nullable=True)
    output_quantity: Mapped[str | None] = mapped_column(String(32), nullable=True)
    process_loss_percentage: Mapped[str | None] = mapped_column(String(16), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class WarehouseTransfer(Base):
    __tablename__ = "warehouse_transfers"
    __table_args__ = (
        UniqueConstraint("tenant_id", "transfer_code", name="uq_warehouse_transfers_tenant_transfer_code"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    transfer_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    from_warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False, index=True)
    to_warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False, index=True)
    transfer_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="DRAFT", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    verification_id: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True, index=True)
    signature_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    signed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    signed_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class WarehouseTransferLine(Base):
    __tablename__ = "warehouse_transfer_lines"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    transfer_id: Mapped[int] = mapped_column(
        ForeignKey("warehouse_transfers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"), server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class StockAdjustment(Base):
    __tablename__ = "stock_adjustments"
    __table_args__ = (UniqueConstraint("tenant_id", "adjust_code", name="uq_stock_adjustments_tenant_adjust_code"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    adjust_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False, index=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    reason_code: Mapped[str] = mapped_column(String(32), nullable=False, default="OTHER")
    adjustment_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="DRAFT", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class ProductionMaterialIssue(Base):
    __tablename__ = "production_material_issues"
    __table_args__ = (
        UniqueConstraint("tenant_id", "issue_code", name="uq_pmi_tenant_issue_code"),
        Index("ix_pmi_tenant_order", "tenant_id", "order_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    issue_code: Mapped[str] = mapped_column(String(32), nullable=False)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    bom_id: Mapped[int] = mapped_column(ForeignKey("boms.id", ondelete="RESTRICT"), nullable=False)
    production_stage: Mapped[str] = mapped_column(String(64), nullable=False)
    covered_order_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False)
    issue_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="DRAFT")
    approval_status: Mapped[str | None] = mapped_column(String(24), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    approved_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    verification_id: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True, index=True)
    signature_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    signed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    signed_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class ProductionMaterialIssueLine(Base):
    __tablename__ = "production_material_issue_lines"
    __table_args__ = (
        Index("ix_pmil_issue", "issue_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    issue_id: Mapped[int] = mapped_column(
        ForeignKey("production_material_issues.id", ondelete="CASCADE"), nullable=False
    )
    bom_line_id: Mapped[int] = mapped_column(ForeignKey("bom_items.id", ondelete="RESTRICT"), nullable=False)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False)
    standard_qty_for_covered: Mapped[str | None] = mapped_column(String(32), nullable=True)
    planned_wastage_qty: Mapped[str | None] = mapped_column(String(32), nullable=True)
    planned_process_loss_qty: Mapped[str | None] = mapped_column(String(32), nullable=True)
    actual_issue_qty: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"), server_default="0")
    variance_qty: Mapped[str | None] = mapped_column(String(32), nullable=True)
    variance_pct: Mapped[str | None] = mapped_column(String(32), nullable=True)
    variance_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    variance_type: Mapped[str | None] = mapped_column(String(48), nullable=True)
    approval_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    stock_movement_id: Mapped[int | None] = mapped_column(
        ForeignKey("stock_movements.id", ondelete="SET NULL"), nullable=True
    )


class ConsumptionChangeRequest(Base):
    __tablename__ = "consumption_change_requests"
    __table_args__ = (
        Index("ix_consumption_cr_order_id", "order_id"),
        Index("ix_consumption_cr_status", "status"),
        Index("ix_consumption_cr_tenant_id", "tenant_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    change_type: Mapped[str] = mapped_column(String(64), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    items_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="PENDING")
    requested_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


# --- Sprint I1: MRP / reorder / IDT / process loss ---


class PlannedOrder(Base):
    __tablename__ = "planned_orders"
    __table_args__ = (
        UniqueConstraint("tenant_id", "planned_order_number", name="uq_planned_orders_tenant_number"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    planned_order_number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(String(16), nullable=False)
    source_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source_bom_id: Mapped[int | None] = mapped_column(
        ForeignKey("boms.id", ondelete="SET NULL"), nullable=True
    )
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True)
    required_qty: Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False)
    planned_qty: Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False)
    requirement_date: Mapped[date] = mapped_column(Date, nullable=False)
    release_date: Mapped[date] = mapped_column(Date, nullable=False)
    action: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="PLANNED", index=True)
    generated_po_id: Mapped[int | None] = mapped_column(
        ForeignKey("purchase_orders.id", ondelete="SET NULL"), nullable=True
    , index=True)
    generated_mo_id: Mapped[int | None] = mapped_column(
        ForeignKey("manufacturing_orders.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class ReorderSuggestion(Base):
    __tablename__ = "reorder_suggestions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True)
    warehouse_id: Mapped[int | None] = mapped_column(
        ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True, index=True
    )
    current_stock: Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False)
    reorder_level: Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False)
    suggested_qty: Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False)
    preferred_vendor_id: Mapped[int | None] = mapped_column(
        ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True
    )
    estimated_cost: Mapped[Decimal | None] = mapped_column(Numeric(15, 4), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING", index=True)
    generated_po_id: Mapped[int | None] = mapped_column(
        ForeignKey("purchase_orders.id", ondelete="SET NULL"), nullable=True
    , index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class InterDepartmentTransfer(Base):
    __tablename__ = "inter_department_transfers"
    __table_args__ = (
        UniqueConstraint("tenant_id", "idt_number", name="uq_idt_tenant_number"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    idt_number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    idt_date: Mapped[date] = mapped_column(Date, nullable=False)
    from_warehouse_id: Mapped[int] = mapped_column(
        ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False
    )
    to_warehouse_id: Mapped[int] = mapped_column(
        ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False
    )
    process_name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    source_item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False)
    source_qty_issued: Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False)
    source_qty_unit: Mapped[str] = mapped_column(String(16), nullable=False)
    source_batch_id: Mapped[int | None] = mapped_column(
        ForeignKey("stock_batches.id", ondelete="SET NULL"), nullable=True
    )
    target_item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False)
    target_qty_expected: Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False)
    target_qty_received: Mapped[Decimal | None] = mapped_column(Numeric(15, 4), nullable=True)
    target_qty_unit: Mapped[str] = mapped_column(String(16), nullable=False)
    process_loss_qty: Mapped[Decimal | None] = mapped_column(Numeric(15, 4), nullable=True)
    process_loss_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    standard_process_loss_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    loss_exception: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_job_work: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    job_work_vendor_id: Mapped[int | None] = mapped_column(
        ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True
    )
    job_work_cost_per_unit: Mapped[Decimal | None] = mapped_column(Numeric(15, 4), nullable=True)
    job_work_total_cost: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True)
    transport_cost: Mapped[Decimal] = mapped_column(
        Numeric(15, 4), nullable=False, default=Decimal("0"), server_default="0"
    )
    other_charges: Mapped[Decimal] = mapped_column(
        Numeric(15, 4), nullable=False, default=Decimal("0"), server_default="0"
    )
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="ISSUED", index=True)
    source_item_cost: Mapped[Decimal | None] = mapped_column(Numeric(15, 4), nullable=True)
    target_item_value: Mapped[Decimal | None] = mapped_column(Numeric(15, 4), nullable=True)
    source_voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True
    , index=True)
    target_voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True
    , index=True)
    linked_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    narration: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )


class InterDepartmentTransferLine(Base):
    __tablename__ = "inter_department_transfer_lines"
    __table_args__ = (
        Index("ix_idt_lines_idt_id", "idt_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    idt_id: Mapped[int] = mapped_column(
        ForeignKey("inter_department_transfers.id", ondelete="CASCADE"), nullable=False
    )
    source_item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False)
    source_qty: Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False)
    source_batch_id: Mapped[int | None] = mapped_column(
        ForeignKey("stock_batches.id", ondelete="SET NULL"), nullable=True
    )
    source_unit_cost: Mapped[Decimal | None] = mapped_column(Numeric(15, 4), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class ProcessLossStandard(Base):
    __tablename__ = "process_loss_standards"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "process_name",
            "item_category_id",
            name="uq_process_loss_standards_tenant_process_cat",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    process_name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    standard_loss_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    warning_threshold_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("5.00"), server_default="5.00"
    )
    item_category_id: Mapped[int | None] = mapped_column(
        ForeignKey("item_categories.id", ondelete="SET NULL"), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class GrnQualityInspection(Base):
    """Inbound QC for a GRN line (Sprint I2)."""

    __tablename__ = "grn_quality_inspections"
    __table_args__ = (
        UniqueConstraint("tenant_id", "grn_item_id", name="uq_grn_qc_tenant_grn_item"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    grn_id: Mapped[int] = mapped_column(
        ForeignKey("goods_receiving.id", ondelete="CASCADE"), nullable=False, index=True
    )
    grn_item_id: Mapped[int] = mapped_column(
        ForeignKey("goods_receiving_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    inspection_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    inspected_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    received_qty: Mapped[Decimal] = mapped_column(
        Numeric(18, 4), nullable=False, default=Decimal("0"), server_default="0"
    )
    accepted_qty: Mapped[Decimal] = mapped_column(
        Numeric(18, 4), nullable=False, default=Decimal("0"), server_default="0"
    )
    rejected_qty: Mapped[Decimal] = mapped_column(
        Numeric(18, 4), nullable=False, default=Decimal("0"), server_default="0"
    )
    hold_qty: Mapped[Decimal] = mapped_column(
        Numeric(18, 4), nullable=False, default=Decimal("0"), server_default="0"
    )
    parameters: Mapped[dict | None] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), nullable=True
    )
    result: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    photos: Mapped[list | dict | None] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), nullable=True
    )
    target_warehouse_id: Mapped[int | None] = mapped_column(
        ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True
    )
    quarantine_warehouse_id: Mapped[int | None] = mapped_column(
        ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True
    )
    rejected_warehouse_id: Mapped[int | None] = mapped_column(
        ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True
    )
    debit_note_suggested: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class CycleCountTask(Base):
    """Scheduled / completed cycle count for an item at a warehouse (Sprint I3)."""

    __tablename__ = "cycle_count_tasks"
    __table_args__ = (
        Index("ix_cycle_count_tasks_tenant_date_status", "tenant_id", "scheduled_date", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id: Mapped[int] = mapped_column(
        ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    scheduled_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="SCHEDULED", index=True)
    system_qty: Mapped[Decimal] = mapped_column(
        Numeric(18, 4), nullable=False, default=Decimal("0"), server_default="0"
    )
    counted_qty: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    variance_qty: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    variance_value: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    abc_class: Mapped[str | None] = mapped_column(String(1), nullable=True)
    adjustment_suggested: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    counted_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    counted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class StockSerial(Base):
    """Individual serial-number unit tracking (Sprint I4)."""

    __tablename__ = "stock_serials"
    __table_args__ = (UniqueConstraint("tenant_id", "serial_number", name="uq_stock_serials_tenant_serial"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="CASCADE"), nullable=False, index=True)
    serial_number: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="IN_STOCK", index=True)
    warehouse_id: Mapped[int | None] = mapped_column(
        ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True, index=True
    )
    grn_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("goods_receiving_items.id", ondelete="SET NULL"), nullable=True
    , index=True)
    dc_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("delivery_challan_items.id", ondelete="SET NULL"), nullable=True
    )
    warranty_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    warranty_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class ItemKit(Base):
    """Sales kit / bundle header (Sprint I4)."""

    __tablename__ = "item_kits"
    __table_args__ = (UniqueConstraint("tenant_id", "kit_code", name="uq_item_kits_tenant_code"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    kit_code: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    kit_price: Mapped[Decimal] = mapped_column(
        Numeric(18, 4), nullable=False, default=Decimal("0"), server_default="0"
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class ItemKitComponent(Base):
    """Component line of a sales kit (Sprint I4)."""

    __tablename__ = "item_kit_components"
    __table_args__ = (UniqueConstraint("kit_id", "item_id", name="uq_item_kit_components_kit_item"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    kit_id: Mapped[int] = mapped_column(ForeignKey("item_kits.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True)
    quantity: Mapped[Decimal] = mapped_column(
        Numeric(18, 4), nullable=False, default=Decimal("1"), server_default="1"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class ConsignmentStock(Base):
    """Vendor-owned consignment inventory at our warehouse (Sprint I4)."""

    __tablename__ = "consignment_stocks"
    __table_args__ = (
        Index("ix_consignment_stocks_tenant_vendor_item", "tenant_id", "vendor_id", "item_id", "warehouse_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id", ondelete="RESTRICT"), nullable=False, index=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True)
    warehouse_id: Mapped[int] = mapped_column(
        ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    consigned_qty: Mapped[Decimal] = mapped_column(
        Numeric(18, 4), nullable=False, default=Decimal("0"), server_default="0"
    )
    consumed_qty: Mapped[Decimal] = mapped_column(
        Numeric(18, 4), nullable=False, default=Decimal("0"), server_default="0"
    )
    remaining_qty: Mapped[Decimal] = mapped_column(
        Numeric(18, 4), nullable=False, default=Decimal("0"), server_default="0"
    )
    billed_qty: Mapped[Decimal] = mapped_column(
        Numeric(18, 4), nullable=False, default=Decimal("0"), server_default="0"
    )
    is_billed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    agreement_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    settlement_terms_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    unit_cost: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_settled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
