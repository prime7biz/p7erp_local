"""Response models for GET /merch/control-tower/summary."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field


class CountAndDate(BaseModel):
    count: int = 0
    oldest_date: date | None = None


class QuotationsAtRiskOut(BaseModel):
    incomplete_count: int = 0
    anomaly_count: int = 0
    expiring_soon_count: int = 0


class BomStatusCountsOut(BaseModel):
    draft_count: int = 0
    submitted_count: int = 0
    approved_count: int = 0
    frozen_count: int = 0


class TnaOverdueOut(BaseModel):
    count: int = 0
    critical_count: int = 0


class MerchControlTowerSummaryOut(BaseModel):
    """Single aggregated merchandising dashboard payload (tenant-scoped)."""

    generated_at: datetime = Field(description="UTC timestamp when aggregates were computed")
    inquiries_needing_action: CountAndDate
    quotations_at_risk: QuotationsAtRiskOut
    orders_with_drift: int = 0
    pending_change_requests: int = 0
    bom_status: BomStatusCountsOut
    tna_overdue: TnaOverdueOut
    planning_risk: int = Field(0, description="Orders with near-term delivery not yet shipped (heuristic)")
    sample_pending: int = Field(0, description="Merch sample requests in requested / in_progress / submitted")
    sample_overdue_target: int = Field(
        0,
        description="Merch samples with target_date before today still open (requested/in_progress/submitted)",
    )
