"""Sprint 5: tenant payroll statutory rates (PF/ESI/PT)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PayrollStatutoryConfig(Base):
    __tablename__ = "payroll_statutory_configs"
    __table_args__ = (UniqueConstraint("tenant_id", name="uq_payroll_statutory_configs_tenant"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    pf_employee_rate: Mapped[Decimal] = mapped_column(Numeric(8, 4), nullable=False, default=Decimal("12"))
    pf_employer_rate: Mapped[Decimal] = mapped_column(Numeric(8, 4), nullable=False, default=Decimal("12"))
    esi_employee_rate: Mapped[Decimal] = mapped_column(Numeric(8, 4), nullable=False, default=Decimal("0.75"))
    esi_employer_rate: Mapped[Decimal] = mapped_column(Numeric(8, 4), nullable=False, default=Decimal("3.25"))
    pf_wage_ceiling: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False, default=Decimal("15000"))
    esi_wage_ceiling: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False, default=Decimal("21000"))
    pt_state: Mapped[str | None] = mapped_column(String(64), nullable=True)
    pt_slabs: Mapped[Any | None] = mapped_column(JSONB, nullable=True)
    gratuity_days_per_year: Mapped[Decimal] = mapped_column(Numeric(8, 4), nullable=False, default=Decimal("15"))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
