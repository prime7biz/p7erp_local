import type { ReactNode } from "react";

export function BomVarianceBadge({
  variancePct,
  tolerance = 5,
}: {
  variancePct: number | null | undefined;
  tolerance?: number;
}): ReactNode {
  if (variancePct == null || Number.isNaN(variancePct)) {
    return <span className="text-xs text-text-muted">—</span>;
  }
  const abs = Math.abs(variancePct);
  const cls =
    abs <= 2
      ? "bg-status-success-subtle text-status-success-foreground border-status-success/30"
      : abs <= tolerance
        ? "bg-status-warning-subtle text-status-warning-foreground border-status-warning/30"
        : "bg-status-danger-subtle text-status-danger-foreground border-status-danger/20";
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {variancePct >= 0 ? "+" : ""}
      {variancePct.toFixed(1)}%
    </span>
  );
}
