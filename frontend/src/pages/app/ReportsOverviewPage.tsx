import { useEffect, useState } from "react";
import { api, type TenantOverviewReport, type CustomerPerformanceRow } from "@/api/client";

export function ReportsOverviewPage() {
  const [overview, setOverview] = useState<TenantOverviewReport | null>(null);
  const [customers, setCustomers] = useState<CustomerPerformanceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setError(null);
        const [ov, perf] = await Promise.all([
          api.getTenantOverview(),
          api.getCustomerPerformance(),
        ]);
        setOverview(ov);
        setCustomers(perf);
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
          <h1 className="text-2xl font-bold text-gray-900">Merchandising Reports</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Simple overview of your tenant activity and customer performance.
          </p>
        </div>
      </header>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm shadow-gray-200/60 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">Tenant Snapshot</h2>
          {overview ? (
            <dl className="space-y-1 text-sm text-gray-700">
              <div className="flex justify-between">
                <dt className="text-gray-500">Tenant</dt>
                <dd className="font-medium">{overview.tenant_name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Customers</dt>
                <dd className="font-medium">{overview.customers}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Orders</dt>
                <dd className="font-medium">{overview.orders}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-xs text-gray-400">Loading tenant overview…</p>
          )}
        </div>

        <div className="md:col-span-2 rounded-lg border border-gray-200 bg-white shadow-sm shadow-gray-200/60 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Orders by Status</h2>
          {overview && overview.orders_by_status.length > 0 ? (
            <ul className="space-y-1 text-sm text-gray-700">
              {overview.orders_by_status.map((row) => (
                <li key={row.status} className="flex justify-between">
                  <span className="capitalize">{row.status.toLowerCase()}</span>
                  <span className="font-medium">{row.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-400">No orders yet.</p>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white shadow-sm shadow-gray-200/60 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Customer Performance</h2>
        {customers && customers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2 pr-4">Customer</th>
                  <th className="py-2 pr-4 text-right">Orders</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((row) => (
                  <tr key={row.customer_id} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 pr-4">{row.customer_name}</td>
                    <td className="py-2 pr-4 text-right font-medium">{row.orders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-gray-400">No customers or orders yet.</p>
        )}
      </section>
    </div>
  );
}

