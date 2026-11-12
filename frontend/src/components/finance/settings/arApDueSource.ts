/**
 * Labels for the AR/AP "due" bill source (tenant setting `finance_ar_ap_due_source`) shown on
 * Ratio Analysis and the Finance Control Tower. When no source is set, the backend picks the standard
 * one automatically (party ledgers when switched on, otherwise outstanding bills) and sends `source_automatic: true`.
 */
import { FINANCE_AR_AP_DUE_SOURCE_OPTIONS } from "./FinanceArApDueSourceField";

/** Shown only when the source was chosen automatically. */
export const DUE_SOURCE_CHANGE_HINT = "Change the bill source in Settings → Configuration → Finance.";

export function dueSourceLabel(source: string): string {
  return FINANCE_AR_AP_DUE_SOURCE_OPTIONS.find((o) => o.value === source)?.label ?? source;
}

/** "Source: Party ledgers (automatic)" / "Source: Outstanding bills". */
export function dueSourceText(source: string, automatic: boolean | null | undefined): string {
  return `Source: ${dueSourceLabel(source)}${automatic === true ? " (automatic)" : ""}`;
}
