"""
Costing engine models: item categories, items, units, currencies,
quotation materials, manufacturing, other costs, size ratios.
Matches PrimeX structure for BOM/inventory/currency integration.
"""
from __future__ import annotations

from datetime import datetime, date

from sqlalchemy import (
    String,
    Text,
    DateTime,
    Date,
    Integer,
    Boolean,
    ForeignKey,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ItemCategory(Base):
    """Item category for inventory/costing (e.g. Fabric, Trim)."""
    __tablename__ = "item_categories"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class ItemSubcategory(Base):
    """Optional item subcategory under an item category."""
    __tablename__ = "item_subcategories"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category_id: Mapped[int] = mapped_column(
        ForeignKey("item_categories.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subcategory_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class ItemUnit(Base):
    """Unit of measure (Yard, Kg, Pcs, etc.)."""
    __tablename__ = "item_units"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    unit_code: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class Item(Base):
    """Inventory item for material costing (linked to categories/units)."""
    __tablename__ = "items"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category_id: Mapped[int] = mapped_column(
        ForeignKey("item_categories.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    subcategory_id: Mapped[int | None] = mapped_column(
        ForeignKey("item_subcategories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    unit_id: Mapped[int] = mapped_column(
        ForeignKey("item_units.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    default_cost: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class Currency(Base):
    """Currency master (BDT, USD, EUR, etc.)."""
    __tablename__ = "currencies"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(10), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class CurrencyExchangeRate(Base):
    """
    Pair-based exchange rate (from_currency → to_currency) per tenant.
    PrimeX parity: currency_exchange_rates table for multi-currency and settings.
    """
    __tablename__ = "currency_exchange_rates"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_currency: Mapped[str] = mapped_column(String(10), nullable=False)
    to_currency: Mapped[str] = mapped_column(String(10), nullable=False)
    exchange_rate: Mapped[str] = mapped_column(String(24), nullable=False)
    effective_date: Mapped[date] = mapped_column(Date, nullable=False)
    source: Mapped[str] = mapped_column(String(50), nullable=False, default="manual")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class QuotationMaterial(Base):
    """Quotation material cost line (consumption, unit price, amounts)."""
    __tablename__ = "quotation_materials"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    quotation_id: Mapped[int] = mapped_column(
        ForeignKey("quotations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    serial_no: Mapped[int] = mapped_column(Integer, nullable=False)
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("item_categories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    item_id: Mapped[int | None] = mapped_column(
        ForeignKey("items.id", ondelete="SET NULL"), nullable=True, index=True
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    consumption_per_dozen: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    unit_price: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    amount_per_dozen: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    total_amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="USD")
    exchange_rate: Mapped[str] = mapped_column(String(32), nullable=False, default="1")
    base_amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    local_amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class QuotationManufacturing(Base):
    """Quotation manufacturing (CM) cost line."""
    __tablename__ = "quotation_manufacturing"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    quotation_id: Mapped[int] = mapped_column(
        ForeignKey("quotations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    serial_no: Mapped[int] = mapped_column(Integer, nullable=False)
    style_part: Mapped[str] = mapped_column(String(64), nullable=False)
    machines_required: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    production_per_hour: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    production_per_day: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    cost_per_machine: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    total_line_cost: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    cost_per_dozen: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    cm_per_piece: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    total_order_cost: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="USD")
    exchange_rate: Mapped[str] = mapped_column(String(32), nullable=False, default="1")
    base_amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    local_amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class QuotationOtherCost(Base):
    """Quotation other cost line (fixed or % on subtotal/material/cm)."""
    __tablename__ = "quotation_other_costs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    quotation_id: Mapped[int] = mapped_column(
        ForeignKey("quotations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    serial_no: Mapped[int] = mapped_column(Integer, nullable=False)
    cost_head: Mapped[str] = mapped_column(String(100), nullable=False)
    percentage: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    total_amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    cost_type: Mapped[str] = mapped_column(String(20), nullable=False, default="fixed")
    value: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    based_on: Mapped[str] = mapped_column(String(30), nullable=False, default="subtotal")
    calculated_amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="USD")
    exchange_rate: Mapped[str] = mapped_column(String(32), nullable=False, default="1")
    base_amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    local_amount: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class QuotationSizeRatio(Base):
    """Quotation size ratio (S/M/L/XL ratio %, quantity, fabric factor)."""
    __tablename__ = "quotation_size_ratios"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    quotation_id: Mapped[int] = mapped_column(
        ForeignKey("quotations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    serial_no: Mapped[int] = mapped_column(Integer, nullable=False)
    size: Mapped[str] = mapped_column(String(10), nullable=False)
    ratio_percentage: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    fabric_factor: Mapped[str] = mapped_column(String(32), nullable=False, default="1.0")
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class QuotationCostSummary(Base):
    """Quotation cost summary (category total, % of total)."""
    __tablename__ = "quotation_cost_summary"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    quotation_id: Mapped[int] = mapped_column(
        ForeignKey("quotations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category_name: Mapped[str] = mapped_column(String(100), nullable=False)
    total_cost: Mapped[str] = mapped_column(String(32), nullable=False)
    percentage_of_total: Mapped[str] = mapped_column(String(32), nullable=False, default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )
