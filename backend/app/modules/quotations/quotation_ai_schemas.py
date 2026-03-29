"""Pydantic contracts for quotation AI endpoints."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


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


class QuotationAiApplySuggestionsResponse(BaseModel):
    quotation: QuotationAiQuotationOut
    applied_fields: list[str] = Field(default_factory=list)
    skipped_fields: list[str] = Field(default_factory=list)
    rejected_fields: list[str] = Field(default_factory=list)
    conflicts: list[QuotationAiApplyConflict] = Field(default_factory=list)


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
