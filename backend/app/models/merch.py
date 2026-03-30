from __future__ import annotations

from datetime import datetime, date

from sqlalchemy import (
    JSON,
    String,
    Text,
    Date,
    DateTime,
    Integer,
    Boolean,
    Numeric,
    ForeignKey,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Inquiry(Base):
    __tablename__ = "inquiries"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    inquiry_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    style_ref: Mapped[str | None] = mapped_column(String(128), nullable=True)
    style_id: Mapped[int | None] = mapped_column(
        ForeignKey("garment_styles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    customer_intermediary_id: Mapped[int | None] = mapped_column(
        ForeignKey("customer_intermediaries.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    season: Mapped[str | None] = mapped_column(String(64), nullable=True)
    department: Mapped[str | None] = mapped_column(String(64), nullable=True)
    quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    target_price: Mapped[str | None] = mapped_column(String(32), nullable=True)
    target_price_currency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(8), nullable=True)
    exchange_rate: Mapped[str | None] = mapped_column(String(32), nullable=True)
    expected_delivery_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    shipping_term: Mapped[str | None] = mapped_column(String(64), nullable=True)
    commission_mode: Mapped[str | None] = mapped_column(String(32), nullable=True)
    commission_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    commission_value: Mapped[float | None] = mapped_column(Numeric(12, 4), nullable=True)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="DRAFT", index=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class InquiryItem(Base):
    __tablename__ = "inquiry_items"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    inquiry_id: Mapped[int] = mapped_column(
        ForeignKey("inquiries.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )


class Quotation(Base):
    __tablename__ = "quotations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    inquiry_id: Mapped[int | None] = mapped_column(
        ForeignKey("inquiries.id", ondelete="SET NULL"), nullable=True, index=True
    )
    quotation_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    style_ref: Mapped[str | None] = mapped_column(String(128), nullable=True)
    style_id: Mapped[int | None] = mapped_column(
        ForeignKey("garment_styles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    customer_intermediary_id: Mapped[int | None] = mapped_column(
        ForeignKey("customer_intermediaries.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    department: Mapped[str | None] = mapped_column(String(100), nullable=True)
    projected_quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    projected_delivery_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    quotation_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    target_price: Mapped[str | None] = mapped_column(String(32), nullable=True)
    target_price_currency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    exchange_rate: Mapped[str | None] = mapped_column(String(32), nullable=True)
    material_cost: Mapped[str | None] = mapped_column(String(32), nullable=True)
    manufacturing_cost: Mapped[str | None] = mapped_column(String(32), nullable=True)
    other_cost: Mapped[str | None] = mapped_column(String(32), nullable=True)
    total_cost: Mapped[str | None] = mapped_column(String(32), nullable=True)
    cost_per_piece: Mapped[str | None] = mapped_column(String(32), nullable=True)
    profit_percentage: Mapped[str | None] = mapped_column(String(32), nullable=True)
    quoted_price: Mapped[str | None] = mapped_column(String(32), nullable=True)
    shipping_term: Mapped[str | None] = mapped_column(String(64), nullable=True)
    commission_mode: Mapped[str | None] = mapped_column(String(32), nullable=True)
    commission_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    commission_value: Mapped[float | None] = mapped_column(Numeric(12, 4), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(8), nullable=True)
    total_amount: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="DRAFT", index=True
    )
    version_no: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    valid_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    size_ratio_enabled: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    pack_ratio: Mapped[str | None] = mapped_column(String(50), nullable=True)
    pcs_per_carton: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    quotation_id: Mapped[int | None] = mapped_column(
        ForeignKey("quotations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    customer_intermediary_id: Mapped[int | None] = mapped_column(
        ForeignKey("customer_intermediaries.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    order_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    style_ref: Mapped[str | None] = mapped_column(String(128), nullable=True)
    shipping_term: Mapped[str | None] = mapped_column(String(64), nullable=True)
    commission_mode: Mapped[str | None] = mapped_column(String(32), nullable=True)
    commission_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    commission_value: Mapped[float | None] = mapped_column(Numeric(12, 4), nullable=True)
    order_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    delivery_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="DRAFT", index=True
    )
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Frozen quotation commercial header values at order conversion (audit / alignment; not auto-synced).
    commercial_snapshot_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class GarmentStyle(Base):
    __tablename__ = "garment_styles"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    style_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    buyer_customer_id: Mapped[int | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    season: Mapped[str | None] = mapped_column(String(64), nullable=True)
    department: Mapped[str | None] = mapped_column(String(64), nullable=True)
    product_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    fabric_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    gsm: Mapped[str | None] = mapped_column(String(32), nullable=True)
    fit_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    wash_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    brand: Mapped[str | None] = mapped_column(String(100), nullable=True)
    buyer_style_ref: Mapped[str | None] = mapped_column(String(128), nullable=True)
    hs_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    uom: Mapped[str | None] = mapped_column(String(16), nullable=True)
    target_fob: Mapped[str | None] = mapped_column(String(32), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(8), nullable=True)
    sample_lead_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    production_lead_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active_for_new_orders: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    lifecycle_stage: Mapped[str] = mapped_column(String(32), nullable=False, default="INQUIRY", index=True)
    priority: Mapped[str | None] = mapped_column(String(16), nullable=True)
    risk_level: Mapped[str | None] = mapped_column(String(16), nullable=True)
    style_image_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="ACTIVE", index=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class Bom(Base):
    __tablename__ = "boms"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    style_id: Mapped[int] = mapped_column(
        ForeignKey("garment_styles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version_no: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="DRAFT", index=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class BomItem(Base):
    __tablename__ = "bom_items"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    bom_id: Mapped[int] = mapped_column(
        ForeignKey("boms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_id: Mapped[int | None] = mapped_column(
        ForeignKey("items.id", ondelete="SET NULL"), nullable=True, index=True
    )
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    item_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    uom: Mapped[str | None] = mapped_column(String(32), nullable=True)
    base_consumption: Mapped[str] = mapped_column(String(32), nullable=False)
    wastage_pct: Mapped[str | None] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )


class ConsumptionPlan(Base):
    __tablename__ = "consumption_plans"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="PLANNED", index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class ConsumptionPlanItem(Base):
    __tablename__ = "consumption_plan_items"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    plan_id: Mapped[int] = mapped_column(
        ForeignKey("consumption_plans.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    item_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    required_qty: Mapped[str] = mapped_column(String(32), nullable=False)
    uom: Mapped[str | None] = mapped_column(String(32), nullable=True)


class Followup(Base):
    __tablename__ = "order_followups"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="OPEN", index=True
    )
    severity: Mapped[str | None] = mapped_column(String(16), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


# ---------- TNA / Advanced Order Follow-up: templates and action lines ----------


class FollowupActionTemplate(Base):
    """Reusable TNA action template: phase, action type, default offset from delivery, for generating order follow-up plans."""
    __tablename__ = "followup_action_templates"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    phase: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    action_group: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sequence_no: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    default_days_before_delivery: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_mandatory: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    buyer_id: Mapped[int | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class OrderFollowupAction(Base):
    """TNA action line per order: planned/actual submission/approval/rejection/resubmission tracking."""
    __tablename__ = "order_followup_actions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    template_id: Mapped[int | None] = mapped_column(
        ForeignKey("followup_action_templates.id", ondelete="SET NULL"), nullable=True, index=True
    )
    sequence_no: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    phase: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    action_group: Mapped[str | None] = mapped_column(String(64), nullable=True)
    action_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_template_generated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_mandatory: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    assigned_to_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    planned_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    actual_submission_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    approval_received_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    actual_completion_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    resubmission_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="pending", index=True
    )
    approval_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    is_rejected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    delay_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    severity: Mapped[str | None] = mapped_column(String(16), nullable=True)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    milestone_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    external_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class FollowupActionComment(Base):
    """Inline comments on a TNA follow-up action."""
    __tablename__ = "followup_action_comments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    action_id: Mapped[int] = mapped_column(
        ForeignKey("order_followup_actions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    comment_text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )


class FollowupActionRejectionLog(Base):
    """History of rejections/resubmissions per TNA follow-up action (multiple cycles)."""
    __tablename__ = "followup_action_rejection_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    action_id: Mapped[int] = mapped_column(
        ForeignKey("order_followup_actions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    rejected_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    resubmission_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )


class StyleComponent(Base):
    __tablename__ = "style_components"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    style_id: Mapped[int] = mapped_column(
        ForeignKey("garment_styles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    component_name: Mapped[str] = mapped_column(String(100), nullable=False)
    sequence_no: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class StyleColorway(Base):
    __tablename__ = "style_colorways"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    style_id: Mapped[int] = mapped_column(
        ForeignKey("garment_styles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    color_name: Mapped[str] = mapped_column(String(100), nullable=False)
    color_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class StyleSizeScale(Base):
    __tablename__ = "style_size_scales"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    style_id: Mapped[int] = mapped_column(
        ForeignKey("garment_styles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    scale_name: Mapped[str] = mapped_column(String(100), nullable=False)
    sizes_csv: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class OrderAmendment(Base):
    __tablename__ = "order_amendments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    amendment_no: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    field_changed: Mapped[str] = mapped_column(String(100), nullable=False)
    old_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="APPROVED")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class InquiryEvent(Base):
    __tablename__ = "inquiry_events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    inquiry_id: Mapped[int] = mapped_column(
        ForeignKey("inquiries.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    from_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    to_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

