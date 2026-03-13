import type { AiForecastRunResponse } from "@/api/client";

interface Props {
  runs: AiForecastRunResponse[];
  loading: boolean;
}

export function AiForecastRunsPanel({ runs, loading }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-800">Recent Forecast Runs</h2>
      {loading ? (
        <p className="text-sm text-slate-500">Loading forecast runs...</p>
      ) : runs.length === 0 ? (
        <p className="text-sm text-slate-500">No forecasts generated yet.</p>
      ) : (
        <div className="space-y-2">
          {runs.map((run) => (
            <div key={run.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-800">{run.forecast_name}</div>
                <div className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">{run.status}</div>
              </div>
              <p className="mt-1 text-xs text-slate-700">{run.narrative_explanation || "No explanation."}</p>
              <div className="mt-1 text-[11px] text-slate-500">
                Confidence: {run.confidence_score == null ? "N/A" : run.confidence_score.toFixed(2)}
              </div>
              <div className="mt-1 text-[11px] text-slate-600">
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
