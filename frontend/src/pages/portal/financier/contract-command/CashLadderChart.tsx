export function CashLadderChart({ weeks }: { weeks: { week_start: string; planned_cm_outflow: number; running_balance_proxy: number }[] }) {
  if (!weeks?.length) return <p className="text-sm text-text-muted">No cash ladder data.</p>;
  const maxOut = Math.max(1, ...weeks.map((w) => Math.abs(w.planned_cm_outflow || 0)));
  return (
    <div className="space-y-2">
      {weeks.map((w) => (
        <div key={w.week_start} className="flex items-center gap-2 text-xs">
          <span className="w-28 shrink-0 text-text-muted">{w.week_start}</span>
          <div className="h-3 flex-1 overflow-hidden rounded bg-surface-muted">
            <div
              className="h-full rounded bg-violet-500/70"
              style={{ width: `${(Math.abs(w.planned_cm_outflow || 0) / maxOut) * 100}%` }}
            />
          </div>
          <span className="w-24 shrink-0 tabular-nums text-text-primary">{w.planned_cm_outflow?.toFixed?.(2) ?? w.planned_cm_outflow}</span>
        </div>
      ))}
    </div>
  );
}
