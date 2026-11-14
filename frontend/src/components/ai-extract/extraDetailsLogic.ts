/**
 * Logic for the "More details found in the document" panel (customer + inquiry imports).
 *
 * The backend sends labelled details (`extra_fields`) with an optional suggested form field.
 * The user picks where each one goes; these helpers build the rows, check that a value fits the
 * chosen field, and append to Notes without replacing what is already there.
 */
import type { ExtraExtractedField } from "@/types/extraction";

export const NOTES_TARGET = "notes";
/** Value of the "Put into" select meaning "Don't use". */
export const IGNORE_TARGET = "";

export type ExtraTargetOption = { key: string; label: string };

export type ExtraRowStatus = "pending" | "applied" | "ignored";

export type ExtraRowState = {
  id: string;
  label: string;
  value: string;
  suggestedField: string | null;
  /** Chosen field key, or IGNORE_TARGET. */
  target: string;
  status: ExtraRowStatus;
  /** Plain-language reason when the value does not fit the chosen field. */
  error: string | null;
  confidence: number;
  /** Field the row was put into (after Apply). */
  appliedTo?: string;
};

export type CoerceResult = { ok: true; value: string | number } | { ok: false; reason: string };

/** The backend escapes `<`, `>` and `&`; React escapes again, so decode for display and form values. */
export function decodeExtractedText(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
}

export function buildTargetOptions(labels: Record<string, string>, keys: string[]): ExtraTargetOption[] {
  return keys.map((key) => ({ key, label: labels[key] ?? key }));
}

/**
 * Build panel rows. A suggestion is kept only when it is one of the offered targets
 * (after `aliases`, e.g. `style_name_candidate` -> the quick-add style name box).
 */
export function buildExtraRows(
  extras: ExtraExtractedField[] | undefined,
  options: ExtraTargetOption[],
  aliases: Record<string, string> = {},
): ExtraRowState[] {
  const allowed = new Set(options.map((o) => o.key));
  return (extras ?? []).map((ex, i) => {
    const raw = ex.suggested_field ?? null;
    const mapped = raw ? (aliases[raw] ?? raw) : null;
    const suggested = mapped && allowed.has(mapped) ? mapped : null;
    return {
      id: `extra-${i}`,
      label: decodeExtractedText(ex.label),
      value: decodeExtractedText(ex.value),
      suggestedField: suggested,
      target: suggested ?? IGNORE_TARGET,
      status: "pending",
      error: null,
      confidence: typeof ex.confidence === "number" ? ex.confidence : 0.5,
    };
  });
}

function oneLine(value: string): string {
  return value
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .join(", ");
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function validYmd(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** YYYY-MM-DD from ISO, day-first numeric (31/12/2026, 31.12.2026) or "12 Mar 2026". */
export function toIsoDate(value: string): string | null {
  const s = value.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return validYmd(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return validYmd(Number(m[3]), Number(m[2]), Number(m[1]));
  m = s.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s,-]+(\d{4})$/);
  if (m) {
    const word = (m[2] ?? "").toLowerCase();
    const mon = MONTHS[word.slice(0, 4)] ?? MONTHS[word.slice(0, 3)];
    if (mon) return validYmd(Number(m[3]), mon, Number(m[1]));
  }
  return null;
}

function firstNumber(value: string): string | null {
  const m = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? m[0] : null;
}

/** "4,50" (comma decimal) or "1.200" (dot thousands): the meaning depends on the country, so ask the user. */
export function isAmbiguousNumber(value: string): boolean {
  const m = value.match(/\d[\d.,]*/);
  if (!m) return false;
  const token = m[0].replace(/[.,]+$/, "");
  return /^\d+,\d{1,2}$/.test(token) || /^\d{1,3}(?:\.\d{3})+$/.test(token);
}

const AMBIGUOUS_NUMBER_REASON = "The number format is unclear (comma or dot). Type the number yourself.";

/** Check and convert a detail for a single form field. Notes are handled by `appendNoteLine`. */
export function coerceExtraValue(target: string, rawValue: string): CoerceResult {
  const value = rawValue.trim();
  if (!value) return { ok: false, reason: "The value is empty." };
  switch (target) {
    case "quantity": {
      if (isAmbiguousNumber(value)) return { ok: false, reason: AMBIGUOUS_NUMBER_REASON };
      const n = firstNumber(value);
      const q = n != null ? Math.round(Number(n)) : NaN;
      return Number.isFinite(q) && q >= 0 ? { ok: true, value: q } : { ok: false, reason: "Needs a whole number." };
    }
    case "target_price":
    case "exchange_rate":
    case "commission_value": {
      if (isAmbiguousNumber(value)) return { ok: false, reason: AMBIGUOUS_NUMBER_REASON };
      const n = firstNumber(value);
      return n != null && Number(n) >= 0 ? { ok: true, value: n } : { ok: false, reason: "Needs a number." };
    }
    case "expected_delivery_date": {
      const d = toIsoDate(value);
      return d ? { ok: true, value: d } : { ok: false, reason: "Needs a date such as 2026-08-15 or 15/08/2026." };
    }
    case "currency":
    case "target_price_currency": {
      const m = value.match(/\b([A-Za-z]{3})\b/);
      return m?.[1] ? { ok: true, value: m[1].toUpperCase() } : { ok: false, reason: "Needs a 3-letter currency code." };
    }
    case "commission_mode": {
      const v = value.toUpperCase();
      if (v.includes("EXCL")) return { ok: true, value: "EXCLUDE" };
      if (v.includes("INCL")) return { ok: true, value: "INCLUDE" };
      return { ok: false, reason: "Needs Include or Exclude." };
    }
    case "commission_type": {
      const v = value.toUpperCase();
      if (v.includes("%") || v.includes("PERC")) return { ok: true, value: "PERCENTAGE" };
      if (v.includes("FIX") || v.includes("FLAT")) return { ok: true, value: "FIXED" };
      return { ok: false, reason: "Needs Percentage or Fixed." };
    }
    case "shipping_term":
      return { ok: true, value: oneLine(value).toUpperCase().slice(0, 64) };
    case "contactEmail": {
      const m = value.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
      return m ? { ok: true, value: m[0].toLowerCase() } : { ok: false, reason: "Needs an email address." };
    }
    case "website": {
      const v = oneLine(value);
      return /^[^\s,]+\.[^\s,]+$/.test(v) ? { ok: true, value: v } : { ok: false, reason: "Needs a web address." };
    }
    case "contactPhone": {
      const digits = value.replace(/\D/g, "");
      return digits.length >= 7 ? { ok: true, value: digits } : { ok: false, reason: "Needs a phone number." };
    }
    case "countryCode": {
      const m = value.match(/\+?\s*(\d{1,4})/);
      return m ? { ok: true, value: `+${m[1]}` } : { ok: false, reason: "Needs a dial code such as +880." };
    }
    default:
      return { ok: true, value: oneLine(value).slice(0, 255) };
  }
}

/** Add "Label: value" to notes. A multi-line value becomes a short list. Never duplicates a line. */
export function appendNoteLine(existing: string | null | undefined, label: string, value: string): string {
  const cur = (existing ?? "").replace(/\s+$/, "");
  const lines = value
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (lines.length === 0) return cur;
  const block = lines.length === 1 ? `${label}: ${lines[0]}` : `${label}:\n${lines.map((l) => `- ${l}`).join("\n")}`;
  if (cur.includes(block)) return cur;
  return cur ? `${cur}\n${block}` : block;
}

/**
 * Rows that "Apply all suggested" should apply: pending rows with a target, and for single-value
 * fields only the first row per field (Notes can take many).
 */
export function planApplyAll(rows: ExtraRowState[]): string[] {
  const used = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    if (r.status !== "pending" || !r.target) continue;
    if (r.target !== NOTES_TARGET) {
      if (used.has(r.target)) continue;
      used.add(r.target);
    }
    out.push(r.id);
  }
  return out;
}
