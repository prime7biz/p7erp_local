"""Pydantic contracts for inquiry AI endpoints."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.ai_extract.schemas import InquiryExtractionResponse


class InquiryAiInquiryOut(BaseModel):
    """Aligned with Inquiry ORM for apply responses (avoids circular imports with quotations)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    customer_id: int
    inquiry_code: str
    style_ref: str | None
    style_id: int | None
    customer_intermediary_id: int | None
    season: str | None
    department: str | None
    quantity: int | None
    target_price: str | None
    target_price_currency: str | None
    currency: str | None
    exchange_rate: str | None
    expected_delivery_date: date | None
    shipping_term: str | None
    commission_mode: str | None
    commission_type: str | None
    commission_value: float | None
    status: str
    notes: str | None
    created_at: datetime
    updated_at: datetime


class InquiryAiFieldSuggestion(BaseModel):
    value: str | None = None
    confidence: float = Field(ge=0.0, le=1.0, default=0.5)
    source: str = Field(default="ai_inference", max_length=64)
    rationale: str | None = Field(None, max_length=512)


class InquiryAiEnrichRequest(BaseModel):
    inquiry_id: int | None = None
    website: str | None = None
    domain: str | None = None
    email: str | None = None
    company_name: str | None = None
    fields: dict[str, str | None] = Field(default_factory=dict)


class InquiryAiEnrichResponse(BaseModel):
    suggestions: dict[str, InquiryAiFieldSuggestion] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    suggestion_batch_id: int | None = None


class InquiryAiValidateIssue(BaseModel):
    field: str
    severity: str = Field(..., max_length=16)
    message: str
    suggestion: str | None = None


class InquiryAiValidateRequest(BaseModel):
    fields: dict[str, Any] = Field(default_factory=dict)
    inquiry_id: int | None = None


class InquiryAiValidateResponse(BaseModel):
    issues: list[InquiryAiValidateIssue] = Field(default_factory=list)
    completeness_score: int = Field(ge=0, le=100)
    quotation_readiness_score: int = Field(ge=0, le=100, default=0)
    commercial_risk_score: int = Field(ge=0, le=100, default=0)
    normalized_fields: dict[str, str | None] = Field(default_factory=dict)
    suggestion_batch_id: int | None = None


class InquiryAiDedupeRequest(BaseModel):
    fields: dict[str, Any] = Field(default_factory=dict)
    exclude_inquiry_id: int | None = None


class InquiryAiDedupeMatch(BaseModel):
    inquiry_id: int
    inquiry_code: str
    customer_id: int
    score: float = Field(ge=0.0, le=1.0)
    matched_on: list[str] = Field(default_factory=list)


class InquiryAiDedupeResponse(BaseModel):
    matches: list[InquiryAiDedupeMatch] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    suggestion_batch_id: int | None = None


class InquiryAiSummaryRequest(BaseModel):
    inquiry_id: int


class InquiryAiSummaryResponse(BaseModel):
    summary_text: str = ""
    key_facts: list[str] = Field(default_factory=list)
    risk_indicators: list[str] = Field(default_factory=list)
    profile_grade: str = Field(default="unknown", max_length=32)
    suggestion_batch_id: int | None = None


class InquiryAiNextActionItem(BaseModel):
    action_type: str = Field(..., max_length=64)
    title: str
    description: str = ""
    priority: int = Field(default=5, ge=1, le=9)
    target_module: str = Field(default="merch", max_length=64)
    target_url: str | None = Field(None, max_length=512)


class InquiryAiNextActionsRequest(BaseModel):
    inquiry_id: int


class InquiryAiNextActionsResponse(BaseModel):
    actions: list[InquiryAiNextActionItem] = Field(default_factory=list)
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


class InquiryAiExtractWrapResponse(BaseModel):
    extraction: InquiryExtractionResponse
    model_hint: str = "gemini_multimodal"
    request_id: str | None = None
    suggestion_batch_id: int | None = None


class InquiryAiAuditEntry(BaseModel):
    id: int
    action: str
    created_at: str
    model_used: str | None = None
    latency_ms: int | None = None
    result: str | None = None
    error_category: str | None = None
    inquiry_id: int | None = None
    summary: str | None = None
    suggestion_batch_id: int | None = None
    actor_username: str | None = None
    event_label: str | None = None
    issue_count: int | None = None
    match_count: int | None = None
    key_facts_count: int | None = None
    action_count: int | None = None
    applied_field_count: int | None = None


class InquiryAiAuditListResponse(BaseModel):
    items: list[InquiryAiAuditEntry] = Field(default_factory=list)


class InquiryAiSuggestionActionItem(BaseModel):
    field_key: str = Field(..., max_length=64)
    decision: Literal["apply", "reject", "skip"]


class InquiryAiMarkDecisionsRequest(BaseModel):
    batch_id: int
    decisions: list[InquiryAiSuggestionActionItem] = Field(default_factory=list)


class InquiryAiApplySuggestionsRequest(BaseModel):
    batch_id: int
    inquiry_id: int
    items: list[InquiryAiSuggestionActionItem] = Field(default_factory=list)
    conflict_mode: Literal["overwrite", "skip_if_different"] = "skip_if_different"


class InquiryAiApplyConflict(BaseModel):
    field: str
    current: str = ""
    suggested: str = ""


class InquiryAiApplySuggestionsResponse(BaseModel):
    inquiry: InquiryAiInquiryOut
    applied_fields: list[str] = Field(default_factory=list)
    skipped_fields: list[str] = Field(default_factory=list)
    rejected_fields: list[str] = Field(default_factory=list)
    conflicts: list[InquiryAiApplyConflict] = Field(default_factory=list)


class InquiryAiDiscardBatchRequest(BaseModel):
    batch_id: int


class InquiryAiLinkBatchRequest(BaseModel):
    batch_id: int
    inquiry_id: int


class InquiryAiFinalizeAfterCreateRequest(BaseModel):
    batch_id: int
    inquiry_id: int


class InquiryAiFinalizeAfterCreateResponse(BaseModel):
    applied_fields: list[str] = Field(default_factory=list)
    diff_summary: list[dict[str, str]] = Field(default_factory=list)
