/**
 * Manufacturing Intelligence Phase 4 API client: predictions (statistics from the company's own history).
 * Backend: backend/app/modules/mfg_intelligence/predictive_router.py + predictive_schemas.py (GET, read-only)
 * and backend/app/modules/mfg_planning/predictive_router.py (decision + explain POST). Prefix /api/v1/mfg-intelligence.
 *
 * 404 while `mfg_predictive_intelligence_v1` (or `manufacturing_intelligence_v1`) is off, 403 "Tenant mismatch" or a
 * missing permission, 422 for a bad query. Numbers are decimal STRINGS (or null): percentages 0-100 with 2 decimals,
 * probabilities / shares / weights 0-1 with 4 decimals. There is no money in Phase 4.
 */
import { request } from "@/api/core";

const BASE = "/api/v1/mfg-intelligence";

function query(params: Record<string, string | number | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export type PredictionConfidence = "HIGH" | "MEDIUM" | "LOW";
export type EfficiencySource = "EMPIRICAL" | "BLENDED" | "PLANNED" | "UNKNOWN";
export type ForecastBand = "ON_TRACK" | "AT_RISK" | "LATE" | "COMPLETE" | "UNKNOWN";
export type SpreadMode = "EMPIRICAL_SPREAD" | "FIXED_BANDS";
export type FindingKind = "DELIVERY_RISK" | "LATE_MATERIAL" | "CAPACITY_OVERLOAD" | "LINE_IDLE" | "OUTPUT_DROP" | "QUALITY_SPIKE";
export type FindingSeverity = "critical" | "high" | "medium";
export type RecommendationStatusFilter = "OPEN" | "CLEARED" | "ALL";
export type AnomalyMetric = "EFFICIENCY" | "REJECTION_RATE" | "HOURLY_OUTPUT";

// ------------------------------------------------------------------ line efficiency

export interface EfficiencyEstimate {
  family: string;
  n: number;
  /** Family name, or ALL when the line-all-families fallback was used. */
  group_used: string;
  empirical_pct: string | null;
  median_pct: string | null;
  robust_cv: string | null;
  planned_pct: string | null;
  weight: string | null;
  blended_pct: string | null;
  source: EfficiencySource | string;
  confidence: PredictionConfidence | string;
  reason_codes: string[];
}

export interface LineEfficiencyLine {
  line_id: number;
  line_code: string;
  name: string;
  factory_unit: string | null;
  production_days: number;
  excluded_days: number;
  excluded_reasons: Record<string, number>;
  last_production_date: string | null;
  overall: EfficiencyEstimate;
  families: EfficiencyEstimate[];
}

export interface LineEfficiencyResponse {
  date_from: string;
  date_to: string;
  window_days: number;
  max_production_days: number;
  metric: string;
  metric_label: string;
  lines: LineEfficiencyLine[];
  notices: string[];
  assumptions: string[];
}

// ------------------------------------------------------------------ delivery forecast

export interface ForecastEfficiency {
  source: string;
  confidence: string;
  group_used: string;
  n: number;
  planned_pct: string | null;
  empirical_pct: string | null;
  blended_pct: string | null;
  weight: string | null;
  robust_cv: string | null;
  reason_codes: string[];
}

export interface ForecastLine {
  line_id: number;
  line_code: string | null;
  plan_row_id: number;
  capacity_date: string | null;
  operator_minutes: string | null;
  smv_per_piece: string | null;
  efficiency: ForecastEfficiency | null;
  rate_likely_units: string | null;
  rate_planned_units: string | null;
  history_days: number;
  missing_inputs: string[];
}

export interface ForecastPoLine {
  po_line_id: number;
  po_code: string;
  item_id: number;
  vendor_id: number | null;
  own_order_supply: boolean;
  qty_used: string | null;
  eta_date: string | null;
  eta_source: string;
  lateness_source: string;
  receipt_p50: string | null;
  receipt_p80: string | null;
  receipt_p90: string | null;
}

export interface ForecastMaterial {
  /** NOT_EVALUATED | NONE_NEEDED | DATED | UNKNOWN */
  status: string;
  reason_codes: string[];
  ready_p50: string | null;
  ready_p80: string | null;
  ready_p90: string | null;
  lateness_source: string;
  shared_supply: boolean;
  /** Emptied (with reason PO_DETAIL_HIDDEN_NO_INVENTORY_ACCESS) when the user has no inventory read access. */
  po_lines: ForecastPoLine[];
}

export interface ForecastGridPoint {
  q: string;
  finish_date: string | null;
}

export interface ForecastDriver {
  driver: "MATERIAL" | "EFFICIENCY" | "LOAD" | string;
  impact_days: number;
  detail: string;
}

export interface DeliveryForecastResponse {
  order_id: number;
  order_code: string;
  order_status: string;
  model_version: string;
  as_of: string;
  target_date: string | null;
  target_basis: string;
  order_qty: string | null;
  produced_qty: string | null;
  remaining_qty: string | null;
  band: ForecastBand | string;
  /** 0.0250 = "< 5 %", 0.9750 = ">= 95 %"; null with fixed bands (not enough history). */
  on_time_probability: string | null;
  probability_display: string | null;
  calibrated: boolean;
  calibration_label: string;
  spread_mode: SpreadMode | string | null;
  spread_window_days: number | null;
  p50_date: string | null;
  p80_date: string | null;
  p90_date: string | null;
  start_date: string | null;
  working_days_needed: number | null;
  daily_rate_likely: string | null;
  daily_rate_p80: string | null;
  daily_rate_p90: string | null;
  delay_days: number | null;
  early_days: number | null;
  efficiency_source: string | null;
  lateness_source: string;
  confidence: string;
  material: ForecastMaterial | null;
  lines: ForecastLine[];
  grid: ForecastGridPoint[];
  drivers: ForecastDriver[];
  reason_codes: string[];
  missing_inputs: string[];
  assumptions: string[];
  inputs_hash: string | null;
  external_lead_time_days?: number | null;
}

// ------------------------------------------------------------------ supplier lateness

export interface LatenessGroup {
  n: number;
  p50_days: number | null;
  p80_days: number | null;
  p90_days: number | null;
  on_time_rate: string | null;
  open_late_lower_bound: number;
  sufficient: boolean;
}

export interface LatenessVendor extends LatenessGroup {
  vendor_id: number;
  vendor_name: string | null;
}

export interface LatenessCategory extends LatenessGroup {
  category_id: number;
  category_name: string | null;
}

export interface LatenessVendorCategory extends LatenessGroup {
  vendor_id: number | null;
  vendor_name: string | null;
  category_id: number | null;
  category_name: string | null;
}

export interface SupplierLatenessResponse {
  as_of: string;
  window_days: number;
  promise_basis: string;
  min_sample: number;
  tenant: LatenessGroup;
  vendors: LatenessVendor[];
  categories: LatenessCategory[];
  vendor_categories: LatenessVendorCategory[];
  excluded: Record<string, number>;
  truncated: boolean;
  notices: string[];
  assumptions: string[];
}

// ------------------------------------------------------------------ anomalies

export interface Anomaly {
  line_id: number;
  line_code: string | null;
  date: string;
  hour_slot: number | null;
  metric: AnomalyMetric | string;
  direction: "LOW" | "HIGH" | string;
  /** Percent for EFFICIENCY / REJECTION_RATE, pieces for HOURLY_OUTPUT. */
  value: string | null;
  baseline_median: string | null;
  robust_z: string;
  baseline_n: number;
}

export interface AnomaliesResponse {
  date_from: string;
  date_to: string;
  threshold: string;
  baseline_production_days: number;
  min_baseline_points: number;
  lines_checked: number;
  anomalies: Anomaly[];
  truncated: boolean;
  series_skipped: Record<string, number>;
  notices: string[];
  assumptions: string[];
}

// ------------------------------------------------------------------ calibration

export interface CalibrationBin {
  lower: string;
  upper: string;
  n: number;
  mean_probability: string | null;
  hit_rate: string | null;
}

export interface CalibrationCoverage {
  n: number;
  share: string | null;
}

export interface CalibrationResponse {
  as_of: string;
  model_version: string;
  status: "OK" | "INSUFFICIENT_OUTCOMES" | string;
  calibrated: boolean;
  min_outcomes: number;
  n: number;
  n_snapshots_considered: number;
  n_pending: number;
  n_excluded: number;
  brier: string | null;
  bins: CalibrationBin[];
  coverage: { p80: CalibrationCoverage; p90: CalibrationCoverage };
  lead_buckets: { lead_days: number; n: number; brier: string | null }[];
  notices: string[];
  assumptions: string[];
}

// ------------------------------------------------------------------ recommendations (stored findings)

export interface Recommendation {
  id: number;
  finding_key: string;
  kind: FindingKind | string;
  severity: FindingSeverity | string;
  priority: string;
  department: string | null;
  order_id: number | null;
  order_code: string | null;
  line_id: number | null;
  line_code: string | null;
  status: "OPEN" | "CLEARED" | string;
  alert_eligible: boolean;
  first_detected_on: string;
  last_detected_on: string;
  cleared_on: string | null;
  deadline_date: string | null;
  /** ACCEPTED | REJECTED | IGNORED, or null while undecided. */
  decision_status: string | null;
  outcome_status: string | null;
  /** Facts, assumptions, recommendation, alternatives, approval requirement, confidence (no money). */
  payload: Record<string, unknown>;
}

export interface RecommendationsResponse {
  status: string;
  kind: string | null;
  limit: number;
  items: Recommendation[];
  truncated: boolean;
  kinds: string[];
  notices: string[];
}

/** Stored decision value (ai_agent_decisions.decision / finding.decision_status). */
export type RecommendationDecision = "ACCEPTED" | "REJECTED";
/** Request value for POST .../decision. */
export type RecommendationDecisionInput = "ACCEPT" | "REJECT";

/** Backend `_decision_out`. A finding that already has a decision returns the stored one with `replayed: true`. */
export interface RecommendationDecisionResponse {
  finding_id: number;
  decision_id: number;
  decision: RecommendationDecision | string;
  note: string | null;
  decided_by: number | null;
  decided_at: string | null;
  replayed: boolean;
  finding_status: string;
  decision_status: string | null;
  deadline_date: string | null;
  /** Screen to open after accepting (`{href, label}`), else null. */
  next_step: { href?: string; label?: string } | null;
  recommendation: Record<string, unknown>;
}

export type ExplainSubject = "order" | "finding";

/** Backend POST /predictive/explain. `source` "ai" = approved AI provider wording (numbers checked), "rules" = fixed text. */
export interface PredictionExplainResponse {
  subject: ExplainSubject;
  record_id: number;
  as_of: string;
  source: "ai" | "rules" | string;
  tag: "AI_TEXT" | "RULES" | string;
  text: string;
  findings: unknown[];
  rules_text: string;
  facts: unknown[];
  dates: Record<string, unknown>;
  fallback_reason: string | null;
  generated_at: string;
}

export const mfgPredictiveApi = {
  getDeliveryForecast(orderId: number): Promise<DeliveryForecastResponse> {
    return request<DeliveryForecastResponse>(`${BASE}/predictive/orders/${orderId}/delivery-forecast`);
  },
  getLineEfficiency(params: { date_to?: string; factory_unit?: string; line_id?: number } = {}): Promise<LineEfficiencyResponse> {
    return request<LineEfficiencyResponse>(`${BASE}/predictive/line-efficiency${query(params)}`);
  },
  getSupplierLateness(params: { vendor_id?: number; category_id?: number } = {}): Promise<SupplierLatenessResponse> {
    return request<SupplierLatenessResponse>(`${BASE}/predictive/supplier-lateness${query(params)}`);
  },
  getAnomalies(params: { date_from: string; date_to: string; line_id?: number; factory_unit?: string }): Promise<AnomaliesResponse> {
    return request<AnomaliesResponse>(`${BASE}/predictive/anomalies${query(params)}`);
  },
  getCalibration(): Promise<CalibrationResponse> {
    return request<CalibrationResponse>(`${BASE}/predictive/calibration`);
  },
  listRecommendations(params: { status?: RecommendationStatusFilter; kind?: string; limit?: number } = {}): Promise<RecommendationsResponse> {
    return request<RecommendationsResponse>(`${BASE}/recommendations${query(params)}`);
  },
  /** Records the human decision only (admin / manager or ai.agents.confirm). Never changes plans, POs or stock. */
  decideRecommendation(findingId: number, body: { decision: RecommendationDecisionInput; note?: string }): Promise<RecommendationDecisionResponse> {
    return request<RecommendationDecisionResponse>(`${BASE}/recommendations/${findingId}/decision`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  /** 404 unless mfg_predictive_ai_text_v1 is on. Falls back to rule text when the AI provider fails. */
  explainPrediction(body: { subject: ExplainSubject; record_id: number }): Promise<PredictionExplainResponse> {
    return request<PredictionExplainResponse>(`${BASE}/predictive/explain`, { method: "POST", body: JSON.stringify(body) });
  },
};
