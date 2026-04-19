import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type TenantOverviewReport } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

const PREFIX = "/app/reports";
const MERCH_APP = "/app/merchandising";

type Tile = { href: string; label: string; group: string };

const TILES: Tile[] = [
  { group: "Merchandising", href: `${PREFIX}/merchandising`, label: "Merchandising overview (tenant + KPIs)" },
  { group: "Merchandising", href: `${MERCH_APP}/control-tower`, label: "Merch control tower" },
  { group: "Merchandising", href: `${MERCH_APP}/pipeline`, label: "Order pipeline" },
  { group: "Merchandising", href: `${MERCH_APP}/pipeline-analytics`, label: "Pipeline analytics" },
  { group: "Merchandising", href: `${MERCH_APP}/samples`, label: "Sample development" },
  { group: "Merchandising", href: `${MERCH_APP}/alerts`, label: "Critical alerts" },
  { group: "Merchandising", href: `${MERCH_APP}/wastage-report`, label: "Wastage report" },
  { group: "Merchandising", href: `${MERCH_APP}/consumption-reconciliation`, label: "Consumption reconciliation" },
  { group: "Merchandising", href: `${PREFIX}/style-360`, label: "Style 360" },
  { group: "Operations", href: `${PREFIX}/purchase-orders`, label: "Purchase orders" },
  { group: "Operations", href: `${PREFIX}/grn`, label: "GRN summary" },
  { group: "Operations", href: `${PREFIX}/sales-orders`, label: "Sales orders" },
  { group: "Commercial", href: `${PREFIX}/lc-outstanding`, label: "LC outstanding" },
  { group: "Commercial", href: `${PREFIX}/btb-maturity`, label: "BTB LC maturity" },
  { group: "Commercial", href: `${PREFIX}/shipments`, label: "Shipment tracking" },
  { group: "Commercial", href: `${PREFIX}/trade-overview`, label: "Trade overview" },
  { group: "Manufacturing", href: `${PREFIX}/production-efficiency`, label: "Production efficiency" },
  { group: "Manufacturing", href: `${PREFIX}/qc-summary`, label: "QC summary" },
  { group: "HR", href: `${PREFIX}/employee`, label: "Employee summary" },
  { group: "HR", href: `${PREFIX}/payroll`, label: "Payroll summary" },
  { group: "Inventory", href: `${PREFIX}/gate-passes`, label: "Gate pass register" },
  { group: "Inventory", href: `${PREFIX}/challans`, label: "Delivery challans" },
  { group: "Cross-check", href: `${PREFIX}/reconciliation`, label: "Data reconciliation" },
  { group: "Cross-check", href: `${PREFIX}/exceptions`, label: "Exceptions" },
];

export function ReportsHubPage() {
  const [overview, setOverview] = useState<TenantOverviewReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .getTenantOverview()
      .then((d) => {
        if (!cancelled) setOverview(d);
      })
      .catch((e) => {
        logApiError("ReportsHubPage.getTenantOverview", e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = Array.from(new Set(TILES.map((t) => t.group)));
  const topOrderStatuses = [...(overview?.orders_by_status ?? [])]
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">Reports</h1>
        <p className="text-text-muted text-sm mt-0.5">
          Analytics and operational reports. Tenant snapshot loads below when available.
        </p>
      </header>
      {loading ? (
        <div className="rounded-lg border border-border bg-surface-raised p-6 space-y-3"><div className="h-4 w-1/3 animate-pulse rounded bg-surface-subtle" /><div className="h-6 w-1/4 animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-1/2 animate-pulse rounded bg-surface-subtle" /></div>
      ) : overview ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-surface-raised p-4">
            <div className="text-xs text-text-muted uppercase">Customers</div>
            <div className="text-2xl font-semibold">{overview.customers}</div>
          </div>
          <div className="rounded-lg border border-border bg-surface-raised p-4">
            <div className="text-xs text-text-muted uppercase">Orders</div>
            <div className="text-2xl font-semibold">{overview.orders}</div>
          </div>
          <div className="rounded-lg border border-border bg-surface-raised p-4">
            <div className="text-xs text-text-muted uppercase">Tenant</div>
            <div className="text-sm font-medium truncate">{overview.tenant_name}</div>
          </div>
          <div className="rounded-lg border border-border bg-surface-raised p-4">
            <div className="text-xs text-text-muted uppercase">Report tiles</div>
            <div className="text-2xl font-semibold">{TILES.length}</div>
          </div>
        </div>
      ) : null}

      {!loading && overview ? (
        <div className="rounded-lg border border-border bg-surface-raised p-4">
          <div className="text-xs text-text-muted uppercase">Top Order Status</div>
          {topOrderStatuses.length === 0 ? (
            <div className="mt-2 text-sm text-text-muted">No order status data yet.</div>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {topOrderStatuses.map((row) => (
                <span key={row.status} className="rounded-full border border-border px-2 py-1 text-xs text-text-secondary">
                  {row.status}: {row.count}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {groups.map((g) => (
        <section key={g}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">{g}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TILES.filter((t) => t.group === g).map((t) => (
              <Link
                key={t.href}
                to={t.href}
                className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm transition hover:border-border-strong hover:shadow-md"
              >
                <span className="font-medium text-text-primary">{t.label}</span>
                <span className="mt-2 block text-xs text-brand-primary">Open →</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
