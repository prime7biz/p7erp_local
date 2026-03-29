from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


AiIntent = Literal[
    "search_query",
    "report_request",
    "summary_request",
    "forecast_request",
    "help_request",
    "action_request",
    "semantic_search",
    "analysis_request",
    "unsupported_request",
]

AiMessageRole = Literal["user", "assistant", "system", "tool"]


class AiSessionCreateRequest(BaseModel):
    title: str | None = Field(default=None, max_length=255)


class AiSessionResponse(BaseModel):
    id: int
    tenant_id: int
    user_id: int | None
    session_code: str
    title: str | None
    status: str
    provider: str | None
    model_name: str | None
    last_message_at: datetime | None
    created_at: datetime
    updated_at: datetime


class AiMessageResponse(BaseModel):
    id: int
    session_id: int
    role: AiMessageRole
    content: str
    content_json: dict[str, Any] | None = None
    created_at: datetime


class AiToolResultCard(BaseModel):
    tool_name: str
    source_area: str
    title: str
    summary: str
    data: dict[str, Any] = Field(default_factory=dict)


class AiToolInvocationResult(BaseModel):
    tool_name: str
    status: Literal["SUCCESS", "FAILED", "BLOCKED"]
    summary: str
    source_area: str
    data: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None
    reason_code: str | None = None
    error_category: str | None = None


class AiChatRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)


class EscalationPayload(BaseModel):
    status: Literal["escalate"] = "escalate"
    tool_required: str
    reason: str


class ApproveEscalationRequest(BaseModel):
    message_id: int = Field(ge=1)
    tool_required: str = Field(min_length=3, max_length=128)
    approved: bool = True


class AiChatResponse(BaseModel):
    session: AiSessionResponse
    user_message: AiMessageResponse
    assistant_message: AiMessageResponse
    detected_intent: AiIntent
    confidence: float = Field(ge=0, le=1)
    request_id: str
    tool_results: list[AiToolInvocationResult] = Field(default_factory=list)
    blocked: bool = False
    escalation: EscalationPayload | None = None


class AiQuickAction(BaseModel):
    key: str
    label: str
    prompt: str
    source_area: str


class AiQuickActionsResponse(BaseModel):
    items: list[AiQuickAction]


class AiReportRunResponse(BaseModel):
    id: int
    tenant_id: int
    user_id: int | None
    session_id: int | None
    request_id: str | None
    report_code: str
    report_name: str
    status: str
    source_modules: list[str] = Field(default_factory=list)
    parameters_json: dict[str, Any] = Field(default_factory=dict)
    result_json: dict[str, Any] = Field(default_factory=dict)
    narrative_summary: str | None = None
    created_at: datetime
    completed_at: datetime | None = None


class AiGenerateReportRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=4000)
    session_id: int | None = None


class AiGenerateForecastRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=4000)
    session_id: int | None = None
    horizon_days: int = Field(default=30, ge=7, le=365)
    from_date: date | None = None
    to_date: date | None = None


class AiForecastRunResponse(BaseModel):
    id: int
    tenant_id: int
    user_id: int | None
    session_id: int | None
    request_id: str | None
    forecast_code: str
    forecast_name: str
    status: str
    source_modules: list[str] = Field(default_factory=list)
    assumptions_json: dict[str, Any] = Field(default_factory=dict)
    parameters_json: dict[str, Any] = Field(default_factory=dict)
    result_json: dict[str, Any] = Field(default_factory=dict)
    confidence_score: float | None = None
    narrative_explanation: str | None = None
    created_at: datetime
    completed_at: datetime | None = None
    model_version: str | None = None
    model_type: str | None = None
    quality_metrics: dict[str, Any] | None = None
    expires_at: datetime | None = None
    celery_task_id: str | None = None


class AiKnowledgeSourceReference(BaseModel):
    document_code: str
    document_title: str
    doc_type: str
    source_area: str
    heading: str | None = None
    snippet: str
    score: float
    metadata: dict[str, Any] = Field(default_factory=dict)


class AiKnowledgeQueryRequest(BaseModel):
    query: str = Field(min_length=3, max_length=4000)
    top_k: int = Field(default=5, ge=1, le=20)


class AiKnowledgeQueryResponse(BaseModel):
    answer: str
    used_sources: list[AiKnowledgeSourceReference] = Field(default_factory=list)
    retrieved_from_knowledge: bool = True
    disclaimer: str


class AiKnowledgeDocumentResponse(BaseModel):
    id: int
    tenant_id: int | None
    document_code: str
    title: str
    doc_type: str
    source_area: str
    owner_scope: str
    visibility: str
    permission_key: str | None = None
    version_tag: str | None = None
    metadata_json: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class AiActionRunResponse(BaseModel):
    id: int
    tenant_id: int
    user_id: int | None
    session_id: int | None
    message_id: int | None
    request_id: str
    action_key: str
    status: str
    requires_confirmation: bool
    confirmation_token: str | None = None
    confirmation_token_hint: str | None = None
    risk_level: str
    prompt_text: str
    preview_text: str | None = None
    input_json: dict[str, Any] = Field(default_factory=dict)
    output_json: dict[str, Any] = Field(default_factory=dict)
    error_text: str | None = None
    created_at: datetime
    confirmed_at: datetime | None = None
    executed_at: datetime | None = None


class AiProposeActionRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=4000)
    session_id: int | None = None


class AiConfirmActionRequest(BaseModel):
    confirmation_token: str = Field(min_length=6, max_length=64)


class AiAnomalyEventResponse(BaseModel):
    id: int
    tenant_id: int
    user_id: int | None
    session_id: int | None
    request_id: str | None
    source_area: str
    rule_code: str
    severity: str
    title: str
    explanation: str
    metrics_json: dict[str, Any] = Field(default_factory=dict)
    dimensions_json: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class AiGenerateAnomalyInsightsRequest(BaseModel):
    session_id: int | None = None


class AiAnomalyGenerateResponse(BaseModel):
    summary: str
    gemini_narrative: str | None = None
    events: list[dict[str, Any]] = Field(default_factory=list)
    persisted_event_ids: list[int] = Field(default_factory=list)
    logic_version: str
    scheduler_ready: bool = True


class AiOpsOverviewResponse(BaseModel):
    period_hours: int
    total_events: int
    blocked_events: int
    error_events: int
    avg_duration_ms: int
    tool_success_rate: float


class AiWeeklyReportResponse(BaseModel):
    id: int
    tenant_id: int
    week_start: date
    week_end: date
    narrative: str
    kpi_snapshot_json: dict[str, Any] | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AiWeeklyReportListResponse(BaseModel):
    items: list[AiWeeklyReportResponse]


class AiSystemTaskCreateRequest(BaseModel):
    task_type: str = Field(min_length=1, max_length=64)
    execution_conditions: dict[str, Any] = Field(default_factory=dict)
    payload: dict[str, Any] = Field(default_factory=dict)
    priority: int = Field(default=5, ge=1, le=10)
    idempotency_key: str | None = Field(default=None, max_length=128)
    session_id: int | None = None
    simulation: bool = False


class AiSystemTaskResponse(BaseModel):
    id: int
    tenant_id: int
    user_id: int | None
    session_id: int | None
    task_code: str
    task_type: str
    task_category: str
    status: str
    priority: int
    requires_approval: bool
    simulation: bool = False
    result_json: dict[str, Any] | None = None
    error_text: str | None = None
    created_at: datetime
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}


class AiFeedbackSubmitRequest(BaseModel):
    message_id: int | None = None
    trace_id: str | None = Field(default=None, max_length=64)
    rating: int = Field(ge=-1, le=1)
    correction_text: str | None = Field(default=None, max_length=8000)
    feedback_category: str | None = Field(default=None, max_length=64)
    flagged_for_review: bool = False
    detected_intent: str | None = Field(default=None, max_length=64)
    route_used: str | None = Field(default=None, max_length=64)
    tools_used: list[str] | None = None
    retrieval_method: str | None = Field(default=None, max_length=64)
    model_used: str | None = Field(default=None, max_length=128)
    confidence: float | None = None


class AiFeedbackResponse(BaseModel):
    id: int
    tenant_id: int
    user_id: int
    message_id: int | None
    trace_id: str | None
    rating: int
    feedback_category: str | None
    flagged_for_review: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class AiApprovalArtifactResponse(BaseModel):
    id: int
    tenant_id: int
    artifact_code: str
    artifact_type: str
    source_tool: str
    source_module: str
    status: str
    original_input_json: dict[str, Any] | None = None
    generated_payload_json: dict[str, Any] | None = None
    diff_json: dict[str, Any] | None = None
    committed_payload_json: dict[str, Any] | None = None
    commit_reference: str | None = None
    reviewer_comments: str | None = None
    created_at: datetime
    expires_at: datetime | None = None

    model_config = {"from_attributes": True}


class AiApprovalArtifactReviewRequest(BaseModel):
    comments: str | None = Field(default=None, max_length=4000)


class AiApprovalArtifactRollbackRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=4000)


class AiApprovalArtifactCommitResult(BaseModel):
    artifact: AiApprovalArtifactResponse
    erp_result: dict[str, Any] | None = None
    error: str | None = None


class AiPermissionPolicyCreateRequest(BaseModel):
    role_id: int | None = None
    module: str = Field(default="*", max_length=64)
    tool_name: str = Field(default="*", max_length=128)
    safety_class_allowed: str = Field(default="*", max_length=24)
    action: str = Field(default="allow", max_length=16)
    priority: int = 0
    is_active: bool = True


class AiPermissionPolicyResponse(BaseModel):
    id: int
    tenant_id: int
    role_id: int | None
    module: str
    tool_name: str
    safety_class_allowed: str
    action: str
    priority: int
    is_active: bool

    model_config = {"from_attributes": True}


class AiPermissionPolicyAdminCreateRequest(AiPermissionPolicyCreateRequest):
    tenant_id: int = Field(ge=1)


class AiTaskPolicyCreateRequest(BaseModel):
    task_type: str = Field(default="*", max_length=64)
    is_enabled: bool = True
    max_frequency_per_hour: int | None = None
    cooldown_seconds: int | None = None
    allow_simulation: bool = True
    require_approval: bool | None = None
    max_retries_override: int | None = None
    priority: int = 0


class AiTaskPolicyResponse(BaseModel):
    id: int
    tenant_id: int | None
    task_type: str
    is_enabled: bool
    max_frequency_per_hour: int | None
    cooldown_seconds: int | None
    allow_simulation: bool
    require_approval: bool | None = None
    max_retries_override: int | None = None
    priority: int

    model_config = {"from_attributes": True}


class AiTaskPolicyAdminCreateRequest(AiTaskPolicyCreateRequest):
    tenant_id: int | None = Field(default=None, description="NULL = platform default policy row")


class AiIngestionJobResponse(BaseModel):
    id: int
    tenant_id: int
    source_type: str
    status: str
    trigger: str
    chunks_processed: int
    chunks_failed: int
    chunks_skipped: int
    source_checksum: str | None
    error_text: str | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AiAdminFeedbackReviewRequest(BaseModel):
    admin_notes: str | None = Field(default=None, max_length=4000)
