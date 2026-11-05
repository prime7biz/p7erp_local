/**
 * Links for finance report drill-down (Tally-style):
 * Financial Statements -> Trial Balance -> Ledger Activity -> Voucher.
 * Each report reads the same query params back with `useSearchParams`.
 */

export type AccountNature = "Asset" | "Liability" | "Equity" | "Income" | "Expense";

export function voucherHref(voucherId: number): string {
  return `/app/accounts/vouchers/${voucherId}`;
}

export function ledgerActivityHref(accountId: number, fromDate: string, toDate: string): string {
  const q = new URLSearchParams({ account_id: String(accountId), from: fromDate, to: toDate });
  return `/app/accounts/reports/ledger-activity?${q.toString()}`;
}

export function trialBalanceHref(opts: {
  asOf: string;
  nature?: AccountNature;
  groupId?: number | "";
  basis?: "fy" | "cumulative";
}): string {
  const q = new URLSearchParams({ as_of: opts.asOf });
  if (opts.basis) q.set("basis", opts.basis);
  if (opts.nature) q.set("nature", opts.nature);
  if (opts.groupId) q.set("group_id", String(opts.groupId));
  return `/app/accounts/reports/trial-balance?${q.toString()}`;
}

/** First day of the calendar year of `isoDate` (P7 uses calendar financial years today). */
export function yearStart(isoDate: string): string {
  return `${isoDate.slice(0, 4)}-01-01`;
}

/** Valid `YYYY-MM-DD` from a query param, otherwise the fallback. */
export function dateParam(value: string | null, fallback: string): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

export function idParam(value: string | null): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}
