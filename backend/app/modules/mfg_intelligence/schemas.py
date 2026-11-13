"""Response models for Manufacturing Intelligence. Every quantity / minute is a decimal STRING (or null)."""
from __future__ import annotations

from datetime import date
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class _Out(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ------------------------------------------------------------------ capacity


class CapacityDayOut(_Out):
    # extra="allow": with mfg_integrated_planning_v1 a day may also carry assigned_operators / assigned_machines
    # (counts from dated line assignments); with the flag off the keys are absent (output unchanged).
    model_config = ConfigDict(extra="allow")

    date: date
    is_working_day: bool
    theoretical_minutes: str | None = None
    practical_smv_minutes: str | None = None
    firm_smv_minutes: str
    soft_smv_minutes: str
    draft_smv_minutes: str
    firm_confirmed_smv_minutes: str
    firm_unconfirmed_smv_minutes: str
    unresolved_firm_rows: int = 0  # firm rows with unknown SMV on this day (their minutes are not counted)
    unresolved_soft_rows: int = 0
    firm_available_smv_minutes: str | None = None
    utilization_pct: str | None = None
    status: str  # OVERLOADED | IDLE | LOADED | CLOSED | UNKNOWN
    reason_codes: list[str] = Field(default_factory=list)
    missing_inputs: list[str] = Field(default_factory=list)
    operators: int | None = None
    efficiency_pct: str | None = None
    smv_per_piece: str | None = None
    theoretical_units: str | None = None
    practical_units: str | None = None


class CapacityLineTotalsOut(_Out):
    practical_smv_minutes: str | None = None
    firm_smv_minutes: str
    soft_smv_minutes: str
    draft_smv_minutes: str
    firm_available_smv_minutes: str | None = None
    utilization_pct: str | None = None
    working_days_known: int
    working_days_unknown: int
    closed_days: int


class CapacityLineOut(_Out):
    line_id: int
    line_code: str
    name: str
    factory_unit: str | None = None
    days: list[CapacityDayOut]
    totals: CapacityLineTotalsOut
    legacy_value: str
    corrected_value: str | None = None
    corrected_complete: bool | None = None
    difference: str | None = None
    notice: str | None = None
    reason_codes: list[str] = Field(default_factory=list)
    missing_inputs: list[str] = Field(default_factory=list)


class CapacityTotalsOut(_Out):
    legacy_value: str
    corrected_value: str | None = None
    corrected_complete: bool | None = None
    difference: str | None = None


class CapacityOut(_Out):
    date_from: date
    date_to: date
    formula_version: str
    planning_math_v2: bool
    legacy_basis: str
    legacy_working_days: int
    legacy_average_shift_minutes: str
    lines: list[CapacityLineOut]
    totals: CapacityTotalsOut
    notices: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)


# ------------------------------------------------------------------ line loading


class DailyAllocationOut(_Out):
    date: date
    smv_minutes: str | None = None


class LoadingRowOut(_Out):
    config_id: int
    line_id: int
    order_id: int | None = None
    order_code: str | None = None
    order_confirmed: bool | None = None
    style_id: int | None = None
    reservation_status: str
    demand_class: str | None = None
    start_date: date
    planned_end_date: date | None = None
    planned_qty: str | None = None
    completed_qty: str | None = None
    remaining_qty: str | None = None
    smv_per_piece: str | None = None
    smv_source: str | None = None
    smv_confidence: str | None = None
    total_load_minutes: str | None = None
    daily_allocation: list[DailyAllocationOut] = Field(default_factory=list)
    reason_codes: list[str] = Field(default_factory=list)


class UnresolvedRowOut(_Out):
    config_id: int
    line_id: int
    order_id: int | None = None
    reservation_status: str
    remaining_qty: str | None = None
    reason_codes: list[str] = Field(default_factory=list)
    missing_inputs: list[str] = Field(default_factory=list)


class LineDayLoadOut(_Out):
    line_id: int
    line_code: str
    date: date
    is_working_day: bool
    firm_smv_minutes: str
    firm_confirmed_smv_minutes: str
    firm_unconfirmed_smv_minutes: str
    soft_smv_minutes: str
    draft_smv_minutes: str


class LineLoadingOut(_Out):
    date_from: date
    date_to: date
    rows: list[LoadingRowOut]
    unresolved_rows: list[UnresolvedRowOut]
    line_days: list[LineDayLoadOut]
    truncated: bool
    notices: list[str] = Field(default_factory=list)


# ------------------------------------------------------------------ readiness


class DimensionOut(_Out):
    key: str
    label: str
    status: str  # READY | PARTIAL | BLOCKED | UNKNOWN | NOT_APPLICABLE | NOT_EVALUATED
    reason_codes: list[str] = Field(default_factory=list)
    detail: str | None = None
    informational: bool = False


class BlockerOut(_Out):
    dimension: str
    reason: str
    department: str
    detail: str | None = None


class InfoOut(_Out):
    dimension: str
    reason: str
    detail: str | None = None


class MaterialLineOut(_Out):
    # extra="allow": with mfg_material_allocation_v1 a line also carries issued_qty, held_qty, tentative_held_qty,
    # pegged_qty, expected_material_date and reason_codes; with the flag off the keys are absent (output unchanged).
    model_config = ConfigDict(extra="allow")

    bom_item_id: int
    item_id: int
    item_name: str | None = None
    category: str | None = None
    uom: str | None = None
    required_qty: str | None = None
    requirement_source: str
    on_hand_qty: str | None = None
    in_transit_qty: str | None = None
    available_qty: str | None = None
    short_qty: str | None = None
    ready: bool | None = None


class OrderBomOut(_Out):
    bom_id: int | None = None
    status: str | None = None


class ReadinessOut(_Out):
    order_id: int
    order_code: str
    order_status: str
    mode: str  # ORDER_BOM_V2 | LEGACY_STYLE_BOM
    material_authority: str  # ORDER_BOM | STYLE_ESTIMATE | NONE | LEGACY_STYLE_BOM
    mfg_order_bom_readiness_v2: bool
    dimensions: list[DimensionOut]
    blockers: list[BlockerOut]
    info: list[InfoOut]
    material_lines: list[MaterialLineOut] = Field(default_factory=list)
    material_lines_truncated: bool = False
    order_bom: OrderBomOut | None = None
    legacy: dict[str, Any] | None = None
    assumptions: list[str] = Field(default_factory=list)


# ------------------------------------------------------------------ delivery prediction


class DeliveryLineOut(_Out):
    line_id: int
    plan_row_id: int
    capacity_date: date | None = None
    practical_smv_minutes: str | None = None
    smv_per_piece: str | None = None
    practical_units_per_day: str | None = None
    missing_inputs: list[str] = Field(default_factory=list)


class DeliveryMaterialOut(_Out):
    # extra="allow": `expected_material_date` is added only with mfg_material_allocation_v1
    model_config = ConfigDict(extra="allow")

    authority: str
    status: str
    reason_codes: list[str] = Field(default_factory=list)


class DeliveryPredictionOut(_Out):
    # extra="allow": `external_lead_time_days` is added only with mfg_integrated_planning_v1 (flag off: absent).
    model_config = ConfigDict(extra="allow")

    order_id: int
    order_code: str
    order_status: str
    target_date: date | None = None
    target_basis: str
    order_qty: str | None = None
    produced_qty: str | None = None
    hourly_good_qty: str | None = None  # information only, not used in the calculation
    remaining_qty: str | None = None
    start_date: date | None = None
    likely_complete_date: date | None = None
    optimistic_complete_date: date | None = None
    pessimistic_complete_date: date | None = None
    working_days_needed: int | None = None
    daily_rate_likely: str | None = None
    daily_rate_optimistic: str | None = None
    daily_rate_pessimistic: str | None = None
    delay_days: int | None = None
    early_days: int | None = None
    band: str  # ON_TRACK | AT_RISK | LATE | COMPLETE | UNKNOWN
    reason_codes: list[str] = Field(default_factory=list)
    missing_inputs: list[str] = Field(default_factory=list)
    lines: list[DeliveryLineOut] = Field(default_factory=list)
    material: DeliveryMaterialOut | None = None
    assumptions: list[str] = Field(default_factory=list)


# ------------------------------------------------------------------ summary


class SummaryCapacityOut(_Out):
    practical_smv_minutes: str | None = None
    firm_smv_minutes: str
    soft_smv_minutes: str
    draft_smv_minutes: str
    firm_available_smv_minutes: str | None = None
    utilization_pct: str | None = None
    unknown_line_days: int | None = None
    line_count: int


class OverloadedItemOut(_Out):
    line_id: int
    line_code: str
    date: date
    firm_smv_minutes: str
    practical_smv_minutes: str
    overload_smv_minutes: str


class IdleItemOut(_Out):
    line_id: int
    line_code: str
    date: date
    practical_smv_minutes: str


class OverloadedOut(_Out):
    count: int | None = None
    top: list[OverloadedItemOut] = Field(default_factory=list)


class IdleOut(_Out):
    count: int | None = None
    top: list[IdleItemOut] = Field(default_factory=list)


class QuickReadinessOut(_Out):
    firm_booked: int
    soft_or_draft_only: int
    not_booked: int


class SummaryOrdersOut(_Out):
    confirmed_total: int
    evaluated: int
    truncated: bool
    readiness_quick_check: QuickReadinessOut
    delivery_risk: dict[str, int]


class SummaryFlagsOut(_Out):
    planning_math_v2: bool
    mfg_order_bom_readiness_v2: bool


class SummaryOut(_Out):
    date_from: date
    date_to: date
    factory_unit: str | None = None
    flags: SummaryFlagsOut
    capacity: SummaryCapacityOut
    overloaded: OverloadedOut
    idle: IdleOut
    orders: SummaryOrdersOut
    notices: list[str] = Field(default_factory=list)


# ------------------------------------------------------------------ Phase 3: cost at completion (money = 4-dp strings)


class MoneyValueOut(_Out):
    """One amount in base currency with its class and lineage. `amount` null = UNKNOWN (not in any total)."""

    amount: str | None = None
    value_class: str  # ACTUAL | COMMITTED | ESTIMATED | FORECAST
    source: str | None = None
    currency: str | None = None
    source_amount: str | None = None
    rate: str | None = None
    rate_source: str | None = None
    reason_codes: list[str] = Field(default_factory=list)
    missing_inputs: list[str] = Field(default_factory=list)


class RevenueOut(_Out):
    gross: MoneyValueOut
    commission: MoneyValueOut
    net: MoneyValueOut


class BudgetFiguresOut(_Out):
    revenue: str | None = None
    material: str | None = None
    cm: str | None = None
    other: str | None = None


class BudgetOut(_Out):
    usable: bool
    source: str
    value_class: str
    currency: str | None = None
    rate: str | None = None
    rate_source: str | None = None
    scale_factor: str | None = None
    scaled: BudgetFiguresOut
    unscaled: BudgetFiguresOut
    reason_codes: list[str] = Field(default_factory=list)


class MaterialOut(_Out):
    procured: MoneyValueOut
    budget: MoneyValueOut
    remaining: MoneyValueOut
    eac: MoneyValueOut
    po_lines: int
    po_lines_unknown_fx: int
    bom_id: int | None = None


class ConversionOut(_Out):
    smv: str | None = None
    smv_source: str | None = None
    sah_minutes: str | None = None
    cpm: str | None = None
    cpm_source: str | None = None
    eac: MoneyValueOut
    budget_cm: str | None = None
    variance_vs_budget_cm: str | None = None


class ProgressOut(_Out):
    p: str | None = None
    source: str
    sewing_good_qty: str | None = None
    plan_completed_qty: str | None = None
    produced_qty: str | None = None
    earned_conversion: str | None = None
    remaining_conversion: str | None = None


class MarginOut(_Out):
    amount: str | None = None
    margin_pct: str | None = None
    basis: str
    value_class: str


class GlActualOut(_Out):
    value_class: str
    source: str
    revenue: str | None = None
    material: str | None = None
    cm: str | None = None
    other: str | None = None
    overhead: str | None = None
    finance_cost: str | None = None
    direct_voucher_lines: int
    reason_codes: list[str] = Field(default_factory=list)
    note: str


class OrderCostOut(_Out):
    order_id: int
    order_code: str
    order_status: str
    order_qty: str | None = None
    delivery_date: date | None = None
    base_currency: str
    status: str  # COMPLETE_DATA | PARTIAL | UNKNOWN
    reason_codes: list[str] = Field(default_factory=list)
    missing_inputs: list[str] = Field(default_factory=list)
    revenue: RevenueOut
    budget: BudgetOut
    material: MaterialOut
    conversion: ConversionOut
    other: MoneyValueOut
    progress: ProgressOut
    eac: MoneyValueOut
    margin: MarginOut
    unknown_by_currency: dict[str, str] = Field(default_factory=dict)
    gl_actual: GlActualOut | None = None
    finance_link: str


class CpmOut(_Out):
    value: str | None = None
    source: str | None = None
    period_start: date | None = None
    period_end: date | None = None
    cm_total: str | None = None
    earned_minutes: str | None = None
    reason_codes: list[str] = Field(default_factory=list)
    warnings: list[dict[str, Any]] = Field(default_factory=list)


class OrderCostDetailOut(OrderCostOut):
    cpm_detail: CpmOut
    assumptions: list[str] = Field(default_factory=list)


class CostTotalsOut(_Out):
    revenue_net: str
    eac: str
    margin: str
    margin_pct: str | None = None
    orders_counted: int
    orders_excluded: int


class CostListOut(_Out):
    base_currency: str
    items: list[OrderCostOut]
    total: int
    limit: int
    offset: int
    totals: CostTotalsOut
    cpm: CpmOut
    assumptions: list[str] = Field(default_factory=list)


# ------------------------------------------------------------------ Phase 3: cash requirement


class CashOpeningOut(_Out):
    cash_in_hand: str
    bank: str
    bank_od: str
    excluding_overdraft: str
    including_overdraft: str
    basis: str
    source: str


class CashTotalsOut(_Out):
    inflow: str
    outflow: str
    net: str
    closing: str


class CashWeekOut(_Out):
    week_index: int
    week_start: date
    week_end: date
    opening: str
    inflow: str
    outflow: str
    net: str
    closing: str
    below_zero: bool
    by_category: dict[str, str] = Field(default_factory=dict)


class FinancingGapOut(_Out):
    week_index: int
    week_start: date
    shortfall: str


class FacilityHeadroomOut(_Out):
    amount: str
    facilities: int
    unknown_by_currency: dict[str, str] = Field(default_factory=dict)
    note: str


class CashUndatedOut(_Out):
    inflow: str
    outflow: str
    rows: int


class CashUnknownOut(_Out):
    direction: str
    category: str
    currency: str
    source_amount: str | None = None
    rows: int


class CashRowOut(_Out):
    direction: str  # IN | OUT
    category: str
    source_type: str
    source_id: int | None = None
    reference: str | None = None
    due_date: date | None = None
    date_rule: str
    confidence: str  # CONTRACTUAL | SCHEDULED | ESTIMATED
    value_class: str
    currency: str | None = None
    source_amount: str | None = None
    rate: str | None = None
    rate_source: str | None = None
    amount: str | None = None
    week_index: int | None = None
    overdue: bool
    reason_codes: list[str] = Field(default_factory=list)


class CashSettingsOut(_Out):
    export_document_days: int
    export_usance_days: int
    btb_usance_days: int


class CashRequirementOut(_Out):
    date_from: date
    date_to: date
    horizon_days: int
    base_currency: str
    value_class: str
    settings: CashSettingsOut
    opening: CashOpeningOut
    totals: CashTotalsOut
    weeks: list[CashWeekOut]
    financing_gap: FinancingGapOut | None = None
    facility_headroom: FacilityHeadroomOut
    undated: CashUndatedOut
    beyond_horizon_rows: int
    unknown_by_currency: list[CashUnknownOut] = Field(default_factory=list)
    rows: list[CashRowOut]
    row_count: int
    truncated: bool
    max_rows: int
    forecast_complete: bool = True  # false when a source hit its row limit (reason SOURCE_TRUNCATED:<category>)
    reason_codes: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
