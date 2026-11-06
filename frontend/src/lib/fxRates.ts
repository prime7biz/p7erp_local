import { api, type LiveRatesResponse } from "@/api/client";

export interface PickedExchangeRate {
  /** 1 unit of `from` = `rate` units of `to`. Always finite and > 0. */
  rate: number;
  /** Where the number came from, e.g. "open.er-api.com" or "fallback". */
  source: string;
  /** False when the backend could not reach the live provider and used built-in fallback rates. */
  live: boolean;
}

function validRate(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/**
 * Work out from→to using the backend's rate table (`rates[X]` = X per 1 `base`).
 * Returns null when either currency is missing or a number is not a usable positive rate.
 */
export function pickExchangeRate(res: LiveRatesResponse | null | undefined, from: string, to: string): PickedExchangeRate | null {
  const f = from.trim().toUpperCase();
  const t = to.trim().toUpperCase();
  if (!f || !t) return null;
  if (f === t) return { rate: 1, source: "same currency", live: true };
  if (!res || typeof res.rates !== "object" || res.rates == null) return null;
  const base = (res.base || "").toUpperCase();
  const rateOf = (code: string): number | null => {
    if (code === base) return 1;
    const v = res.rates[code];
    return validRate(v) ? v : null;
  };
  const fromPerBase = rateOf(f);
  const toPerBase = rateOf(t);
  if (fromPerBase == null || toPerBase == null) return null;
  const rate = toPerBase / fromPerBase;
  if (!validRate(rate)) return null;
  return { rate, source: res.source || "backend", live: res.live !== false };
}

/** Ask our backend (not a third-party site) for today's rate. Returns null if no usable rate. */
export async function fetchExchangeRate(from: string, to: string): Promise<PickedExchangeRate | null> {
  const res = await api.getLiveRates(from.trim().toUpperCase());
  return pickExchangeRate(res, from, to);
}
