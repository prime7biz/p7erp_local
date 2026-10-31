"""Pydantic models for AI extraction responses."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ExtractedField(BaseModel):
    value: Any = None
    confidence: float = Field(ge=0.0, le=1.0)
    source_text: str | None = None
    # Attribution: uploaded_document | website | domain | existing_record_match | ai_inference
    source: str = Field(default="uploaded_document", max_length=64)


class DuplicateWarning(BaseModel):
    field: str
    existing_value: str
    existing_id: int


class InquiryItemExtracted(BaseModel):
    item_name: str = ""
    description: str = ""
    quantity: int | None = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class CandidateMatch(BaseModel):
    id: int
    name: str
    score: float = Field(ge=0.0, le=1.0)


class CustomerExtractionResponse(BaseModel):
    success: bool
    document_type: str = "customer_info"
    fields: dict[str, ExtractedField] = Field(default_factory=dict)
    unmapped_text: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    duplicate_warnings: list[DuplicateWarning] = Field(default_factory=list)


class InquiryExtractionResponse(BaseModel):
    success: bool
    document_type: str = "inquiry_info"
    fields: dict[str, ExtractedField] = Field(default_factory=dict)
    items: list[InquiryItemExtracted] = Field(default_factory=list)
    candidate_matches: dict[str, list[CandidateMatch]] = Field(default_factory=dict)
    unmapped_text: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class VendorExtractionResponse(BaseModel):
    success: bool
    document_type: str = "vendor_info"
    fields: dict[str, ExtractedField] = Field(default_factory=dict)
    unmapped_text: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    duplicate_warnings: list[DuplicateWarning] = Field(default_factory=list)


class OrderExtractionResponse(BaseModel):
    """Buyer PO / order confirmation extraction → order header suggestions (no DB writes)."""

    success: bool
    document_type: str = "order_info"
    fields: dict[str, ExtractedField] = Field(default_factory=dict)
    unmapped_text: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class LcExtractionResponse(BaseModel):
    """Letter of Credit / master contract document extraction (no DB writes)."""

    success: bool
    document_type: str = "lc_info"
    fields: dict[str, ExtractedField] = Field(default_factory=dict)
    unmapped_text: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    alerts: list[dict[str, str]] = Field(default_factory=list)
    suggest_create_master_contract: bool = True


class ShippingDocExtractionResponse(BaseModel):
    """BL / AWB / packing list / booking note extraction (no DB writes)."""

    success: bool
    document_type: str = "shipping_doc_info"
    fields: dict[str, ExtractedField] = Field(default_factory=dict)
    unmapped_text: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    alerts: list[dict[str, str]] = Field(default_factory=list)
    suggested_status: str | None = "IN_TRANSIT"
    matched_shipment_id: int | None = None
    matched_shipment_reference: str | None = None
    match_hint: str | None = None


class HrDocExtractionResponse(BaseModel):
    """HR CV / NID / medical / birth certificate extraction (no DB writes)."""

    success: bool
    document_type: str = "hr_doc"
    fields: dict[str, ExtractedField] = Field(default_factory=dict)
    unmapped_text: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    alerts: list[dict[str, str]] = Field(default_factory=list)
