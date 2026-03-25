import { useEffect, useState } from "react";
import { api, type QualityDashboardResponse } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function ReportQcSummaryPage() {
  const [data, setData] = useState<QualityDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getQualityDashboard()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        logApiError("ReportQcSummaryPage.getQualityDashboard", e);
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">QC Summary</h1>
        <p className="text-text-muted text-sm mt-0.5">Manufacturing quality dashboard: inspections, defects, NCR, CAPA.</p>
      </header>
      {error && (
        <div className="rounded-lg bg-status-danger-subtle border border-status-danger/20 px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}
      {loading ? (
        <div className="space-y-3 p-6"><div className="h-4 w-3/4 animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-full animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-5/6 animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-2/3 animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-4/5 animate-pulse rounded bg-surface-subtle" /></div>
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-border bg-surface-raised p-4">
              <div className="text-xs text-text-muted uppercase">Pass rate</div>
              <div className="text-2xl font-semibold">{data.inspections.pass_rate?.toFixed(1) ?? "—"}%</div>
              <div className="text-xs text-text-muted">
                {data.inspections.passed}/{data.inspections.total} passed
              </div>
            </div>
            <div className="rounded-lg border border-border bg-surface-raised p-4">
              <div className="text-xs text-text-muted uppercase">NCR</div>
              <div className="text-2xl font-semibold">{data.ncr.total}</div>
              <div className="text-xs text-text-muted">
                Open {data.ncr.open} · Closed {data.ncr.closed}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-surface-raised p-4">
              <div className="text-xs text-text-muted uppercase">CAPA</div>
              <div className="text-2xl font-semibold">{data.capa.total}</div>
              <div className="text-xs text-text-muted">
                Open {data.capa.open} · In progress {data.capa.in_progress}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-surface-raised p-4">
              <div className="text-xs text-text-muted uppercase">Failed inspections</div>
              <div className="text-2xl font-semibold">{data.inspections.failed}</div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
            <h2 className="border-b border-border px-4 py-2 text-sm font-semibold">By check type</h2>
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle text-left text-text-muted">
                <tr>
                  <th className="py-2 px-4">Type</th>
                  <th className="py-2 px-4">Total</th>
                  <th className="py-2 px-4">Passed</th>
                  <th className="py-2 px-4">Failed</th>
                  <th className="py-2 px-4">Pass %</th>
                </tr>
              </thead>
              <tbody>
                {data.by_check_type.map((r) => (
                  <tr key={r.check_type} className="border-b border-border-subtle">
                    <td className="py-2 px-4">{r.check_type}</td>
                    <td className="py-2 px-4">{r.total}</td>
                    <td className="py-2 px-4">{r.passed}</td>
                    <td className="py-2 px-4">{r.failed}</td>
                    <td className="py-2 px-4">{r.pass_rate?.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
            <h2 className="border-b border-border px-4 py-2 text-sm font-semibold">Defect distribution</h2>
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle text-left text-text-muted">
                <tr>
                  <th className="py-2 px-4">Code</th>
                  <th className="py-2 px-4">Count</th>
                </tr>
              </thead>
              <tbody>
                {data.defect_distribution.map((d) => (
                  <tr key={d.defect_code} className="border-b border-border-subtle">
                    <td className="py-2 px-4">{d.defect_code}</td>
                    <td className="py-2 px-4">{d.count}</td>
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
