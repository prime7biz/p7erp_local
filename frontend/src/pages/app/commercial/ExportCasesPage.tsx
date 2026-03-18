import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type ExportCaseRow } from "@/api/client";

export function ExportCasesPage() {
  const [items, setItems] = useState<ExportCaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api
      .listExportCases()
      .then((data) => {
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        if (!cancelled) {
          setItems([]);
          setError(e instanceof Error ? e.message : "Failed to load export cases");
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
        <h1 className="text-2xl font-bold text-text-primary">Export Cases</h1>
        <p className="text-text-muted text-sm mt-0.5">
          View and manage export cases linked to orders and documentation.
        </p>
      </header>

      {error && (
        <div className="rounded-lg bg-status-danger-subtle border border-status-danger/20 px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-text-muted">Loading export cases…</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-text-muted">No data</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle border-b border-border text-left text-text-muted">
              <tr>
                <th className="py-2 px-4">Code</th>
                <th className="py-2 px-4">Status</th>
                <th className="py-2 px-4">Order ID</th>
                <th className="py-2 px-4">Trade Case</th>
                <th className="py-2 px-4">Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="py-2 px-4 font-medium text-text-primary">{row.reference ?? row.case_code ?? `#${row.id}`}</td>
                  <td className="py-2 px-4 text-text-secondary">{row.status ?? "—"}</td>
                  <td className="py-2 px-4 text-text-secondary">{row.order_id != null ? row.order_id : "—"}</td>
                  <td className="py-2 px-4 text-text-secondary">
                    {row.trade_case_id ? (
                      <Link to={`/app/trade/cases/${row.trade_case_id}`} className="text-brand-primary hover:underline">
                        #{row.trade_case_id}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 px-4 text-text-secondary">
                    {row.created_at ? new Date(row.created_at).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
