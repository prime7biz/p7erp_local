import { useEffect, useMemo, useState } from "react";
import { api, type DeliveryChallanResponse } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function ReportChallansPage() {
  const [rows, setRows] = useState<DeliveryChallanResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listDeliveryChallans({ status_filter: statusFilter || undefined })
      .then((data) => {
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        logApiError("ReportChallansPage", e);
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [statusFilter]);

  const summary = useMemo(() => {
    let posted = 0;
    let draft = 0;
    for (const r of rows) {
      const s = (r.status ?? "").toUpperCase();
      if (s === "POSTED") posted += 1;
      else draft += 1;
    }
    return { posted, draft, total: rows.length };
  }, [rows]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">Delivery Challans Report</h1>
        <p className="text-text-muted text-sm mt-0.5">Outbound delivery challans and line counts.</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface-raised p-4">
          <div className="text-xs text-text-muted uppercase">Total</div>
          <div className="text-xl font-semibold">{summary.total}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface-raised p-4">
          <div className="text-xs text-text-muted uppercase">Posted</div>
          <div className="text-xl font-semibold text-emerald-800">{summary.posted}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface-raised p-4">
          <div className="text-xs text-text-muted uppercase">Other / draft</div>
          <div className="text-xl font-semibold">{summary.draft}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-text-muted">Status</label>
        <input
          className="rounded border border-border-strong px-2 py-1 text-sm"
          placeholder="Filter (optional)"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        />
      </div>
      {error && (
        <div className="rounded-lg bg-status-danger-subtle border border-status-danger/20 px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}
      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        {loading ? (
          <div className="space-y-3 p-6"><div className="h-4 w-3/4 animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-full animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-5/6 animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-2/3 animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-4/5 animate-pulse rounded bg-surface-subtle" /></div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-text-muted">No challans</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle border-b border-border text-left text-text-muted">
              <tr>
                <th className="py-2 px-4">Code</th>
                <th className="py-2 px-4">Customer</th>
                <th className="py-2 px-4">Delivery</th>
                <th className="py-2 px-4">Status</th>
                <th className="py-2 px-4">Lines</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border-subtle">
                  <td className="py-2 px-4 font-medium">{r.challan_code}</td>
                  <td className="py-2 px-4">{r.customer_name}</td>
                  <td className="py-2 px-4">{r.delivery_date ? new Date(r.delivery_date).toLocaleDateString() : "—"}</td>
                  <td className="py-2 px-4">{r.status}</td>
                  <td className="py-2 px-4">{r.items?.length ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
