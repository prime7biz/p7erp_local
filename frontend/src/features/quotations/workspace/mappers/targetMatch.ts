import type { LiveRatesResponse } from "@/api/client";
import { pickExchangeRate } from "@/lib/fxRates";
import { toSafeNumber } from "./quotationNumeric";

/** The only rate provider accepted for matching a buyer target (no built-in fallback rates). */
export const TARGET_FX_SOURCE = "open.er-api.com";
/** A live rate older than this is refused. */
export const TARGET_FX_MAX_AGE_MS = 36 * 60 * 60 * 1000;

export type TargetInQuotationCurrency =
  | { ok: true; perPiece: number; rate: number; source: string }
  | { ok: false; reason: string };

/**
 * Buyer target (per piece, in its own currency) -> quotation currency.
 * Same currency needs no rate. Otherwise a LIVE rate from the expected provider, fetched in the last 24 hours, is required.
 */
export function targetInQuotationCurrency(args: {
  targetPrice: string | null | undefined;
  targetCurrency: string | null | undefined;
  quotationCurrency: string | null | undefined;
  /** Rates with `base = quotation currency`; not needed when both currencies are equal. */
  rates: LiveRatesResponse | null;
  now?: Date;
}): TargetInQuotationCurrency {
  const target = toSafeNumber(args.targetPrice);
  if (!(target > 0)) return { ok: false, reason: "Enter the buyer target price first." };
  const from = (args.targetCurrency || args.quotationCurrency || "USD").trim().toUpperCase();
  const to = (args.quotationCurrency || "USD").trim().toUpperCase();
  if (from === to) return { ok: true, perPiece: target, rate: 1, source: "same currency" };

  const res = args.rates;
  if (!res) return { ok: false, reason: "Exchange rate is not loaded yet." };
  if (res.live !== true || res.source !== TARGET_FX_SOURCE) {
    return { ok: false, reason: "No live exchange rate is available. Enter a target in the quotation currency instead." };
  }
  const fetched = Date.parse(res.fetched_at);
  const now = (args.now ?? new Date()).getTime();
  if (!Number.isFinite(fetched) || now - fetched > TARGET_FX_MAX_AGE_MS || fetched - now > 5 * 60 * 1000) {
    return { ok: false, reason: "The exchange rate is older than 36 hours. Refresh it and try again." };
  }
  const picked = pickExchangeRate(res, from, to);
  if (!picked || !picked.live) {
    return { ok: false, reason: `No usable ${from} to ${to} rate.` };
  }
  return { ok: true, perPiece: target * picked.rate, rate: picked.rate, source: picked.source };
}
