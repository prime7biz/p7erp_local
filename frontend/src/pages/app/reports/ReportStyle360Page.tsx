import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type StyleReportRow } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function ReportStyle360Page() {
  const [searchParams] = useSearchParams();
  const initialStyleId = searchParams.get("styleId");
  const [rows, setRows] = useState<StyleReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [lifecycleStage, setLifecycleStage] = useState("");
  const [criticalOnly, setCriticalOnly] = useState(Boolean(initialStyleId));
  const [savedView, setSavedView] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.listStyleSummaryReport({
        search: search || undefined,
        lifecycle_stage: lifecycleStage || undefined,
        critical_only: criticalOnly,
        saved_view: savedView || undefined,
      });
      const filtered = initialStyleId ? data.filter((row) => row.style_id === Number(initialStyleId)) : data;
      setRows(filtered);
    } catch (e) {
      logApiError("ReportStyle360Page", e);
      setError(e instanceof Error ? e.message : "Failed to load style report");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, lifecycleStage, criticalOnly, savedView, initialStyleId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Style 360 Report</h1>
        <p className="mt-1 text-sm text-text-muted">One place to monitor open follow-up, overdue milestones, and pending payment by style.</p>
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4 grid gap-3 md:grid-cols-5">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search style code/name" className="rounded-lg border border-border-strong px-3 py-2 text-sm" />
        <select value={lifecycleStage} onChange={(e) => setLifecycleStage(e.target.value)} className="rounded-lg border border-border-strong px-3 py-2 text-sm">
          <option value="">All lifecycle</option>
          {["INQUIRY", "DEVELOPMENT", "QUOTED", "ORDERED", "IN_PRODUCTION", "SHIPPED", "PAID", "CLOSED"].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select value={savedView} onChange={(e) => setSavedView(e.target.value)} className="rounded-lg border border-border-strong px-3 py-2 text-sm">
          <option value="">No saved view</option>
          <option value="critical_styles">Critical styles</option>
          <option value="shipment_due_week">Shipment due this week</option>
          <option value="payment_overdue">Payment overdue</option>
        </select>
        <label className="inline-flex items-center gap-2 rounded-lg border border-border-strong px-3 py-2 text-sm">
          <input type="checkbox" checked={criticalOnly} onChange={(e) => setCriticalOnly(e.target.checked)} />
          Critical only
        </label>
        <button type="button" onClick={() => void load()} className="rounded-lg border border-border-strong px-3 py-2 text-sm text-text-secondary">
          Refresh
        </button>
      </div>

      {error && <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">{error}</div>}

      <div className="rounded-xl border border-border bg-surface-raised overflow-x-auto">
        {loading ? (
          <div className="space-y-3 p-6"><div className="h-4 w-3/4 animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-full animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-5/6 animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-2/3 animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-4/5 animate-pulse rounded bg-surface-subtle" /></div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-text-muted">No rows found.</div>
        ) : (
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-surface-subtle border-b border-border text-left text-text-muted">
              <tr>
                <th className="px-4 py-2">Style</th>
                <th className="px-4 py-2">Lifecycle</th>
                <th className="px-4 py-2 text-right">Open actions</th>
                <th className="px-4 py-2 text-right">Overdue</th>
                <th className="px-4 py-2 text-right">Invoice</th>
                <th className="px-4 py-2 text-right">Received</th>
                <th className="px-4 py-2 text-right">Due</th>
                <th className="px-4 py-2">Next due</th>
                <th className="px-4 py-2">Last event</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.style_id} className="border-b border-border-subtle last:border-0 hover:bg-surface-subtle/70">
                  <td className="px-4 py-2">
                    <Link className="text-brand-primary hover:underline" to={`/app/merchandising/styles/${row.style_id}`}>
                      {row.style_code} · {row.style_name}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{row.lifecycle_stage}</td>
                  <td className="px-4 py-2 text-right">{row.open_followup_actions}</td>
                  <td className="px-4 py-2 text-right">{row.overdue_followup_actions}</td>
                  <td className="px-4 py-2 text-right">{row.invoice_amount}</td>
                  <td className="px-4 py-2 text-right">{row.received_amount}</td>
                  <td className="px-4 py-2 text-right text-status-danger">{row.due_amount}</td>
                  <td className="px-4 py-2">{row.next_due_at ? new Date(row.next_due_at).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-2">{row.last_event_at ? new Date(row.last_event_at).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
