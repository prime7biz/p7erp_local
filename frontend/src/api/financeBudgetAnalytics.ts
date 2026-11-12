/**
 * Budget analytics, expense analysis and expense controls API client (Finance modernization, Phase 4).
 * Backend: backend/app/modules/finance/budget_analytics/ (router.py, schemas.py, constants.py).
 * Every amount is a decimal STRING with 4 places. Never turn it into a JS number for arithmetic
 * (use `components/finance/statements/statementFormat.ts` to show amounts).
 * All routes need the tenant flag `finance_budget_analytics_v2` (otherwise 404). Read-only.
 */
import { request, requestBlob } from "@/api/core";

const BASE = "/api/v1/finance";

export type Money = string;

// ---------------------------------------------------------------- Budget analytics
export type BudgetDimension = "cost_center" | "account" | "month" | "department";
export type BudgetStatus = "within" | "warning" | "over" | "critical";

export interface BudgetRef {
  id: number;
  budget_name: string;
  status: string;
}

export interface AnalyticsRow {
  /** Cost centre / account id, "YYYY-MM" month, or department text; null = "none". */
  id?: number | string | null;
  label: string;
  budget: Money;
  actual: Money;
  /** budget - actual (positive = under budget). */
  variance: Money;
  /** null when the budget is 0. */
  variance_percent?: Money | null;
  /** actual / budget x 100; null when the budget is 0. */
  used_percent?: Money | null;
  status: BudgetStatus;
}

export interface AnalyticsTotals {
  budget: Money;
  actual: Money;
  variance: Money;
  variance_percent?: Money | null;
  used_percent?: Money | null;
  status: BudgetStatus;
}

export interface BudgetAnalyticsResponse {
  report: string;
  fiscal_year: string;
  fiscal_year_start: string;
  fiscal_year_end: string;
  dimension: BudgetDimension;
  base_currency: string;
  enforcement_mode: string;
  budgets: BudgetRef[];
  rows: AnalyticsRow[];
  totals: AnalyticsTotals;
  notes: string[];
  data_as_of: string;
}

export interface BudgetAnalyticsQuery {
  /** Label such as "2026-27" (or "2026" for a January year). */
  fiscal_year?: string;
  budget_id?: number;
  dimension: BudgetDimension;
}

export interface DrilldownQuery {
  fiscal_year?: string;
  budget_id?: number;
  cost_center_id?: number;
  no_cost_center?: boolean;
  account_id?: number;
  department?: string;
  no_department?: boolean;
  /** "YYYY-MM". */
  month?: string;
  limit?: number;
  offset?: number;
}

export interface DrillLine {
  voucher_line_id: number;
  voucher_id: number;
  voucher_number: string;
  voucher_date: string;
  voucher_status: string;
  account_id: number;
  account_number?: string | null;
  account_name?: string | null;
  cost_center_id?: number | null;
  cost_center_name?: string | null;
  narration?: string | null;
  entry_type: string;
  /** The line's base-currency amount as posted (always positive). */
  base_amount: Money;
  /** Contribution to "actual" (credit lines and reversals are negative). */
  signed_amount: Money;
}

export interface DrilldownResponse {
  report: string;
  fiscal_year: string;
  base_currency: string;
  filters: Record<string, unknown>;
  /** Signed actual of ALL matching lines (equals the cell it was opened from). */
  total: Money;
  line_count: number;
  limit: number;
  offset: number;
  lines: DrillLine[];
  data_as_of: string;
}

// ---------------------------------------------------------------- Expense analysis
export type ExpenseGroupBy = "month" | "account" | "cost_center" | "vendor";

export interface ExpenseRow {
  id?: number | string | null;
  label: string;
  current: Money;
  previous: Money;
  change: Money;
  change_percent?: Money | null;
}

export interface ExpenseClassTotal {
  statement_class: string;
  current: Money;
  previous: Money;
}

export interface ExpenseWarning {
  code: string;
  message: string;
  current: Money;
  previous: Money;
  account_count: number;
}

export interface ExpenseAnalysisResponse {
  report: string;
  from_date: string;
  to_date: string;
  previous_from_date: string;
  previous_to_date: string;
  group_by: ExpenseGroupBy;
  base_currency: string;
  expense_classes: string[];
  rows: ExpenseRow[];
  by_class: ExpenseClassTotal[];
  total_current: Money;
  total_previous: Money;
  change: Money;
  change_percent?: Money | null;
  warnings: ExpenseWarning[];
  notes: string[];
  data_as_of: string;
}

export interface ExpenseAnalysisQuery {
  from_date?: string;
  to_date?: string;
  group_by: ExpenseGroupBy;
}

// ---------------------------------------------------------------- Expense controls
export type ControlSeverity = "high" | "medium" | "low";

export interface ControlItem {
  code: string;
  severity: ControlSeverity;
  title: string;
  amount: Money;
  account_id?: number | null;
  cost_center_id?: number | null;
  budget_id?: number | null;
  budget_line_id?: number | null;
  voucher_ids: number[];
  evidence: Record<string, unknown>;
}

export interface ControlRule {
  code: string;
  label: string;
  severity: ControlSeverity;
  /** Exact number of exceptions for this rule. */
  count: number;
  amount: Money;
  /** At most 100 items, worst first. */
  items: ControlItem[];
  note?: string | null;
}

export interface ExpenseControlsResponse {
  report: string;
  as_of_date: string;
  fiscal_year: string;
  base_currency: string;
  enforcement_mode: string;
  rules: ControlRule[];
  data_as_of: string;
}

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "" || value === false) continue;
    sp.set(key, String(value));
  }
  const text = sp.toString();
  return text ? `?${text}` : "";
}

export const financeBudgetAnalyticsApi = {
  getBudgetAnalytics: (q: BudgetAnalyticsQuery) =>
    request<BudgetAnalyticsResponse>(`${BASE}/budget-analytics${qs({ ...q })}`),
  getDrilldown: (q: DrilldownQuery) => request<DrilldownResponse>(`${BASE}/budget-analytics/drilldown${qs({ ...q })}`),
  /** CSV of the same table. Save the blob with `saveBlob`. 403 = no export permission. */
  exportBudgetAnalytics: (q: BudgetAnalyticsQuery) => requestBlob(`${BASE}/budget-analytics/export${qs({ ...q })}`),
  getExpenseAnalysis: (q: ExpenseAnalysisQuery) =>
    request<ExpenseAnalysisResponse>(`${BASE}/expense-analysis${qs({ ...q })}`),
  getExpenseControls: (q: { as_of_date?: string }) =>
    request<ExpenseControlsResponse>(`${BASE}/expense-controls${qs({ ...q })}`),
};
