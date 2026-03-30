"""Persisted costing suggestion batches for quotations (Phase 2 review mode)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy import JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class QuotationCostingSuggestionBatch(Base):
    __tablename__ = "quotation_costing_suggestion_batches"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    quotation_id: Mapped[int | None] = mapped_column(
        ForeignKey("quotations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    action_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    provider: Mapped[str | None] = mapped_column(String(64), nullable=True)
    model_hint: Mapped[str | None] = mapped_column(String(128), nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    generated_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source_type: Mapped[str] = mapped_column(String(32), nullable=False, default="deterministic")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="generated", index=True)
    meta_json: Mapped[dict | None] = mapped_column(JSON().with_variant(JSONB, "postgresql"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)


class QuotationCostingSuggestionItem(Base):
    __tablename__ = "quotation_costing_suggestion_items"
    __table_args__ = (UniqueConstraint("batch_id", "ordinal", name="uq_quotation_costing_suggestion_item_batch_ordinal"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    batch_id: Mapped[int] = mapped_column(
        ForeignKey("quotation_costing_suggestion_batches.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cost_category: Mapped[str] = mapped_column(String(32), nullable=False)
    target_line_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    suggestion_type: Mapped[str] = mapped_column(String(32), nullable=False)
    field_changes_json: Mapped[dict] = mapped_column(JSON().with_variant(JSONB, "postgresql"), nullable=False)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    reason_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_mode: Mapped[str] = mapped_column(String(32), nullable=False, default="deterministic_only")
    disposition: Mapped[str] = mapped_column(String(32), nullable=False, default="pending", index=True)
    before_snapshot_json: Mapped[dict | None] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
