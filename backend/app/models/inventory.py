from __future__ import annotations

from datetime import datetime, date

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Warehouse(Base):
    __tablename__ = "warehouses"
    __table_args__ = (UniqueConstraint("tenant_id", "warehouse_code", name="uq_warehouses_tenant_warehouse_code"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
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
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class Vendor(Base):
    __tablename__ = "vendors"
    __table_args__ = (UniqueConstraint("tenant_id", "vendor_code", name="uq_vendors_tenant_vendor_code"),)

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
    vendor_type: Mapped[str | None] = mapped_column(String(16), nullable=True)  # local | foreign
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
    __table_args__ = (UniqueConstraint("tenant_id", "po_code", name="uq_purchase_orders_tenant_po_code"),)

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

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    purchase_order_id: Mapped[int] = mapped_column(
        ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True)
    warehouse_id: Mapped[int | None] = mapped_column(ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True, index=True)
    quantity: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    unit_price: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    source_bom_id: Mapped[int | None] = mapped_column(
        ForeignKey("boms.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source_bom_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("bom_items.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source_quotation_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("quotation_materials.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class GoodsReceiving(Base):
    __tablename__ = "goods_receiving"
    __table_args__ = (UniqueConstraint("tenant_id", "grn_code", name="uq_goods_receiving_tenant_grn_code"),)

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
    vendor_id: Mapped[int | None] = mapped_column(ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True, index=True)
    default_warehouse_id: Mapped[int | None] = mapped_column(
        ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source_type: Mapped[str | None] = mapped_column(String(16), nullable=True)  # PO | NON_PO
    approval_status: Mapped[str | None] = mapped_column(String(24), nullable=True)
    supplier_delivery_challan_no: Mapped[str | None] = mapped_column(String(128), nullable=True)
    supplier_invoice_no: Mapped[str | None] = mapped_column(String(128), nullable=True)
    vehicle_info: Mapped[str | None] = mapped_column(String(255), nullable=True)
    non_po_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    approved_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    acknowledgement_issued: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    acknowledgement_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    acknowledged_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source_bom_id: Mapped[int | None] = mapped_column(
        ForeignKey("boms.id", ondelete="SET NULL"), nullable=True, index=True
    )
    btb_lc_id: Mapped[int | None] = mapped_column(
        ForeignKey("btb_lcs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    master_contract_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_contracts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    export_case_id: Mapped[int | None] = mapped_column(
        ForeignKey("export_cases.id", ondelete="SET NULL"), nullable=True, index=True
    )
    verification_id: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True, index=True)
    signature_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    signed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class GoodsReceivingItem(Base):
    __tablename__ = "goods_receiving_items"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    goods_receiving_id: Mapped[int] = mapped_column(
        ForeignKey("goods_receiving.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True)
    warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False, index=True)
    quantity: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    lot_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    purchase_order_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("purchase_order_items.id", ondelete="SET NULL"), nullable=True, index=True
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
        ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source_bom_id: Mapped[int | None] = mapped_column(
        ForeignKey("boms.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source_bom_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("bom_items.id", ondelete="SET NULL"), nullable=True, index=True
    )
    master_contract_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_contracts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    export_case_id: Mapped[int | None] = mapped_column(
        ForeignKey("export_cases.id", ondelete="SET NULL"), nullable=True, index=True
    )
    btb_lc_id: Mapped[int | None] = mapped_column(
        ForeignKey("btb_lcs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    vendor_id: Mapped[int | None] = mapped_column(ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True, index=True)
    line_remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class GoodsReceivingAcknowledgement(Base):
    __tablename__ = "goods_receiving_acknowledgements"
    __table_args__ = (UniqueConstraint("tenant_id", "gra_code", name="uq_gra_tenant_code"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    goods_receiving_id: Mapped[int] = mapped_column(
        ForeignKey("goods_receiving.id", ondelete="CASCADE"), nullable=False, index=True
    )
    gra_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    issue_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="ISSUED")
    issued_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class StockReservation(Base):
    """Soft/hard quantity holds against inventory for orders/BOM planning (ATP)."""

    __tablename__ = "stock_reservations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True)
    warehouse_id: Mapped[int | None] = mapped_column(
        ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True, index=True
    )
    order_id: Mapped[int | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    bom_id: Mapped[int | None] = mapped_column(ForeignKey("boms.id", ondelete="SET NULL"), nullable=True, index=True)
    reserved_qty: Mapped[float] = mapped_column(Numeric(18, 4), nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="HARD", index=True)  # SOFT|HARD|RELEASED
    reserved_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    released_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class StockMovement(Base):
    __tablename__ = "stock_movements"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True)
    warehouse_id: Mapped[int | None] = mapped_column(ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True, index=True)
    movement_type: Mapped[str] = mapped_column(String(16), nullable=False, index=True)  # IN|OUT|ADJUST
    quantity: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    reference_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    reference_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    movement_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    lot_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    unit_cost: Mapped[str | None] = mapped_column(String(32), nullable=True)
    movement_value: Mapped[str | None] = mapped_column(String(32), nullable=True)
    movement_kind: Mapped[str | None] = mapped_column(String(48), nullable=True, index=True)
    source_line_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    bom_id: Mapped[int | None] = mapped_column(ForeignKey("boms.id", ondelete="SET NULL"), nullable=True, index=True)
    bom_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("bom_items.id", ondelete="SET NULL"), nullable=True, index=True
    )
    purchase_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("purchase_orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    purchase_order_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("purchase_order_items.id", ondelete="SET NULL"), nullable=True, index=True
    )
    goods_receiving_id: Mapped[int | None] = mapped_column(
        ForeignKey("goods_receiving.id", ondelete="SET NULL"), nullable=True, index=True
    )
    goods_receiving_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("goods_receiving_items.id", ondelete="SET NULL"), nullable=True, index=True
    )
    process_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("process_orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    vendor_id: Mapped[int | None] = mapped_column(ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True, index=True)
    master_contract_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_contracts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    btb_lc_id: Mapped[int | None] = mapped_column(
        ForeignKey("btb_lcs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    export_case_id: Mapped[int | None] = mapped_column(
        ForeignKey("export_cases.id", ondelete="SET NULL"), nullable=True, index=True
    )
    production_material_issue_id: Mapped[int | None] = mapped_column(
        ForeignKey("production_material_issues.id", ondelete="SET NULL"), nullable=True, index=True
    )


class InventoryCostLayer(Base):
    """FIFO cost layer: one row per inbound stock_movements.id (IN)."""
    __tablename__ = "inventory_cost_layers"
    __table_args__ = (UniqueConstraint("source_movement_id", name="uq_inventory_cost_layers_source_movement_id"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id: Mapped[int | None] = mapped_column(ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True, index=True)
    source_movement_id: Mapped[int] = mapped_column(
        ForeignKey("stock_movements.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    qty_original: Mapped[str] = mapped_column(String(32), nullable=False)
    qty_remaining: Mapped[str] = mapped_column(String(32), nullable=False)
    unit_cost: Mapped[str] = mapped_column(String(32), nullable=False)
    layer_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


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
    session_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="DRAFT", index=True)
    count_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class PhysicalInventoryLine(Base):
    __tablename__ = "physical_inventory_lines"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("physical_inventory_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True)
    expected_qty: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
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
    warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False, index=True)
    quantity: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
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
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class ProcessOrder(Base):
    __tablename__ = "process_orders"
    __table_args__ = (
        UniqueConstraint("tenant_id", "process_number", name="uq_process_orders_tenant_process_number"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    process_number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    process_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    process_method: Mapped[str] = mapped_column(String(24), nullable=False, default="in_house")
    customer_id: Mapped[int | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    knitting_service_voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    linked_order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    warehouse_id: Mapped[int | None] = mapped_column(ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True, index=True)
    input_item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True)
    output_item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True)
    input_quantity: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    expected_output_qty: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    actual_output_qty: Mapped[str | None] = mapped_column(String(32), nullable=True)
    processing_charges: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="DRAFT", index=True)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    process_stage: Mapped[str | None] = mapped_column(String(64), nullable=True)
    prior_process_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("process_orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    vendor_id: Mapped[int | None] = mapped_column(ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True, index=True)
    output_warehouse_id: Mapped[int | None] = mapped_column(
        ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source_bom_id: Mapped[int | None] = mapped_column(
        ForeignKey("boms.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    btb_lc_id: Mapped[int | None] = mapped_column(
        ForeignKey("btb_lcs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    master_contract_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_contracts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    export_case_id: Mapped[int | None] = mapped_column(
        ForeignKey("export_cases.id", ondelete="SET NULL"), nullable=True, index=True
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
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class ProcessOrderCostLine(Base):
    __tablename__ = "process_order_cost_lines"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    process_order_id: Mapped[int] = mapped_column(
        ForeignKey("process_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    cost_type: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    vendor_id: Mapped[int | None] = mapped_column(ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True, index=True)
    amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    currency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)


class ManufacturingOrder(Base):
    __tablename__ = "manufacturing_orders"
    __table_args__ = (UniqueConstraint("tenant_id", "mo_number", name="uq_manufacturing_orders_tenant_mo_number"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    mo_number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    finished_item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True)
    planned_quantity: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    completed_quantity: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
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

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    manufacturing_order_id: Mapped[int] = mapped_column(
        ForeignKey("manufacturing_orders.id", ondelete="CASCADE"), nullable=False, index=True
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
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True)
    quantity: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class StockAdjustment(Base):
    __tablename__ = "stock_adjustments"
    __table_args__ = (UniqueConstraint("tenant_id", "adjust_code", name="uq_stock_adjustments_tenant_adjust_code"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    adjust_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False, index=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True)
    quantity: Mapped[str] = mapped_column(String(32), nullable=False)
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
    __table_args__ = (UniqueConstraint("tenant_id", "issue_code", name="uq_pmi_tenant_issue_code"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    issue_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    bom_id: Mapped[int] = mapped_column(ForeignKey("boms.id", ondelete="RESTRICT"), nullable=False, index=True)
    production_stage: Mapped[str] = mapped_column(String(64), nullable=False)
    covered_order_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False, index=True)
    issue_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="DRAFT", index=True)
    approval_status: Mapped[str | None] = mapped_column(String(24), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    approved_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    verification_id: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True, index=True)
    signature_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    signed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class ProductionMaterialIssueLine(Base):
    __tablename__ = "production_material_issue_lines"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    issue_id: Mapped[int] = mapped_column(
        ForeignKey("production_material_issues.id", ondelete="CASCADE"), nullable=False, index=True
    )
    bom_line_id: Mapped[int] = mapped_column(ForeignKey("bom_items.id", ondelete="RESTRICT"), nullable=False, index=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True)
    standard_qty_for_covered: Mapped[str | None] = mapped_column(String(32), nullable=True)
    planned_wastage_qty: Mapped[str | None] = mapped_column(String(32), nullable=True)
    planned_process_loss_qty: Mapped[str | None] = mapped_column(String(32), nullable=True)
    actual_issue_qty: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    variance_qty: Mapped[str | None] = mapped_column(String(32), nullable=True)
    variance_pct: Mapped[str | None] = mapped_column(String(32), nullable=True)
    variance_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    variance_type: Mapped[str | None] = mapped_column(String(48), nullable=True)
    approval_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    stock_movement_id: Mapped[int | None] = mapped_column(
        ForeignKey("stock_movements.id", ondelete="SET NULL"), nullable=True, index=True
    )


class ConsumptionChangeRequest(Base):
    __tablename__ = "consumption_change_requests"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    change_type: Mapped[str] = mapped_column(String(64), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    items_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="PENDING", index=True)
    requested_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
