"""Tier 1 / Tier 2 approval of amendments to an existing employee (migration 303)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

CHANGE_KINDS = ("INFO", "COMPENSATION", "PAY_BENEFITS", "TAX_PROFILE")
CHANGE_STATUSES = ("PENDING_TIER1", "PENDING_TIER2", "APPLIED", "REJECTED", "CANCELLED", "FAILED")
OPEN_CHANGE_STATUSES = ("PENDING_TIER1", "PENDING_TIER2")


class HrEmployeeChangeRequest(Base):
    __tablename__ = "hr_employee_change_requests"
    __table_args__ = (
        UniqueConstraint("tenant_id", "request_id", name="uq_hr_employee_change_requests_request"),
        CheckConstraint(
            "kind IN ('INFO', 'COMPENSATION', 'PAY_BENEFITS', 'TAX_PROFILE')", name="ck_hr_employee_change_requests_kind"
        ),
        CheckConstraint(
            "status IN ('PENDING_TIER1', 'PENDING_TIER2', 'APPLIED', 'REJECTED', 'CANCELLED', 'FAILED')",
            name="ck_hr_employee_change_requests_status",
        ),
        Index("ix_hr_employee_change_requests_tenant_status", "tenant_id", "status"),
        Index("ix_hr_employee_change_requests_tenant_employee", "tenant_id", "employee_id"),
        Index(
            "uq_hr_employee_change_requests_one_open",
            "tenant_id",
            "employee_id",
            "kind",
            unique=True,
            postgresql_where=text("status IN ('PENDING_TIER1', 'PENDING_TIER2')"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("hr_employees.id", ondelete="CASCADE"), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    # The body the direct endpoint accepts (validated on submit and again when applied).
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    # Current values of the fields the request changes; applying fails if they moved meanwhile.
    before: Mapped[dict] = mapped_column(JSONB, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING_TIER1")
    request_id: Mapped[str] = mapped_column(String(64), nullable=False)
    requested_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    tier1_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    tier1_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    tier1_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    tier2_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    tier2_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    tier2_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
