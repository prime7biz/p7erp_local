"""Material Control Phase 2B+ models: layer allocation, UD events, leftover, RTV, bond, claims."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
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


class MaterialLayerAllocation(Base):
    """FIFO cost-layer quantity reserved to an order/style (shared stock allocation)."""

    __tablename__ = "material_layer_allocations"
    __table_args__ = (
        Index("ix_mla_tenant_order", "tenant_id", "order_id"),
        Index("ix_mla_tenant_layer", "tenant_id", "cost_layer_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    cost_layer_id: Mapped[int] = mapped_column(
        ForeignKey("inventory_cost_layers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True)
    warehouse_id: Mapped[int] = mapped_column(
        ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    style_id: Mapped[int | None] = mapped_column(
        ForeignKey("garment_styles.id", ondelete="SET NULL"), nullable=True
    )
    colorway_id: Mapped[int | None] = mapped_column(
        ForeignKey("style_colorways.id", ondelete="SET NULL"), nullable=True
    )
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    qty_allocated: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    qty_consumed: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    qty_released: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="ACTIVE")
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class UdMaterialUtilizationEvent(Base):
    """Append-only UD material utilization ledger (no updates/deletes in service)."""

    __tablename__ = "ud_material_utilization_events"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "source_document_type",
            "source_document_id",
            "source_line_id",
            "source_stage_key",
            "event_kind",
            name="uq_ud_mat_util_source_event",
        ),
        Index("ix_ud_mat_util_tenant_entitlement", "tenant_id", "ud_entitlement_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    ud_entitlement_id: Mapped[int | None] = mapped_column(
        ForeignKey("bd_ud_entitlements.id", ondelete="SET NULL"), nullable=True
    )
    master_contract_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_contracts.id", ondelete="SET NULL"), nullable=True
    )
    btb_lc_id: Mapped[int | None] = mapped_column(ForeignKey("btb_lcs.id", ondelete="SET NULL"), nullable=True)
    purchase_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("purchase_orders.id", ondelete="SET NULL"), nullable=True
    )
    style_id: Mapped[int | None] = mapped_column(
        ForeignKey("garment_styles.id", ondelete="SET NULL"), nullable=True
    )
    colorway_id: Mapped[int | None] = mapped_column(
        ForeignKey("style_colorways.id", ondelete="SET NULL"), nullable=True
    )
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    source_document_type: Mapped[str] = mapped_column(String(64), nullable=False)
    source_document_id: Mapped[int] = mapped_column(Integer, nullable=False)
    source_line_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_stage_key: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    event_kind: Mapped[str] = mapped_column(String(32), nullable=False)
    qty_normalized: Mapped[str] = mapped_column(String(32), nullable=False)
    factor_snapshot: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reversal_of_event_id: Mapped[int | None] = mapped_column(
        ForeignKey("ud_material_utilization_events.id", ondelete="SET NULL"), nullable=True
    )
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class MaterialLeftoverReturn(Base):
    """Bought leftover returned to store (same item) with optional FIFO layer + voucher links."""

    __tablename__ = "material_leftover_returns"
    __table_args__ = (
        Index("ix_mlr_tenant_order", "tenant_id", "order_id"),
        Index("ix_mlr_tenant_request", "tenant_id", "request_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    style_id: Mapped[int | None] = mapped_column(
        ForeignKey("garment_styles.id", ondelete="SET NULL"), nullable=True
    )
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False, index=True)
    warehouse_id: Mapped[int] = mapped_column(
        ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    qty: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    cost_layer_id: Mapped[int | None] = mapped_column(
        ForeignKey("inventory_cost_layers.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="DRAFT")
    stock_movement_id: Mapped[int | None] = mapped_column(
        ForeignKey("stock_movements.id", ondelete="SET NULL"), nullable=True
    )
    voucher_id: Mapped[int | None] = mapped_column(ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class JobWorkBondTransfer(Base):
    """Qty-only bonded material transfer for inbound job work (never BondedWarehouseEntry / FIFO / GL)."""

    __tablename__ = "job_work_bond_transfers"
    __table_args__ = (UniqueConstraint("tenant_id", "transfer_no", name="uq_jw_bond_transfer_no"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    transfer_no: Mapped[str] = mapped_column(String(32), nullable=False)
    contract_id: Mapped[int] = mapped_column(
        ForeignKey("job_work_contracts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="DRAFT")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class JobWorkBondTransferLine(Base):
    __tablename__ = "job_work_bond_transfer_lines"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    transfer_id: Mapped[int] = mapped_column(
        ForeignKey("job_work_bond_transfers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    material_id: Mapped[int] = mapped_column(
        ForeignKey("job_work_materials.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False)
    qty: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class PrincipalMaterialClaim(Base):
    """Payable claim to principal factory customer for defective/customer materials."""

    __tablename__ = "principal_material_claims"
    __table_args__ = (UniqueConstraint("tenant_id", "claim_no", name="uq_principal_mat_claim_no"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    claim_no: Mapped[str] = mapped_column(String(32), nullable=False)
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    contract_id: Mapped[int | None] = mapped_column(
        ForeignKey("job_work_contracts.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="OPEN")
    amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="BDT")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    voucher_id: Mapped[int | None] = mapped_column(ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class PrincipalMaterialClaimSettlement(Base):
    __tablename__ = "principal_material_claim_settlements"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    claim_id: Mapped[int] = mapped_column(
        ForeignKey("principal_material_claims.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event_kind: Mapped[str] = mapped_column(String(24), nullable=False, default="SETTLE")
    amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    voucher_id: Mapped[int | None] = mapped_column(ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class MaterialRtvDocument(Base):
    """Vendor return / exchange (RTV) for bought material."""

    __tablename__ = "material_rtv_documents"
    __table_args__ = (UniqueConstraint("tenant_id", "rtv_no", name="uq_material_rtv_no"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    rtv_no: Mapped[str] = mapped_column(String(32), nullable=False)
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id", ondelete="RESTRICT"), nullable=False, index=True)
    warehouse_id: Mapped[int] = mapped_column(
        ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="DRAFT")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    voucher_id: Mapped[int | None] = mapped_column(ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True)
    stock_movement_id: Mapped[int | None] = mapped_column(
        ForeignKey("stock_movements.id", ondelete="SET NULL"), nullable=True
    )
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class MaterialRtvLine(Base):
    __tablename__ = "material_rtv_lines"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    rtv_id: Mapped[int] = mapped_column(
        ForeignKey("material_rtv_documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False)
    qty: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    unit_cost: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class MaterialRoll(Base):
    """Phase 7 lite: fabric roll / shade / width tracker (flag material_budget_plan_v1)."""

    __tablename__ = "material_rolls"
    __table_args__ = (
        UniqueConstraint("tenant_id", "roll_code", name="uq_material_roll_code"),
        Index("ix_mroll_item_wh", "tenant_id", "item_id", "warehouse_id"),
        Index("ix_mroll_shade", "tenant_id", "shade_band"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    roll_code: Mapped[str] = mapped_column(String(64), nullable=False)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False)
    warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False)
    grn_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("goods_receiving_items.id", ondelete="SET NULL"), nullable=True
    )
    cost_layer_id: Mapped[int | None] = mapped_column(
        ForeignKey("inventory_cost_layers.id", ondelete="SET NULL"), nullable=True
    )
    style_id: Mapped[int | None] = mapped_column(ForeignKey("garment_styles.id", ondelete="SET NULL"), nullable=True)
    colorway_id: Mapped[int | None] = mapped_column(
        ForeignKey("style_colorways.id", ondelete="SET NULL"), nullable=True
    )
    lot_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    shade_band: Mapped[str | None] = mapped_column(String(32), nullable=True)
    width_cm: Mapped[str | None] = mapped_column(String(16), nullable=True)
    qty: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    qty_remaining: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="AVAILABLE")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class MaterialLandedCostDoc(Base):
    """Phase 7 lite: freight/duty allocation onto GRN FIFO layers (flag material_landed_cost_v1)."""

    __tablename__ = "material_landed_cost_docs"
    __table_args__ = (
        UniqueConstraint("tenant_id", "doc_no", name="uq_mlcd_doc_no"),
        Index("ix_mlcd_grn", "tenant_id", "goods_receiving_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    doc_no: Mapped[str] = mapped_column(String(32), nullable=False)
    goods_receiving_id: Mapped[int] = mapped_column(
        ForeignKey("goods_receiving.id", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="DRAFT")
    total_amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="BDT")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    voucher_id: Mapped[int | None] = mapped_column(ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class MaterialLandedCostLine(Base):
    __tablename__ = "material_landed_cost_lines"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    doc_id: Mapped[int] = mapped_column(
        ForeignKey("material_landed_cost_docs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    cost_kind: Mapped[str] = mapped_column(String(32), nullable=False, default="FREIGHT")
    amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
