/**
 * Small pure helpers for the budget analytics, expense analysis and expense controls screens
 * (no React, easy to test). Amounts are decimal strings and stay strings.
 */
import type {
  AnalyticsRow,
  BudgetDimension,
  BudgetStatus,
  ControlSeverity,
  DrilldownQuery,
  ExpenseGroupBy,
} from "@/api/financeBudgetAnalytics";
import { formatIndian, formatPlain } from "@/components/finance/statements/statementFormat";

export const DIMENSION_OPTIONS: { value: BudgetDimension; label: string }[] = [
  { value: "cost_center", label: "Cost centre" },
  { value: "account", label: "Account" },
  { value: "month", label: "Month" },
  { value: "department", label: "Department" },
];

export const GROUP_BY_OPTIONS: { value: ExpenseGroupBy; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "account", label: "Account" },
  { value: "cost_center", label: "Cost centre" },
  { value: "vendor", label: "Vendor" },
];

/** Thresholds of backend `budget_analytics/constants.py` (used % = actual / budget x 100). */
export const STATUS_LABEL: Record<BudgetStatus, string> = {
  within: "Within",
  warning: "Warning (80%+)",
  over: "Over (100%+)",
  critical: "Critical (110%+)",
};

export const STATUS_CHIP: Record<BudgetStatus, string> = {
  within: "border-status-success/30 bg-status-success-subtle text-status-success-foreground",
  warning: "border-status-warning/30 bg-status-warning-subtle text-status-warning-foreground",
  over: "border-status-danger/30 bg-status-danger-subtle text-status-danger-foreground",
  critical: "border-status-danger bg-status-danger-subtle font-semibold text-status-danger-foreground",
};

export const SEVERITY_LABEL: Record<ControlSeverity, string> = { high: "High", medium: "Medium", low: "Low" };

export const SEVERITY_CHIP: Record<ControlSeverity, string> = {
  high: "border-status-danger/30 bg-status-danger-subtle text-status-danger-foreground",
  medium: "border-status-warning/30 bg-status-warning-subtle text-status-warning-foreground",
  low: "border-border bg-surface-subtle text-text-secondary",
};

/** Percent text from a 4-decimal string. Missing (budget 0 / no previous) is an em dash, never "0%". */
export function percentText(value: string | null | undefined): string {
  return value == null ? "—" : `${formatPlain(value, 2)}%`;
}

/** Money for a table cell: lakh/crore grouping, "0.00" for zero. */
export function moneyText(value: string | null | undefined): string {
  return value == null ? "" : formatIndian(value);
}

/**
 * Drill-down filter for one table row (null = this row has no voucher lines to show).
 * A row with id null means "no cost centre" / "no department"; the totals row (row null) shows all lines.
 */
export function drillFilterFor(
  dimension: BudgetDimension,
  row: Pick<AnalyticsRow, "id"> | null,
  base: { fiscal_year?: string; budget_id?: number },
): DrilldownQuery | null {
  if (row == null) return { ...base };
  const id = row.id ?? null;
  switch (dimension) {
    case "cost_center":
      return typeof id === "number" ? { ...base, cost_center_id: id } : { ...base, no_cost_center: true };
    case "account":
      // A budget line with no account has no posted lines of its own.
      return typeof id === "number" ? { ...base, account_id: id } : null;
    case "month":
      return typeof id === "string" && /^\d{4}-\d{2}$/.test(id) ? { ...base, month: id } : null;
    case "department":
      return typeof id === "string" && id.trim() ? { ...base, department: id } : { ...base, no_department: true };
    default:
      return null;
  }
}

/** Where a voucher opens. */
export const voucherHref = (voucherId: number) => `/app/accounts/vouchers/${voucherId}`;

const EVIDENCE_LABEL: Record<string, string> = {
  month: "Month",
  current_spend: "Spend this month",
  trailing_average: "Average of earlier months",
  ratio_percent: "Ratio",
  trailing_months: "Earlier months",
  threshold_percent: "Threshold",
  minimum_amount: "Minimum amount",
  from_date: "From",
  to_date: "To",
  spend: "Spend",
  line_count: "Lines",
  budget_ids: "Budgets checked",
  unit_amount: "Amount each time",
  occurrences: "Times",
  dates: "Dates",
  party_type: "Matched by",
  party: "Narration",
  vendor_id: "Vendor id",
  window_days: "Within (days)",
  net_amount: "Net amount",
  status: "Status",
  used_percent: "Used",
  budget_amount: "Budget",
  actual_amount: "Actual",
  period_month: "Budget month",
  period_start: "Period start",
  period_end: "Period end",
  thresholds: "Thresholds (%)",
};

const MONEY_KEYS = new Set([
  "current_spend",
  "trailing_average",
  "trailing_months",
  "minimum_amount",
  "spend",
  "unit_amount",
  "net_amount",
  "budget_amount",
  "actual_amount",
]);
const PERCENT_KEYS = new Set(["ratio_percent", "threshold_percent", "used_percent"]);
const DECIMAL_TEXT = /^-?\d+(\.\d+)?$/;

function valueText(key: string, raw: unknown): string {
  if (typeof raw === "string" && DECIMAL_TEXT.test(raw)) {
    if (MONEY_KEYS.has(key)) return formatIndian(raw);
    if (PERCENT_KEYS.has(key)) return `${formatPlain(raw, 2)}%`;
  }
  if (Array.isArray(raw)) return raw.map((v) => String(v)).join(", ");
  if (raw && typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${typeof v === "string" && DECIMAL_TEXT.test(v) && MONEY_KEYS.has(key) ? formatIndian(v) : String(v)}`)
      .join(" · ");
  }
  return String(raw);
}

/** "Label: value" pieces of an exception's evidence. Money gets lakh/crore grouping; empty values are skipped. */
export function evidencePairs(evidence: Record<string, unknown>): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const [key, raw] of Object.entries(evidence ?? {})) {
    if (raw == null || raw === "" || (Array.isArray(raw) && raw.length === 0)) continue;
    out.push({ label: EVIDENCE_LABEL[key] ?? key.replaceAll("_", " "), value: valueText(key, raw) });
  }
  return out;
}

/** "45 lines" style count text. */
export function countText(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
