/**
 * Pure helpers for Finance > Management Performance (no React, no network) - tested in mgmtPerformanceLogic.test.ts.
 * Amounts stay decimal strings; only formatting happens here.
 */
import type { BudgetRowStatus, ExceptionItem, ForecastRow, MpAccess } from "@/api/mgmtPerformance";
import { formatIndian, formatPlain } from "@/components/finance/statements/statementFormat";

export const MGMT_PERFORMANCE_FLAG = "mgmt_performance_v1";

type FeatureFlags = Record<string, unknown> | null | undefined;

/** True only for an explicit `true` (default OFF). */
export function isMgmtPerformanceEnabled(flags: FeatureFlags): boolean {
  return flags?.[MGMT_PERFORMANCE_FLAG] === true;
}

export type MpView = "overview" | "budget" | "exceptions" | "revisions" | "finished-goods" | "targets" | "cash" | "setup";

export interface ViewDef {
  id: MpView;
  label: string;
  /** Needs the company view (money for the whole company). Owners see only the others. */
  company: boolean;
}

export const VIEWS: ViewDef[] = [
  { id: "overview", label: "Overview", company: true },
  { id: "budget", label: "Budget forecast", company: false },
  { id: "exceptions", label: "Exceptions", company: false },
  { id: "revisions", label: "Budget revisions", company: false },
  { id: "finished-goods", label: "Finished goods", company: true },
  { id: "targets", label: "Targets", company: true },
  { id: "cash", label: "Cash", company: true },
  { id: "setup", label: "Setup", company: true },
];

export function visibleViews(access: MpAccess | null): ViewDef[] {
  if (!access?.allowed) return [];
  return VIEWS.filter((v) => access.company || !v.company);
}

/** `?view=` value -> a view the user may open (falls back to the first visible one). */
export function parseView(raw: string | null, access: MpAccess | null): MpView | null {
  const views = visibleViews(access);
  if (views.length === 0) return null;
  const found = views.find((v) => v.id === raw) ?? views[0];
  return found ? found.id : null;
}

export function money(value: string | null | undefined): string {
  if (value == null) return "—";
  return formatIndian(value, 2, "minus");
}

export function pct(value: string | null | undefined): string {
  return value == null ? "—" : `${formatPlain(value, 2)}%`;
}

export function qty(value: string | null | undefined): string {
  return value == null ? "—" : formatPlain(value, 0);
}

/** True when a decimal string is below zero (no float maths: looks at the sign only). */
export function isNegative(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().startsWith("-") && /[1-9]/.test(value);
}

export const STATUS_TEXT: Record<BudgetRowStatus, string> = {
  OK: "On track",
  WARNING: "Warning",
  AT_RISK: "At risk",
  FAILED: "Over budget",
  UNBUDGETED: "No budget",
  UNMAPPED: "No category",
};

export type Tone = "ok" | "warning" | "danger" | "neutral";

export function statusTone(status: string): Tone {
  if (status === "OK" || status === "APPROVED" || status === "COMPLETE" || status === "COVERED") return "ok";
  if (status === "FAILED" || status === "AT_RISK" || status === "GAP" || status === "UNKNOWN" || status === "REJECTED") return "danger";
  if (status === "WARNING" || status === "UNBUDGETED" || status === "UNMAPPED" || status === "ESTIMATED" || status === "PIPELINE_COVERS" || status === "OPEN")
    return "warning";
  return "neutral";
}

export const TONE_CLASS: Record<Tone, string> = {
  ok: "bg-status-success-subtle text-status-success-foreground",
  warning: "bg-status-warning-subtle text-status-warning-foreground",
  danger: "bg-status-danger-subtle text-status-danger-foreground",
  neutral: "bg-surface-subtle text-text-secondary",
};

const SOURCE_TEXT: Record<string, string> = {
  ACTUAL_CLOSED_MONTH: "Actual (closed month)",
  BUDGET_TIME_PHASED: "Budget for the rest of the month",
  HISTORY_3M: "3-month average",
  COMMITTED_ONLY: "Committed only",
  COMMITTED_WITHIN_BUDGET: "Committed, inside the category budget",
  PAYROLL_PROJECTION: "Payroll projection",
};

export function sourceText(source: string): string {
  return SOURCE_TEXT[source] ?? source;
}

const REASON_TEXT: Record<string, string> = {
  CATEGORY_MAP_EMPTY: "No expense category is set up yet (Setup → Expense categories).",
  UNMAPPED_EXPENSE_ACCOUNT: "Some expense accounts have no category, so they are not in the forecast.",
  COMMITTED_UNMAPPED: "Some open purchase orders could not be given a category and are left out.",
  EMPLOYEE_WITHOUT_STRUCTURE: "Some active employees have no salary structure, so the payroll forecast may be low.",
  OVERTIME_WITHOUT_AMOUNT: "Some approved overtime has no amount yet.",
  FG_STOCK_GROUP_NOT_MARKED: "No stock group is marked as Finished goods (Inventory → Stock groups).",
  FG_RECEIPT_WITHOUT_ORDER: "Some finished-goods receipts have no order, so they cannot be valued.",
  ORDER_COST_UNKNOWN: "Some orders have no selling price or material cost; they are left out of the totals.",
  CONTRIBUTION_PCT_UNKNOWN: "The contribution % is unknown, so the targets cannot be calculated.",
  CONTRIBUTION_PER_PIECE_UNKNOWN: "No finished goods yet this period, so the pieces target cannot be calculated.",
  TARGET_NOT_SET: "No monthly profit target is set (Setup → Targets); 0 is used.",
  ORDERS_TRUNCATED: "Too many orders: only the first 1,000 are counted.",
  PO_FX_UNKNOWN: "A foreign purchase order has no exchange rate and is left out.",
  FACILITY_FX_UNKNOWN: "A foreign loan has no exchange rate and is left out.",
  IN_HOUSE_PROCESSING_FROM_BUDGET: "Processing cost taken from the quotation (no process order cost).",
  SELLING_PRICE_UNKNOWN: "Selling price unknown.",
  MATERIAL_COST_UNKNOWN: "Material cost unknown.",
  PROCESSING_COST_UNKNOWN: "Processing cost unknown.",
  RECEIPTS_ABOVE_ORDER_QTY: "More was received than ordered; the extra is not counted.",
  PROCESS_COST_FX_UNKNOWN: "A process cost in another currency is left out.",
};

export function reasonText(code: string): string {
  return REASON_TEXT[code] ?? code.replace(/_/g, " ").toLowerCase();
}

export interface RowAction {
  id: "months" | "revise" | "exceptions";
  label: string;
}

/** Actions menu of one budget-forecast row (one combined Actions dropdown per row). */
export function forecastRowActions(row: ForecastRow, access: MpAccess | null): RowAction[] {
  const out: RowAction[] = [];
  if (!row.restricted && row.months.length > 0) out.push({ id: "months", label: "Month by month" });
  const owns = row.cost_center_id != null && (access?.cost_center_ids ?? []).includes(row.cost_center_id);
  if (!row.restricted && row.budget_line_ids.length > 0 && (access?.can_setup || owns)) {
    out.push({ id: "revise", label: "Request budget change" });
  }
  if (row.status !== "OK") out.push({ id: "exceptions", label: "Show exceptions" });
  return out;
}

export type ExceptionDialog = "respond" | "review" | "approve" | "reject";

export function exceptionActions(item: ExceptionItem): { id: ExceptionDialog; label: string; danger?: boolean }[] {
  const out: { id: ExceptionDialog; label: string; danger?: boolean }[] = [];
  if (item.can_respond) out.push({ id: "respond", label: item.status === "REJECTED" ? "Answer again" : "Answer" });
  if (item.can_review) out.push({ id: "review", label: "Mark reviewed" });
  if (item.can_decide) {
    out.push({ id: "approve", label: "Approve" });
    out.push({ id: "reject", label: "Reject", danger: true });
  }
  return out;
}

/** Request id for one dialog (letters, digits, dash; 8-64 chars) - made once per open dialog. */
export function newRequestId(prefix = "mp"): string {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}-${rand}`.slice(0, 40);
}

/** A non-negative decimal with at most 4 places, as typed (no float conversion). */
export function isDecimalText(value: string): boolean {
  return /^\d{1,14}(\.\d{1,4})?$/.test(value.trim());
}

/** Period choices for the picker: current month, previous 2 months, current quarter, financial year. */
export function periodOptions(todayIso: string, fyStartMonth: number): { value: string; label: string }[] {
  const [y = 2000, m = 1] = todayIso.split("-").map(Number);
  const months: { value: string; label: string }[] = [];
  for (let i = 0; i < 3; i += 1) {
    const total = y * 12 + (m - 1) - i;
    const yy = Math.floor(total / 12);
    const mm = (total % 12) + 1;
    const value = `${yy}-${String(mm).padStart(2, "0")}`;
    months.push({ value, label: i === 0 ? `This month (${value})` : value });
  }
  const fyYear = m >= fyStartMonth ? y : y - 1;
  const monthsIntoFy = (m - fyStartMonth + 12) % 12;
  const quarter = Math.floor(monthsIntoFy / 3) + 1;
  return [
    ...months,
    { value: `${fyYear}-Q${quarter}`, label: `This quarter (Q${quarter})` },
    { value: `FY${fyYear}`, label: `This financial year (FY${fyYear})` },
  ];
}

export const GAP_TEXT: Record<string, string> = {
  COVERED: "Costs and profit target are already covered",
  PIPELINE_COVERS: "Confirmed orders due this period would cover it",
  GAP: "More sales / production needed",
};
