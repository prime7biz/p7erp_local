/**
 * Lakh / crore money text for the Tally-style statements (mirror of backend `money_format.py`).
 *
 *   "1234567.5000"    -> "12,34,567.50"
 *   "1813863870.26"   -> "1,81,38,63,870.26"
 *   "-1234.5"         -> "(-)1,234.50"
 *   net "1234.5"      -> "1,234.50 Dr",   net "-1234.5" -> "1,234.50 Cr"
 *
 * Money arrives from the API as decimal STRINGS. Everything here works on the digits of the string
 * (BigInt "units" of one ten-thousandth) and never turns an amount into a JavaScript number, so a
 * crore-sized figure keeps every digit. Rounding is half away from zero on the exact value, like
 * the backend's ROUND_HALF_UP.
 */

const DECIMALS = 4;
const SCALE = BigInt(10 ** DECIMALS);
const ZERO = BigInt(0);

export type MoneyText = string | null | undefined;

/** "1,234.56789" / "-0.5" -> units of 1/10000 (rounded half away from zero). Unparsable text -> 0. */
export function toUnits(value: MoneyText): bigint {
  if (value == null) return ZERO;
  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(String(value).replace(/[,\s]/g, ""));
  if (!match || (match[2] === "" && (match[3] ?? "") === "")) return ZERO;
  const whole = BigInt(match[2] || "0");
  const fraction = (match[3] ?? "").padEnd(DECIMALS + 1, "0");
  let units = whole * SCALE + BigInt(fraction.slice(0, DECIMALS));
  if (Number(fraction[DECIMALS]) >= 5) units += BigInt(1);
  return match[1] === "-" ? -units : units;
}

/** Units -> 4-decimal text ("12.3400"). */
export function fromUnits(units: bigint): string {
  const negative = units < ZERO;
  const abs = negative ? -units : units;
  const whole = abs / SCALE;
  const fraction = (abs % SCALE).toString().padStart(DECIMALS, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${fraction}`;
}

/** Exact a - b as 4-decimal text. */
export function subtractMoneyText(a: MoneyText, b: MoneyText): string {
  return fromUnits(toUnits(a) - toUnits(b));
}

/** True when the amount is zero at 4 decimals (or missing). */
export function isZeroMoney(value: MoneyText): boolean {
  return toUnits(value) === ZERO;
}

/** "1234567" -> "12,34,567": last three digits together, then groups of two. */
export function groupIndianDigits(digits: string): string {
  if (digits.length <= 3) return digits;
  let head = digits.slice(0, -3);
  const tail = digits.slice(-3);
  const parts: string[] = [];
  while (head.length > 2) {
    parts.unshift(head.slice(-2));
    head = head.slice(0, -2);
  }
  if (head) parts.unshift(head);
  return `${parts.join(",")},${tail}`;
}

/** Round units to `places` decimals (0-4), half away from zero. Returns units at that scale. */
function roundUnits(abs: bigint, places: number): bigint {
  const drop = BigInt(10 ** (DECIMALS - places));
  const half = drop / BigInt(2);
  return (abs + half) / drop;
}

/**
 * Indian grouping. `negative`: "paren" -> "(-)1,234.00", "minus" -> "-1,234.00".
 * null / undefined -> "".
 */
export function formatIndian(value: MoneyText, places = 2, negative: "paren" | "minus" = "paren"): string {
  if (value == null) return "";
  const p = Math.min(Math.max(Math.trunc(places), 0), DECIMALS);
  const units = toUnits(value);
  const isNegative = units < ZERO;
  const rounded = roundUnits(isNegative ? -units : units, p);
  const text = rounded.toString().padStart(p + 1, "0");
  const whole = p > 0 ? text.slice(0, -p) : text;
  const fraction = p > 0 ? `.${text.slice(-p)}` : "";
  const out = `${groupIndianDigits(whole)}${fraction}`;
  // A value that rounds to zero has no sign.
  if (!isNegative || rounded === ZERO) return out;
  return negative === "paren" ? `(-)${out}` : `-${out}`;
}

/** Debit-minus-credit balance as "1,234.50 Dr" / "1,234.50 Cr". Zero has no suffix. */
export function formatDrCr(net: MoneyText, places = 2): string {
  if (net == null) return "";
  const units = toUnits(net);
  const p = Math.min(Math.max(Math.trunc(places), 0), DECIMALS);
  const rounded = roundUnits(units < ZERO ? -units : units, p);
  if (rounded === ZERO) return formatIndian("0", p);
  return `${formatIndian(fromUnits(units < ZERO ? -units : units), p)} ${units > ZERO ? "Dr" : "Cr"}`;
}

/** An absolute amount plus the side the API gave it ("Dr", "Cr" or ""): "1,234.50 Dr". */
export function formatWithSide(amount: MoneyText, side: string | null | undefined, places = 2): string {
  if (amount == null) return "";
  const text = formatIndian(amount, places);
  return side === "Dr" || side === "Cr" ? `${text} ${side}` : text;
}

/** Money for a table cell: blank when zero (Tally style), otherwise Indian grouping. */
export function formatCell(value: MoneyText, places = 2): string {
  return value == null || isZeroMoney(value) ? "" : formatIndian(value, places);
}

/** Debit minus credit as "x Dr" / "x Cr" from two separate columns. */
export function formatNet(debit: MoneyText, credit: MoneyText, places = 2): string {
  return formatDrCr(subtractMoneyText(debit, credit), places);
}

/** Percent-style figure from a 4-decimal string, e.g. "12.5000" -> "12.50". */
export function formatPlain(value: MoneyText, places = 2): string {
  return value == null ? "" : formatIndian(value, places, "minus");
}
