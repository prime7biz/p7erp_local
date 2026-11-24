"""Voucher-style HR class requests (Class 3/4 enter → Class 2 recommend → Class 1 approve).

Inert while ``user_authority_classes_v1`` is OFF. Migration 317.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

HR_CLASS_REQUEST_KINDS = (
    "NEW_EMPLOYEE",
    "LEAVE",
    "INCREMENT",
    "PROMOTION",
    "CORRECTION",
    "RESIGNATION",
    "DISCONTINUE",
    "WARNING",
    "BULK_INCREMENT",
    "CONFIRMATION",
)

HR_CLASS_REQUEST_STATUSES = (
    "DRAFT",
    "SUBMITTED",
    "RECOMMENDED",
    "RETURNED",
    "APPLYING",
    "APPROVED",
    "APPLIED",
    "REJECTED",
    "CANCELLED",
    "FAILED",
)

OPEN_HR_CLASS_STATUSES = ("DRAFT", "SUBMITTED", "RECOMMENDED", "RETURNED", "APPLYING")
SINGLE_OPEN_KINDS = ("INCREMENT", "PROMOTION", "CORRECTION")
SEPARATION_OPEN_KINDS = ("RESIGNATION", "DISCONTINUE")


class HrClassRequest(Base):
    __tablename__ = "hr_class_requests"
    __table_args__ = (
        UniqueConstraint("tenant_id", "request_id", name="uq_hr_class_requests_request"),
        CheckConstraint(
            "kind IN (" + ", ".join(f"'{k}'" for k in HR_CLASS_REQUEST_KINDS) + ")",
            name="ck_hr_class_requests_kind",
        ),
        CheckConstraint(
            "status IN (" + ", ".join(f"'{s}'" for s in HR_CLASS_REQUEST_STATUSES) + ")",
            name="ck_hr_class_requests_status",
        ),
        CheckConstraint("source IN ('HR_ENTRY', 'ESS')", name="ck_hr_class_requests_source"),
        Index("ix_hr_class_requests_tenant_status_created", "tenant_id", "status", "created_at"),
        Index("ix_hr_class_requests_tenant_employee_status", "tenant_id", "employee_id", "status"),
        Index(
            "uq_hr_class_requests_one_open_single",
            "tenant_id",
            "employee_id",
            "kind",
            unique=True,
            postgresql_where=text(
                "status IN ('DRAFT', 'SUBMITTED', 'RECOMMENDED', 'RETURNED', 'APPLYING') "
                "AND kind IN ('INCREMENT', 'PROMOTION', 'CORRECTION')"
            ),
        ),
        Index(
            "uq_hr_class_requests_one_open_separation",
            "tenant_id",
            "employee_id",
            unique=True,
            postgresql_where=text(
                "status IN ('DRAFT', 'SUBMITTED', 'RECOMMENDED', 'RETURNED', 'APPLYING') "
                "AND kind IN ('RESIGNATION', 'DISCONTINUE')"
            ),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    request_no: Mapped[str] = mapped_column(String(32), nullable=False)
    request_id: Mapped[str] = mapped_column(String(64), nullable=False)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="HR_ENTRY")
    kind: Mapped[str] = mapped_column(String(24), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="DRAFT")
    employee_id: Mapped[int | None] = mapped_column(
        ForeignKey("hr_employees.id", ondelete="SET NULL"), nullable=True, index=True
    )
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    before: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    reason: Mapped[str] = mapped_column(Text, nullable=False, default="")
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    leave_request_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    separation_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    onboarding_request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    staff_invitation_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    discipline_case_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    settlement_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    entered_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    entered_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    recommended_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    recommended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    recommend_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    recommend_is_auto: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    approve_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class HrClassRequestAction(Base):
    __tablename__ = "hr_class_request_actions"
    __table_args__ = (
        Index("ix_hr_class_request_actions_tenant_request", "tenant_id", "request_pk"),
        CheckConstraint(
            "action IN ('SUBMIT', 'RESUBMIT', 'RECOMMEND', 'RETURN', 'APPROVE', 'REJECT', 'CANCEL', 'APPLY', 'FAIL', 'RETRY')",
            name="ck_hr_class_request_actions_action",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    request_pk: Mapped[int] = mapped_column(
        ForeignKey("hr_class_requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    action: Mapped[str] = mapped_column(String(16), nullable=False)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_auto: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class HrClassRequestLine(Base):
    """Per-employee lines for BULK_INCREMENT (Phase 3)."""

    __tablename__ = "hr_class_request_lines"
    __table_args__ = (
        Index("ix_hr_class_request_lines_tenant_request", "tenant_id", "request_pk"),
        Index("ix_hr_class_request_lines_tenant_employee", "tenant_id", "employee_id"),
        UniqueConstraint("tenant_id", "request_pk", "employee_id", name="uq_hr_class_request_lines_emp"),
        CheckConstraint(
            "line_status IN ('PENDING', 'APPLIED', 'FAILED', 'SKIPPED')",
            name="ck_hr_class_request_lines_status",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    request_pk: Mapped[int] = mapped_column(
        ForeignKey("hr_class_requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    employee_id: Mapped[int] = mapped_column(ForeignKey("hr_employees.id", ondelete="CASCADE"), nullable=False)
    before: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    line_status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING")
    error_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class HrApprovalDelegation(Base):
    """Time-boxed Class 1/2 approval delegation (Phase 3, flag hr_delegation_v1)."""

    __tablename__ = "hr_approval_delegations"
    __table_args__ = (
        Index("ix_hr_approval_delegations_tenant_active", "tenant_id", "step", "starts_at", "ends_at"),
        CheckConstraint("step IN ('RECOMMEND', 'APPROVE')", name="ck_hr_approval_delegations_step"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    delegator_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    delegate_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    step: Mapped[str] = mapped_column(String(16), nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
