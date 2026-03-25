"""Pydantic models for AI extraction responses."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ExtractedField(BaseModel):
    value: Any = None
    confidence: float = Field(ge=0.0, le=1.0)
    source_text: str | None = None


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
