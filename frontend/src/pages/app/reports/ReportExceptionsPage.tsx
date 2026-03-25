import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type MerchAlertItem, type TradeCaseRow } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function ReportExceptionsPage() {
  const [alerts, setAlerts] = useState<MerchAlertItem[]>([]);
  const [tradeCases, setTradeCases] = useState<TradeCaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.getMerchAlerts({ status: "OPEN", page_size: 100, page: 1 }),
      api.listTradeCases({ status: "OPEN", limit: 100 }),
    ])
      .then(([a, tc]) => {
        if (!cancelled) {
          setAlerts(a.items ?? []);
          setTradeCases(Array.isArray(tc) ? tc : []);
        }
      })
      .catch((e) => {
        logApiError("ReportExceptionsPage", e);
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
        <h1 className="text-2xl font-bold text-text-primary">Exceptions & Open Items</h1>
        <p className="text-text-muted text-sm mt-0.5">Open merchandising alerts and open trade cases.</p>
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
          <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
            <h2 className="border-b border-border px-4 py-2 text-sm font-semibold">Merch alerts (open)</h2>
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle text-left text-text-muted">
                <tr>
                  <th className="py-2 px-4">Severity</th>
                  <th className="py-2 px-4">Title</th>
                  <th className="py-2 px-4">Type</th>
                  <th className="py-2 px-4">Order</th>
                  <th className="py-2 px-4">SLA</th>
                </tr>
              </thead>
              <tbody>
                {alerts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-text-muted">
                      No open alerts
                    </td>
                  </tr>
                ) : (
                  alerts.map((x) => (
                    <tr key={x.id} className="border-b border-border-subtle">
                      <td className="py-2 px-4">{x.severity}</td>
                      <td className="py-2 px-4">{x.title}</td>
                      <td className="py-2 px-4">{x.alert_type}</td>
                      <td className="py-2 px-4">
                        {x.order_id != null ? (
                          <Link to={`/app/orders/${x.order_id}`} className="text-brand-primary hover:underline">
                            {x.order_code ?? x.order_id}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2 px-4">{x.sla_bucket ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
            <h2 className="border-b border-border px-4 py-2 text-sm font-semibold">Trade cases (open)</h2>
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle text-left text-text-muted">
                <tr>
                  <th className="py-2 px-4">Reference</th>
                  <th className="py-2 px-4">Stage</th>
                  <th className="py-2 px-4">ETD</th>
                  <th className="py-2 px-4">Link</th>
                </tr>
              </thead>
              <tbody>
                {tradeCases.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-text-muted">
                      No open trade cases
                    </td>
                  </tr>
                ) : (
                  tradeCases.map((t) => (
                    <tr key={t.id} className="border-b border-border-subtle">
                      <td className="py-2 px-4 font-medium">{t.reference}</td>
                      <td className="py-2 px-4">{t.current_stage}</td>
                      <td className="py-2 px-4">{t.etd ? new Date(t.etd).toLocaleDateString() : "—"}</td>
                      <td className="py-2 px-4">
                        <Link to={`/app/trade/cases/${t.id}`} className="text-brand-primary hover:underline">
                          View
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
