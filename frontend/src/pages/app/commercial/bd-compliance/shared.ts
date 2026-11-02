export const inputClass =
  "w-full rounded-lg border border-border-strong px-2.5 py-1.5 text-sm text-text-primary focus:border-brand-primary focus:outline-none";
export const labelClass = "mb-1 block text-xs font-medium text-text-secondary";
export const btnPrimary =
  "inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-1.5 text-sm font-semibold text-brand-primary-foreground hover:bg-brand-primary/90 disabled:opacity-50";
export const btnSecondary =
  "inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-primary hover:bg-surface-raised disabled:opacity-50";

export const errMsg = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/** Format a decimal string for display without losing precision for small values. */
export function num(v: string | number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

export const UD_STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  APPROVED: "bg-emerald-100 text-emerald-800",
  CLOSED: "bg-gray-200 text-gray-600",
};
