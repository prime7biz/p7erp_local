import type { AiAnomalyEventResponse } from "@/api/client";

interface Props {
  loading: boolean;
  running: boolean;
  events: AiAnomalyEventResponse[];
  onGenerate: () => Promise<void>;
}

export function AiAnomalyInsightsPanel({ loading, running, events, onGenerate }: Props) {
  const severityClass = (severity: string) => {
    const s = severity.toUpperCase();
    if (s === "HIGH") return "text-red-700";
    if (s === "MEDIUM") return "text-amber-700";
    return "text-emerald-700";
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800">Anomaly Insights</h2>
        <button
          type="button"
          onClick={() => void onGenerate()}
          disabled={running}
          className="rounded-md bg-rose-600 px-2 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {running ? "Running..." : "Generate"}
        </button>
      </div>
      {loading ? (
        <p className="text-sm text-slate-500">Loading anomaly events...</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-slate-500">No anomaly events available yet.</p>
      ) : (
        <div className="space-y-2">
          {events.slice(0, 8).map((event) => (
            <div key={event.id} className="rounded-md border border-slate-200 bg-slate-50 p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-slate-800">{event.title}</div>
                <div className={`rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold ${severityClass(event.severity)}`}>
                  {event.severity}
                </div>
              </div>
              <p className="mt-1 text-[11px] text-slate-700">{event.explanation}</p>
              <p className="mt-1 text-[11px] text-slate-500">
                Rule: {event.rule_code} | Area: {event.source_area}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
