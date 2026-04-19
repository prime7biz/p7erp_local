from __future__ import annotations

from datetime import date
from typing import Any

from pydantic import BaseModel, Field


class ControlTowerOrderRow(BaseModel):
    order_id: int
    order_code: str
    customer_name: str | None = None
    delivery_date: date | None = None
    pipeline_status: str | None = None
    style_id: int | None = None
    master_contract_id: int | None = None
    lc_status: str | None = None
    material_readiness_pct: float | None = None
    line_code: str | None = None
    reservation_status: str | None = None
    planned_end_date: date | None = None


class ControlTowerSummaryOut(BaseModel):
    delivery_from: date
    delivery_to: date
    limit: int
    offset: int
    total: int
    orders: list[ControlTowerOrderRow] = Field(default_factory=list)


class ControlTowerTimelineOut(BaseModel):
    order_id: int
    milestones: dict[str, Any] = Field(default_factory=dict)
    readiness: dict[str, Any] = Field(default_factory=dict)


class ControlTowerLcSnapshotOut(BaseModel):
    master_contract_id: int
    reference: str
    status: str
    amount: float | None = None
    currency: str | None = None
    linked_order_ids: list[int] = Field(default_factory=list)
    btb_lc_count: int = 0


class CapacityHeatmapCell(BaseModel):
    line_id: int
    line_code: str
    bucket_date: date
    firm_minutes: float = 0.0
    soft_minutes: float = 0.0
    draft_minutes: float = 0.0


class ControlTowerCapacityHeatmapOut(BaseModel):
    date_from: date
    date_to: date
    cells: list[CapacityHeatmapCell] = Field(default_factory=list)
