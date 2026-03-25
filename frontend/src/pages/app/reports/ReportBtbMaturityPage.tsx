import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type BtbLcRow } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

function daysToMaturity(d: string | null | undefined): number | null {
  if (!d) return null;
  const t = new Date(d).getTime();
  if (Number.isNaN(t)) return null;
  const diff = t - Date.now();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

function bucket(days: number | null): string {
  if (days == null) return "—";
  if (days < 0) return "Overdue";
  if (days <= 30) return "0–30 days";
  if (days <= 60) return "31–60 days";
  if (days <= 90) return "61–90 days";
  return "90+ days";
}

export function ReportBtbMaturityPage() {
  const [rows, setRows] = useState<BtbLcRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api
      .listBtbLcs(statusFilter ? { status: statusFilter } : undefined)
      .then((data) => {
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        logApiError("ReportBtbMaturityPage.listBtbLcs", e);
        if (!cancelled) {
          setRows([]);
          setError(e instanceof Error ? e.message : "Failed to load");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [statusFilter]);

  const buckets = useMemo(() => {
    const m: Record<string, number> = { "0–30 days": 0, "31–60 days": 0, "61–90 days": 0, "90+ days": 0, Overdue: 0, "—": 0 };
    for (const r of rows) {
      const d = daysToMaturity(r.maturity_date ?? null);
      const b = bucket(d);
      m[b] = (m[b] ?? 0) + 1;
    }
    return m;
  }, [rows]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">BTB LC Maturity</h1>
        <p className="text-text-muted text-sm mt-0.5">
          Back-to-back LC maturity and accounting status.{" "}
          <Link to="/app/commercial/btb-lcs" className="text-brand-primary hover:underline">
            Open BTB LCs
          </Link>
        </p>
      </header>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-text-muted">Status</label>
        <input
          className="rounded border border-border-strong px-2 py-1 text-sm"
          placeholder="Filter (optional)"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-5">
        {Object.entries(buckets).map(([k, v]) => (
          <div key={k} className="rounded-lg border border-border bg-surface-raised p-3 text-center">
            <div className="text-xs text-text-muted">{k}</div>
            <div className="text-lg font-semibold">{v}</div>
          </div>
        ))}
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
          <div className="p-12 text-center text-text-muted">No BTB LCs</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle border-b border-border text-left text-text-muted">
              <tr>
                <th className="py-2 px-4">Reference</th>
                <th className="py-2 px-4">Vendor</th>
                <th className="py-2 px-4">Amount</th>
                <th className="py-2 px-4">Maturity</th>
                <th className="py-2 px-4">Days</th>
                <th className="py-2 px-4">Bucket</th>
                <th className="py-2 px-4">Accounting</th>
                <th className="py-2 px-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const days = daysToMaturity(r.maturity_date ?? null);
                return (
                  <tr key={r.id} className="border-b border-border-subtle last:border-0">
                    <td className="py-2 px-4 font-medium text-text-primary">
                      <Link to={`/app/commercial/btb-lcs`} className="text-brand-primary hover:underline">
                        {r.reference ?? r.lc_number ?? r.id}
                      </Link>
                    </td>
                    <td className="py-2 px-4 text-text-secondary">{r.vendor_id != null ? `#${r.vendor_id}` : "—"}</td>
                    <td className="py-2 px-4 text-text-secondary">
                      {r.amount != null ? Number(r.amount).toLocaleString() : "—"} {r.currency ?? ""}
                    </td>
                    <td className="py-2 px-4 text-text-secondary">
                      {r.maturity_date ? new Date(r.maturity_date).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-2 px-4 text-text-secondary">{days != null ? days : "—"}</td>
                    <td className="py-2 px-4 text-text-secondary">{bucket(days)}</td>
                    <td className="py-2 px-4 text-text-secondary">{r.accounting_status ?? "—"}</td>
                    <td className="py-2 px-4 text-text-secondary">{r.status ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
