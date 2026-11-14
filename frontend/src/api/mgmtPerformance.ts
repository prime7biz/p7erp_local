/**
 * Finance > Management Performance API client. Backend: backend/app/modules/finance/mgmt_performance/.
 * Every amount is a decimal STRING with 4 places (null = unknown or hidden). Never do arithmetic on it in JS.
 * All routes need the tenant flag `mgmt_performance_v1` (otherwise 404). Reads never change data.
 */
import { request } from "@/api/core";

const BASE = "/api/v1/finance/mgmt-performance";

export type Money = string;
export type BudgetRowStatus = "OK" | "WARNING" | "AT_RISK" | "FAILED" | "UNBUDGETED" | "UNMAPPED";
export type ExceptionStatus = "OPEN" | "RESPONDED" | "REVIEWED" | "APPROVED" | "REJECTED";
export type ExceptionFamily = "BUDGET" | "UNBUDGETED" | "UNMAPPED";
export type ExceptionAction = "respond" | "review" | "approve" | "reject";

export interface PeriodInfo {
  kind: "month" | "quarter" | "year";
  label: string;
  start: string;
  end: string;
  today?: string;
}

export interface MpAccess {
  allowed: boolean;
  company: boolean;
  cost_center_ids: number[];
  payroll_visible?: boolean;
  can_setup?: boolean;
  can_respond_unowned?: boolean;
  can_review?: boolean;
  can_decide?: boolean;
  can_approve_revisions?: boolean;
  user_id?: number;
}

export interface TargetsData {
  opex_forecast: Money;
  contingency: Money;
  target_profit: Money;
  unallocated_landed_selling: Money;
  fg_contribution: Money;
  pipeline_contribution: Money;
  required_contribution: Money;
  expected_contribution_pct: Money | null;
  expected_contribution_pct_source: string;
  contribution_per_piece: Money | null;
  break_even_value: Money | null;
  profit_target_value: Money | null;
  remaining_production_value: Money | null;
  remaining_production_pieces: Money | null;
  marketing_gap_value: Money | null;
  result_so_far: Money;
  result_with_pipeline: Money;
  gap_status: "COVERED" | "PIPELINE_COVERS" | "GAP";
  targets_set_months: string[];
  reason_codes: string[];
}

export interface SummaryResponse {
  period: PeriodInfo;
  base_currency: string;
  accounting_profit: {
    from_date: string;
    to_date: string;
    gross_result: Money;
    nett_result: Money;
    income_expense_movement: Money;
    balanced: boolean;
    value_class: "ACTUAL";
  };
  fg_contribution: {
    value: Money;
    direct_cost: Money;
    contribution: Money;
    contribution_pct: Money | null;
    unallocated_landed_selling: Money;
    net_contribution: Money;
    counted_qty: Money;
    orders: number;
    unknown_orders: number;
    value_class: "ESTIMATED";
  };
  opex: { budget: Money; actual: Money; committed: Money; forecast: Money };
  forecast_result: { so_far: Money; with_pipeline: Money; value_class: "FORECAST" };
  budget_status_counts: Partial<Record<BudgetRowStatus, number>>;
  targets: TargetsData;
  reason_codes: string[];
  notes: string[];
}

export interface ForecastMonth {
  month: string;
  kind: "past" | "current" | "future";
  budget: Money;
  actual: Money;
  committed: Money;
  forecast: Money;
  source: string | null;
}

export interface ForecastRow {
  cost_center_id: number | null;
  cost_center_label: string;
  department: string | null;
  owner_user_id: number | null;
  category: string;
  category_label: string;
  budget: Money | null;
  actual: Money | null;
  committed: Money | null;
  forecast: Money | null;
  variance: Money | null;
  used_pct: Money | null;
  run_rate: Money | null;
  history_avg: Money | null;
  warning_pct: Money;
  status: BudgetRowStatus;
  sources: string[];
  restricted: boolean;
  budget_line_ids: number[];
  months: ForecastMonth[];
}

export interface UnmappedRow {
  kind: "POSTED" | "BUDGET";
  account_id: number | null;
  account_label: string;
  cost_center_id: number | null;
  cost_center_label?: string;
  amount: Money;
}

export interface PayrollInfo {
  month: string;
  source: "PAYROLL_RUN" | "ATTENDANCE_ACCRUAL";
  amount: Money | null;
  earned_to_date: Money;
  remaining: Money;
  overtime: Money;
  employees: number;
  employees_without_structure: number;
  reason_codes: string[];
}

export interface BudgetForecastResponse {
  period: PeriodInfo;
  base_currency: string;
  scope: "company" | "own_cost_centres";
  rows: ForecastRow[];
  unmapped: UnmappedRow[];
  status_counts: Partial<Record<BudgetRowStatus, number>>;
  totals: { budget: Money; actual: Money; committed: Money; forecast: Money };
  payroll: PayrollInfo[] | null;
  committed_unmapped_lines: number | null;
  budgets_used: { id: number; budget_name: string; fiscal_year: string }[];
  thresholds: Record<string, Money>;
  reason_codes: string[];
  notes: string[];
}

export interface OrderContributionRow {
  order_id: number;
  order_code: string | null;
  order_qty: Money | null;
  received_before: Money;
  received_in_period: Money;
  counted_qty: Money;
  unit_price: Money | null;
  material: Money | null;
  processing: Money | null;
  processing_source: string | null;
  selling: Money | null;
  cost_per_piece: Money | null;
  value: Money | null;
  direct_cost: Money | null;
  contribution: Money | null;
  contribution_pct: Money | null;
  cost_status: "COMPLETE" | "ESTIMATED" | "UNKNOWN";
  confidence: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  revenue_source: string | null;
  reason_codes: string[];
}

export interface FgContributionResponse {
  period: PeriodInfo;
  totals: {
    value: Money;
    direct_cost: Money;
    contribution: Money;
    contribution_pct: Money | null;
    counted_qty: Money;
    contribution_per_piece: Money | null;
  };
  orders_total: number;
  unknown_orders: number;
  receipts_without_order: { rows: number; qty: Money };
  pipeline: { orders: number; value: Money; contribution: Money; unknown_orders: number };
  order_book_contribution_pct: Money | null;
  fg_stock_groups: number;
  truncated: boolean;
  reason_codes: string[];
  items: OrderContributionRow[];
  limit: number;
  offset: number;
  notes: string[];
}

export interface TargetsResponse extends TargetsData {
  period: PeriodInfo;
  base_currency: string;
}

export interface CashWeek {
  week_index: number;
  week_start: string;
  week_end: string;
  inflow: Money;
  outflow: Money;
  net: Money;
  closing: Money;
  below_zero: boolean;
}

export interface CashResponse {
  date_from: string;
  date_to: string;
  base_currency: string;
  opening: { excluding_overdraft: Money; including_overdraft: Money };
  totals: { inflow: Money; outflow: Money; net: Money; closing: Money };
  weeks: CashWeek[];
  financing_gap: { week_index: number; week_start: string; shortfall: Money } | null;
  reason_codes: string[];
  notes: string[];
}

export interface ExceptionItem {
  id: number;
  period_month: string;
  cost_center_id: number | null;
  cost_center_label: string;
  owner_user_id: number | null;
  category: string | null;
  category_label: string | null;
  account_id: number | null;
  family: ExceptionFamily;
  severity: "WARNING" | "AT_RISK" | "FAILED";
  status: ExceptionStatus;
  budget_amount: Money | null;
  actual_amount: Money | null;
  forecast_amount: Money | null;
  revised_forecast: Money | null;
  reason: string | null;
  corrective_action: string | null;
  review_note: string | null;
  decision_note: string | null;
  restricted: boolean;
  can_respond: boolean;
  can_review: boolean;
  can_decide: boolean;
}

export interface Paged<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface RevisionItem {
  id: number;
  budget_id: number | null;
  budget_line_id: number | null;
  kind: "CHANGE" | "ADD_LINE";
  revision_no: number | null;
  cost_center_id: number | null;
  account_id: number | null;
  period_month: string;
  old_amount: Money | null;
  /** null when `restricted` (payroll line, viewer without payroll rights). */
  new_amount: Money | null;
  restricted?: boolean;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  requested_by: number | null;
  requested_at: string;
  decided_by: number | null;
  decision_note: string | null;
  can_decide: boolean;
  replay?: boolean;
}

export interface CategoryOption {
  code: string;
  label: string;
  operating: boolean;
}

export interface CategoryMapResponse {
  categories: CategoryOption[];
  groups: { id: number; name: string; parent_group_id: number | null; category: string | null }[];
  accounts: { id: number; label: string; group_id: number | null; category: string | null; effective_category: string | null }[];
  unmapped_accounts: number;
}

export interface ThresholdItem {
  category: string;
  label: string;
  warning_pct: Money;
  is_default: boolean;
}

export interface TargetSetupItem {
  period_month: string;
  target_profit_amount: Money | null;
  contingency_pct: Money | null;
  notes: string | null;
}

export interface OwnersResponse {
  cost_centers: { id: number; code: string; name: string; department: string | null; is_active: boolean; owner_user_id: number | null }[];
  users: { id: number; label: string }[];
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  const text = sp.toString();
  return text ? `?${text}` : "";
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const mgmtPerformanceApi = {
  getAccess: () => request<MpAccess>(`${BASE}/access`),
  getSummary: (period?: string) => request<SummaryResponse>(`${BASE}/summary${qs({ period })}`),
  getBudgetForecast: (period?: string) => request<BudgetForecastResponse>(`${BASE}/budget-forecast${qs({ period })}`),
  getFgContribution: (period?: string, limit = 100, offset = 0) =>
    request<FgContributionResponse>(`${BASE}/fg-contribution${qs({ period, limit, offset })}`),
  getTargets: (period?: string) => request<TargetsResponse>(`${BASE}/targets${qs({ period })}`),
  getCash: (horizonDays = 90) => request<CashResponse>(`${BASE}/cash${qs({ horizon_days: horizonDays })}`),
  getExceptions: (q: { month?: string; status?: ExceptionStatus; family?: ExceptionFamily; limit?: number; offset?: number }) =>
    request<Paged<ExceptionItem>>(`${BASE}/exceptions${qs(q)}`),
  scanExceptions: () => request<{ created: number; escalated: number; updated: number }>(`${BASE}/exceptions/scan`, { method: "POST" }),
  actOnException: (
    id: number,
    action: ExceptionAction,
    body: { request_id: string; reason?: string; corrective_action?: string; revised_forecast?: string; note?: string },
  ) => request<{ id: number; status: ExceptionStatus; replay: boolean }>(`${BASE}/exceptions/${id}/${action}`, json("POST", body)),
  getRevisions: (q: { status?: RevisionItem["status"]; limit?: number; offset?: number }) =>
    request<Paged<RevisionItem>>(`${BASE}/revisions${qs(q)}`),
  requestRevision: (body: {
    request_id: string;
    kind: "CHANGE" | "ADD_LINE";
    budget_line_id?: number;
    budget_id?: number;
    cost_center_id?: number;
    account_id?: number;
    period_month?: string;
    new_amount: string;
    reason: string;
    exception_id?: number;
  }) => request<RevisionItem>(`${BASE}/revisions`, json("POST", body)),
  decideRevision: (id: number, decision: "approve" | "reject", note?: string) =>
    request<RevisionItem>(`${BASE}/revisions/${id}/${decision}`, json("POST", { note })),
  getCategoryMap: () => request<CategoryMapResponse>(`${BASE}/setup/category-map`),
  saveCategoryMap: (items: { account_id?: number; account_group_id?: number; category: string | null }[]) =>
    request<CategoryMapResponse>(`${BASE}/setup/category-map`, json("PUT", { items })),
  getThresholds: () => request<{ items: ThresholdItem[] }>(`${BASE}/setup/thresholds`),
  saveThresholds: (items: { category: string; warning_pct: string }[]) =>
    request<{ items: ThresholdItem[] }>(`${BASE}/setup/thresholds`, json("PUT", { items })),
  getTargetSetup: (fiscalYear?: string) =>
    request<{ fiscal_year: string; items: TargetSetupItem[] }>(`${BASE}/setup/targets${qs({ fiscal_year: fiscalYear })}`),
  saveTarget: (body: { period_month: string; target_profit_amount: string; contingency_pct: string; notes?: string }) =>
    request<{ ok: boolean }>(`${BASE}/setup/targets`, json("PUT", body)),
  getOwners: () => request<OwnersResponse>(`${BASE}/setup/cost-center-owners`),
  saveOwner: (costCenterId: number, ownerUserId: number | null) =>
    request<{ ok: boolean }>(`${BASE}/setup/cost-center-owners`, json("PUT", { cost_center_id: costCenterId, owner_user_id: ownerUserId })),
};
