"""Pydantic contracts for order AI endpoints."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.modules.ai_extract.schemas import OrderExtractionResponse


class OrderAiOrderOut(BaseModel):
    """Narrow shape returned after AI apply."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    customer_id: int
    quotation_id: int | None
    order_code: str
    style_ref: str | None
    customer_intermediary_id: int | None
    shipping_term: str | None
    commission_mode: str | None
    commission_type: str | None
    commission_value: float | None
    order_date: date | None
    delivery_date: date | None
    quantity: int | None
    status: str
    remarks: str | None
    created_at: datetime
    updated_at: datetime


class OrderAiFieldSuggestion(BaseModel):
    value: str | None = None
    confidence: float = Field(ge=0.0, le=1.0, default=0.5)
    source: str = Field(default="ai_inference", max_length=64)
    rationale: str | None = Field(None, max_length=512)


class OrderAiEnrichRequest(BaseModel):
    order_id: int | None = None
    website: str | None = None
    domain: str | None = None
    email: str | None = None
    company_name: str | None = None
    fields: dict[str, str | None] = Field(default_factory=dict)


class OrderAiEnrichResponse(BaseModel):
    suggestions: dict[str, OrderAiFieldSuggestion] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    suggestion_batch_id: int | None = None


class OrderAiValidateIssue(BaseModel):
    field: str
    severity: str = Field(..., max_length=16)
    message: str
    suggestion: str | None = None


class OrderAiValidateRequest(BaseModel):
    fields: dict[str, Any] = Field(default_factory=dict)
    order_id: int | None = None


class OrderAiValidateResponse(BaseModel):
    issues: list[OrderAiValidateIssue] = Field(default_factory=list)
    completeness_score: int = Field(ge=0, le=100)
    execution_readiness_score: int = Field(ge=0, le=100, default=0)
    commercial_risk_score: int = Field(ge=0, le=100, default=0)
    normalized_fields: dict[str, str | None] = Field(default_factory=dict)
    suggestion_batch_id: int | None = None


class OrderAiDedupeRequest(BaseModel):
    fields: dict[str, Any] = Field(default_factory=dict)
    exclude_order_id: int | None = None


class OrderAiDedupeMatch(BaseModel):
    order_id: int
    order_code: str
    customer_id: int
    score: float = Field(ge=0.0, le=1.0)
    matched_on: list[str] = Field(default_factory=list)


class OrderAiDedupeResponse(BaseModel):
    matches: list[OrderAiDedupeMatch] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    suggestion_batch_id: int | None = None


class OrderAiSummaryRequest(BaseModel):
    order_id: int


class OrderAiSummaryResponse(BaseModel):
    summary_text: str = ""
    key_facts: list[str] = Field(default_factory=list)
    risk_indicators: list[str] = Field(default_factory=list)
    profile_grade: str = Field(default="unknown", max_length=32)
    suggestion_batch_id: int | None = None


class OrderAiNextActionItem(BaseModel):
    action_type: str = Field(..., max_length=64)
    title: str
    description: str = ""
    priority: int = Field(default=5, ge=1, le=9)
    target_module: str = Field(default="merch", max_length=64)
    target_url: str | None = Field(None, max_length=512)


class OrderAiNextActionsRequest(BaseModel):
    order_id: int
    include_planning_context: bool = False


class OrderAiNextActionsResponse(BaseModel):
    actions: list[OrderAiNextActionItem] = Field(default_factory=list)
    suggestion_batch_id: int | None = None


class _LlmEnrichOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    suggestions: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class _LlmSummaryOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    summary_text: str = ""
    key_facts: list[str] = Field(default_factory=list)
    risk_indicators: list[str] = Field(default_factory=list)
    profile_grade: str = "fair"


class _LlmNextActionsOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    actions: list[dict[str, Any]] = Field(default_factory=list)


class OrderAiExtractWrapResponse(BaseModel):
    extraction: OrderExtractionResponse
    model_hint: str = "gemini_multimodal"
    request_id: str | None = None
    suggestion_batch_id: int | None = None


class OrderAiAuditEntry(BaseModel):
    id: int
    action: str
    created_at: str
    model_used: str | None = None
    latency_ms: int | None = None
    result: str | None = None
    error_category: str | None = None
    order_id: int | None = None
    summary: str | None = None
    suggestion_batch_id: int | None = None
    actor_username: str | None = None
    event_label: str | None = None
    issue_count: int | None = None
    match_count: int | None = None
    key_facts_count: int | None = None
    action_count: int | None = None
    applied_field_count: int | None = None


class OrderAiAuditListResponse(BaseModel):
    items: list[OrderAiAuditEntry] = Field(default_factory=list)


class OrderAiSuggestionActionItem(BaseModel):
    field_key: str = Field(..., max_length=64)
    decision: Literal["apply", "reject", "skip"]


class OrderAiMarkDecisionsRequest(BaseModel):
    batch_id: int
    decisions: list[OrderAiSuggestionActionItem] = Field(default_factory=list)


class OrderAiApplySuggestionsRequest(BaseModel):
    batch_id: int
    order_id: int
    items: list[OrderAiSuggestionActionItem] = Field(default_factory=list)
    conflict_mode: Literal["overwrite", "skip_if_different"] = "skip_if_different"


class OrderAiApplyConflict(BaseModel):
    field: str
    current: str = ""
    suggested: str = ""


class OrderAiApplySuggestionsResponse(BaseModel):
    order: OrderAiOrderOut
    applied_fields: list[str] = Field(default_factory=list)
    skipped_fields: list[str] = Field(default_factory=list)
    rejected_fields: list[str] = Field(default_factory=list)
    conflicts: list[OrderAiApplyConflict] = Field(default_factory=list)


class OrderAiDiscardBatchRequest(BaseModel):
    batch_id: int


class OrderAiLinkBatchRequest(BaseModel):
    batch_id: int
    order_id: int


class OrderAiFinalizeAfterCreateRequest(BaseModel):
    batch_id: int
    order_id: int


class OrderAiFinalizeAfterCreateResponse(BaseModel):
    applied_fields: list[str] = Field(default_factory=list)
    diff_summary: list[dict[str, str]] = Field(default_factory=list)


class OrderAiIndicatorsOut(BaseModel):
    """Rules-based scores for list/detail (no LLM)."""

    completeness_score: int = Field(ge=0, le=100, default=0)
    execution_readiness_score: int = Field(ge=0, le=100, default=0)
    material_readiness_score: int = Field(ge=0, le=100, default=0)
    planning_confidence_score: int = Field(ge=0, le=100, default=0)
    promise_date_risk_score: int = Field(ge=0, le=100, default=0)
    duplicate_risk_score: int = Field(ge=0, le=100, default=0)
    missing_dependency_count: int = Field(ge=0, default=0)
    urgent_planning_flag: bool = False
    flags: list[str] = Field(default_factory=list)
    capacity_bottleneck_flag: bool = False
    bottleneck_severity_score: int = Field(ge=0, le=100, default=0)
    promise_sensitivity_score: int = Field(ge=0, le=100, default=0)


class OrderAiPromiseLineOut(BaseModel):
    item_id: int
    item_code: str
    required_qty: float
    available_qty: float
    shortage_qty: float


class OrderAiPromiseCheckOut(BaseModel):
    order_id: int
    atp_ok: bool
    ctp_ok: bool
    reasons: list[str] = Field(default_factory=list)
    lines: list[OrderAiPromiseLineOut] = Field(default_factory=list)


class OrderAiValidateExecutionRequest(BaseModel):
    fields: dict[str, Any] = Field(default_factory=dict)
    order_id: int | None = None
    include_promise_snapshot: bool = True


class OrderAiValidateExecutionResponse(BaseModel):
    issues: list[OrderAiValidateIssue] = Field(default_factory=list)
    completeness_score: int = Field(ge=0, le=100)
    execution_readiness_score: int = Field(ge=0, le=100, default=0)
    material_readiness_score: int = Field(ge=0, le=100, default=0)
    planning_confidence_score: int = Field(ge=0, le=100, default=0)
    promise_date_risk_score: int = Field(ge=0, le=100, default=0)
    missing_prerequisites: list[str] = Field(default_factory=list)
    normalized_fields: dict[str, str | None] = Field(default_factory=dict)
    promise_check: OrderAiPromiseCheckOut | None = None
    suggestion_batch_id: int | None = None


class OrderAiPlanningRiskCheckRequest(BaseModel):
    order_id: int


class OrderAiPlanningRiskFactor(BaseModel):
    code: str = Field(..., max_length=64)
    severity: Literal["info", "warning", "error"] = "warning"
    message: str = Field(..., max_length=512)
    details: dict[str, Any] = Field(default_factory=dict)


class OrderAiPlanningRiskCheckResponse(BaseModel):
    order_id: int
    risk_band: Literal["low", "medium", "high"] = "medium"
    risk_score: int = Field(ge=0, le=100, default=0)
    material_readiness_score: int = Field(ge=0, le=100, default=0)
    planning_confidence_score: int = Field(ge=0, le=100, default=0)
    promise_date_risk_score: int = Field(ge=0, le=100, default=0)
    missing_prerequisites: list[str] = Field(default_factory=list)
    factors: list[OrderAiPlanningRiskFactor] = Field(default_factory=list)
    promise_check: OrderAiPromiseCheckOut
    suggestion_batch_id: int | None = None


class OrderAiAtpCtpSummaryRequest(BaseModel):
    order_id: int


class OrderAiAtpCtpSummaryResponse(BaseModel):
    order_id: int
    atp_ok: bool
    ctp_ok: bool
    reasons: list[str] = Field(default_factory=list)
    shortage_line_count: int = 0
    max_shortage_qty: float = 0.0
    summary_text: str = ""
    lines: list[OrderAiPromiseLineOut] = Field(default_factory=list)
    suggestion_batch_id: int | None = None


class OrderAiBottleneckOverlapOut(BaseModel):
    line_id: int
    this_config_id: int
    peer_config_id: int
    peer_order_id: int | None = None
    window_start: str = Field(..., max_length=32)
    window_end: str = Field(..., max_length=32)
    peer_window_start: str = Field(..., max_length=32)
    peer_window_end: str = Field(..., max_length=32)
    severity_hint: Literal["info", "warning", "error"] = "warning"
    message: str = Field(..., max_length=512)


class OrderAiCapacityBottleneckScanRequest(BaseModel):
    order_id: int


class OrderAiCapacityBottleneckScanResponse(BaseModel):
    order_id: int
    config_count: int = Field(ge=0, default=0)
    distinct_lines: int = Field(ge=0, default=0)
    overlap_hits: int = Field(ge=0, default=0)
    severity_score: int = Field(ge=0, le=100, default=0)
    bottlenecks: list[OrderAiBottleneckOverlapOut] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    explainability_notes: list[str] = Field(default_factory=list)
    suggestion_batch_id: int | None = None


class OrderAiWhatIfSimulationRequest(BaseModel):
    order_id: int
    scenario_label: str | None = Field(None, max_length=128)
    delivery_date_shift_days: int = Field(default=0, ge=-400, le=400)
    quantity_scale_pct: int | None = Field(None, ge=50, le=200)
    capacity_load_pct: int | None = Field(None, ge=50, le=200)
    material_assumption: Literal["as_is", "strict", "relaxed"] = "as_is"


class OrderAiWhatIfSimulationResponse(BaseModel):
    order_id: int
    scenario_label: str | None = None
    assumptions: list[str] = Field(default_factory=list)
    baseline_promise: OrderAiPromiseCheckOut
    simulated_promise: OrderAiPromiseCheckOut
    bottleneck_severity_baseline: int = Field(ge=0, le=100, default=0)
    bottleneck_severity_adjusted: int = Field(ge=0, le=100, default=0)
    scenario_readiness_score: int = Field(ge=0, le=100, default=0)
    advisory_notes: list[str] = Field(default_factory=list)
    suggestion_batch_id: int | None = None


class OrderAiPromiseSensitivityPointOut(BaseModel):
    offset_days: int
    effective_delivery_date: str | None = None
    atp_ok: bool
    ctp_ok: bool
    reason_count: int = Field(ge=0, default=0)


class OrderAiPromiseSensitivityCheckRequest(BaseModel):
    order_id: int
    delivery_offsets_days: list[int] = Field(default_factory=lambda: [0, -7, 7, -14, 14])

    @field_validator("delivery_offsets_days")
    @classmethod
    def _cap_offsets(cls, v: list[int]) -> list[int]:
        if len(v) > 12:
            raise ValueError("At most 12 delivery offsets allowed")
        return v


class OrderAiPromiseSensitivityCheckResponse(BaseModel):
    order_id: int
    points: list[OrderAiPromiseSensitivityPointOut] = Field(default_factory=list)
    sensitivity_score: int = Field(ge=0, le=100, default=0)
    explainability_notes: list[str] = Field(default_factory=list)
    suggestion_batch_id: int | None = None


class OrderAiExecutionPlanningSummaryRequest(BaseModel):
    order_id: int


class OrderAiExecutionPlanningSummaryResponse(BaseModel):
    order_id: int
    headline: str = Field(default="", max_length=512)
    bullets: list[str] = Field(default_factory=list)
    bottleneck_severity_score: int = Field(ge=0, le=100, default=0)
    scenario_readiness_proxy: int = Field(ge=0, le=100, default=0)
    promise_sensitivity_score: int = Field(ge=0, le=100, default=0)
    recommended_review_path: list[str] = Field(default_factory=list)
    next_step_hints: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    suggestion_batch_id: int | None = None
