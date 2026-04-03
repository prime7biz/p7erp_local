/**
 * Cross-rate from live FX table (rates are vs USD, e.g. open.er-api.com).
 * from → to = rates[to] / rates[from]
 */
export function resolveRate(
  from: string,
  to: string,
  liveRates: Record<string, number>,
): number {
  const f = from.trim().toUpperCase();
  const t = to.trim().toUpperCase();
  if (f === t) return 1;
  const fromRate = liveRates[f];
  const toRate = liveRates[t];
  if (fromRate != null && toRate != null && fromRate !== 0) {
    return toRate / fromRate;
  }
  return 0;
}
