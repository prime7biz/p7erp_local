/**
 * "Difference in opening balances" (Tally wording) on the Trial Balance and Balance Sheet.
 * When the stored ledger opening balances do not match, the backend adds one synthetic line so the sheet
 * still balances, sends the OPENING_BALANCE_DIFFERENCE warning and `reconciliation.opening_difference`
 * (debit minus credit). The line is not a ledger, so it has no drill-down.
 */
import type { StatementReconciliation } from "@/api/financeStatements";
import { isZeroMoney } from "./statementFormat";

/** Backend `OPENING_DIFFERENCE_CODE`. */
export const OPENING_DIFFERENCE_CODE = "DIFFERENCE_IN_OPENING_BALANCES";
/** Backend `OPENING_DIFFERENCE_WARNING`; the warning amount is debit minus credit. */
export const OPENING_BALANCE_DIFFERENCE_WARNING = "OPENING_BALANCE_DIFFERENCE";
/** Where a finance admin corrects ledger opening balances (Chart of Accounts). */
export const CHART_OF_ACCOUNTS_PATH = "/app/accounts";

/** Italic amber text for the synthetic line (never a link). */
export const OPENING_DIFFERENCE_ROW_CLASS = "italic text-status-warning-foreground";

export function isOpeningDifferenceRow(row: { row_type: string; code?: string | null }): boolean {
  return row.row_type === "opening_difference" || row.code === OPENING_DIFFERENCE_CODE;
}

/** True when the sheet balances only because of the disclosed opening difference line. */
export function balancedAfterOpeningDifference(reconciliation: StatementReconciliation): boolean {
  return reconciliation.balanced && !isZeroMoney(reconciliation.opening_difference);
}
