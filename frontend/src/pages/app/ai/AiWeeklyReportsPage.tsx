import { useEffect } from "react";
import { Calendar, RefreshCw, Sparkles } from "lucide-react";
import { useWeeklyReports } from "@/pages/app/ai/hooks/useWeeklyReports";
import { AiWeeklyReportStatusBanner } from "@/pages/app/ai/components/AiWeeklyReportStatusBanner";
import { AiWeeklyReportListPanel } from "@/pages/app/ai/components/AiWeeklyReportListPanel";
import { AiWeeklyReportDetail } from "@/pages/app/ai/components/AiWeeklyReportDetail";

const PRINT_ROOT = "weekly-report-print-root";

export function AiWeeklyReportsPage() {
  const s = useWeeklyReports(24);
  const { info, setInfo } = s;

  useEffect(() => {
    if (!info) return;
    const t = window.setTimeout(() => setInfo(null), 6000);
    return () => window.clearTimeout(t);
  }, [info, setInfo]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Weekly AI reports</h1>
          <p className="text-sm text-text-muted">
            Stored executive summaries from live KPIs. Markdown narrative below; open the panel for raw numbers and week-over-week
            change where a prior week exists.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="sr-only" htmlFor="wr-limit">
            How many past weeks
          </label>
          <select
            id="wr-limit"
            className="rounded-lg border border-border bg-surface-raised px-2 py-1.5 text-xs text-text-secondary"
            value={s.limit}
            onChange={(e) => s.setLimit(Number(e.target.value))}
          >
            <option value={12}>Last 12</option>
            <option value={24}>Last 24</option>
            <option value={52}>Last 52</option>
          </select>
          <button
            type="button"
            onClick={() => void s.load()}
            disabled={s.loading}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${s.loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void s.generate({ force: false })}
            disabled={s.loading || s.generating || !s.status?.gemini_configured}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-raised px-2.5 py-1.5 text-xs text-text-primary hover:bg-surface-subtle disabled:opacity-50"
            title={!s.status?.gemini_configured ? "Configure Gemini on the server first" : "Create report for the current week if missing"}
          >
            <Calendar className="h-3.5 w-3.5" />
            Generate this week
          </button>
          <button
            type="button"
            onClick={() => void s.generate({ force: true })}
            disabled={s.loading || s.generating || !s.status?.gemini_configured}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
            title="Overwrite this week with a new AI narrative"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Regenerate
          </button>
        </div>
      </div>

      <AiWeeklyReportStatusBanner status={s.status} loading={s.loading} />

      {s.error && (
        <div
          className="rounded-lg border border-status-error/40 bg-status-error/10 px-3 py-2 text-sm text-status-error-foreground"
          role="alert"
        >
          {s.error}
        </div>
      )}
      {info && (
        <div className="rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm text-text-secondary">{info}</div>
      )}

      {s.loading && !s.items.length ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : s.items.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-raised p-8 text-center text-sm text-text-secondary">
          <p className="mb-3">No weekly reports yet.</p>
          <p className="text-xs text-text-muted mb-4">
            Reports can be created on schedule (when the app runs through Sunday UTC) or by clicking “Generate this week” if Gemini is
            configured.
          </p>
          {s.status?.gemini_configured && (
            <button
              type="button"
              onClick={() => void s.generate({ force: false })}
              disabled={s.generating}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-text-primary hover:bg-surface-subtle disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              {s.generating ? "Generating…" : "Generate first report"}
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(220px,280px)_1fr]">
          <div className="print:hidden">
            <AiWeeklyReportListPanel
              items={s.items}
              selectedId={s.selectedId}
              onSelect={s.setSelectedId}
              currentWeekStart={s.status?.current_week_start ?? null}
            />
          </div>
          <div>
            {s.selected ? (
              <AiWeeklyReportDetail report={s.selected} printId={PRINT_ROOT} />
            ) : (
              <p className="text-sm text-text-muted">Select a week.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
