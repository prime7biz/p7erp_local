import { useEffect, useMemo, useState } from "react";
import { api, type HrPayrollReportRow } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function ReportPayrollSummaryPage() {
  const year = new Date().getFullYear();
  const [y, setY] = useState(year);
  const [rows, setRows] = useState<HrPayrollReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listHrPayrollReport({ year: y })
      .then((data) => {
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        logApiError("ReportPayrollSummaryPage.listHrPayrollReport", e);
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [y]);

  const totals = useMemo(() => {
    let g = 0;
    let d = 0;
    let n = 0;
    for (const r of rows) {
      g += r.gross_total ?? 0;
      d += r.deduction_total ?? 0;
      n += r.net_total ?? 0;
    }
    return { g, d, n };
  }, [rows]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Payroll Summary</h1>
          <p className="text-text-muted text-sm mt-0.5">Payroll runs by period (YTD totals below).</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          Year
          <input
            type="number"
            className="w-24 rounded border border-border-strong px-2 py-1"
            value={y}
            onChange={(e) => setY(Number(e.target.value))}
          />
        </label>
      </header>
      {error && (
        <div className="rounded-lg bg-status-danger-subtle border border-status-danger/20 px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface-raised p-4">
          <div className="text-xs text-text-muted uppercase">Gross (listed runs)</div>
          <div className="text-xl font-semibold">{totals.g.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface-raised p-4">
          <div className="text-xs text-text-muted uppercase">Deductions</div>
          <div className="text-xl font-semibold">{totals.d.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface-raised p-4">
          <div className="text-xs text-text-muted uppercase">Net</div>
          <div className="text-xl font-semibold">{totals.n.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        {loading ? (
          <div className="space-y-3 p-6"><div className="h-4 w-3/4 animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-full animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-5/6 animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-2/3 animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-4/5 animate-pulse rounded bg-surface-subtle" /></div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-text-muted">No payroll runs</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle border-b border-border text-left text-text-muted">
              <tr>
                <th className="py-2 px-4">Period</th>
                <th className="py-2 px-4">Employees</th>
                <th className="py-2 px-4">Gross</th>
                <th className="py-2 px-4">Deductions</th>
                <th className="py-2 px-4">Net</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.payroll_period} className="border-b border-border-subtle">
                  <td className="py-2 px-4 font-medium">{r.payroll_period}</td>
                  <td className="py-2 px-4">{r.total_employees}</td>
                  <td className="py-2 px-4">{r.gross_total.toLocaleString()}</td>
                  <td className="py-2 px-4">{r.deduction_total.toLocaleString()}</td>
                  <td className="py-2 px-4">{r.net_total.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
