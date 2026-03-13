import enum
from sqlalchemy import String, Boolean, DateTime, Enum as SQLEnum, text
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
    default_commission_mode: Mapped[CommissionMode | None] = mapped_column(
        SQLEnum(CommissionMode, name="commissionmode"),
        nullable=True,
        default=CommissionMode.EXCLUDE,
        server_default=text("'EXCLUDE'"),
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    users = relationship("User", back_populates="tenant")
    roles = relationship("Role", back_populates="tenant")
