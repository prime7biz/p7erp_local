/**
 * Manufacturing Intelligence Phase 5 API client: forward plan, scenarios, finance-constrained view and scheduler.
 * Backend: backend/app/modules/mfg_intelligence/advanced_planning_router.py + advanced_planning_schemas.py (GET,
 * read-only) and backend/app/modules/mfg_planning/scheduler_router.py (POST convert). Prefix /api/v1/mfg-intelligence.
 *
 * 404 while `mfg_advanced_planning_v1` (or `manufacturing_intelligence_v1`) is off; the scheduler also needs
 * `mfg_integrated_planning_v1`, the finance view `mfg_financial_readiness_v1` + the finance gate. Errors carry
 * `detail: {code, message}` (for example HORIZON_NOT_ALLOWED, PARAMETER_OUT_OF_RANGE, TOO_MANY_LINES, 503
 * FORWARD_PLAN_TIMEOUT). Minutes are 2-decimal strings, money 4-decimal strings, dates ISO.
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

export type ForwardBucket = "week" | "month";
export type ForwardScenario = "BASE" | "OPTIMISTIC" | "CONSERVATIVE" | "CAPACITY_CONSTRAINED";
export type EfficiencyBasis = "PLAN" | "P50" | "Q20" | "P80" | "P90";

export type DemandLayer =
  | "CONFIRMED_PLANNED_FIRM"
  | "CONFIRMED_PLANNED_SOFT"
  | "UNCONFIRMED_ORDER_ROWS"
  | "UNLINKED_ROWS"
  | "OVERDUE_PLANNED_BACKLOG"
  | "CONFIRMED_UNPLANNED"
  | "OVERDUE_UNPLANNED"
  | "TENTATIVE_FULL"
  | "TENTATIVE_WEIGHTED"
  | "FORECAST_RESIDUAL";

/** Scenario parameters sent as query values (decimal text for percentages). */
export interface ForwardPlanParams {
  efficiency_basis?: EfficiencyBasis;
  overtime_pct?: string;
  absence_pct?: string;
  extra_operator_pct?: string;
  virtual_lines?: number;
}

export interface ForwardPlanQuery extends ForwardPlanParams {
  horizon_days: number;
  bucket: ForwardBucket;
  factory_unit?: string;
  scenario: ForwardScenario;
}

export interface ForwardBucketRow {
  index: number;
  start: string;
  end: string;
  working_days: number;
  capacity_minutes: string | null;
  /** COMPLETE or PARTIAL (some line-days have unknown capacity). */
  capacity_status: string;
  unknown_line_days: number;
  unknown_reasons: Record<string, number>;
  overtime_minutes: string | null;
  partial_month: boolean;
  /** Every layer is listed; only `layers_included` make up `load_minutes`. */
  layers: Record<string, string | null>;
  load_minutes: string | null;
  gap_minutes: string | null;
  utilization_pct: string | null;
  reason_codes: string[];
}

export interface ForwardEfficiency {
  basis: string;
  mode: string;
  lines_by_mode: Record<string, number>;
  predictive: boolean;
}

export interface ForwardPlanResponse {
  engine_version: string;
  as_of: string;
  date_from: string;
  date_to: string;
  horizon_days: number;
  bucket: ForwardBucket | string;
  factory_unit: string | null;
  scenario: string;
  parameters: Record<string, unknown>;
  layers_included: string[];
  efficiency: ForwardEfficiency;
  frozen_end: string;
  lines: number;
  virtual_lines: number;
  buckets: ForwardBucketRow[];
  totals: { capacity_minutes?: string | null; load_minutes?: string | null; gap_minutes?: string | null; overtime_minutes?: string | null; layers?: Record<string, string | null> } & Record<string, unknown>;
  /** Present for CAPACITY_CONSTRAINED: demand above capacity is carried forward. */
  constrained: { deferred_beyond_horizon_minutes?: Record<string, string | null>; booked_overload_weeks?: number[] } & Record<string, unknown> | null;
  identity: Record<string, unknown>;
  counts: Record<string, number>;
  beyond_horizon_minutes: Record<string, string | null>;
  forecast: { availability?: string; families_available?: string[]; families_insufficient?: string[]; coverage_pct?: string | null } & Record<string, unknown>;
  median_line_daily_minutes: string | null;
  reason_codes: string[];
  notices: string[];
  assumptions: string[];
}

export interface CompareScenario {
  scenario: string;
  parameters: Record<string, unknown>;
  layers_included: string[];
  efficiency: ForwardEfficiency;
  buckets: ForwardBucketRow[];
  totals: ForwardPlanResponse["totals"];
  deferred_beyond_horizon_minutes: Record<string, string | null> | null;
  reason_codes: string[];
}

export interface CompareResponse {
  engine_version: string;
  as_of: string;
  date_from: string;
  date_to: string;
  horizon_days: number;
  bucket: string;
  factory_unit: string | null;
  scenarios: CompareScenario[];
  notices: string[];
  assumptions: string[];
}

export interface ForecastDemandResponse {
  as_of: string;
  date_from: string;
  date_to: string;
  horizon_days: number;
  method: string;
  label: string;
  availability: string;
  tenant_history_months: number;
  tenant_history_sufficient: boolean;
  coverage_pct: string | null;
  months: string[];
  families: ForecastFamily[];
  reason_codes: string[];
  notices: string[];
  assumptions: string[];
}

export interface ForecastFamily {
  family: string;
  /** AVAILABLE or INSUFFICIENT_HISTORY */
  availability: string;
  months_with_orders: number;
  residual_total_minutes: string | null;
  months: { month: string; forecast_minutes: string | null; consumed_minutes: string | null; residual_minutes: string | null }[];
  reason_codes: string[];
}

export interface FinanceWeek {
  week_index: number;
  week_start: string;
  week_end: string;
  phase3_closing: string | null;
  after_confirmed_material: string | null;
  after_kept_tentative: string | null;
  position_with_headroom: string | null;
  below_zero: boolean;
}

export interface FinanceBooking {
  booking_id: number;
  key: string;
  line_id: number | null;
  quotation_id: number | null;
  inquiry_id: number | null;
  confidence_pct: string | null;
  start_date: string;
  end_date: string | null;
  planned_qty: string | null;
  full_minutes: string | null;
  weighted_minutes: string | null;
  admitted_minutes: string | null;
  cash_need: string | null;
  due_date: string | null;
  week_index: number | null;
  value_class: string;
  reason_codes: string[];
}

export interface FinanceConstrainedResponse {
  as_of: string;
  date_from: string;
  date_to: string;
  horizon_days: number;
  factory_unit: string | null;
  base_currency: string;
  value_class: string;
  capacity_parameters: Record<string, unknown>;
  facility_headroom: { amount?: string | null; facilities?: unknown; unknown_by_currency?: Record<string, unknown> } & Record<string, unknown>;
  weeks: FinanceWeek[];
  confirmed_material: { total?: string | null; value_class?: string; orders_unknown?: number; orders_undated?: number } & Record<string, unknown>;
  kept: FinanceBooking[];
  cut: FinanceBooking[];
  tentative_not_admitted_by_capacity: number;
  forecast_cut: { key: string; month?: string | null; family?: string | null; minutes?: string | null; reason_codes?: string[] }[];
  confirmed_financing_gap: { week_index: number; week_start: string; shortfall: string | null } | null;
  after_confirmed_only_gap: Record<string, unknown> | null;
  phase3: Record<string, unknown>;
  reason_codes: string[];
  notices: string[];
  assumptions: string[];
}

// ------------------------------------------------------------------ scheduler

export type SchedulerJobStatus = "PLACED" | "UNCHANGED" | "UNSCHEDULED" | "PINNED";
export type DecidingCriterion = "LATENESS" | "CHANGEOVER" | "IDLE_GAP" | "OVERTIME" | "LINE_CODE" | "LINE_ID";

export interface SchedulerScore {
  lateness_days: number;
  /** 0 same style, 1 same family, 2 other / new setup, 3 family never run on the line */
  changeover_rank: number;
  idle_gap_days: number;
  overtime_minutes: string;
  line_code: string;
}

export interface SchedulerPlacement {
  line_id: number;
  line_code: string;
  start_date: string;
  end_date: string;
  working_days: number;
  lateness_days: number;
  changeover_rank: number;
  score: SchedulerScore;
}

export interface SchedulerAlternative {
  line_id: number;
  line_code: string;
  start_date: string;
  end_date: string;
  score: SchedulerScore;
  deciding_criterion: DecidingCriterion | string;
}

export interface SchedulerJob {
  /** "row:<config_id>" or "order:<order_id>" */
  job_id: string;
  kind: "ROW" | "ORDER" | string;
  order_id: number;
  order_code: string | null;
  config_id: number | null;
  style_id: number | null;
  family: string | null;
  qty: string;
  smv_per_piece: string | null;
  minutes: string | null;
  need_by: string | null;
  earliest_start: string | null;
  priority_rank: number | null;
  status: SchedulerJobStatus | string;
  action: "UPDATE" | "CREATE" | null | string;
  current: { line_id: number; start_date: string; end_date: string | null } | null;
  placement: SchedulerPlacement | null;
  alternatives: SchedulerAlternative[];
  tentative_displaced: number[];
  overtime_would_recover_minutes: string | null;
  reason_codes: string[];
}

export interface SchedulerItem {
  job_id: string;
  action: "UPDATE" | "CREATE" | string;
  config_id: number | null;
  line_id: number;
  order_id: number | null;
  style_id: number | null;
  start_date: string;
  planned_end_date: string;
  planned_qty: string | null;
  reservation_status: string | null;
  target_efficiency_pct: string | null;
}

export interface SchedulerKpi {
  late_jobs: number;
  lateness_days: number;
  changeovers: number;
  overtime_minutes: string;
  unscheduled_jobs: number;
}

export interface SchedulerFirmLate {
  config_id: number;
  order_id: number;
  order_code: string | null;
  line_id: number;
  end_date: string;
  need_by: string;
  lateness_days: number;
  reason_codes: string[];
}

export interface SchedulerPreviewResponse {
  engine_version: string;
  as_of: string;
  date_from: string;
  date_to: string;
  horizon_days: number;
  frozen_end: string;
  factory_unit: string | null;
  parameters: Record<string, unknown>;
  settings: { frozen_horizon_days?: number; changeover_loss_pct?: number } & Record<string, unknown>;
  lines: { line_id: number; line_code: string; name?: string | null; factory_unit?: string | null }[];
  jobs: SchedulerJob[];
  items: SchedulerItem[];
  kpis: { before?: SchedulerKpi; after?: SchedulerKpi } & Record<string, SchedulerKpi | undefined>;
  firm_reschedule_suggested: SchedulerFirmLate[];
  counts: Record<string, number>;
  proposal_hash: string;
  proposal_only: boolean;
  reason_codes: string[];
  notices: string[];
  assumptions: string[];
}

/** Same parameters as the preview; the server re-runs the engine with them (no efficiency_basis: PLAN only). */
export interface SchedulerParams {
  horizon_days: number;
  factory_unit: string | null;
  material_delay_days: number;
  btb_delay_days: number;
  exclude_job_ids: string[];
}

export interface SchedulerConvertInput {
  params: SchedulerParams;
  proposal_hash: string;
  /** 5-500 characters, saved as the plan revision reason. */
  note: string;
  /** ^[A-Za-z0-9_-]{8,32}$, generated once per dialog so a retry replays instead of creating a second revision. */
  request_id: string;
}

/** The new (201) or replayed (200) plan revision plus the scheduler summary. */
export interface SchedulerConvertResponse {
  id: number;
  revision_no: number | null;
  status: string;
  title: string | null;
  reason: string | null;
  request_id: string | null;
  scheduler: { proposal_hash: string; replay: boolean; items: number | null };
  [key: string]: unknown;
}

function paramQuery(p: ForwardPlanParams) {
  return {
    efficiency_basis: p.efficiency_basis,
    overtime_pct: p.overtime_pct,
    absence_pct: p.absence_pct,
    extra_operator_pct: p.extra_operator_pct,
    virtual_lines: p.virtual_lines,
  };
}

export const mfgAdvancedPlanningApi = {
  getForwardPlan(q: ForwardPlanQuery): Promise<ForwardPlanResponse> {
    return request<ForwardPlanResponse>(
      `${BASE}/forward-plan${query({ horizon_days: q.horizon_days, bucket: q.bucket, factory_unit: q.factory_unit, scenario: q.scenario, ...paramQuery(q) })}`,
    );
  },
  compareScenarios(q: Omit<ForwardPlanQuery, "scenario"> & { scenarios: ForwardScenario[] }): Promise<CompareResponse> {
    return request<CompareResponse>(
      `${BASE}/forward-plan/compare${query({
        scenarios: q.scenarios.join(","),
        horizon_days: q.horizon_days,
        bucket: q.bucket,
        factory_unit: q.factory_unit,
        ...paramQuery(q),
      })}`,
    );
  },
  getForecastDemand(horizonDays: number): Promise<ForecastDemandResponse> {
    return request<ForecastDemandResponse>(`${BASE}/forward-plan/forecast-demand${query({ horizon_days: horizonDays })}`);
  },
  getFinanceConstrained(q: { horizon_days: number; factory_unit?: string }): Promise<FinanceConstrainedResponse> {
    return request<FinanceConstrainedResponse>(`${BASE}/forward-plan/finance-constrained${query(q)}`);
  },
  getSchedulerPreview(p: SchedulerParams): Promise<SchedulerPreviewResponse> {
    return request<SchedulerPreviewResponse>(
      `${BASE}/scheduler/preview${query({
        horizon_days: p.horizon_days,
        factory_unit: p.factory_unit,
        efficiency_basis: "PLAN",
        material_delay_days: p.material_delay_days,
        btb_delay_days: p.btb_delay_days,
        exclude_job_ids: p.exclude_job_ids.length ? p.exclude_job_ids.join(",") : undefined,
      })}`,
    );
  },
  convertProposal(body: SchedulerConvertInput): Promise<SchedulerConvertResponse> {
    return request<SchedulerConvertResponse>(`${BASE}/scheduler/convert`, { method: "POST", body: JSON.stringify(body) });
  },
};
