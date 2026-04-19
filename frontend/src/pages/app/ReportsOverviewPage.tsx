import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type MerchControlTowerSummaryResponse,
  type MerchReportsCatalogResponse,
  type TenantOverviewReport,
  type CustomerPerformanceRow,
} from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function ReportsOverviewPage() {
  const [overview, setOverview] = useState<TenantOverviewReport | null>(null);
  const [customers, setCustomers] = useState<CustomerPerformanceRow[] | null>(null);
  const [merchCatalog, setMerchCatalog] = useState<MerchReportsCatalogResponse | null>(null);
  const [merchTower, setMerchTower] = useState<MerchControlTowerSummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setError(null);
        const [ov, perf, catalog, tower] = await Promise.all([
          api.getTenantOverview(),
          api.getCustomerPerformance(),
          api.getMerchReportsCatalog().catch((e) => {
            logApiError("ReportsOverviewPage.getMerchReportsCatalog", e);
            return null;
          }),
          api.getMerchControlTowerSummary().catch((e) => {
            logApiError("ReportsOverviewPage.getMerchControlTowerSummary", e);
            return null;
          }),
        ]);
        setOverview(ov);
        setCustomers(perf);
        setMerchCatalog(catalog);
        setMerchTower(tower);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load reports");
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Merchandising reports</h1>
          <p className="text-text-muted text-sm mt-0.5">
            Tenant snapshot, customer performance, and shortcuts to merchandising analytics screens.
          </p>
        </div>
      </header>

      {error && (
        <div className="rounded-lg bg-status-danger-subtle border border-status-danger/20 px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}

      {merchTower ? (
        <section>
          <h2 className="text-sm font-semibold text-text-primary mb-3">Merch control tower snapshot</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border border-border bg-surface-raised p-4">
              <div className="text-xs text-text-muted uppercase">Inquiries (action)</div>
              <div className="text-xl font-semibold">{merchTower.inquiries_needing_action.count}</div>
            </div>
            <div className="rounded-lg border border-border bg-surface-raised p-4">
              <div className="text-xs text-text-muted uppercase">Quotations at risk (signals)</div>
              <div className="text-xl font-semibold">
                {merchTower.quotations_at_risk.incomplete_count +
                  merchTower.quotations_at_risk.anomaly_count +
                  merchTower.quotations_at_risk.expiring_soon_count}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-surface-raised p-4">
              <div className="text-xs text-text-muted uppercase">Samples pending</div>
              <div className="text-xl font-semibold">{merchTower.sample_pending}</div>
            </div>
            <div className="rounded-lg border border-border bg-surface-raised p-4">
              <div className="text-xs text-text-muted uppercase">TNA overdue</div>
              <div className="text-xl font-semibold">{merchTower.tna_overdue.count}</div>
            </div>
          </div>
        </section>
      ) : null}

      {merchCatalog && merchCatalog.reports.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold text-text-primary mb-3">Merchandising operations &amp; analytics</h2>
          <p className="text-xs text-text-muted mb-3">
            Open the in-app screen for each KPI. API paths are listed for integrations ({merchCatalog.reports.length}{" "}
            entries).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {merchCatalog.reports.map((r) => (
              <Link
                key={r.key}
                to={r.ui_path}
                className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm transition hover:border-border-strong hover:shadow-md"
              >
                <span className="font-medium text-text-primary">{r.title}</span>
                <span className="mt-1 block text-[11px] text-text-muted font-mono truncate" title={r.api_path}>
                  {r.api_path}
                </span>
                <span className="mt-2 block text-xs text-brand-primary">Open in app →</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-surface-raised shadow-sm shadow-gray-200/60 p-5">
          <h2 className="text-sm font-semibold text-text-primary mb-2">Tenant snapshot</h2>
          {overview ? (
            <dl className="space-y-1 text-sm text-text-secondary">
              <div className="flex justify-between">
                <dt className="text-text-muted">Tenant</dt>
                <dd className="font-medium">{overview.tenant_name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-muted">Customers</dt>
                <dd className="font-medium">{overview.customers}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-muted">Orders</dt>
                <dd className="font-medium">{overview.orders}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-xs text-text-muted">Loading tenant overview…</p>
          )}
        </div>

        <div className="md:col-span-2 rounded-lg border border-border bg-surface-raised shadow-sm shadow-gray-200/60 p-5">
          <h2 className="text-sm font-semibold text-text-primary mb-3">Orders by status</h2>
          {overview && overview.orders_by_status.length > 0 ? (
            <ul className="space-y-1 text-sm text-text-secondary">
              {overview.orders_by_status.map((row) => (
                <li key={row.status} className="flex justify-between">
                  <span className="capitalize">{row.status.toLowerCase()}</span>
                  <span className="font-medium">{row.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-text-muted">No orders yet.</p>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface-raised shadow-sm shadow-gray-200/60 p-5">
        <h2 className="text-sm font-semibold text-text-primary mb-3">Customer performance</h2>
        {customers && customers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-muted">
                  <th className="py-2 pr-4">Customer</th>
                  <th className="py-2 pr-4 text-right">Orders</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((row) => (
                  <tr key={row.customer_id} className="border-b border-border-subtle last:border-0">
                    <td className="py-2 pr-4">{row.customer_name}</td>
                    <td className="py-2 pr-4 text-right font-medium">{row.orders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-text-muted">No customers or orders yet.</p>
        )}
      </section>
    </div>
  );
}
