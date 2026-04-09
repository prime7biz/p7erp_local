import enum
from sqlalchemy import JSON, String, Boolean, DateTime, Enum as SQLEnum, ForeignKey, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
from app.database import Base


class TenantType(str, enum.Enum):
    manufacturer = "manufacturer"
    buying_house = "buying_house"
    both = "both"


class CommissionMode(str, enum.Enum):
    INCLUDE = "INCLUDE"
    EXCLUDE = "EXCLUDE"


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    domain: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    tenant_type: Mapped[TenantType] = mapped_column(
        SQLEnum(TenantType),
        nullable=False,
        default=TenantType.both,
        server_default=text("'both'"),
    )
    logo: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    company_code: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True)
    # First public signup records which legal/trust document bundle version the tenant accepted.
    legal_acceptance_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    legal_accepted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    legal_accepted_by_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Bcrypt hash of a one-time setup token for POST /auth/register when tenant has zero users (Finding #4).
    # Cleared automatically after the first admin registers. Alternative: BOOTSTRAP_REGISTRATION_KEY in env.
    bootstrap_token_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Optional feature toggles, e.g. {"trade_enabled": false} to hide Trade/Logistics nav for buying_house tenants.
    feature_flags: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    default_commission_mode: Mapped[CommissionMode | None] = mapped_column(
        SQLEnum(CommissionMode, name="commissionmode"),
        nullable=True,
        default=CommissionMode.EXCLUDE,
        server_default=text("'EXCLUDE'"),
    )
    allow_negative_stock: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    default_rm_warehouse_id: Mapped[int | None] = mapped_column(
        ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True, index=True
    )
    default_fg_warehouse_id: Mapped[int | None] = mapped_column(
        ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # ISO 3166-1 alpha-2 (e.g. BD, US) for public holiday import and locale.
    country_code: Mapped[str | None] = mapped_column(String(4), nullable=True)
    timezone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # ISO 4217; used for facility / finance base-currency reporting (defaults to BDT for existing tenants).
    base_currency: Mapped[str] = mapped_column(String(10), nullable=False, default="BDT")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    # Soft-delete: platform admin sets deleted_at; tenant users cannot log in when set.
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)

    users = relationship("User", back_populates="tenant")
    roles = relationship("Role", back_populates="tenant")
    staff_invitations = relationship("StaffInvitation", back_populates="tenant")
