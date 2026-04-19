import { useMemo } from "react";
import { Link } from "react-router-dom";

import type { ControlTowerCapacityHeatmapCell } from "@/api/client";

function enumerateDates(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  const d = new Date(fromIso + "T12:00:00");
  const end = new Date(toIso + "T12:00:00");
  if (Number.isNaN(d.getTime()) || Number.isNaN(end.getTime()) || d > end) return out;
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function CapacityHeatmap({
  dateFrom,
  dateTo,
  cells,
  loading,
  error,
}: {
  dateFrom: string;
  dateTo: string;
  cells: ControlTowerCapacityHeatmapCell[];
  loading: boolean;
  error: string;
}) {
  const days = useMemo(() => enumerateDates(dateFrom, dateTo), [dateFrom, dateTo]);

  const { lineIds, lineLabels, matrix, maxLoad } = useMemo(() => {
    const lineOrder: number[] = [];
    const seen = new Set<number>();
    for (const c of cells) {
      if (!seen.has(c.line_id)) {
        seen.add(c.line_id);
        lineOrder.push(c.line_id);
      }
    }
    lineOrder.sort((a, b) => a - b);

    const labels = new Map<number, string>();
    const matrix = new Map<string, number>();
    let max = 1;
    for (const c of cells) {
      labels.set(c.line_id, c.line_code || `L${c.line_id}`);
      const key = `${c.line_id}|${c.bucket_date.slice(0, 10)}`;
      const load = (c.firm_minutes || 0) + (c.soft_minutes || 0);
      matrix.set(key, load);
      if (load > max) max = load;
    }
    return { lineIds: lineOrder, lineLabels: labels, matrix, maxLoad: max };
  }, [cells]);

  if (loading) return <p className="text-xs text-text-muted">Loading capacity heatmap…</p>;
  if (error) return <div className="text-xs text-status-danger-foreground">{error}</div>;
  if (days.length === 0) return <p className="text-xs text-text-muted">Invalid date range.</p>;

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-text-muted italic">
        Projected load: committed SMV-minutes (firm + soft) per line and start bucket — not a guaranteed capacity %.
      </p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full border-collapse text-[10px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-[1] border-b border-r border-border bg-surface-subtle px-2 py-1 text-left text-text-secondary">
                Line
              </th>
              {days.map((d) => (
                <th key={d} className="border-b border-border px-1 py-1 text-center text-text-muted">
                  {d.slice(5)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lineIds.length === 0 ? (
              <tr>
                <td colSpan={1 + days.length} className="px-2 py-4 text-center text-text-muted">
                  No line bookings in range.
                </td>
              </tr>
            ) : (
              lineIds.map((lid) => (
                <tr key={lid}>
                  <td className="sticky left-0 z-[1] border-b border-r border-border bg-surface-raised px-2 py-1 font-medium text-text-primary">
                    {lineLabels.get(lid) ?? `Line ${lid}`}
                  </td>
                  {days.map((d) => {
                    const load = matrix.get(`${lid}|${d}`) ?? 0;
                    const intensity = Math.min(1, load / maxLoad);
                    const bg = `rgba(59, 130, 246, ${0.12 + intensity * 0.55})`;
                    return (
                      <td key={d} className="border-b border-border px-0 py-0 text-center">
                        <Link
                          to={`/app/production/line-plan`}
                          title={`${load.toFixed(0)} SMV-min (firm+soft)`}
                          className="block min-h-[28px] min-w-[28px] leading-[28px] text-text-primary"
                          style={{ background: load > 0 ? bg : undefined }}
                        >
                          {load > 0 ? (load >= 1000 ? `${(load / 1000).toFixed(1)}k` : `${Math.round(load)}`) : ""}
                        </Link>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Link className="text-xs text-status-info hover:underline" to="/app/production/line-plan">
        Open line plan board
      </Link>
    </div>
  );
}
