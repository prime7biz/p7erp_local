import type { AiForecastRunResponse } from "@/api/client";

interface Props {
  runs: AiForecastRunResponse[];
  loading: boolean;
}

export function AiForecastRunsPanel({ runs, loading }: Props) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4">
      <h2 className="mb-3 text-sm font-semibold text-text-primary">Recent Forecast Runs</h2>
      {loading ? (
        <p className="text-sm text-text-muted">Loading forecast runs...</p>
      ) : runs.length === 0 ? (
        <p className="text-sm text-text-muted">No forecasts generated yet.</p>
      ) : (
        <div className="space-y-2">
          {runs.map((run) => (
            <div key={run.id} className="rounded-lg border border-border bg-surface-subtle p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-text-primary">{run.forecast_name}</div>
                <div className="rounded-full bg-surface-raised px-2 py-0.5 text-[11px] font-semibold text-text-secondary">{run.status}</div>
              </div>
              <p className="mt-1 text-xs text-text-secondary">{run.narrative_explanation || "No explanation."}</p>
              <div className="mt-1 text-[11px] text-text-muted">
                Confidence: {run.confidence_score == null ? "N/A" : run.confidence_score.toFixed(2)}
              </div>
              <div className="mt-1 text-[11px] text-text-secondary">
                Assumptions:{" "}
                {Object.entries(run.assumptions_json || {})
                  .slice(0, 2)
                  .map(([k, v]) => `${k}=${String(v)}`)
                  .join(" | ") || "Not provided"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
