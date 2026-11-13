/**
 * Manufacturing Intelligence (Phase 1, read-only) API client.
 * Backend: backend/app/modules/mfg_intelligence/ (schemas.py, router.py).
 * Every quantity / minute is a decimal STRING (or null) - never turn it into a float for money-like maths.
 */
import { request } from "@/api/core";

const BASE = "/api/v1/mfg-intelligence";

export type CapacityStatus = "OVERLOADED" | "IDLE" | "LOADED" | "CLOSED" | "UNKNOWN";
export type DeliveryBand = "ON_TRACK" | "AT_RISK" | "LATE" | "COMPLETE" | "UNKNOWN";
export type DimensionStatus = "READY" | "PARTIAL" | "BLOCKED" | "UNKNOWN" | "NOT_APPLICABLE" | "NOT_EVALUATED";

export interface MfgDateWindow {
  date_from: string;
  date_to: string;
  factory_unit?: string;
  line_id?: number;
}

// ------------------------------------------------------------------ capacity
export interface CapacityDay {
  date: string;
  is_working_day: boolean;
  theoretical_minutes: string | null;
  practical_smv_minutes: string | null;
  firm_smv_minutes: string;
  soft_smv_minutes: string;
  draft_smv_minutes: string;
  firm_confirmed_smv_minutes: string;
  firm_unconfirmed_smv_minutes: string;
  firm_available_smv_minutes: string | null;
  utilization_pct: string | null;
  status: CapacityStatus | string;
  reason_codes: string[];
  missing_inputs: string[];
  operators: number | null;
  efficiency_pct: string | null;
  smv_per_piece: string | null;
  theoretical_units: string | null;
  practical_units: string | null;
  unresolved_firm_rows?: number;
  unresolved_soft_rows?: number;
  /** Only with mfg_integrated_planning_v1: counts from dated line assignments. */
  assigned_operators?: number | null;
  assigned_machines?: number | null;
}

export interface CapacityLineTotals {
  practical_smv_minutes: string | null;
  firm_smv_minutes: string;
  soft_smv_minutes: string;
  draft_smv_minutes: string;
  firm_available_smv_minutes: string | null;
  utilization_pct: string | null;
  working_days_known: number;
  working_days_unknown: number;
  closed_days: number;
}

export interface CapacityLine {
  line_id: number;
  line_code: string;
  name: string;
  factory_unit: string | null;
  days: CapacityDay[];
  totals: CapacityLineTotals;
  legacy_value: string;
  corrected_value: string | null;
  corrected_complete: boolean | null;
  difference: string | null;
  notice: string | null;
  reason_codes: string[];
  missing_inputs: string[];
}

export interface CapacityTotals {
  legacy_value: string;
  corrected_value: string | null;
  corrected_complete: boolean | null;
  difference: string | null;
}

export interface CapacityResponse {
  date_from: string;
  date_to: string;
  formula_version: string;
  planning_math_v2: boolean;
  legacy_basis: string;
  legacy_working_days: number;
  legacy_average_shift_minutes: string;
  lines: CapacityLine[];
  totals: CapacityTotals;
  notices: string[];
  assumptions: string[];
}

// ------------------------------------------------------------------ line loading
export interface DailyAllocation {
  date: string;
  smv_minutes: string | null;
}

export interface LoadingRow {
  config_id: number;
  line_id: number;
  order_id: number | null;
  order_code: string | null;
  order_confirmed: boolean | null;
  style_id: number | null;
  reservation_status: string;
  demand_class: string | null;
  start_date: string;
  planned_end_date: string | null;
  planned_qty: string | null;
  completed_qty: string | null;
  remaining_qty: string | null;
  smv_per_piece: string | null;
  smv_source: string | null;
  smv_confidence: string | null;
  total_load_minutes: string | null;
  daily_allocation: DailyAllocation[];
  reason_codes: string[];
}

export interface UnresolvedRow {
  config_id: number;
  line_id: number;
  order_id: number | null;
  reservation_status: string;
  remaining_qty: string | null;
  reason_codes: string[];
  missing_inputs: string[];
}

export interface LineDayLoad {
  line_id: number;
  line_code: string;
  date: string;
  is_working_day: boolean;
  firm_smv_minutes: string;
  firm_confirmed_smv_minutes: string;
  firm_unconfirmed_smv_minutes: string;
  soft_smv_minutes: string;
  draft_smv_minutes: string;
}

export interface LineLoadingResponse {
  date_from: string;
  date_to: string;
  rows: LoadingRow[];
  unresolved_rows: UnresolvedRow[];
  line_days: LineDayLoad[];
  truncated: boolean;
  notices: string[];
}

// ------------------------------------------------------------------ readiness
export interface ReadinessDimension {
  key: string;
  label: string;
  status: DimensionStatus | string;
  reason_codes: string[];
  detail: string | null;
  informational: boolean;
}

export interface ReadinessBlocker {
  dimension: string;
  reason: string;
  department: string;
  detail: string | null;
}

export interface ReadinessInfo {
  dimension: string;
  reason: string;
  detail: string | null;
}

export interface ReadinessMaterialLine {
  bom_item_id: number;
  item_id: number;
  item_name: string | null;
  category: string | null;
  uom: string | null;
  required_qty: string | null;
  requirement_source: string;
  on_hand_qty: string | null;
  in_transit_qty: string | null;
  available_qty: string | null;
  short_qty: string | null;
  ready: boolean | null;
  /** Only with mfg_material_allocation_v1. */
  issued_qty?: string | null;
  held_qty?: string | null;
  tentative_held_qty?: string | null;
  pegged_qty?: string | null;
  expected_material_date?: string | null;
  reason_codes?: string[];
}

export interface ReadinessResponse {
  order_id: number;
  order_code: string;
  order_status: string;
  mode: string;
  material_authority: string;
  mfg_order_bom_readiness_v2: boolean;
  dimensions: ReadinessDimension[];
  blockers: ReadinessBlocker[];
  info: ReadinessInfo[];
  material_lines: ReadinessMaterialLine[];
  material_lines_truncated: boolean;
  order_bom: { bom_id: number | null; status: string | null } | null;
  legacy: Record<string, unknown> | null;
  assumptions: string[];
}

// ------------------------------------------------------------------ delivery prediction
export interface DeliveryLine {
  line_id: number;
  plan_row_id: number;
  capacity_date: string | null;
  practical_smv_minutes: string | null;
  smv_per_piece: string | null;
  practical_units_per_day: string | null;
  missing_inputs: string[];
}

export interface DeliveryPredictionResponse {
  order_id: number;
  order_code: string;
  order_status: string;
  target_date: string | null;
  target_basis: string;
  order_qty: string | null;
  produced_qty: string | null;
  hourly_good_qty: string | null;
  remaining_qty: string | null;
  start_date: string | null;
  likely_complete_date: string | null;
  optimistic_complete_date: string | null;
  pessimistic_complete_date: string | null;
  working_days_needed: number | null;
  daily_rate_likely: string | null;
  daily_rate_optimistic: string | null;
  daily_rate_pessimistic: string | null;
  delay_days: number | null;
  early_days: number | null;
  band: DeliveryBand | string;
  reason_codes: string[];
  missing_inputs: string[];
  lines: DeliveryLine[];
  /** expected_material_date only with mfg_material_allocation_v1. */
  material: { authority: string; status: string; reason_codes: string[]; expected_material_date?: string | null } | null;
  /** Only with mfg_integrated_planning_v1: open post-sewing external stage days added after sewing. */
  external_lead_time_days?: number | null;
  assumptions: string[];
}

// ------------------------------------------------------------------ summary
export interface MfgSummaryResponse {
  date_from: string;
  date_to: string;
  factory_unit: string | null;
  flags: { planning_math_v2: boolean; mfg_order_bom_readiness_v2: boolean };
  capacity: {
    practical_smv_minutes: string | null;
    firm_smv_minutes: string;
    soft_smv_minutes: string;
    draft_smv_minutes: string;
    firm_available_smv_minutes: string | null;
    utilization_pct: string | null;
    unknown_line_days: number | null;
    line_count: number;
  };
  overloaded: {
    count: number | null;
    top: {
      line_id: number;
      line_code: string;
      date: string;
      firm_smv_minutes: string;
      practical_smv_minutes: string;
      overload_smv_minutes: string;
    }[];
  };
  idle: {
    count: number | null;
    top: { line_id: number; line_code: string; date: string; practical_smv_minutes: string }[];
  };
  orders: {
    confirmed_total: number;
    evaluated: number;
    truncated: boolean;
    readiness_quick_check: { firm_booked: number; soft_or_draft_only: number; not_booked: number };
    delivery_risk: Record<string, number>;
  };
  notices: string[];
}

function qs(p: MfgDateWindow): string {
  const q = new URLSearchParams();
  q.set("date_from", p.date_from);
  q.set("date_to", p.date_to);
  if (p.factory_unit) q.set("factory_unit", p.factory_unit);
  if (p.line_id != null) q.set("line_id", String(p.line_id));
  return q.toString();
}

export const manufacturingIntelligenceApi = {
  getSummary(p: Omit<MfgDateWindow, "line_id">): Promise<MfgSummaryResponse> {
    return request<MfgSummaryResponse>(`${BASE}/summary?${qs(p)}`);
  },
  getCapacity(p: MfgDateWindow): Promise<CapacityResponse> {
    return request<CapacityResponse>(`${BASE}/capacity?${qs(p)}`);
  },
  getLineLoading(p: MfgDateWindow): Promise<LineLoadingResponse> {
    return request<LineLoadingResponse>(`${BASE}/line-loading?${qs(p)}`);
  },
  getReadiness(orderId: number): Promise<ReadinessResponse> {
    return request<ReadinessResponse>(`${BASE}/orders/${orderId}/readiness`);
  },
  getDeliveryPrediction(orderId: number): Promise<DeliveryPredictionResponse> {
    return request<DeliveryPredictionResponse>(`${BASE}/orders/${orderId}/delivery-prediction`);
  },
};
