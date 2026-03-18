import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api, type TradeCaseDashboardResponse, type TradeCaseRow } from "@/api/client";

export function TradeDashboardPage() {
  const [summary, setSummary] = useState<TradeCaseDashboardResponse | null>(null);
  const [riskCases, setRiskCases] = useState<TradeCaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const s = await api.getTradeDashboardSummary();
        setSummary(s);
        if (s.at_risk_case_ids.length > 0) {
          const allCases = await api.listTradeCases({ limit: 200 });
          const mapped = allCases.filter((c) => s.at_risk_case_ids.includes(c.id));
          setRiskCases(mapped);
        } else {
          setRiskCases([]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load trade control tower");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  if (loading) return <div className="p-6 text-sm text-text-muted">Loading control tower...</div>;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Trade Control Tower</h1>
          <p className="mt-0.5 text-sm text-text-muted">
            Monitor open trade cases, shipment risks, missing documents, and settlement progress.
          </p>
        </div>
        <Link
          to="/app/trade/cases"
          className="rounded-xl border border-border-strong bg-surface-raised px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle"
        >
          Open Trade Cases
        </Link>
      </header>

      {error && (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-text-muted">Total Cases</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">{summary?.total_cases ?? 0}</p>
        </div>
        <div className="rounded-xl border border-brand-primary/30 bg-brand-primary/10/70 p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-text-muted">Open Cases</p>
          <p className="mt-1 text-2xl font-semibold text-brand-primary">{summary?.open_cases ?? 0}</p>
        </div>
        <div className="rounded-xl border border-status-success/30 bg-status-success-subtle/70 p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-text-muted">Shipped Cases</p>
          <p className="mt-1 text-2xl font-semibold text-status-success-foreground">{summary?.shipped_cases ?? 0}</p>
        </div>
        <div className="rounded-xl border border-status-success/30 bg-status-success-subtle/70 p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-text-muted">Settled Cases</p>
          <p className="mt-1 text-2xl font-semibold text-status-success-foreground">{summary?.settled_cases ?? 0}</p>
        </div>
        <div className="rounded-xl border border-status-warning/30 bg-status-warning-subtle/70 p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-text-muted">Cases Missing Docs</p>
          <p className="mt-1 text-2xl font-semibold text-status-warning-foreground">{summary?.missing_docs_cases ?? 0}</p>
        </div>
        <div className="rounded-xl border border-status-danger/20 bg-status-danger-subtle/70 p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-text-muted">Overdue Shipments</p>
          <p className="mt-1 text-2xl font-semibold text-status-danger-foreground">{summary?.overdue_shipments ?? 0}</p>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface-raised shadow-sm overflow-hidden">
        <div className="border-b border-border bg-surface-subtle px-4 py-2">
          <h2 className="text-sm font-semibold text-text-primary">At-Risk Cases</h2>
        </div>
        {riskCases.length === 0 ? (
          <div className="p-6 text-sm text-text-muted">No at-risk cases in current summary.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle text-left text-text-secondary">
                <tr>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Direction</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {riskCases.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-2.5 font-medium text-text-primary">{row.reference}</td>
                    <td className="px-4 py-2.5">{row.direction}</td>
                    <td className="px-4 py-2.5">{row.current_stage}</td>
                    <td className="px-4 py-2.5">{row.status}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        to={`/app/trade/cases/${row.id}`}
                        className="rounded border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
