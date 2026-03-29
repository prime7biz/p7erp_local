"""Pydantic contracts for customer AI endpoints (structured JSON only to clients)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.ai_extract.schemas import CustomerExtractionResponse
from app.modules.customers.schemas import CustomerResponse


class CustomerAiFieldSuggestion(BaseModel):
    value: str | None = None
    confidence: float = Field(ge=0.0, le=1.0, default=0.5)
    source: str = Field(default="ai_inference", max_length=64)
    rationale: str | None = Field(None, max_length=512)


class CustomerAiEnrichRequest(BaseModel):
    customer_id: int | None = None
    website: str | None = None
    domain: str | None = None
    email: str | None = None
    company_name: str | None = None
    fields: dict[str, str | None] = Field(default_factory=dict)


class CustomerAiEnrichResponse(BaseModel):
    suggestions: dict[str, CustomerAiFieldSuggestion] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    suggestion_batch_id: int | None = None


class CustomerAiValidateIssue(BaseModel):
    field: str
    severity: str = Field(..., max_length=16)  # error | warning | info
    message: str
    suggestion: str | None = None


class CustomerAiValidateRequest(BaseModel):
    fields: dict[str, Any] = Field(default_factory=dict)
    customer_id: int | None = None


class CustomerAiValidateResponse(BaseModel):
    issues: list[CustomerAiValidateIssue] = Field(default_factory=list)
    completeness_score: int = Field(ge=0, le=100)
    normalized_fields: dict[str, str | None] = Field(default_factory=dict)
    suggestion_batch_id: int | None = None


class CustomerAiDedupeRequest(BaseModel):
    fields: dict[str, Any] = Field(default_factory=dict)
    exclude_customer_id: int | None = None


class CustomerAiDedupeMatch(BaseModel):
    customer_id: int
    customer_code: str
    name: str
    score: float = Field(ge=0.0, le=1.0)
    matched_on: list[str] = Field(default_factory=list)


class CustomerAiDedupeResponse(BaseModel):
    matches: list[CustomerAiDedupeMatch] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    suggestion_batch_id: int | None = None


class CustomerAiSummaryRequest(BaseModel):
    customer_id: int


class CustomerAiSummaryResponse(BaseModel):
    summary_text: str = ""
    key_facts: list[str] = Field(default_factory=list)
    risk_indicators: list[str] = Field(default_factory=list)
    profile_grade: str = Field(default="unknown", max_length=32)
    suggestion_batch_id: int | None = None


class CustomerAiNextActionItem(BaseModel):
    action_type: str = Field(..., max_length=64)
    title: str
    description: str = ""
    priority: int = Field(default=5, ge=1, le=9)
    target_module: str = Field(default="customers", max_length=64)
    target_url: str | None = Field(None, max_length=512)


class CustomerAiNextActionsRequest(BaseModel):
    customer_id: int


class CustomerAiNextActionsResponse(BaseModel):
    actions: list[CustomerAiNextActionItem] = Field(default_factory=list)
    suggestion_batch_id: int | None = None


class CustomerAiNlSearchResponse(BaseModel):
    interpreted_filters: dict[str, str | None] = Field(default_factory=dict)
    keyword: str | None = None
    explanation: str | None = None


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


class _LlmNlFiltersOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    country: str | None = None
    status: str | None = None
    customer_type: str | None = None
    keyword: str | None = None
    explanation: str | None = None


class CustomerAiExtractWrapResponse(BaseModel):
    """Same as extraction plus trace id for audit."""

    extraction: CustomerExtractionResponse
    model_hint: str = "gemini_multimodal"
    request_id: str | None = None
    suggestion_batch_id: int | None = None


class CustomerAiAuditEntry(BaseModel):
    id: int
    action: str
    created_at: str
    model_used: str | None = None
    latency_ms: int | None = None
    result: str | None = None
    error_category: str | None = None
    customer_id: int | None = None
    summary: str | None = None
    suggestion_batch_id: int | None = None
    actor_username: str | None = None
    event_label: str | None = None
    issue_count: int | None = None
    match_count: int | None = None
    key_facts_count: int | None = None
    action_count: int | None = None
    applied_field_count: int | None = None


class CustomerAiAuditListResponse(BaseModel):
    items: list[CustomerAiAuditEntry] = Field(default_factory=list)


class CustomerAiSuggestionActionItem(BaseModel):
    field_key: str = Field(..., max_length=64)
    decision: Literal["apply", "reject", "skip"]


class CustomerAiMarkDecisionsRequest(BaseModel):
    batch_id: int
    decisions: list[CustomerAiSuggestionActionItem] = Field(default_factory=list)


class CustomerAiApplySuggestionsRequest(BaseModel):
    batch_id: int
    customer_id: int
    items: list[CustomerAiSuggestionActionItem] = Field(default_factory=list)
    conflict_mode: Literal["overwrite", "skip_if_different"] = "skip_if_different"


class CustomerAiApplyConflict(BaseModel):
    field: str
    current: str = ""
    suggested: str = ""


class CustomerAiApplySuggestionsResponse(BaseModel):
    customer: CustomerResponse
    applied_fields: list[str] = Field(default_factory=list)
    skipped_fields: list[str] = Field(default_factory=list)
    rejected_fields: list[str] = Field(default_factory=list)
    conflicts: list[CustomerAiApplyConflict] = Field(default_factory=list)


class CustomerAiDiscardBatchRequest(BaseModel):
    batch_id: int


class CustomerAiLinkBatchRequest(BaseModel):
    batch_id: int
    customer_id: int


class CustomerAiFinalizeAfterCreateRequest(BaseModel):
    batch_id: int
    customer_id: int


class CustomerAiFinalizeAfterCreateResponse(BaseModel):
    applied_fields: list[str] = Field(default_factory=list)
    diff_summary: list[dict[str, str]] = Field(default_factory=list)
