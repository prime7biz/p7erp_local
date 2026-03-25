import { useCallback, useEffect, useState } from "react";
import { api, type AiWeeklyReportItem } from "@/api/client";
import { logApiError } from "@/utils/logApiError";
import { Calendar, RefreshCw } from "lucide-react";

export function AiWeeklyReportsPage() {
  const [items, setItems] = useState<AiWeeklyReportItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api
      .aiListWeeklyReports({ limit: 24 })
      .then((r) => setItems(r.items))
      .catch((e) => logApiError("AiWeeklyReports.list", e))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Weekly AI reports</h1>
          <p className="text-sm text-text-muted">
            Stored executive summaries generated on schedule (Sundays) when Gemini is configured on the server.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-raised p-8 text-center text-sm text-text-secondary">
          No weekly reports yet. Reports are created automatically on Sundays when the API is available.
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((row) => (
            <article key={row.id} className="rounded-xl border border-border bg-surface-raised p-4">
              <div className="flex items-center gap-2 text-xs text-text-muted mb-2">
                <Calendar className="h-3.5 w-3.5" />
                Week {row.week_start} → {row.week_end}
                <span className="text-text-muted">· {new Date(row.created_at).toLocaleString()}</span>
              </div>
              <div className="text-sm text-text-secondary whitespace-pre-wrap">{row.narrative}</div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
