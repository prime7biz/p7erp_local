import { Info, AlertTriangle } from "lucide-react";
import type { AiWeeklyReportStatus } from "@/api/client";

export function AiWeeklyReportStatusBanner({
  status,
  loading,
}: {
  status: AiWeeklyReportStatus | null;
  loading: boolean;
}) {
  if (loading && !status) {
    return (
      <div className="rounded-xl border border-border bg-surface-raised p-3 text-sm text-text-muted">Loading status…</div>
    );
  }
  if (!status) return null;

  const next = new Date(status.next_scheduled_utc);
  const noGemini = !status.gemini_configured;
  return (
    <div
      className={
        noGemini
          ? "rounded-xl border border-status-warning/40 bg-status-warning/10 p-3"
          : "rounded-xl border border-border bg-surface-raised p-3"
      }
    >
      <div className="flex items-start gap-2">
        {noGemini ? <AlertTriangle className="h-4 w-4 text-status-warning-foreground mt-0.5 shrink-0" /> : <Info className="h-4 w-4 text-text-muted mt-0.5 shrink-0" />}
        <div className="min-w-0 text-sm text-text-secondary">
          {noGemini ? (
            <p>
              <span className="font-medium text-text-primary">Gemini is not configured</span> on the server. Weekly reports
              cannot be generated until an administrator sets a valid API key. You can still open past reports.
            </p>
          ) : (
            <p>
              Executive summaries are built from a KPI snapshot; new reports are also created automatically on the next
              scheduled run: <span className="text-text-primary font-medium">{next.toLocaleString(undefined, { timeZone: "UTC" })}</span>{" "}
              (UTC) when the app process is up.
            </p>
          )}
          <p className="mt-1 text-xs text-text-muted">
            Current week: {status.current_week_start} – {status.current_week_end}
            {status.has_current_week_report ? " · A report is stored for this week." : " · No report stored for this week yet."}
            {status.last_report_created_at && (
              <> · Last report created: {new Date(status.last_report_created_at).toLocaleString()}</>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
