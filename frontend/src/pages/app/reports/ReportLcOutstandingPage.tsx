import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type MasterContractRow } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function ReportLcOutstandingPage() {
  const [rows, setRows] = useState<MasterContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api
      .listMasterContracts(statusFilter ? { status: statusFilter } : undefined)
      .then((data) => {
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        logApiError("ReportLcOutstandingPage.listMasterContracts", e);
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

  const totals = useMemo(() => {
    let amt = 0;
    let util = 0;
    for (const r of rows) {
      amt += Number(r.amount ?? 0);
      util += Number(r.btb_utilized_amount ?? 0);
    }
    return { amount: amt, utilized: util, remaining: amt - util };
  }, [rows]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">LC / Master Contract Exposure</h1>
        <p className="text-text-muted text-sm mt-0.5">
          Export LC and sales contracts: limit, utilization, and remaining capacity.{" "}
          <Link to="/app/commercial/master-contracts" className="text-brand-primary hover:underline">
            Open master contracts
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
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface-raised p-4">
          <div className="text-xs text-text-muted uppercase">Total contract amount</div>
          <div className="text-xl font-semibold">{totals.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface-raised p-4">
          <div className="text-xs text-text-muted uppercase">BTB utilized</div>
          <div className="text-xl font-semibold">{totals.utilized.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface-raised p-4">
          <div className="text-xs text-text-muted uppercase">Remaining (approx.)</div>
          <div className="text-xl font-semibold">{totals.remaining.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
        </div>
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
          <div className="p-12 text-center text-text-muted">No master contracts</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle border-b border-border text-left text-text-muted">
              <tr>
                <th className="py-2 px-4">Reference</th>
                <th className="py-2 px-4">Type</th>
                <th className="py-2 px-4">Buyer</th>
                <th className="py-2 px-4">Bank</th>
                <th className="py-2 px-4">Amount</th>
                <th className="py-2 px-4">Utilized</th>
                <th className="py-2 px-4">%</th>
                <th className="py-2 px-4">Expiry</th>
                <th className="py-2 px-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pct = r.btb_utilization_pct != null ? Number(r.btb_utilization_pct) : null;
                const rem =
                  r.amount != null && r.btb_utilized_amount != null
                    ? Number(r.amount) - Number(r.btb_utilized_amount)
                    : null;
                return (
                  <tr key={r.id} className="border-b border-border-subtle last:border-0">
                    <td className="py-2 px-4 font-medium text-text-primary">{r.reference ?? r.id}</td>
                    <td className="py-2 px-4 text-text-secondary">{r.contract_type ?? "—"}</td>
                    <td className="py-2 px-4 text-text-secondary">{r.buyer_name ?? "—"}</td>
                    <td className="py-2 px-4 text-text-secondary">{r.bank_name ?? "—"}</td>
                    <td className="py-2 px-4 text-text-secondary">
                      {r.amount != null ? Number(r.amount).toLocaleString() : "—"} {r.currency ?? ""}
                    </td>
                    <td className="py-2 px-4 text-text-secondary">
                      {r.btb_utilized_amount != null ? Number(r.btb_utilized_amount).toLocaleString() : "—"}
                    </td>
                    <td className="py-2 px-4 text-text-secondary">
                      {pct != null ? `${pct.toFixed(1)}%` : "—"}
                      {rem != null && !Number.isNaN(rem) ? ` (Δ ${rem.toLocaleString()})` : ""}
                    </td>
                    <td className="py-2 px-4 text-text-secondary">
                      {r.expiry_date ? new Date(r.expiry_date).toLocaleDateString() : "—"}
                    </td>
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
