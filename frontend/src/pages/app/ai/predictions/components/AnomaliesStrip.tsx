import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { api, type AiAnomalyEventResponse } from "@/api/client";
import { logApiError } from "@/utils/logApiError";
import { AlertTriangle } from "lucide-react";

export function AnomaliesStrip() {
  const [events, setEvents] = useState<AiAnomalyEventResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .aiListAnomalyEvents({ limit: 5 })
      .then(setEvents)
      .catch((e) => logApiError("AnomaliesStrip", e))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
          <AlertTriangle className="h-4 w-4 text-status-warning-foreground" />
          Recent anomalies
        </h2>
        <Link to="/app/ai/assistant" className="text-[11px] text-brand-primary hover:underline">
          Open AI assistant
        </Link>
      </div>
      {loading ? (
        <p className="text-xs text-text-muted">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-xs text-text-muted">No anomaly events recorded.</p>
      ) : (
        <ul className="space-y-2 text-xs text-text-secondary">
          {events.map((ev) => (
            <li key={ev.id} className="rounded border border-border-subtle bg-surface-subtle p-2">
              <span className="font-medium text-text-primary">{ev.title}</span>{" "}
              <span className="text-text-muted">({ev.severity})</span>
              <p className="mt-0.5 line-clamp-2">{ev.explanation}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
