/**
 * Manufacturing Intelligence Phase 3 API client: order cost at completion and cash requirement (read-only).
 * Backend: backend/app/modules/mfg_intelligence/finance_router.py + schemas.py, prefix /api/v1/mfg-intelligence.
 *
 * 404 while the tenant flag is off (`mfg_cost_intelligence_v1` / `mfg_financial_readiness_v1`), 403 without the
 * finance gate (admin / manager, or finance.access + finance.mis_report.view), 422 for a bad query.
 * Every money value is a 4-decimal STRING (or null): format it for display only, never do float maths with it.
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

export type ValueClass = "ACTUAL" | "COMMITTED" | "ESTIMATED" | "FORECAST";
export type CostStatus = "COMPLETE_DATA" | "PARTIAL" | "UNKNOWN";
export type CostOrderStatusFilter = "NEW" | "CONFIRMED" | "IN_PROGRESS";

/** One money figure with where it came from (backend `MoneyValueOut`). */
export interface MoneyValue {
  amount: string | null;
  value_class: ValueClass | string;
  source: string | null;
  currency: string | null;
  source_amount: string | null;
  rate: string | null;
  rate_source: string | null;
  reason_codes: string[];
  missing_inputs: string[];
}

export interface BudgetFigures {
  revenue: string | null;
  material: string | null;
  cm: string | null;
  other: string | null;
}

export interface CostBudget {
  usable: boolean;
  source: string;
  value_class: ValueClass | string;
  currency: string | null;
  rate: string | null;
  rate_source: string | null;
  scale_factor: string | null;
  scaled: BudgetFigures;
  unscaled: BudgetFigures;
  reason_codes: string[];
}

export interface CostMaterial {
  procured: MoneyValue;
  budget: MoneyValue;
  remaining: MoneyValue;
  eac: MoneyValue;
  po_lines: number;
  po_lines_unknown_fx: number;
  bom_id: number | null;
}

export interface CostConversion {
  smv: string | null;
  smv_source: string | null;
  sah_minutes: string | null;
  cpm: string | null;
  cpm_source: string | null;
  eac: MoneyValue;
  budget_cm: string | null;
  variance_vs_budget_cm: string | null;
}

export interface CostProgress {
  p: string | null;
  source: string;
  sewing_good_qty: string | null;
  plan_completed_qty: string | null;
  produced_qty: string | null;
  earned_conversion: string | null;
  remaining_conversion: string | null;
}

export interface CostMargin {
  amount: string | null;
  margin_pct: string | null;
  basis: string;
  value_class: ValueClass | string;
}

/** Ledger (posted GL) order figures - information only, never part of the estimate. */
export interface GlActual {
  value_class: ValueClass | string;
  source: string;
  revenue: string | null;
  material: string | null;
  cm: string | null;
  other: string | null;
  overhead: string | null;
  finance_cost: string | null;
  direct_voucher_lines: number;
  reason_codes: string[];
  note: string;
}

export interface OrderCost {
  order_id: number;
  order_code: string;
  order_status: string;
  order_qty: string | null;
  delivery_date: string | null;
  base_currency: string;
  status: CostStatus | string;
  reason_codes: string[];
  missing_inputs: string[];
  revenue: { gross: MoneyValue; commission: MoneyValue; net: MoneyValue };
  budget: CostBudget;
  material: CostMaterial;
  conversion: CostConversion;
  other: MoneyValue;
  progress: CostProgress;
  eac: MoneyValue;
  margin: CostMargin;
  /** Currency -> source amount left out because no exchange rate is stored. */
  unknown_by_currency: Record<string, string>;
  /** Only on the single-order endpoint. */
  gl_actual: GlActual | null;
  /** App path to the finance order profitability page (may be empty). */
  finance_link: string;
}

export interface CpmDetail {
  value: string | null;
  source: string | null;
  period_start: string | null;
  period_end: string | null;
  cm_total: string | null;
  earned_minutes: string | null;
  reason_codes: string[];
  warnings: Record<string, unknown>[];
}

export interface OrderCostDetail extends OrderCost {
  cpm_detail: CpmDetail;
  assumptions: string[];
}

export interface CostTotals {
  revenue_net: string;
  eac: string;
  margin: string;
  margin_pct: string | null;
  orders_counted: number;
  orders_excluded: number;
}

export interface CostListResponse {
  base_currency: string;
  items: OrderCost[];
  total: number;
  limit: number;
  offset: number;
  totals: CostTotals;
  cpm: CpmDetail;
  assumptions: string[];
}

// ------------------------------------------------------------------ cash requirement

export interface CashOpening {
  cash_in_hand: string;
  bank: string;
  /** Drawn bank overdraft (signed; a drawn overdraft lowers net cash). */
  bank_od: string;
  /** Cash in hand + bank, before the drawn overdraft. */
  excluding_overdraft: string;
  /** Net cash = cash + bank - drawn overdraft. Week 1 opens with this figure. */
  including_overdraft: string;
  basis: string;
  source: string;
}

export interface CashTotals {
  inflow: string;
  outflow: string;
  net: string;
  closing: string;
}

export interface CashWeek {
  week_index: number;
  week_start: string;
  week_end: string;
  opening: string;
  inflow: string;
  outflow: string;
  net: string;
  closing: string;
  below_zero: boolean;
  by_category: Record<string, string>;
}

export interface FinancingGap {
  week_index: number;
  week_start: string;
  shortfall: string;
}

export interface FacilityHeadroom {
  amount: string;
  facilities: number;
  unknown_by_currency: Record<string, string>;
  note: string;
}

export interface CashUndated {
  inflow: string;
  outflow: string;
  rows: number;
}

export interface CashUnknown {
  direction: string;
  category: string;
  currency: string;
  source_amount: string | null;
  rows: number;
}

export type CashConfidence = "CONTRACTUAL" | "SCHEDULED" | "ESTIMATED";

export interface CashRow {
  direction: "IN" | "OUT" | string;
  category: string;
  source_type: string;
  source_id: number | null;
  reference: string | null;
  due_date: string | null;
  date_rule: string;
  confidence: CashConfidence | string;
  value_class: ValueClass | string;
  currency: string | null;
  source_amount: string | null;
  rate: string | null;
  rate_source: string | null;
  amount: string | null;
  week_index: number | null;
  overdue: boolean;
  reason_codes: string[];
}

export interface CashRequirementResponse {
  date_from: string;
  date_to: string;
  horizon_days: number;
  base_currency: string;
  value_class: ValueClass | string;
  settings: { export_document_days: number; export_usance_days: number; btb_usance_days: number };
  opening: CashOpening;
  totals: CashTotals;
  weeks: CashWeek[];
  financing_gap: FinancingGap | null;
  facility_headroom: FacilityHeadroom;
  undated: CashUndated;
  beyond_horizon_rows: number;
  unknown_by_currency: CashUnknown[];
  rows: CashRow[];
  row_count: number;
  truncated: boolean;
  max_rows: number;
  /** false when a data source hit its row cap (reason `SOURCE_TRUNCATED:<category>`): totals are incomplete. */
  forecast_complete?: boolean;
  reason_codes: string[];
  notes: string[];
}

export const COST_LIST_MAX_LIMIT = 200;
export const CASH_MAX_HORIZON_DAYS = 180;
export const CASH_DEFAULT_HORIZON_DAYS = 90;

export const mfgCostCashApi = {
  listCostAtCompletion(p: { status?: CostOrderStatusFilter; limit?: number; offset?: number } = {}): Promise<CostListResponse> {
    return request<CostListResponse>(`${BASE}/cost-at-completion${query(p)}`);
  },
  getOrderCostAtCompletion(orderId: number): Promise<OrderCostDetail> {
    return request<OrderCostDetail>(`${BASE}/orders/${orderId}/cost-at-completion`);
  },
  getCashRequirement(p: { date_from?: string; horizon_days?: number } = {}): Promise<CashRequirementResponse> {
    return request<CashRequirementResponse>(`${BASE}/cash-requirement${query(p)}`);
  },
};
