import { useEffect, useState } from "react";
import { api, type MfgDowntimeReasonRow, type MfgDowntimeTrendRow, type MfgExecutionDashboardResponse } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function ReportProductionEfficiencyPage() {
  const [dash, setDash] = useState<MfgExecutionDashboardResponse | null>(null);
  const [reasons, setReasons] = useState<MfgDowntimeReasonRow[]>([]);
  const [trend, setTrend] = useState<MfgDowntimeTrendRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([api.getMfgExecutionDashboard(), api.getMfgDowntimeReasonSummary(), api.getMfgDowntimeTrend()])
      .then(([d, r, t]) => {
        if (!cancelled) {
          setDash(d);
          setReasons(Array.isArray(r) ? r : []);
          setTrend(Array.isArray(t) ? t : []);
        }
      })
      .catch((e) => {
        logApiError("ReportProductionEfficiencyPage", e);
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const completionRate =
    dash && dash.total_work_orders > 0
      ? Math.round((100 * dash.completed_work_orders) / dash.total_work_orders)
      : 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">Production Efficiency</h1>
        <p className="text-text-muted text-sm mt-0.5">Manufacturing execution dashboard and downtime.</p>
      </header>
      {error && (
        <div className="rounded-lg bg-status-danger-subtle border border-status-danger/20 px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}
      {loading ? (
        <div className="space-y-3 p-6"><div className="h-4 w-3/4 animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-full animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-5/6 animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-2/3 animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-4/5 animate-pulse rounded bg-surface-subtle" /></div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-border bg-surface-raised p-4">
              <div className="text-xs text-text-muted uppercase">OEE-like %</div>
              <div className="text-2xl font-semibold">{dash?.oee_like_percent?.toFixed(1) ?? "—"}</div>
            </div>
            <div className="rounded-lg border border-border bg-surface-raised p-4">
              <div className="text-xs text-text-muted uppercase">Work orders</div>
              <div className="text-2xl font-semibold">
                {dash?.completed_work_orders ?? 0}/{dash?.total_work_orders ?? 0}
              </div>
              <div className="text-xs text-text-muted">Completion ~{completionRate}%</div>
            </div>
            <div className="rounded-lg border border-border bg-surface-raised p-4">
              <div className="text-xs text-text-muted uppercase">Operations</div>
              <div className="text-2xl font-semibold">
                {dash?.completed_operations ?? 0}/{dash?.total_operations ?? 0}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-surface-raised p-4">
              <div className="text-xs text-text-muted uppercase">Downtime (min)</div>
              <div className="text-2xl font-semibold">{dash?.total_downtime_minutes ?? 0}</div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
            <h2 className="border-b border-border px-4 py-2 text-sm font-semibold">Downtime by reason</h2>
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle text-left text-text-muted">
                <tr>
                  <th className="py-2 px-4">Reason</th>
                  <th className="py-2 px-4">Events</th>
                  <th className="py-2 px-4">Open</th>
                  <th className="py-2 px-4">Minutes</th>
                </tr>
              </thead>
              <tbody>
                {reasons.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-text-muted">
                      No downtime rows
                    </td>
                  </tr>
                ) : (
                  reasons.map((r) => (
                    <tr key={r.reason_code} className="border-b border-border-subtle">
                      <td className="py-2 px-4">{r.reason_code}</td>
                      <td className="py-2 px-4">{r.total_events}</td>
                      <td className="py-2 px-4">{r.open_events}</td>
                      <td className="py-2 px-4">{r.total_minutes?.toFixed(0)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
            <h2 className="border-b border-border px-4 py-2 text-sm font-semibold">Downtime trend (recent)</h2>
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle text-left text-text-muted">
                <tr>
                  <th className="py-2 px-4">Date</th>
                  <th className="py-2 px-4">Events</th>
                  <th className="py-2 px-4">Minutes</th>
                </tr>
              </thead>
              <tbody>
                {trend.slice(0, 14).map((r) => (
                  <tr key={r.trend_date} className="border-b border-border-subtle">
                    <td className="py-2 px-4">{r.trend_date}</td>
                    <td className="py-2 px-4">{r.total_events}</td>
                    <td className="py-2 px-4">{r.total_minutes?.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
