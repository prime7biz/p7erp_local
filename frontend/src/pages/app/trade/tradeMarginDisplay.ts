/**
 * Display text for the trade case "Estimated Margin" card.
 *
 * The backend reports revenue in the case currency (`amount`) plus its base-currency value
 * (`amount_base`), while cost and margin are already in base currency (`margin_currency`).
 * These helpers show everything in base currency and keep the original amount + rate as detail.
 */
import type { TradeCaseMarginResponse } from "@/api/client";
import { formatMoney } from "@/lib/money";

export interface MoneyDisplay {
  /** Main text, e.g. "BDT 120,000.00". */
  text: string;
  /** Small second line, e.g. "USD 1,000.00 @ 120"; null when nothing extra to say. */
  detail: string | null;
  /** Hover tooltip (`title` attribute). */
  title?: string;
  /** True when the amount could not be converted because there is no exchange rate. */
  missingRate: boolean;
}

const EMPTY: MoneyDisplay = { text: "—", detail: null, missingRate: false };

export function baseCurrencyOf(margin: TradeCaseMarginResponse | null | undefined): string {
  return (margin?.margin_currency || margin?.base_currency || "").toUpperCase();
}

export function moneyWithCurrency(value: number, currency: string): string {
  return currency ? `${currency} ${formatMoney(value)}` : formatMoney(value);
}

function formatRate(rate: number): string {
  return rate.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export function revenueDisplay(margin: TradeCaseMarginResponse | null | undefined): MoneyDisplay {
  if (margin?.amount == null) return EMPTY;
  const base = baseCurrencyOf(margin);
  const original = (margin.amount_currency || margin.currency || base).toUpperCase();
  const originalText = moneyWithCurrency(margin.amount, original);
  if (margin.amount_base == null) {
    return {
      text: originalText,
      detail: `Revenue shown in ${original}: no rate to ${base || "base currency"}`,
      title: `${originalText} could not be converted to ${base || "base currency"}`,
      missingRate: true,
    };
  }
  const baseText = moneyWithCurrency(margin.amount_base, base);
  if (!original || original === base) {
    return { text: baseText, detail: null, missingRate: false };
  }
  const rate = margin.fx_rate_to_base != null ? formatRate(margin.fx_rate_to_base) : "?";
  return {
    text: baseText,
    detail: `${originalText} @ ${rate}`,
    title: `${originalText} × ${rate} = ${baseText}`,
    missingRate: false,
  };
}

export function costDisplay(margin: TradeCaseMarginResponse | null | undefined): MoneyDisplay {
  if (margin?.estimated_cost == null) return EMPTY;
  const currency = (margin.estimated_cost_currency || baseCurrencyOf(margin)).toUpperCase();
  const count = margin.cost_po_count;
  return {
    text: moneyWithCurrency(margin.estimated_cost, currency),
    detail: null,
    title:
      count != null
        ? `Sum of ${count} purchase order(s), using their ${currency || "base currency"} values`
        : undefined,
    missingRate: false,
  };
}

export function marginDisplay(margin: TradeCaseMarginResponse | null | undefined): MoneyDisplay {
  if (margin?.margin_amount == null) return EMPTY;
  const text = moneyWithCurrency(margin.margin_amount, baseCurrencyOf(margin));
  const pct = margin.margin_pct != null ? `${margin.margin_pct.toFixed(2)}%` : null;
  return { text, detail: pct, missingRate: false };
}
