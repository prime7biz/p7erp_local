"""Human decisions on AI exception-agent findings (flag `ai_exception_agents_enabled`)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AiAgentDecision(Base):
    """One row per confirm / dismiss. Agents never act without a row here written by a person."""

    __tablename__ = "ai_agent_decisions"
    __table_args__ = (Index("ix_ai_agent_decisions_tenant_key", "tenant_id", "exception_key"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    agent: Mapped[str] = mapped_column(String(32), nullable=False)
    exception_key: Mapped[str] = mapped_column(String(160), nullable=False)
    decision: Mapped[str] = mapped_column(String(16), nullable=False)  # NOTIFIED | DISMISSED
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    recipients_count: Mapped[int] = mapped_column(nullable=False, default=0)
    decided_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    decided_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
