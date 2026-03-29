"""Pydantic contracts for vendor (supplier) AI endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.ai_extract.schemas import VendorExtractionResponse


class VendorAiVendorOut(BaseModel):
    """Aligned with inventory VendorOut for apply responses (avoids circular imports)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    vendor_code: str
    name: str
    contact_person: str | None
    email: str | None
    phone: str | None
    address: str | None
    is_active: bool
    ledger_id: int | None
    default_currency: str | None
    payment_terms_days: int | None
    vendor_type: str | None
    country: str | None
    city: str | None
    tax_id: str | None
    bank_name: str | None
    bank_account_no: str | None
    swift_code: str | None
    credit_limit: float | None
    legal_name: str | None = None
    trade_name: str | None = None
    website: str | None = None
    mobile: str | None = None
    designation: str | None = None
    address_line1: str | None = None
    state_or_region: str | None = None
    postal_code: str | None = None
    registration_number: str | None = None
    bank_account_title: str | None = None
    iban: str | None = None
    payment_terms: str | None = None
    incoterms: str | None = None
    shipping_terms: str | None = None
    lead_time_notes: str | None = None
    compliance_status: str | None = None
    compliance_reference_numbers: str | None = None
    certifications_summary: str | None = None
    onboarding_status: str | None = None
    remarks: str | None = None
    internal_notes: str | None = None
    created_at: datetime
    updated_at: datetime


class VendorAiFieldSuggestion(BaseModel):
    value: str | None = None
    confidence: float = Field(ge=0.0, le=1.0, default=0.5)
    source: str = Field(default="ai_inference", max_length=64)
    rationale: str | None = Field(None, max_length=512)


class VendorAiEnrichRequest(BaseModel):
    vendor_id: int | None = None
    website: str | None = None
    domain: str | None = None
    email: str | None = None
    company_name: str | None = None
    fields: dict[str, str | None] = Field(default_factory=dict)


class VendorAiEnrichResponse(BaseModel):
    suggestions: dict[str, VendorAiFieldSuggestion] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    suggestion_batch_id: int | None = None


class VendorAiValidateIssue(BaseModel):
    field: str
    severity: str = Field(..., max_length=16)
    message: str
    suggestion: str | None = None


class VendorAiValidateRequest(BaseModel):
    fields: dict[str, Any] = Field(default_factory=dict)
    vendor_id: int | None = None


class VendorAiValidateResponse(BaseModel):
    issues: list[VendorAiValidateIssue] = Field(default_factory=list)
    completeness_score: int = Field(ge=0, le=100)
    banking_score: int = Field(ge=0, le=100, default=0)
    compliance_score: int = Field(ge=0, le=100, default=0)
    normalized_fields: dict[str, str | None] = Field(default_factory=dict)
    suggestion_batch_id: int | None = None


class VendorAiDedupeRequest(BaseModel):
    fields: dict[str, Any] = Field(default_factory=dict)
    exclude_vendor_id: int | None = None


class VendorAiDedupeMatch(BaseModel):
    vendor_id: int
    vendor_code: str
    name: str
    score: float = Field(ge=0.0, le=1.0)
    matched_on: list[str] = Field(default_factory=list)


class VendorAiDedupeResponse(BaseModel):
    matches: list[VendorAiDedupeMatch] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    suggestion_batch_id: int | None = None


class VendorAiSummaryRequest(BaseModel):
    vendor_id: int


class VendorAiSummaryResponse(BaseModel):
    summary_text: str = ""
    key_facts: list[str] = Field(default_factory=list)
    risk_indicators: list[str] = Field(default_factory=list)
    profile_grade: str = Field(default="unknown", max_length=32)
    suggestion_batch_id: int | None = None


class VendorAiNextActionItem(BaseModel):
    action_type: str = Field(..., max_length=64)
    title: str
    description: str = ""
    priority: int = Field(default=5, ge=1, le=9)
    target_module: str = Field(default="inventory", max_length=64)
    target_url: str | None = Field(None, max_length=512)


class VendorAiNextActionsRequest(BaseModel):
    vendor_id: int


class VendorAiNextActionsResponse(BaseModel):
    actions: list[VendorAiNextActionItem] = Field(default_factory=list)
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


class VendorAiExtractWrapResponse(BaseModel):
    extraction: VendorExtractionResponse
    model_hint: str = "gemini_multimodal"
    request_id: str | None = None
    suggestion_batch_id: int | None = None


class VendorAiAuditEntry(BaseModel):
    id: int
    action: str
    created_at: str
    model_used: str | None = None
    latency_ms: int | None = None
    result: str | None = None
    error_category: str | None = None
    vendor_id: int | None = None
    summary: str | None = None
    suggestion_batch_id: int | None = None
    actor_username: str | None = None
    event_label: str | None = None
    issue_count: int | None = None
    match_count: int | None = None
    key_facts_count: int | None = None
    action_count: int | None = None
    applied_field_count: int | None = None


class VendorAiAuditListResponse(BaseModel):
    items: list[VendorAiAuditEntry] = Field(default_factory=list)


class VendorAiSuggestionActionItem(BaseModel):
    field_key: str = Field(..., max_length=64)
    decision: Literal["apply", "reject", "skip"]


class VendorAiMarkDecisionsRequest(BaseModel):
    batch_id: int
    decisions: list[VendorAiSuggestionActionItem] = Field(default_factory=list)


class VendorAiApplySuggestionsRequest(BaseModel):
    batch_id: int
    vendor_id: int
    items: list[VendorAiSuggestionActionItem] = Field(default_factory=list)
    conflict_mode: Literal["overwrite", "skip_if_different"] = "skip_if_different"


class VendorAiApplyConflict(BaseModel):
    field: str
    current: str = ""
    suggested: str = ""


class VendorAiApplySuggestionsResponse(BaseModel):
    vendor: VendorAiVendorOut
    applied_fields: list[str] = Field(default_factory=list)
    skipped_fields: list[str] = Field(default_factory=list)
    rejected_fields: list[str] = Field(default_factory=list)
    conflicts: list[VendorAiApplyConflict] = Field(default_factory=list)


class VendorAiDiscardBatchRequest(BaseModel):
    batch_id: int


class VendorAiLinkBatchRequest(BaseModel):
    batch_id: int
    vendor_id: int


class VendorAiFinalizeAfterCreateRequest(BaseModel):
    batch_id: int
    vendor_id: int


class VendorAiFinalizeAfterCreateResponse(BaseModel):
    applied_fields: list[str] = Field(default_factory=list)
    diff_summary: list[dict[str, str]] = Field(default_factory=list)
