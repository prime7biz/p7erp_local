interface Row {
  label: string;
  value: number;
}

interface Props {
  rows: Row[];
  maxRows?: number;
  valueFormat?: (n: number) => string;
}

export function MiniBars({ rows, maxRows = 10, valueFormat = (n) => String(n) }: Props) {
  const sorted = [...rows].sort((a, b) => b.value - a.value).slice(0, maxRows);
  if (!sorted.length) return <p className="text-[11px] text-text-muted">No data.</p>;
  const maxV = Math.max(...sorted.map((r) => Math.abs(r.value)), 1);
  return (
    <div className="space-y-1">
      {sorted.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-[11px]">
          <span className="w-24 shrink-0 truncate text-text-muted" title={r.label}>
            {r.label}
          </span>
          <div className="h-3 min-w-0 flex-1 rounded bg-surface-subtle">
            <div
              className="h-3 rounded bg-status-info-foreground/70"
              style={{ width: `${(Math.abs(r.value) / maxV) * 100}%` }}
            />
          </div>
          <span className="w-16 shrink-0 text-right text-text-secondary">{valueFormat(r.value)}</span>
        </div>
      ))}
    </div>
  );
}
