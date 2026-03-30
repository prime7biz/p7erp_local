"""API schemas for commercial change requests."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


EntityType = Literal["order", "quotation"]
ChangeRequestStatus = Literal[
    "pending_approval",
    "approved",
    "rejected",
    "applied",
    "cancelled",
]


class CommercialChangeRequestCreate(BaseModel):
    entity_type: EntityType
    entity_id: int = Field(..., gt=0)
    field_key: str = Field(..., min_length=1, max_length=64)
    new_value: Any
    reason: str = Field(..., min_length=1, max_length=4000)
    source: Literal["manual", "ai_suggestion", "system"] = "manual"
    source_ref: str | None = Field(None, max_length=128)


class CommercialChangeRequestOut(BaseModel):
    id: int
    tenant_id: int
    entity_type: str
    entity_id: int
    field_key: str
    old_value: str | None
    new_value: str | None
    reason: str
    source: str
    source_ref: str | None
    status: str
    proposed_by: int | None
    proposed_at: str
    reviewed_by: int | None
    reviewed_at: str | None
    review_note: str | None
    applied_by: int | None
    applied_at: str | None
    request_id: str | None

    class Config:
        from_attributes = True


class CommercialChangeRequestReviewBody(BaseModel):
    note: str | None = Field(None, max_length=2000)


class CommercialChangePendingSummaryOut(BaseModel):
    pending_approval_count: int
