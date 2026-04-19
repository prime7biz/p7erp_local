"""Pydantic contracts for quotation AI endpoints."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.ai_extract.schemas import InquiryExtractionResponse


class QuotationAiQuotationOut(BaseModel):
    """Narrow shape returned after AI apply — avoids circular imports with full response."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    customer_id: int
    inquiry_id: int | None
    quotation_code: str
    style_ref: str | None
    style_id: int | None
    customer_intermediary_id: int | None
    department: str | None
    projected_quantity: int | None
    projected_delivery_date: date | None
    quotation_date: date | None
    target_price: str | None
    target_price_currency: str | None
    exchange_rate: str | None
    shipping_term: str | None
    commission_mode: str | None
    commission_type: str | None
    commission_value: float | None
    currency: str | None
    valid_until: date | None
    notes: str | None
    status: str
    version_no: int
    created_at: datetime
    updated_at: datetime


class QuotationAiFieldSuggestion(BaseModel):
    value: str | None = None
    confidence: float = Field(ge=0.0, le=1.0, default=0.5)
    source: str = Field(default="ai_inference", max_length=64)
    rationale: str | None = Field(None, max_length=512)


class QuotationAiEnrichRequest(BaseModel):
    quotation_id: int | None = None
    website: str | None = None
    domain: str | None = None
    email: str | None = None
    company_name: str | None = None
    fields: dict[str, str | None] = Field(default_factory=dict)


class QuotationAiEnrichResponse(BaseModel):
    suggestions: dict[str, QuotationAiFieldSuggestion] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    suggestion_batch_id: int | None = None


class QuotationAiExtractWrapResponse(BaseModel):
    """Document extraction → inquiry-shaped fields; mapped to quotation suggestion batch on apply."""

    extraction: InquiryExtractionResponse
    model_hint: str = "gemini_multimodal"
    request_id: str | None = None
    suggestion_batch_id: int | None = None


class QuotationAiValidateIssue(BaseModel):
    field: str
    severity: str = Field(..., max_length=16)
    message: str
    suggestion: str | None = None


class QuotationAiValidateRequest(BaseModel):
    fields: dict[str, Any] = Field(default_factory=dict)
    quotation_id: int | None = None


class QuotationAiValidateResponse(BaseModel):
    issues: list[QuotationAiValidateIssue] = Field(default_factory=list)
    completeness_score: int = Field(ge=0, le=100)
    costing_readiness_score: int = Field(ge=0, le=100, default=0)
    commercial_risk_score: int = Field(ge=0, le=100, default=0)
    normalized_fields: dict[str, str | None] = Field(default_factory=dict)
    suggestion_batch_id: int | None = None


class QuotationAiDedupeRequest(BaseModel):
    fields: dict[str, Any] = Field(default_factory=dict)
    exclude_quotation_id: int | None = None


class QuotationAiDedupeMatch(BaseModel):
    quotation_id: int
    quotation_code: str
    customer_id: int
    score: float = Field(ge=0.0, le=1.0)
    matched_on: list[str] = Field(default_factory=list)


class QuotationAiDedupeResponse(BaseModel):
    matches: list[QuotationAiDedupeMatch] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    suggestion_batch_id: int | None = None


class QuotationAiSummaryRequest(BaseModel):
    quotation_id: int


class QuotationAiSummaryResponse(BaseModel):
    summary_text: str = ""
    key_facts: list[str] = Field(default_factory=list)
    risk_indicators: list[str] = Field(default_factory=list)
    profile_grade: str = Field(default="unknown", max_length=32)
    suggestion_batch_id: int | None = None


class QuotationAiNextActionItem(BaseModel):
    action_type: str = Field(..., max_length=64)
    title: str
    description: str = ""
    priority: int = Field(default=5, ge=1, le=9)
    target_module: str = Field(default="costing", max_length=64)
    target_url: str | None = Field(None, max_length=512)


class QuotationAiNextActionsRequest(BaseModel):
    quotation_id: int


class QuotationAiNextActionsResponse(BaseModel):
    actions: list[QuotationAiNextActionItem] = Field(default_factory=list)
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


class QuotationAiExtractWrapResponse(BaseModel):
    extraction: dict[str, Any]
    model_hint: str = "gemini_multimodal"
    request_id: str | None = None
    suggestion_batch_id: int | None = None


class QuotationAiAuditEntry(BaseModel):
    id: int
    action: str
    created_at: str
    model_used: str | None = None
    latency_ms: int | None = None
    result: str | None = None
    error_category: str | None = None
    quotation_id: int | None = None
    summary: str | None = None
    suggestion_batch_id: int | None = None
    actor_username: str | None = None
    event_label: str | None = None
    issue_count: int | None = None
    match_count: int | None = None
    key_facts_count: int | None = None
    action_count: int | None = None
    applied_field_count: int | None = None


class QuotationAiAuditListResponse(BaseModel):
    items: list[QuotationAiAuditEntry] = Field(default_factory=list)


class QuotationAiSuggestionActionItem(BaseModel):
    field_key: str = Field(..., max_length=64)
    decision: Literal["apply", "reject", "skip"]


class QuotationAiMarkDecisionsRequest(BaseModel):
    batch_id: int
    decisions: list[QuotationAiSuggestionActionItem] = Field(default_factory=list)


class QuotationAiApplySuggestionsRequest(BaseModel):
    batch_id: int
    quotation_id: int
    items: list[QuotationAiSuggestionActionItem] = Field(default_factory=list)
    conflict_mode: Literal["overwrite", "skip_if_different"] = "skip_if_different"


class QuotationAiApplyConflict(BaseModel):
    field: str
    current: str = ""
    suggested: str = ""


class QuotationAiApplyRequiresChangeItem(BaseModel):
    field_key: str
    message: str


class QuotationAiApplySuggestionsResponse(BaseModel):
    quotation: QuotationAiQuotationOut
    applied_fields: list[str] = Field(default_factory=list)
    skipped_fields: list[str] = Field(default_factory=list)
    rejected_fields: list[str] = Field(default_factory=list)
    conflicts: list[QuotationAiApplyConflict] = Field(default_factory=list)
    requires_change_request: list[QuotationAiApplyRequiresChangeItem] = Field(default_factory=list)


class QuotationAiDiscardBatchRequest(BaseModel):
    batch_id: int


class QuotationAiLinkBatchRequest(BaseModel):
    batch_id: int
    quotation_id: int


class QuotationAiFinalizeAfterCreateRequest(BaseModel):
    batch_id: int
    quotation_id: int


class QuotationAiFinalizeAfterCreateResponse(BaseModel):
    applied_fields: list[str] = Field(default_factory=list)
    diff_summary: list[dict[str, str]] = Field(default_factory=list)


class QuotationAiIndicatorsOut(BaseModel):
    """Rules-based scores for list/detail (no LLM). Optional on list when ai_indicators=1."""

    completeness_score: int = Field(ge=0, le=100, default=0)
    costing_readiness_score: int = Field(ge=0, le=100, default=0)
    flags: list[str] = Field(default_factory=list)
    # Phase 1 read-only costing intelligence (header + line counts on detail; header-only on list).
    costing_phase1_enabled: bool = True
    signal_scope: Literal["header_only", "full_costing"] = "full_costing"
    confidence_basis: Literal["partial", "full"] = "full"
    source_mode: Literal["deterministic_only"] = "deterministic_only"
    reason_codes: list[str] = Field(default_factory=list)
    limited_confidence: bool = False
    cost_completeness_score: int = Field(ge=0, le=100, default=0)
    costing_confidence_score: int = Field(ge=0, le=100, default=0)
    anomaly_severity: Literal["none", "low", "medium", "high"] = "none"
    margin_pressure: Literal["low", "medium", "high"] = "low"
    fx_sensitivity: bool = False
    missing_prerequisite_count: int = Field(ge=0, default=0)
    urgent_costing_review: bool = False
    costing_flags: list[str] = Field(default_factory=list)
    # Phase 13: last benchmark hint from audit (when benchmark_hint=1 on list).
    cost_benchmark_enabled: bool = False
    cost_benchmark_label: str | None = Field(
        default=None,
        description="over_cost | under_cost | abnormal | normal | insufficient_data",
    )


# ----- Read-only costing intelligence (Phase 1) -----


class QuotationCostingAiRequest(BaseModel):
    quotation_id: int = Field(ge=1)


class CostingIntelItem(BaseModel):
    """Machine-readable reason_code (stable); code mirrors reason_code for backward compatibility."""

    reason_code: str = Field(max_length=64)
    code: str = Field(max_length=64)
    severity: str = Field(max_length=16)
    message: str = Field(max_length=1024)


class QuotationCostingAiSignalMeta(BaseModel):
    signal_scope: Literal["header_only", "full_costing"]
    confidence_basis: Literal["partial", "full"]
    source_mode: Literal["deterministic_only"] = "deterministic_only"
    reason_codes: list[str] = Field(default_factory=list)
    limited_confidence: bool = False


class QuotationCostingAiCompletenessResponse(QuotationCostingAiSignalMeta):
    advisory_notice: str
    quotation_id: int
    cost_completeness_score: int = Field(ge=0, le=100)
    costing_confidence_score: int = Field(ge=0, le=100)
    items: list[CostingIntelItem] = Field(default_factory=list)
    line_counts: dict[str, int] = Field(default_factory=dict)


class QuotationCostingAiAnomalyScanResponse(QuotationCostingAiSignalMeta):
    advisory_notice: str
    quotation_id: int
    anomaly_severity: Literal["none", "low", "medium", "high"]
    items: list[CostingIntelItem] = Field(default_factory=list)


class QuotationCostingAiMarginRiskResponse(QuotationCostingAiSignalMeta):
    advisory_notice: str
    quotation_id: int
    margin_pressure: Literal["low", "medium", "high"]
    context: dict[str, Any] = Field(default_factory=dict)


class QuotationCostingAiFxSensitivityResponse(QuotationCostingAiSignalMeta):
    advisory_notice: str
    quotation_id: int
    fx_sensitivity: bool
    context: dict[str, Any] = Field(default_factory=dict)


class QuotationCostingAiCostingSummaryResponse(QuotationCostingAiSignalMeta):
    advisory_notice: str
    quotation_id: int
    summary_lines: list[str] = Field(default_factory=list)
    scores: dict[str, Any] = Field(default_factory=dict)


class QuotationCostingNextActionItem(BaseModel):
    title: str = Field(max_length=200)
    description: str = Field(max_length=600)
    category: str = Field(max_length=64)


class QuotationCostingAiNextActionsResponse(QuotationCostingAiSignalMeta):
    advisory_notice: str
    quotation_id: int
    actions: list[QuotationCostingNextActionItem] = Field(default_factory=list)


# ----- Costing suggestions Phase 2 (line-level review) -----


class QuotationCostingSuggestionItemOut(BaseModel):
    id: int
    ordinal: int
    cost_category: Literal["material", "manufacturing", "other_cost"]
    target_line_id: int | None = None
    suggestion_type: str = Field(default="modify_line", max_length=32)
    field_changes_json: dict[str, Any] = Field(default_factory=dict)
    confidence: float | None = None
    reason_code: str | None = None
    explanation: str | None = None
    source_mode: str = "deterministic_only"
    disposition: str = "pending"
    before_snapshot_json: dict[str, Any] | None = None


class QuotationCostingSuggestionBatchOut(BaseModel):
    id: int
    tenant_id: int
    quotation_id: int | None
    action_type: str
    status: str
    meta_json: dict[str, Any] | None = None
    created_at: str | None = None
    updated_at: str | None = None
    expires_at: str | None = None
    items: list[QuotationCostingSuggestionItemOut] = Field(default_factory=list)


class QuotationCostingSuggestionDecisionItem(BaseModel):
    item_id: int = Field(ge=1)
    decision: Literal["apply", "reject", "skip"]


class QuotationCostingSuggestionMarkDecisionsRequest(BaseModel):
    batch_id: int = Field(ge=1)
    decisions: list[QuotationCostingSuggestionDecisionItem] = Field(default_factory=list)


class QuotationCostingSuggestionApplyRequest(BaseModel):
    quotation_id: int = Field(ge=1)
    batch_id: int = Field(ge=1)
    items: list[QuotationCostingSuggestionDecisionItem] = Field(default_factory=list)


class QuotationCostingSuggestionApplyResponse(BaseModel):
    quotation_id: int
    batch_id: int
    applied_item_ids: list[int] = Field(default_factory=list)
    skipped_item_ids: list[int] = Field(default_factory=list)
    rejected_item_ids: list[int] = Field(default_factory=list)
    blocked_items: list[dict[str, Any]] = Field(default_factory=list)
    requires_revision: bool = False


class QuotationCostingSuggestionDiscardRequest(BaseModel):
    batch_id: int = Field(ge=1)


# ----- Cost benchmark (Phase 13) -----


class BenchmarkRange(BaseModel):
    min: float | None = None
    max: float | None = None
    avg: float | None = None
    p25: float | None = None
    p75: float | None = None


class BenchmarkMetricOut(BaseModel):
    metric_key: str
    benchmark_range: BenchmarkRange
    current_value: float | None = None
    deviation_percent: float | None = None
    """0–1: strength of peer sample for this metric (peer count + spread heuristic)."""
    confidence: float = Field(ge=0.0, le=1.0, default=0.5)
    classification: Literal[
        "normal",
        "slightly_high",
        "slightly_low",
        "high",
        "low",
        "abnormal",
        "insufficient_data",
    ]
    reason_code: str | None = None
    explanation: str | None = None


class CostBenchmarkRequest(BaseModel):
    quotation_id: int = Field(ge=1)
    same_customer_only: bool = False
    months_back: int = Field(default=12, ge=1, le=60)


class CostBenchmarkResponse(BaseModel):
    advisory_notice: str = "Advisory only — rules-based benchmark vs tenant history. Does not change costing."
    quotation_id: int
    insufficient_data: bool = False
    similar_quotation_count: int = 0
    overall_classification: Literal[
        "normal",
        "slightly_high",
        "slightly_low",
        "high",
        "low",
        "abnormal",
        "insufficient_data",
    ] = "insufficient_data"
    """0–1: aggregate confidence from peer count and per-metric spread."""
    overall_confidence: float = Field(ge=0.0, le=1.0, default=0.2)
    metrics: list[BenchmarkMetricOut] = Field(default_factory=list)
    summary: str = ""
    next_actions: list[str] = Field(default_factory=list)
    source_mode: Literal["deterministic_only", "deterministic_plus_narrative"] = "deterministic_only"
    reason_codes: list[str] = Field(default_factory=list)


class CostBenchmarkHistoryEntry(BaseModel):
    id: int
    created_at: str | None = None
    action: str
    quotation_id: int | None = None
    summary: str | None = None
    overall_classification: str | None = None
    overall_confidence: float | None = None


class CostBenchmarkHistoryResponse(BaseModel):
    items: list[CostBenchmarkHistoryEntry] = Field(default_factory=list)
