from __future__ import annotations

from datetime import date
from typing import Any

from pydantic import BaseModel, Field


class KpiDefinitionOut(BaseModel):
    id: int
    code: str
    name: str
    purpose: str | None = None
    module: str
    metric_type: str
    tier: str
    unit: str
    direction: str
    sensitivity: str
    applicability: list[Any] = Field(default_factory=list)
    dashboard_codes: list[Any] = Field(default_factory=list)
    adapter_key: str | None = None
    blocked_reason: str | None = None
    definition_version: int
    active: bool
    owner_role: str | None = None
    refresh_frequency: str | None = None
    formula_expression: str | None = None
    numerator_definition: str | None = None
    denominator_definition: str | None = None


class SeedResultOut(BaseModel):
    created: int
    skipped: int
    total_seed: int


class CommitmentRevisionOut(BaseModel):
    id: int
    order_id: int
    revision_no: int
    committed_date: date | None
    committed_qty: str | None
    reason: str | None
    source: str
    changed_by: int | None
    changed_at: str
    backfilled: bool


class RecalcEnqueueIn(BaseModel):
    date_from: date
    date_to: date
    kpi_code: str | None = None
    reason: str | None = None
