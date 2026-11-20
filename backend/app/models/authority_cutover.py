"""Immutable cutover snapshots for user_authority_classes_v1 (Phase 7)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AuthorityCutoverSnapshot(Base):
    __tablename__ = "authority_cutover_snapshots"
    __table_args__ = (
        UniqueConstraint("tenant_id", "user_id", name="uq_authority_cutover_snapshots_tenant_user"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    original_role_id: Mapped[int] = mapped_column(ForeignKey("roles.id", ondelete="RESTRICT"), nullable=False)
    original_role_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    original_authority_class: Mapped[str | None] = mapped_column(String(16), nullable=True)
    original_is_tenant_super_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    original_module_grants: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    proposed_authority_class: Mapped[str | None] = mapped_column(String(16), nullable=True)
    proposed_is_tenant_super_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    proposed_module_grants: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="PROPOSED")
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    restored_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
