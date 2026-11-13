/**
 * Pure helpers for the Manufacturing Intelligence Phase 3 "Cost & cash" tab (no React, no fetch).
 * Money stays a decimal STRING from the backend: helpers here only read signs and text, never do float maths.
 */
import { formatDecimal } from "../formatDecimal";
import type { ChipTone } from "../panelLogic";

/** Money for display only: 2 decimals, minus sign kept. Never used for maths. */
export function money(value: string | null | undefined): string {
  return formatDecimal(value, 2);
}

// ------------------------------------------------------------------ flags and tab gating

export interface MfgPhase3Flags {
  /** mfg_cost_intelligence_v1: order cost at completion */
  cost: boolean;
  /** mfg_financial_readiness_v1: cash requirement */
  cash: boolean;
}

export const NO_PHASE3: MfgPhase3Flags = { cost: false, cash: false };

/** Strict `=== true` like the backend: a missing flag or any other value is OFF. */
export function readPhase3Flags(flags: Record<string, unknown> | null | undefined): MfgPhase3Flags {
  const f = flags ?? {};
  return {
    cost: f.mfg_cost_intelligence_v1 === true,
    cash: f.mfg_financial_readiness_v1 === true,
  };
}

export function phase3AnyOn(flags: MfgPhase3Flags): boolean {
  return flags.cost || flags.cash;
}

/** The Cost & cash tab needs a Phase 3 flag AND the `can_view_finance` hint (missing hint = no money shown). */
export function showCostCashTab(flags: MfgPhase3Flags, canViewFinance: boolean | null | undefined): boolean {
  return phase3AnyOn(flags) && canViewFinance === true;
}

// ------------------------------------------------------------------ value classes and statuses

export const VALUE_CLASS_LABEL: Record<string, string> = {
  ACTUAL: "Actual",
  COMMITTED: "Committed",
  ESTIMATED: "Estimate",
  FORECAST: "Forecast",
};

export const VALUE_CLASS_HELP: Record<string, string> = {
  ACTUAL: "Posted in the accounts (ledger).",
  COMMITTED: "Ordered (purchase orders) but not yet billed.",
  ESTIMATED: "Calculated estimate - not posted.",
  FORECAST: "Expected future cash movement - not posted.",
};

export function valueClassLabel(cls: string | null | undefined): string {
  return VALUE_CLASS_LABEL[(cls ?? "").toUpperCase()] ?? (cls || "—");
}

export function valueClassTone(cls: string | null | undefined): ChipTone {
  switch ((cls ?? "").toUpperCase()) {
    case "ACTUAL":
      return "good";
    case "COMMITTED":
      return "info";
    case "ESTIMATED":
      return "warn";
    default:
      return "neutral";
  }
}

export const COST_STATUS_LABEL: Record<string, string> = {
  COMPLETE_DATA: "Complete data",
  PARTIAL: "Partial data",
  UNKNOWN: "Unknown",
};

export function costStatusTone(status: string | null | undefined): ChipTone {
  const s = (status ?? "").toUpperCase();
  if (s === "COMPLETE_DATA") return "good";
  if (s === "PARTIAL") return "warn";
  return "bad";
}

export const CONFIDENCE_LABEL: Record<string, string> = {
  CONTRACTUAL: "Contract date",
  SCHEDULED: "Scheduled",
  ESTIMATED: "Estimated",
};

export function confidenceTone(c: string | null | undefined): ChipTone {
  const s = (c ?? "").toUpperCase();
  if (s === "CONTRACTUAL") return "good";
  if (s === "SCHEDULED") return "info";
  return "warn";
}

export const CASH_CATEGORY_LABEL: Record<string, string> = {
  BTB_MATURITY: "BTB LC payment",
  FACILITY_REPAYMENT: "Loan / facility repayment",
  AP_BILL: "Supplier bill (accounts payable)",
  VENDOR_BILL: "Posted supplier bill",
  GRN_NOT_BILLED: "Goods received, not billed yet",
  PO_UNRECEIVED: "Purchase order not received yet",
  PAYROLL_NET: "Payroll (net pay)",
  PAYROLL_STATUTORY: "Payroll statutory deductions",
  COMMERCIAL_INVOICE: "Export invoice to be realised",
  ORDER_REMAINING: "Order not invoiced yet",
};

export function cashCategoryLabel(code: string): string {
  return CASH_CATEGORY_LABEL[code] ?? code.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

export const PROGRESS_SOURCE_LABEL: Record<string, string> = {
  HOURLY_SEWING_GOOD_QTY: "Sewing good pieces (hourly)",
  PLAN_COMPLETED_QTY: "Line plan completed qty",
  UNKNOWN: "Unknown",
};

// ------------------------------------------------------------------ decimal text helpers (no float maths)

/** True when the decimal text is below zero ("-12.5000"). */
export function isNegativeText(value: string | null | undefined): boolean {
  if (value == null) return false;
  const s = value.trim();
  return s.startsWith("-") && /[1-9]/.test(s);
}

/** Progress ratio text "0.4500" -> percent text "45" (moves the decimal point on the text; display only). */
export function ratioToPercentText(p: string | null | undefined): string | null {
  if (p == null || p.trim() === "") return null;
  const s = p.trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const neg = s.startsWith("-");
  const body = neg ? s.slice(1) : s;
  const [intPart = "0", frac = ""] = body.split(".");
  const padded = (frac + "00").slice(0, 2);
  const rest = frac.slice(2);
  const whole = (intPart + padded).replace(/^0+(?=\d)/, "");
  return `${neg ? "-" : ""}${whole}${rest ? `.${rest}` : ""}`;
}

/** Split "STALE_PAYABLES: 3 posted vendor bill(s) ..." into code + text; plain notes have no code. */
export function splitNote(note: string): { code: string | null; text: string } {
  const m = /^([A-Z][A-Z0-9_]+):\s*(.*)$/s.exec(note.trim());
  return m ? { code: m[1]!, text: m[2]! } : { code: null, text: note };
}

export const MONEY_NOT_POSTED_LABEL = "Estimate / forecast - not posted to the accounts";
export const GL_ACTUAL_LABEL = "From the ledger - for information, not part of the estimate";

// ------------------------------------------------------------------ inputs and errors

/** Horizon days text: whole number 1..max. Returns an error message or "". */
export function horizonError(value: string, max = 180): string {
  const s = value.trim();
  if (!/^\d+$/.test(s)) return `Horizon must be a whole number of days (1-${max}).`;
  const n = Number(s);
  if (n < 1 || n > max) return `Horizon must be between 1 and ${max} days.`;
  return "";
}

/** Message for a failed money load: 404 = switched off, 403 = no finance access, else the server text. */
export function moneyLoadError(status: number | null, message: string, what: string): string {
  if (status === 404) return `${what} is switched off for your company. An admin can turn it on in Settings → Configuration.`;
  if (status === 403)
    return "Money figures are only for admin / manager or users whose role has finance access and the MIS report view.";
  if (status === 422) return message ? `Please check the filters: ${message}` : "Please check the filters.";
  return message || "Could not load the figures. Please try again.";
}

/** Planning settings: whole-number day field check. */
export function dayFieldError(label: string, value: string, min: number, max: number): string {
  const s = value.trim();
  if (!/^\d+$/.test(s)) return `${label} must be a whole number (${min}-${max}).`;
  const n = Number(s);
  if (n < min || n > max) return `${label} must be ${min}-${max}.`;
  return "";
}
