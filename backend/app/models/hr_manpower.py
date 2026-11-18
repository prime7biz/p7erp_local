"""Factory Manpower & SMV Control models (migration 304+).

Standing HR sanctioned strength by Department + Designation, tenant ratio targets,
and department group mapping for sewing / cutting / finishing ratios.
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

DEPARTMENT_GROUP_KEYS = ("SEWING", "CUTTING", "FINISHING", "OTHER")


class HrManpowerSanctionedStrength(Base):
    __tablename__ = "hr_manpower_sanctioned_strength"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "department_id",
            "designation_id",
            "effective_from",
            name="uq_hr_manpower_sanctioned_cell_from",
        ),
        CheckConstraint("approved_quota >= 0", name="ck_hr_manpower_sanctioned_quota_nonneg"),
        Index(
            "ix_hr_manpower_sanctioned_tenant_dept_desig",
            "tenant_id",
            "department_id",
            "designation_id",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    department_id: Mapped[int] = mapped_column(
        ForeignKey("hr_departments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    designation_id: Mapped[int] = mapped_column(
        ForeignKey("hr_designations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    approved_quota: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    updated_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class HrManpowerSettings(Base):
    __tablename__ = "hr_manpower_settings"
    __table_args__ = (UniqueConstraint("tenant_id", name="uq_hr_manpower_settings_tenant"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    # Nullable ratio targets (strings or numbers). Missing key = show actual only, never enforce a default.
    targets: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    allow_unmapped_hire: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    updated_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class HrManpowerDepartmentGroup(Base):
    """Maps an HR department to SEWING / CUTTING / FINISHING / OTHER for ratio reports."""

    __tablename__ = "hr_manpower_department_groups"
    __table_args__ = (
        UniqueConstraint("tenant_id", "department_id", name="uq_hr_manpower_dept_group_dept"),
        CheckConstraint(
            "group_key IN ('SEWING', 'CUTTING', 'FINISHING', 'OTHER')",
            name="ck_hr_manpower_dept_group_key",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    department_id: Mapped[int] = mapped_column(
        ForeignKey("hr_departments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    group_key: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


EXCEPTION_STATUSES = ("PENDING", "APPROVED", "REJECTED", "CANCELLED")
OPEN_EXCEPTION_STATUSES = ("PENDING",)


class HrManpowerQuotaException(Base):
    """Over-quota hiring exception (Phase 2). Approve is fail-closed; no admin wildcard bypass."""

    __tablename__ = "hr_manpower_quota_exceptions"
    __table_args__ = (
        UniqueConstraint("tenant_id", "request_id", name="uq_hr_manpower_quota_exc_request"),
        CheckConstraint("extra_slots > 0", name="ck_hr_manpower_quota_exc_slots_pos"),
        CheckConstraint(
            "status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')",
            name="ck_hr_manpower_quota_exc_status",
        ),
        Index("ix_hr_manpower_quota_exc_tenant_status", "tenant_id", "status"),
        Index(
            "uq_hr_manpower_quota_exc_one_pending",
            "tenant_id",
            "department_id",
            "designation_id",
            unique=True,
            postgresql_where=text("status = 'PENDING'"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    department_id: Mapped[int] = mapped_column(
        ForeignKey("hr_departments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    designation_id: Mapped[int] = mapped_column(
        ForeignKey("hr_designations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    extra_slots: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING")
    request_id: Mapped[str] = mapped_column(String(64), nullable=False)
    requested_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    decision_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    expires_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class HrManpowerQuotaExceptionConsumption(Base):
    """One hire/reassign/activate that used an approved exception slot."""

    __tablename__ = "hr_manpower_quota_exception_consumptions"
    __table_args__ = (
        UniqueConstraint("tenant_id", "employee_id", name="uq_hr_manpower_quota_cons_emp"),
        UniqueConstraint("exception_id", "employee_id", name="uq_hr_manpower_quota_cons_exc_emp"),
        Index("ix_hr_manpower_quota_cons_exception", "exception_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    exception_id: Mapped[int] = mapped_column(
        ForeignKey("hr_manpower_quota_exceptions.id", ondelete="CASCADE"), nullable=False
    )
    employee_id: Mapped[int] = mapped_column(ForeignKey("hr_employees.id", ondelete="CASCADE"), nullable=False)
    consumed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    consumed_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
