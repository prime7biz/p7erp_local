/**
 * Exact money math for the browser.
 *
 * The API sends amounts as decimal strings with 4 places (e.g. "100.5000"). Adding those with
 * plain JavaScript numbers drifts (0.1 + 0.2 = 0.30000000000000004), so totals and "is this
 * voucher balanced?" checks can be wrong by a hair.
 *
 * Here every amount is converted to an integer count of ten-thousandths ("units"):
 *   "100.5000" -> 1_005_000 units. Integer addition is exact, so sums and comparisons are exact.
 * Safe range: about ±900 billion (Number.MAX_SAFE_INTEGER / 10 000), far above any single voucher.
 */

/** Number of decimal places the backend stores for money. */
export const MONEY_DECIMALS = 4;
const SCALE = 10_000;

export type MoneyInput = string | number | null | undefined;

/** Parse "1,234.56789" / 1234.5 / null into integer ten-thousandths (rounded half away from zero). */
export function toMoneyUnits(value: MoneyInput): number {
  if (value == null) return 0;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0;
    // toFixed(8) gives the exact decimal digits of the float, avoiding 1.005 * 10000 = 10049.999…
    return parseDecimalString(Math.abs(value) >= 1e15 ? String(Math.round(value)) : value.toFixed(8));
  }
  return parseDecimalString(value);
}

function parseDecimalString(raw: string): number {
  const s = raw.replace(/[,\s]/g, "");
  const m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) return 0;
  const negative = m[1] === "-";
  const whole = m[2] === "" ? 0 : Number(m[2]);
  const frac = (m[3] ?? "").padEnd(MONEY_DECIMALS + 1, "0");
  let units = whole * SCALE + Number(frac.slice(0, MONEY_DECIMALS));
  if (Number(frac[MONEY_DECIMALS]) >= 5) units += 1;
  if (units === 0) return 0;
  return negative ? -units : units;
}

/** Convert units back to a normal number (for display / charts). */
export function fromMoneyUnits(units: number): number {
  return units / SCALE;
}

/** Round any amount to 4 decimal places exactly and return it as a number. */
export function roundMoney(value: MoneyInput): number {
  return fromMoneyUnits(toMoneyUnits(value));
}

/** Exact sum of many amounts. `sumMoney(["0.1", "0.2"]) === 0.3`. */
export function sumMoney(values: Iterable<MoneyInput>): number {
  let units = 0;
  for (const v of values) units += toMoneyUnits(v);
  return fromMoneyUnits(units);
}

/** Exact sum of one field across rows: `sumMoneyBy(lines, (l) => l.amount)`. */
export function sumMoneyBy<T>(rows: readonly T[], pick: (row: T) => MoneyInput): number {
  let units = 0;
  for (const row of rows) units += toMoneyUnits(pick(row));
  return fromMoneyUnits(units);
}

/** Exact a + b. */
export function addMoney(a: MoneyInput, b: MoneyInput): number {
  return fromMoneyUnits(toMoneyUnits(a) + toMoneyUnits(b));
}

/** Exact a - b. */
export function subtractMoney(a: MoneyInput, b: MoneyInput): number {
  return fromMoneyUnits(toMoneyUnits(a) - toMoneyUnits(b));
}

/** -1 when a < b, 0 when equal to 4 decimals, 1 when a > b. */
export function compareMoney(a: MoneyInput, b: MoneyInput): -1 | 0 | 1 {
  const d = toMoneyUnits(a) - toMoneyUnits(b);
  return d < 0 ? -1 : d > 0 ? 1 : 0;
}

/** True when both amounts are equal at 4 decimal places (e.g. debit total vs credit total). */
export function moneyEquals(a: MoneyInput, b: MoneyInput): boolean {
  return toMoneyUnits(a) === toMoneyUnits(b);
}

export function isZeroMoney(value: MoneyInput): boolean {
  return toMoneyUnits(value) === 0;
}

/** API-ready string with exactly 4 decimals: `toMoneyString(12.3) === "12.3000"`. */
export function toMoneyString(value: MoneyInput, decimals: number = MONEY_DECIMALS): string {
  const units = toMoneyUnits(value);
  const sign = units < 0 ? "-" : "";
  const abs = Math.abs(units);
  if (decimals < MONEY_DECIMALS) {
    // Fewer places than stored: round the (already exact) 4-dp value half away from zero.
    const step = 10 ** (MONEY_DECIMALS - decimals);
    const rounded = Math.round(abs / step);
    const factor = 10 ** decimals;
    const whole = Math.floor(rounded / factor);
    const frac = decimals > 0 ? "." + String(rounded % factor).padStart(decimals, "0") : "";
    return (rounded === 0 ? "" : sign) + String(whole) + frac;
  }
  const whole = Math.floor(abs / SCALE);
  const frac = String(abs % SCALE).padStart(MONEY_DECIMALS, "0").padEnd(decimals, "0");
  return sign + String(whole) + "." + frac;
}

/** Display format with thousands separators: `formatMoney("1234.5") === "1,234.50"`. */
export function formatMoney(
  value: MoneyInput,
  options: { decimals?: number; locale?: string } = {},
): string {
  const decimals = options.decimals ?? 2;
  return roundMoney(value).toLocaleString(options.locale ?? "en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
