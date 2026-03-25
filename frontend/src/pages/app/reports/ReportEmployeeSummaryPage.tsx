import { useEffect, useState } from "react";
import { api, type HrAttendanceReportRow, type HrReportSummaryResponse } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function ReportEmployeeSummaryPage() {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [summary, setSummary] = useState<HrReportSummaryResponse | null>(null);
  const [attendance, setAttendance] = useState<HrAttendanceReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([api.getHrReportSummary({ month }), api.listHrAttendanceReport({ month })])
      .then(([s, a]) => {
        if (!cancelled) {
          setSummary(s);
          setAttendance(Array.isArray(a) ? a : []);
        }
      })
      .catch((e) => {
        logApiError("ReportEmployeeSummaryPage", e);
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Employee Summary</h1>
          <p className="text-text-muted text-sm mt-0.5">Headcount, attendance, and leave pipeline.</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          Month
          <input
            type="month"
            className="rounded border border-border-strong px-2 py-1"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
      </header>
      {error && (
        <div className="rounded-lg bg-status-danger-subtle border border-status-danger/20 px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}
      {loading ? (
        <div className="space-y-3 p-6"><div className="h-4 w-3/4 animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-full animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-5/6 animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-2/3 animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-4/5 animate-pulse rounded bg-surface-subtle" /></div>
      ) : summary ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-surface-raised p-4">
              <div className="text-xs text-text-muted uppercase">Employees</div>
              <div className="text-2xl font-semibold">{summary.total_employees}</div>
            </div>
            <div className="rounded-lg border border-border bg-surface-raised p-4">
              <div className="text-xs text-text-muted uppercase">Attendance rate</div>
              <div className="text-2xl font-semibold">{summary.attendance_rate_percent?.toFixed(1) ?? "—"}%</div>
            </div>
            <div className="rounded-lg border border-border bg-surface-raised p-4">
              <div className="text-xs text-text-muted uppercase">Pending leave</div>
              <div className="text-2xl font-semibold">{summary.pending_leave_requests}</div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
            <h2 className="border-b border-border px-4 py-2 text-sm font-semibold">Attendance by employee</h2>
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle text-left text-text-muted">
                <tr>
                  <th className="py-2 px-4">Code</th>
                  <th className="py-2 px-4">Name</th>
                  <th className="py-2 px-4">Present</th>
                  <th className="py-2 px-4">Absent</th>
                  <th className="py-2 px-4">Leave</th>
                </tr>
              </thead>
              <tbody>
                {attendance.map((r) => (
                  <tr key={r.employee_code} className="border-b border-border-subtle">
                    <td className="py-2 px-4">{r.employee_code}</td>
                    <td className="py-2 px-4">{r.employee_name}</td>
                    <td className="py-2 px-4">{r.present_days}</td>
                    <td className="py-2 px-4">{r.absent_days}</td>
                    <td className="py-2 px-4">{r.leave_days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
