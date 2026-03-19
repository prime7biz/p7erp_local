import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type ExportCaseRow } from "@/api/client";

export function ExportCasesPage() {
  const [items, setItems] = useState<ExportCaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.listExportCases();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setItems([]);
      setError(e instanceof Error ? e.message : "Failed to load export cases");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
          <div className="overflow-x-auto overflow-y-visible">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle border-b border-border text-left text-text-muted">
                <tr>
                  <th className="py-2 px-4">Code</th>
                  <th className="py-2 px-4">Status</th>
                  <th className="py-2 px-4">Order ID</th>
                  <th className="py-2 px-4">Trade Case</th>
                  <th className="py-2 px-4">Created</th>
                  <th className="py-2 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="py-2 px-4 font-medium text-text-primary">{row.reference ?? row.case_code ?? `#${row.id}`}</td>
                    <td className="py-2 px-4 text-text-secondary">{row.status ?? "—"}</td>
                    <td className="py-2 px-4 text-text-secondary">
                      {row.order_id != null ? (
                        <Link to={`/app/orders/${row.order_id}`} className="text-brand-primary hover:underline">
                          #{row.order_id}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
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
                    <td className="relative py-2 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setOpenActionsId((prev) => (prev === row.id ? null : row.id))}
                        className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                      >
                        Actions
                      </button>
                      {openActionsId === row.id && (
                        <div className="absolute right-4 z-10 mt-1 w-40 rounded-lg border border-border bg-white p-1 shadow-lg">
                          {row.order_id != null && (
                            <Link
                              to={`/app/orders/${row.order_id}`}
                              onClick={() => setOpenActionsId(null)}
                              className="block rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                            >
                              View order
                            </Link>
                          )}
                          {row.trade_case_id != null && (
                            <Link
                              to={`/app/trade/cases/${row.trade_case_id}`}
                              onClick={() => setOpenActionsId(null)}
                              className="block rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                            >
                              View trade case
                            </Link>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
