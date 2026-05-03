import type { AiForecastSummaryResponse } from "@/api/client";

export function PredictionsKpiStrip({
  summary,
  loading,
}: {
  summary: AiForecastSummaryResponse | null;
  loading: boolean;
}) {
  if (loading && !summary) {
    return <p className="text-sm text-text-muted">Loading summary…</p>;
  }
  if (!summary) {
    return null;
  }
  const cards = [
    { label: "Total runs", value: String(summary.total_runs) },
    {
      label: "Last run",
      value: summary.last_run_at ? new Date(summary.last_run_at).toLocaleString() : "—",
    },
    {
      label: "Avg confidence",
      value: summary.avg_confidence == null ? "—" : summary.avg_confidence.toFixed(2),
    },
    {
      label: "Templates used",
      value: String(Object.keys(summary.by_forecast_code || {}).length),
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border border-border bg-surface-raised p-3">
          <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">{c.label}</div>
          <div className="mt-1 text-sm font-semibold text-text-primary">{c.value}</div>
        </div>
      ))}
    </div>
  );
}
