/**
 * Display helpers for decimal STRINGS from the backend. Display only: never use for posting maths.
 */
export function formatDecimal(value: string | null | undefined, maxFractionDigits = 0): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: maxFractionDigits, minimumFractionDigits: 0 });
}

export function formatPercent(value: string | null | undefined, maxFractionDigits = 1): string {
  const s = formatDecimal(value, maxFractionDigits);
  return s === "—" ? s : `${s}%`;
}

/** Signed difference, e.g. "+1,200" / "-300" / "0". */
export function formatSigned(value: string | null | undefined, maxFractionDigits = 0): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const body = Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: maxFractionDigits });
  if (n > 0) return `+${body}`;
  if (n < 0) return `-${body}`;
  return "0";
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}
