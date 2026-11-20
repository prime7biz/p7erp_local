import type { ReactNode } from "react";

export type SummaryStripItem = {
  key: string;
  label: string;
  value: ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "muted";
};

const toneClass: Record<NonNullable<SummaryStripItem["tone"]>, string> = {
  default: "text-text-primary",
  success: "text-status-success-foreground",
  warning: "text-status-warning-foreground",
  danger: "text-status-danger-foreground",
  muted: "text-text-muted",
};

const gridClass = [
  "grid gap-2 sm:grid-cols-2",
  "grid gap-2 sm:grid-cols-2 lg:grid-cols-3",
  "grid gap-2 sm:grid-cols-2 lg:grid-cols-4",
  "grid gap-2 sm:grid-cols-2 lg:grid-cols-5",
] as const;

/**
 * Compact totals / status row (voucher-entry balance summary style).
 */
export function SummaryStrip({
  items,
  className = "",
}: {
  items: SummaryStripItem[];
  className?: string;
}) {
  if (items.length === 0) return null;
  const cols = Math.min(Math.max(items.length, 2), 5);
  const layout = gridClass[cols - 2] ?? gridClass[3];
  return (
    <div className={`${layout} rounded-xl border border-border bg-surface-subtle/60 p-3 ${className}`.trim()}>
      {items.map((item) => (
        <div key={item.key} className="min-w-0 rounded-lg border border-border/60 bg-surface-raised px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{item.label}</div>
          <div className={`mt-0.5 truncate text-sm font-semibold ${toneClass[item.tone ?? "default"]}`}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}
