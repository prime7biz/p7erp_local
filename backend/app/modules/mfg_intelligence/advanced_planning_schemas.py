"""Response shapes of the Phase 5 forward-plan API (frozen for the frontend; extra keys are allowed and kept).

Minutes are 2-decimal strings, money 4-decimal strings, dates ISO.
"""
from __future__ import annotations

from datetime import date
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class _Out(BaseModel):
    model_config = ConfigDict(extra="allow")


# ------------------------------------------------------------------ scheduler (B2): GET /scheduler/preview


class SchedulerTupleOut(_Out):
    """D18 score, compared left to right (smaller wins)."""

    lateness_days: int
    changeover_rank: int  # 0 same style, 1 same family, 2 other / new setup, 3 family never run on the line
    idle_gap_days: int
    overtime_minutes: str
    line_code: str


class SchedulerPlacementOut(_Out):
    line_id: int
    line_code: str
    start_date: date
    end_date: date
    working_days: int
    lateness_days: int
    changeover_rank: int
    score: SchedulerTupleOut


class SchedulerAlternativeOut(_Out):
    line_id: int
    line_code: str
    start_date: date
    end_date: date
    score: SchedulerTupleOut
    deciding_criterion: str  # LATENESS | CHANGEOVER | IDLE_GAP | OVERTIME | LINE_CODE


class SchedulerCurrentOut(_Out):
    line_id: int
    start_date: date
    end_date: date | None


class SchedulerJobOut(_Out):
    job_id: str  # "row:<config_id>" or "order:<order_id>"
    kind: str  # ROW | ORDER
    order_id: int
    order_code: str | None
    config_id: int | None
    style_id: int | None
    family: str | None
    qty: str  # 3 dp
    smv_per_piece: str | None  # 4 dp
    minutes: str | None  # 2 dp
    need_by: date | None
    earliest_start: date | None
    priority_rank: int | None  # 1 = scheduled first (D17)
    status: str  # PLACED | UNCHANGED | UNSCHEDULED | PINNED
    action: str | None  # UPDATE | CREATE | None (no revision item)
    current: SchedulerCurrentOut | None
    placement: SchedulerPlacementOut | None
    alternatives: list[SchedulerAlternativeOut]
    tentative_displaced: list[int]  # tentative booking ids the placement overlaps (never blocking)
    overtime_would_recover_minutes: str | None
    reason_codes: list[str]


class SchedulerItemOut(_Out):
    """Exactly what convert sends to the plan revision (`RevisionItemIn` fields) for one job."""

    job_id: str
    action: str  # UPDATE (line / dates only) | CREATE (SOFT_BOOKED)
    config_id: int | None
    line_id: int
    order_id: int | None
    style_id: int | None
    start_date: date
    planned_end_date: date
    planned_qty: str | None
    reservation_status: str | None
    target_efficiency_pct: str | None


class SchedulerKpiOut(_Out):
    late_jobs: int
    lateness_days: int
    changeovers: int
    overtime_minutes: str
    unscheduled_jobs: int


class SchedulerPreviewOut(_Out):
    engine_version: str
    as_of: date
    date_from: date
    date_to: date
    horizon_days: int
    frozen_end: date
    factory_unit: str | None
    parameters: dict[str, Any]  # horizon_days, factory_unit, efficiency_basis (PLAN), material_delay_days,
    # btb_delay_days, exclude_job_ids
    settings: dict[str, Any]  # frozen_horizon_days, changeover_loss_pct
    lines: list[dict[str, Any]]
    jobs: list[SchedulerJobOut]
    items: list[SchedulerItemOut]
    kpis: dict[str, SchedulerKpiOut]  # before / after
    firm_reschedule_suggested: list[dict[str, Any]]
    counts: dict[str, int]
    proposal_hash: str
    proposal_only: bool
    reason_codes: list[str]
    notices: list[str]
    assumptions: list[str]


# ------------------------------------------------------------------ scheduler (B2): POST /scheduler/convert


class SchedulerParamsIn(BaseModel):
    """The same parameters as the preview; the server re-runs the engine with them."""

    model_config = ConfigDict(extra="forbid")

    horizon_days: int = 90
    factory_unit: str | None = Field(None, max_length=64)
    material_delay_days: int = Field(0, ge=0, le=60)
    btb_delay_days: int = Field(0, ge=0, le=60)
    exclude_job_ids: list[str] = Field(default_factory=list, max_length=100)


class SchedulerConvertIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    params: SchedulerParamsIn
    proposal_hash: str = Field(..., min_length=64, max_length=64, pattern=r"^[0-9a-f]{64}$")
    note: str = Field(..., min_length=5, max_length=500)
    request_id: str = Field(..., pattern=r"^[A-Za-z0-9_-]{8,32}$")


class BucketOut(_Out):
    index: int
    start: date
    end: date
    working_days: int
    capacity_minutes: str | None
    capacity_status: str
    unknown_line_days: int
    unknown_reasons: dict[str, int]
    overtime_minutes: str | None
    partial_month: bool
    layers: dict[str, str | None]
    load_minutes: str | None
    gap_minutes: str | None
    utilization_pct: str | None
    reason_codes: list[str]


class EfficiencyOut(_Out):
    basis: str
    mode: str
    lines_by_mode: dict[str, int]
    predictive: bool


class ForwardPlanOut(_Out):
    engine_version: str
    as_of: date
    date_from: date
    date_to: date
    horizon_days: int
    bucket: str
    factory_unit: str | None
    scenario: str
    parameters: dict[str, Any]
    layers_included: list[str]
    efficiency: EfficiencyOut
    frozen_end: date
    lines: int
    virtual_lines: int
    buckets: list[BucketOut]
    totals: dict[str, Any]
    constrained: dict[str, Any] | None
    identity: dict[str, Any]
    counts: dict[str, int]
    beyond_horizon_minutes: dict[str, str | None]
    forecast: dict[str, Any]
    median_line_daily_minutes: str | None
    reason_codes: list[str]
    notices: list[str]
    assumptions: list[str]


class CompareScenarioOut(_Out):
    scenario: str
    parameters: dict[str, Any]
    layers_included: list[str]
    efficiency: EfficiencyOut
    buckets: list[BucketOut]
    totals: dict[str, Any]
    deferred_beyond_horizon_minutes: dict[str, str | None] | None
    reason_codes: list[str]


class CompareOut(_Out):
    engine_version: str
    as_of: date
    date_from: date
    date_to: date
    horizon_days: int
    bucket: str
    factory_unit: str | None
    scenarios: list[CompareScenarioOut]
    notices: list[str]
    assumptions: list[str]


class ForecastDemandOut(_Out):
    as_of: date
    date_from: date
    date_to: date
    horizon_days: int
    method: str
    label: str
    availability: str
    tenant_history_months: int
    tenant_history_sufficient: bool
    coverage_pct: str | None
    months: list[str]
    families: list[dict[str, Any]]
    reason_codes: list[str]
    notices: list[str]
    assumptions: list[str]


class FinanceWeekOut(_Out):
    week_index: int
    week_start: date
    week_end: date
    phase3_closing: str | None
    after_confirmed_material: str | None
    after_kept_tentative: str | None
    position_with_headroom: str | None
    below_zero: bool


class FinanceConstrainedOut(_Out):
    as_of: date
    date_from: date
    date_to: date
    horizon_days: int
    factory_unit: str | None
    base_currency: str
    value_class: str
    capacity_parameters: dict[str, Any]
    facility_headroom: dict[str, Any]
    weeks: list[FinanceWeekOut]
    confirmed_material: dict[str, Any]
    kept: list[dict[str, Any]]
    cut: list[dict[str, Any]]
    tentative_not_admitted_by_capacity: int
    forecast_cut: list[dict[str, Any]]
    confirmed_financing_gap: dict[str, Any] | None
    after_confirmed_only_gap: dict[str, Any] | None
    phase3: dict[str, Any]
    reason_codes: list[str]
    notices: list[str]
    assumptions: list[str]
