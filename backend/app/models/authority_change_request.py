"""Authority class change requests (masters) — migration 310."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

ACR_STATUSES = (
    "SUBMITTED",
    "VERIFIED",
    "RECOMMENDED",
    "APPROVED",
    "APPLYING",
    "APPLIED",
    "REJECTED",
    "RETURNED",
    "CONFLICT",
    "ROUTING_EXCEPTION",
)
ACR_STEPS = ("VERIFY", "RECOMMEND", "APPROVE", "APPLY")
ACR_RESOURCE_TYPES = ("account_group", "chart_of_account")
ACR_ACTIONS = ("CREATE", "UPDATE", "DEACTIVATE")
ACR_ACTION_KINDS = (
    "SUBMIT",
    "VERIFY",
    "RECOMMEND",
    "APPROVE",
    "REJECT",
    "RETURN",
    "TAKEOVER",
    "APPLY",
    "FAIL",
)


class AuthorityChangeRequest(Base):
    __tablename__ = "authority_change_requests"
    __table_args__ = (
        UniqueConstraint("tenant_id", "request_id", name="uq_authority_change_requests_request"),
        CheckConstraint(
            "status IN (" + ", ".join(f"'{s}'" for s in ACR_STATUSES) + ")",
            name="ck_authority_change_requests_status",
        ),
        CheckConstraint(
            "current_step IN (" + ", ".join(f"'{s}'" for s in ACR_STEPS) + ")",
            name="ck_authority_change_requests_step",
        ),
        CheckConstraint(
            "resource_type IN (" + ", ".join(f"'{s}'" for s in ACR_RESOURCE_TYPES) + ")",
            name="ck_authority_change_requests_resource",
        ),
        CheckConstraint(
            "action IN (" + ", ".join(f"'{s}'" for s in ACR_ACTIONS) + ")",
            name="ck_authority_change_requests_action",
        ),
        Index("ix_authority_change_requests_tenant_status_step", "tenant_id", "status", "current_step"),
        Index("ix_authority_change_requests_tenant_module", "tenant_id", "module_code"),
        Index("ix_authority_change_requests_tenant_created_by", "tenant_id", "created_by"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    request_id: Mapped[str] = mapped_column(String(64), nullable=False)
    module_code: Mapped[str] = mapped_column(String(32), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(64), nullable=False)
    resource_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    action: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="SUBMITTED")
    current_step: Mapped[str] = mapped_column(String(16), nullable=False, default="VERIFY")
    base_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    before_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    proposed_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    verified_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    recommended_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    takeover_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class AuthorityChangeAction(Base):
    __tablename__ = "authority_change_actions"
    __table_args__ = (
        CheckConstraint(
            "action_kind IN (" + ", ".join(f"'{s}'" for s in ACR_ACTION_KINDS) + ")",
            name="ck_authority_change_actions_kind",
        ),
        Index("ix_authority_change_actions_request", "change_request_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    change_request_id: Mapped[int] = mapped_column(
        ForeignKey("authority_change_requests.id", ondelete="CASCADE"), nullable=False
    )
    action_kind: Mapped[str] = mapped_column(String(16), nullable=False)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    from_status: Mapped[str | None] = mapped_column(String(24), nullable=True)
    to_status: Mapped[str | None] = mapped_column(String(24), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
