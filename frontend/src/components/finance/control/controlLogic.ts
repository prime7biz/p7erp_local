/**
 * Small pure helpers for the Finance Control Tower and GL profitability screens
 * (no React, easy to test). Amounts are decimal strings and stay strings.
 */
import type { ExceptionRow, Severity } from "@/api/financeControl";
import { formatIndian, formatPlain, isZeroMoney } from "@/components/finance/statements/statementFormat";

export const SEVERITY_LABEL: Record<Severity, string> = { high: "High", medium: "Medium", low: "Low" };

export const SEVERITY_CHIP: Record<Severity, string> = {
  high: "border-status-danger/30 bg-status-danger-subtle text-status-danger-foreground",
  medium: "border-status-warning/30 bg-status-warning-subtle text-status-warning-foreground",
  low: "border-border bg-surface-subtle text-text-secondary",
};

/**
 * Where a list row opens, only when the app already has a page for that record.
 * Voucher rows, delivery challans and stock items have a detail page; GRNs, vendor bills, outstanding bills,
 * budgets and ledgers have none, so they stay plain text.
 */
export function exceptionRowHref(code: string, row: ExceptionRow): string | null {
  if (row.id == null) return null;
  switch (code) {
    case "VOUCHERS_PENDING_APPROVAL":
    case "VOUCHERS_DRAFT_OLD":
      return `/app/accounts/vouchers/${row.id}`;
    case "CHALLAN_NOT_INVOICED":
      return `/app/inventory/delivery-challans/${row.id}`;
    case "NEGATIVE_STOCK":
      return `/app/inventory/stock-items/${row.id}`;
    default:
      return null;
  }
}

/** Percent text from a 4-decimal string. A missing margin (zero revenue) is an em dash, never "0%". */
export function marginText(value: string | null | undefined): string {
  return value == null ? "—" : `${formatPlain(value, 2)}%`;
}

const MONEY_TEXT = /^-?\d+\.\d{4}$/;

const DETAIL_LABEL: Record<string, string> = {
  age_days: "Age (days)",
  po_code: "PO",
  supplier_invoice_no: "Supplier invoice",
  expected_value: "Expected value",
  amount_due: "Amount due",
  bill_type: "Type",
  voucher_type: "Voucher type",
  voucher_date: "Voucher date",
  warehouse_name: "Warehouse",
  on_hand: "On hand",
  default_cost: "Default cost",
  statement_class: "Class",
  fifo_total: "Stock value (FIFO)",
  gl_total: "Stock ledgers",
  unclassified_stock: "Unclassified stock",
};

const HIDDEN_DETAIL_KEYS = new Set(["warehouse_id", "group_id"]);

/** "Label: value" pieces for the small grey line under a list row. Money-looking text gets lakh/crore grouping. */
export function detailPairs(details: Record<string, unknown>): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const [key, raw] of Object.entries(details ?? {})) {
    if (HIDDEN_DETAIL_KEYS.has(key) || raw == null || raw === "") continue;
    const text = typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean" ? String(raw) : JSON.stringify(raw);
    out.push({
      label: DETAIL_LABEL[key] ?? key.replaceAll("_", " "),
      value: typeof raw === "string" && MONEY_TEXT.test(raw) ? formatIndian(raw) : text,
    });
  }
  return out;
}

/** Amount shown on a card / list row: money with lakh/crore grouping, "0.00" when there is nothing. */
export function amountText(value: string | null | undefined): string {
  return value == null || isZeroMoney(value) ? "0.00" : formatIndian(value);
}

/** Link into the Style / LC / Buyer page (works with and without the Finance hubs). */
export const entityProfitHref = (kind: "styles" | "master-contracts" | "buyers", id: number) =>
  `/app/finance/profitability/entity?kind=${kind}&id=${id}`;

/** True when a page of rows is the last one. */
export function isLastPage(total: number, offset: number, limit: number): boolean {
  return offset + limit >= total;
}
