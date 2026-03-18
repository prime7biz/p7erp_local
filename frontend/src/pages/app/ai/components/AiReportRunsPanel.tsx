import type { AiReportRunResponse } from "@/api/client";

interface Props {
  reports: AiReportRunResponse[];
  loading: boolean;
}

export function AiReportRunsPanel({ reports, loading }: Props) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4">
      <h2 className="mb-3 text-sm font-semibold text-text-primary">Recent AI Reports</h2>
      {loading ? (
        <p className="text-sm text-text-muted">Loading reports...</p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-text-muted">No generated reports yet.</p>
      ) : (
        <div className="space-y-2">
          {reports.map((report) => (
            <div key={report.id} className="rounded-lg border border-border bg-surface-subtle p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-text-primary">{report.report_name}</div>
                <div className="rounded-full bg-surface-raised px-2 py-0.5 text-[11px] font-semibold text-text-secondary">
                  {report.status}
                </div>
              </div>
              <p className="mt-1 text-xs text-text-secondary">{report.narrative_summary || "No narrative summary."}</p>
              {Array.isArray(report.source_modules) && report.source_modules.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {report.source_modules.map((m) => (
                    <span key={`${report.id}-${m}`} className="rounded-full border border-border bg-surface-raised px-2 py-0.5 text-[11px] text-text-secondary">
                      {m}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
