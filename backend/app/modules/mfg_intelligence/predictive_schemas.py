"""Response models for the Phase 4 predictive endpoints. Numbers are decimal STRINGS (or null); no money anywhere.

Percent fields (`*_pct`) are 0-100 with 2 decimals; probabilities / shares / weights are 0-1 with 4 decimals.
"""
from __future__ import annotations

from datetime import date
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class _Out(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ------------------------------------------------------------------ line efficiency


class EfficiencyEstimateOut(_Out):
    family: str
    n: int
    group_used: str  # family name or ALL (line-all-families fallback)
    empirical_pct: str | None = None
    median_pct: str | None = None
    robust_cv: str | None = None
    planned_pct: str | None = None
    weight: str | None = None
    blended_pct: str | None = None
    source: str  # EMPIRICAL | BLENDED | PLANNED | UNKNOWN
    confidence: str  # HIGH | MEDIUM | LOW
    reason_codes: list[str] = Field(default_factory=list)


class LineEfficiencyLineOut(_Out):
    line_id: int
    line_code: str
    name: str
    factory_unit: str | None = None
    production_days: int
    excluded_days: int
    excluded_reasons: dict[str, int] = Field(default_factory=dict)
    last_production_date: date | None = None
    overall: EfficiencyEstimateOut
    families: list[EfficiencyEstimateOut] = Field(default_factory=list)


class LineEfficiencyOut(_Out):
    date_from: date
    date_to: date
    window_days: int
    max_production_days: int
    metric: str
    metric_label: str
    lines: list[LineEfficiencyLineOut]
    notices: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)


# ------------------------------------------------------------------ delivery forecast


class ForecastEfficiencyOut(_Out):
    source: str
    confidence: str
    group_used: str
    n: int
    planned_pct: str | None = None
    empirical_pct: str | None = None
    blended_pct: str | None = None
    weight: str | None = None
    robust_cv: str | None = None
    reason_codes: list[str] = Field(default_factory=list)


class ForecastLineOut(_Out):
    line_id: int
    line_code: str | None = None
    plan_row_id: int
    capacity_date: date | None = None
    operator_minutes: str | None = None
    smv_per_piece: str | None = None
    efficiency: ForecastEfficiencyOut | None = None
    rate_likely_units: str | None = None
    rate_planned_units: str | None = None
    history_days: int = 0
    missing_inputs: list[str] = Field(default_factory=list)


class ForecastPoLineOut(_Out):
    po_line_id: int
    po_code: str
    item_id: int
    vendor_id: int | None = None
    own_order_supply: bool
    qty_used: str | None = None
    eta_date: date | None = None
    eta_source: str
    lateness_source: str
    receipt_p50: date | None = None
    receipt_p80: date | None = None
    receipt_p90: date | None = None


class ForecastMaterialOut(_Out):
    status: str  # NOT_EVALUATED | NONE_NEEDED | DATED | UNKNOWN
    reason_codes: list[str] = Field(default_factory=list)
    ready_p50: date | None = None
    ready_p80: date | None = None
    ready_p90: date | None = None
    lateness_source: str
    shared_supply: bool = False
    po_lines: list[ForecastPoLineOut] = Field(default_factory=list)


class ForecastGridPointOut(_Out):
    q: str
    finish_date: date | None = None


class ForecastDriverOut(_Out):
    driver: str  # MATERIAL | EFFICIENCY | LOAD
    impact_days: int
    detail: str


class DeliveryForecastOut(_Out):
    order_id: int
    order_code: str
    order_status: str
    model_version: str
    as_of: date
    target_date: date | None = None
    target_basis: str
    order_qty: str | None = None
    produced_qty: str | None = None
    remaining_qty: str | None = None
    band: str  # ON_TRACK | AT_RISK | LATE | COMPLETE | UNKNOWN
    on_time_probability: str | None = None  # 0.0250 = "< 5 %", 0.9750 = ">= 95 %", null with fixed bands
    probability_display: str | None = None
    calibrated: bool
    calibration_label: str
    spread_mode: str | None = None  # EMPIRICAL_SPREAD | FIXED_BANDS
    spread_window_days: int | None = None
    p50_date: date | None = None
    p80_date: date | None = None
    p90_date: date | None = None
    start_date: date | None = None
    working_days_needed: int | None = None
    daily_rate_likely: str | None = None
    daily_rate_p80: str | None = None
    daily_rate_p90: str | None = None
    delay_days: int | None = None
    early_days: int | None = None
    efficiency_source: str | None = None  # PLANNED | BLENDED | EMPIRICAL | MIXED
    lateness_source: str  # NOT_EVALUATED | NONE | VENDOR_CATEGORY | VENDOR | CATEGORY | TENANT | UNKNOWN
    confidence: str
    material: ForecastMaterialOut | None = None
    lines: list[ForecastLineOut] = Field(default_factory=list)
    grid: list[ForecastGridPointOut] = Field(default_factory=list)
    drivers: list[ForecastDriverOut] = Field(default_factory=list)
    reason_codes: list[str] = Field(default_factory=list)
    missing_inputs: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    inputs_hash: str | None = None
    external_lead_time_days: int | None = None  # only with mfg_integrated_planning_v1


# ------------------------------------------------------------------ supplier lateness


class LatenessGroupOut(_Out):
    n: int
    p50_days: int | None = None
    p80_days: int | None = None
    p90_days: int | None = None
    on_time_rate: str | None = None
    open_late_lower_bound: int = 0
    sufficient: bool


class LatenessVendorOut(LatenessGroupOut):
    vendor_id: int
    vendor_name: str | None = None


class LatenessCategoryOut(LatenessGroupOut):
    category_id: int
    category_name: str | None = None


class LatenessVendorCategoryOut(LatenessGroupOut):
    vendor_id: int | None = None
    vendor_name: str | None = None
    category_id: int | None = None
    category_name: str | None = None


class SupplierLatenessOut(_Out):
    as_of: date
    window_days: int
    promise_basis: str
    min_sample: int
    tenant: LatenessGroupOut
    vendors: list[LatenessVendorOut] = Field(default_factory=list)
    categories: list[LatenessCategoryOut] = Field(default_factory=list)
    vendor_categories: list[LatenessVendorCategoryOut] = Field(default_factory=list)
    excluded: dict[str, int] = Field(default_factory=dict)
    truncated: bool
    notices: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)


# ------------------------------------------------------------------ anomalies


class AnomalyOut(_Out):
    line_id: int
    line_code: str | None = None
    date: date
    hour_slot: int | None = None
    metric: str  # EFFICIENCY | REJECTION_RATE | HOURLY_OUTPUT
    direction: str  # LOW | HIGH
    value: str | None = None  # percent for EFFICIENCY / REJECTION_RATE, pieces for HOURLY_OUTPUT
    baseline_median: str | None = None
    robust_z: str
    baseline_n: int


class AnomaliesOut(_Out):
    date_from: date
    date_to: date
    threshold: str
    baseline_production_days: int
    min_baseline_points: int
    lines_checked: int
    anomalies: list[AnomalyOut]
    truncated: bool
    series_skipped: dict[str, int] = Field(default_factory=dict)
    notices: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)


# ------------------------------------------------------------------ calibration


class CalibrationBinOut(_Out):
    lower: str
    upper: str
    n: int
    mean_probability: str | None = None
    hit_rate: str | None = None


class CoverageOut(_Out):
    n: int
    share: str | None = None


class CalibrationCoverageOut(_Out):
    p80: CoverageOut
    p90: CoverageOut


class LeadBucketOut(_Out):
    lead_days: int
    n: int
    brier: str | None = None


class CalibrationOut(_Out):
    as_of: date
    model_version: str
    status: str  # OK | INSUFFICIENT_OUTCOMES
    calibrated: bool
    min_outcomes: int
    n: int
    n_snapshots_considered: int
    n_pending: int
    n_excluded: int
    brier: str | None = None
    bins: list[CalibrationBinOut] = Field(default_factory=list)
    coverage: CalibrationCoverageOut
    lead_buckets: list[LeadBucketOut] = Field(default_factory=list)
    notices: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)


# ------------------------------------------------------------------ recommendations


class RecommendationOut(_Out):
    id: int
    finding_key: str
    kind: str
    severity: str
    priority: str
    department: str | None = None
    order_id: int | None = None
    order_code: str | None = None
    line_id: int | None = None
    line_code: str | None = None
    status: str
    alert_eligible: bool
    first_detected_on: date
    last_detected_on: date
    cleared_on: date | None = None
    deadline_date: date | None = None
    decision_status: str | None = None
    outcome_status: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class RecommendationsOut(_Out):
    status: str
    kind: str | None = None
    limit: int
    items: list[RecommendationOut]
    truncated: bool
    kinds: list[str]
    notices: list[str] = Field(default_factory=list)
