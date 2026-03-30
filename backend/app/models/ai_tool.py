from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from pgvector.sqlalchemy import Vector

from app.database import Base


class AiSession(Base):
    __tablename__ = "ai_sessions"
    __table_args__ = (
        UniqueConstraint("tenant_id", "session_code", name="uq_ai_sessions_tenant_session_code"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    session_code: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="ACTIVE", index=True)
    provider: Mapped[str | None] = mapped_column(String(64), nullable=True)
    model_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    context_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class AiMessage(Base):
    __tablename__ = "ai_messages"
    __table_args__ = (
        UniqueConstraint("tenant_id", "session_id", "message_index", name="uq_ai_messages_tenant_session_index"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("ai_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    message_index: Mapped[int] = mapped_column(Integer, nullable=False)
    role: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    prompt_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    completion_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, index=True)


class AiToolInvocation(Base):
    __tablename__ = "ai_tool_invocations"
    __table_args__ = (
        UniqueConstraint("tenant_id", "invocation_code", name="uq_ai_tool_invocations_tenant_invocation_code"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("ai_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    message_id: Mapped[int | None] = mapped_column(ForeignKey("ai_messages.id", ondelete="SET NULL"), nullable=True, index=True)
    invocation_code: Mapped[str] = mapped_column(String(64), nullable=False)
    tool_name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="PENDING", index=True)
    input_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    output_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class AiAuditLog(Base):
    __tablename__ = "ai_audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    session_id: Mapped[int | None] = mapped_column(ForeignKey("ai_sessions.id", ondelete="SET NULL"), nullable=True, index=True)
    message_id: Mapped[int | None] = mapped_column(ForeignKey("ai_messages.id", ondelete="SET NULL"), nullable=True, index=True)
    tool_invocation_id: Mapped[int | None] = mapped_column(
        ForeignKey("ai_tool_invocations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String(16), nullable=False, default="INFO", index=True)
    resource: Mapped[str | None] = mapped_column(String(64), nullable=True)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    details_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    trace_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    route_selected: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    tools_called: Mapped[list | None] = mapped_column(JSON, nullable=True)
    model_used: Mapped[str | None] = mapped_column(String(128), nullable=True)
    prompt_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    completion_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cost_estimate_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    approval_status: Mapped[str | None] = mapped_column(String(24), nullable=True)
    escalation_reason: Mapped[str | None] = mapped_column(String(512), nullable=True)
    prompt_category: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, index=True)


class AiSavedPrompt(Base):
    __tablename__ = "ai_saved_prompts"
    __table_args__ = (
        UniqueConstraint("tenant_id", "key", name="uq_ai_saved_prompts_tenant_key"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    key: Mapped[str] = mapped_column(String(64), nullable=False)
    label: Mapped[str] = mapped_column(String(128), nullable=False)
    prompt_text: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class AiReportRun(Base):
    __tablename__ = "ai_report_runs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    session_id: Mapped[int | None] = mapped_column(ForeignKey("ai_sessions.id", ondelete="SET NULL"), nullable=True, index=True)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    report_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    report_name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="PENDING", index=True)
    source_modules: Mapped[list | None] = mapped_column(JSON, nullable=True)
    parameters_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    result_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    narrative_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class AiForecastRun(Base):
    __tablename__ = "ai_forecast_runs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    session_id: Mapped[int | None] = mapped_column(ForeignKey("ai_sessions.id", ondelete="SET NULL"), nullable=True, index=True)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    forecast_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    forecast_name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="PENDING", index=True)
    source_modules: Mapped[list | None] = mapped_column(JSON, nullable=True)
    assumptions_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    parameters_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    result_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    confidence_score: Mapped[float | None] = mapped_column(nullable=True)
    narrative_explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    model_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    model_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    training_data_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    confidence_lower: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    confidence_upper: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    quality_metrics: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    celery_task_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)


class AiForecastModel(Base):
    __tablename__ = "ai_forecast_models"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "target_variable",
            "model_version",
            name="uq_ai_forecast_models_tenant_target_version",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    target_variable: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    model_type: Mapped[str] = mapped_column(String(64), nullable=False)
    model_version: Mapped[str] = mapped_column(String(64), nullable=False)
    serialized_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    training_rows: Mapped[int | None] = mapped_column(Integer, nullable=True)
    training_data_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    quality_metrics: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False, index=True)
    trained_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class AiKnowledgeDocument(Base):
    __tablename__ = "ai_knowledge_documents"
    __table_args__ = (
        UniqueConstraint("tenant_id", "document_code", name="uq_ai_knowledge_documents_tenant_doc_code"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int | None] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    document_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    doc_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    source_area: Mapped[str] = mapped_column(String(64), nullable=False, default="knowledge")
    owner_scope: Mapped[str] = mapped_column(String(16), nullable=False, default="global", index=True)
    visibility: Mapped[str] = mapped_column(String(24), nullable=False, default="public", index=True)
    permission_key: Mapped[str | None] = mapped_column(String(128), nullable=True)
    version_tag: Mapped[str | None] = mapped_column(String(64), nullable=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class AiKnowledgeChunk(Base):
    __tablename__ = "ai_knowledge_chunks"
    __table_args__ = (
        UniqueConstraint("document_id", "chunk_index", name="uq_ai_knowledge_chunks_document_chunk"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int | None] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    document_id: Mapped[int] = mapped_column(
        ForeignKey("ai_knowledge_documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    heading: Mapped[str | None] = mapped_column(String(255), nullable=True)
    content_text: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    token_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, index=True)


class AiEmbeddingChunk(Base):
    """Vector-indexed text chunks for tenant-scoped semantic search (pgvector)."""

    __tablename__ = "ai_embedding_chunks"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "source_type",
            "source_ref",
            "chunk_index",
            name="uq_ai_embedding_chunks_tenant_source_chunk",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    source_ref: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    source_module: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content_text: Mapped[str] = mapped_column(Text, nullable=False)
    heading: Mapped[str | None] = mapped_column(String(255), nullable=True)
    embedding: Mapped[list] = mapped_column(Vector(384), nullable=False)
    document_type: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    order_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    style_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    date_reference: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    token_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    embedding_model: Mapped[str] = mapped_column(String(128), nullable=False, default="all-MiniLM-L6-v2")
    is_stale: Mapped[bool] = mapped_column(default=False, nullable=False, index=True)
    indexed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    source_updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, index=True)


class AiAutomationRule(Base):
    __tablename__ = "ai_automation_rules"
    __table_args__ = (
        UniqueConstraint("tenant_id", "rule_code", name="uq_ai_automation_rules_tenant_rule_code"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    rule_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    action_key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    is_enabled: Mapped[bool] = mapped_column(default=True, nullable=False, index=True)
    requires_confirmation: Mapped[bool] = mapped_column(default=True, nullable=False)
    permission_key: Mapped[str | None] = mapped_column(String(128), nullable=True)
    policy_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Phase 20 governance evaluator: JSON condition vs proposal payload (optional per rule).
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    condition_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class AiActionRun(Base):
    __tablename__ = "ai_action_runs"
    __table_args__ = (
        UniqueConstraint("tenant_id", "request_id", name="uq_ai_action_runs_tenant_request_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    session_id: Mapped[int | None] = mapped_column(ForeignKey("ai_sessions.id", ondelete="SET NULL"), nullable=True, index=True)
    message_id: Mapped[int | None] = mapped_column(ForeignKey("ai_messages.id", ondelete="SET NULL"), nullable=True, index=True)
    rule_id: Mapped[int | None] = mapped_column(
        ForeignKey("ai_automation_rules.id", ondelete="SET NULL"), nullable=True, index=True
    )
    request_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    action_key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="PROPOSED", index=True)
    requires_confirmation: Mapped[bool] = mapped_column(default=True, nullable=False)
    # Legacy plaintext token column; retained for migration compatibility only.
    confirmation_token: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    confirmation_token_hash: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    confirmation_token_last4: Mapped[str | None] = mapped_column(String(8), nullable=True)
    risk_level: Mapped[str] = mapped_column(String(16), nullable=False, default="LOW", index=True)
    prompt_text: Mapped[str] = mapped_column(Text, nullable=False)
    preview_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    input_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    output_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class AiSystemTask(Base):
    __tablename__ = "ai_system_tasks"
    __table_args__ = (UniqueConstraint("tenant_id", "task_code", name="uq_ai_system_tasks_tenant_task_code"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    session_id: Mapped[int | None] = mapped_column(ForeignKey("ai_sessions.id", ondelete="SET NULL"), nullable=True)
    task_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    task_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    task_category: Mapped[str] = mapped_column(String(24), nullable=False, default="informational", index=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="created", index=True)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    execution_conditions: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    result_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    requires_approval: Mapped[bool] = mapped_column(default=False, nullable=False)
    approved_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(128), nullable=True, unique=True)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_retries: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    timeout_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=300)
    celery_task_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    queued_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    simulation: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class AiSystemTaskDeadLetter(Base):
    __tablename__ = "ai_system_task_dead_letters"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    original_task_id: Mapped[int] = mapped_column(
        ForeignKey("ai_system_tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    failure_reason: Mapped[str] = mapped_column(Text, nullable=False)
    last_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    retry_exhausted: Mapped[bool] = mapped_column(default=True, nullable=False)
    acknowledged: Mapped[bool] = mapped_column(default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class AiApprovalArtifact(Base):
    """Reviewable AI-generated draft before ERP commit (Phase-2)."""

    __tablename__ = "ai_approval_artifacts"
    __table_args__ = (UniqueConstraint("tenant_id", "artifact_code", name="uq_ai_approval_artifacts_tenant_code"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    session_id: Mapped[int | None] = mapped_column(ForeignKey("ai_sessions.id", ondelete="SET NULL"), nullable=True)
    artifact_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    artifact_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    source_tool: Mapped[str] = mapped_column(String(128), nullable=False)
    source_module: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="created", index=True)
    original_input_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    generated_payload_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    diff_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    committed_payload_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    commit_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reviewer_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewer_comments: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    committed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    rollback_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    rolled_back_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    rolled_back_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class AiPermissionPolicy(Base):
    """Fine-grained AI tool access per tenant / role (Phase-2)."""

    __tablename__ = "ai_permission_policies"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    role_id: Mapped[int | None] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), nullable=True, index=True)
    module: Mapped[str] = mapped_column(String(64), nullable=False, default="*", index=True)
    tool_name: Mapped[str] = mapped_column(String(128), nullable=False, default="*", index=True)
    safety_class_allowed: Mapped[str] = mapped_column(String(24), nullable=False, default="*")
    action: Mapped[str] = mapped_column(String(16), nullable=False, default="allow")
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class AiTaskPolicy(Base):
    """Whitelist, cooldowns, and limits for system task types (Phase-2)."""

    __tablename__ = "ai_task_policies"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int | None] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    task_type: Mapped[str] = mapped_column(String(64), nullable=False, default="*", index=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    max_frequency_per_hour: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cooldown_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    allow_simulation: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    require_approval: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    max_retries_override: Mapped[int | None] = mapped_column(Integer, nullable=True)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class AiIngestionJob(Base):
    """Embedding / reindex job tracking (Phase-2)."""

    __tablename__ = "ai_ingestion_jobs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="queued", index=True)
    trigger: Mapped[str] = mapped_column(String(32), nullable=False, default="manual")
    source_checksum: Mapped[str | None] = mapped_column(String(64), nullable=True)
    previous_checksum: Mapped[str | None] = mapped_column(String(64), nullable=True)
    chunks_processed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    chunks_failed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    chunks_skipped: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_retries: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, index=True)


class AiFeedback(Base):
    """User ratings and corrections for AI quality (Phase-2)."""

    __tablename__ = "ai_feedback"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id: Mapped[int | None] = mapped_column(ForeignKey("ai_sessions.id", ondelete="SET NULL"), nullable=True)
    message_id: Mapped[int | None] = mapped_column(ForeignKey("ai_messages.id", ondelete="SET NULL"), nullable=True, index=True)
    trace_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    rating: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    correction_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    feedback_category: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    flagged_for_review: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    detected_intent: Mapped[str | None] = mapped_column(String(64), nullable=True)
    route_used: Mapped[str | None] = mapped_column(String(64), nullable=True)
    tools_used: Mapped[list | None] = mapped_column(JSON, nullable=True)
    retrieval_method: Mapped[str | None] = mapped_column(String(64), nullable=True)
    model_used: Mapped[str | None] = mapped_column(String(128), nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    reviewed_by_admin_id: Mapped[int | None] = mapped_column(
        ForeignKey("platform_admins.id", ondelete="SET NULL"), nullable=True
    )
    admin_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, index=True)


class AiWeeklyReport(Base):
    """Stored Gemini-generated weekly executive summaries per tenant."""

    __tablename__ = "ai_weekly_reports"
    __table_args__ = (
        UniqueConstraint("tenant_id", "week_start", name="uq_ai_weekly_reports_tenant_week"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    week_start: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    week_end: Mapped[date] = mapped_column(Date, nullable=False)
    narrative: Mapped[str] = mapped_column(Text, nullable=False)
    kpi_snapshot_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, index=True)


class AiAnomalyEvent(Base):
    __tablename__ = "ai_anomaly_events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    session_id: Mapped[int | None] = mapped_column(ForeignKey("ai_sessions.id", ondelete="SET NULL"), nullable=True, index=True)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    source_area: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    rule_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String(16), nullable=False, default="MEDIUM", index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    metrics_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    dimensions_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, index=True)
