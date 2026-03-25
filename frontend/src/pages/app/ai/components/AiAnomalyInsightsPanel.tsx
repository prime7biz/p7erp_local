import type { AiAnomalyEventResponse } from "@/api/client";

interface Props {
  loading: boolean;
  running: boolean;
  events: AiAnomalyEventResponse[];
  geminiNarrative?: string | null;
  onGenerate: () => Promise<void>;
}

export function AiAnomalyInsightsPanel({ loading, running, events, geminiNarrative, onGenerate }: Props) {
  const severityClass = (severity: string) => {
    const s = severity.toUpperCase();
    if (s === "HIGH") return "text-status-danger-foreground";
    if (s === "MEDIUM") return "text-status-warning-foreground";
    return "text-status-success-foreground";
  };

  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-primary">Anomaly Insights</h2>
        <button
          type="button"
          onClick={() => void onGenerate()}
          disabled={running}
          className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-surface-subtle"
        >
          {running ? "Running..." : "Generate"}
        </button>
      </div>
      {geminiNarrative ? (
        <div className="mb-3 rounded-md border border-border bg-surface-subtle p-2 text-xs text-text-secondary whitespace-pre-wrap">
          <span className="font-semibold text-text-primary">Gemini analysis: </span>
          {geminiNarrative}
        </div>
      ) : null}
      {loading ? (
        <p className="text-sm text-text-muted">Loading anomaly events...</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-text-muted">No anomaly events available yet.</p>
      ) : (
        <div className="space-y-2">
          {events.slice(0, 8).map((event) => (
            <div key={event.id} className="rounded-md border border-border bg-surface-subtle p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-text-primary">{event.title}</div>
                <div className={`rounded-full bg-surface-raised px-2 py-0.5 text-[11px] font-semibold ${severityClass(event.severity)}`}>
                  {event.severity}
                </div>
              </div>
              <p className="mt-1 text-[11px] text-text-secondary">{event.explanation}</p>
              <p className="mt-1 text-[11px] text-text-muted">
                Rule: {event.rule_code} | Area: {event.source_area}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
