import type { MfgCapacityLoadRow } from "@/api/client";

type Props = {
  rows: MfgCapacityLoadRow[];
  loading?: boolean;
};

function cellClass(pct: number): string {
  if (pct >= 95) return "bg-red-500/80 text-white";
  if (pct >= 80) return "bg-amber-500/80 text-white";
  if (pct > 0) return "bg-emerald-500/70 text-white";
  return "bg-slate-200 text-text-secondary dark:bg-slate-700";
}

export function CapacityHeatmap({ rows, loading }: Props) {
  if (loading) {
    return <p className="text-sm text-text-muted">Loading capacity…</p>;
  }
  if (!rows.length) {
    return <p className="text-sm text-text-muted">No capacity load data. Run MRP or create plans first.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-subtle text-text-secondary">
            <th className="px-3 py-2">Work center</th>
            <th className="px-3 py-2">Orders</th>
            <th className="px-3 py-2">Planned qty</th>
            <th className="px-3 py-2">Completed</th>
            <th className="px-3 py-2">Load %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.work_center_id ?? "wc"}-${i}`} className="border-b border-border/60">
              <td className="px-3 py-2">{r.work_center_name}</td>
              <td className="px-3 py-2">{r.total_orders}</td>
              <td className="px-3 py-2">{r.total_qty_planned}</td>
              <td className="px-3 py-2">{r.total_qty_completed}</td>
              <td className="px-3 py-2">
                <span className={`inline-block min-w-[3rem] rounded px-2 py-0.5 text-center text-xs font-medium ${cellClass(r.load_percent)}`}>
                  {r.load_percent.toFixed(0)}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
