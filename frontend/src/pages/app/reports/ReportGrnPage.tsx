import { useEffect, useState } from "react";
import { api, type ReportGrnRow } from "@/api/client";

export function ReportGrnPage() {
  const [rows, setRows] = useState<ReportGrnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api
      .getReportGrn({ limit: 100 })
      .then((data) => {
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        if (!cancelled) {
          setRows([]);
          setError(e instanceof Error ? e.message : "Failed to load report");
        }
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
        <h1 className="text-2xl font-bold text-text-primary">GRN Summary</h1>
        <p className="text-text-muted text-sm mt-0.5">
          Goods receiving notes summary.
        </p>
      </header>
      {error && (
        <div className="rounded-lg bg-status-danger-subtle border border-status-danger/20 px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}
      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-text-muted">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-text-muted">No data</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle border-b border-border text-left text-text-muted">
              <tr>
                <th className="py-2 px-4">GRN Code</th>
                <th className="py-2 px-4">PO ID</th>
                <th className="py-2 px-4">Received Date</th>
                <th className="py-2 px-4">Status</th>
                <th className="py-2 px-4">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border-subtle last:border-0">
                  <td className="py-2 px-4 font-medium text-text-primary">{r.grn_code}</td>
                  <td className="py-2 px-4 text-text-secondary">{r.purchase_order_id ?? "—"}</td>
                  <td className="py-2 px-4 text-text-secondary">{r.received_date ? new Date(r.received_date).toLocaleDateString() : "—"}</td>
                  <td className="py-2 px-4 text-text-secondary">{r.status}</td>
                  <td className="py-2 px-4 text-text-secondary">{r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
