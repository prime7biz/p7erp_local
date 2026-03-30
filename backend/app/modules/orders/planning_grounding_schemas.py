"""Pydantic models for deterministic planning grounding snapshots."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class GroundingSignal(BaseModel):
    code: str
    status: str  # ok | warning | blocked | unavailable
    confidence: str  # high | medium | low
    value: Any | None = None
    explanation: str = ""
    source: str = ""


class PlanningGroundingSnapshot(BaseModel):
    order_id: int
    computed_at: datetime
    overall_readiness: str  # ready | at_risk | blocked | incomplete
    signals: list[GroundingSignal] = Field(default_factory=list)
    dependency_completeness: dict[str, bool] = Field(default_factory=dict)
    assumptions: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)


class PlanningGroundingSummaryRow(BaseModel):
    order_id: int
    overall_readiness: str
    pending_change_requests: int = 0
