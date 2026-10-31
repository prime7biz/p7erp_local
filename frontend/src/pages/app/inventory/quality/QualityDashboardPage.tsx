import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type InventoryQualityDashboardResponse } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";

export function QualityDashboardPage() {
  const [data, setData] = useState<InventoryQualityDashboardResponse | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await api.getInventoryQualityDashboard());
    } catch (e) {
      logApiError("QualityDashboardPage.load", e);
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title="Quality Dashboard"
        description="GRN inspection backlog, pass/fail rates, and vendor alerts (last 30 days)"
      />
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="flex flex-wrap gap-3 text-sm">
        <Link to="/app/inventory/grn-inspection" className="underline text-slate-700">
          GRN inspections
        </Link>
        <Link to="/app/inventory/vendor-scorecard" className="underline text-slate-700">
          Vendor scorecard
        </Link>
      </div>

      {!data ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs uppercase text-amber-800">Pending inspections</p>
              <p className="mt-1 text-2xl font-semibold text-amber-950">{data.pending_count}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs uppercase text-emerald-800">Pass rate (30d)</p>
              <p className="mt-1 text-2xl font-semibold text-emerald-950">{data.pass_rate_pct}%</p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-xs uppercase text-red-800">Fail rate (30d)</p>
              <p className="mt-1 text-2xl font-semibold text-red-950">{data.fail_rate_pct}%</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-xs uppercase text-gray-500">Completed (30d)</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900">{data.completed_last_30_days}</p>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Top rejected items</h2>
            {data.top_rejected_items.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">No rejections in the last 30 days.</p>
            ) : (
              <table className="mt-2 w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs text-gray-500">
                    <th className="py-1">Item</th>
                    <th className="py-1 text-right">Rejected qty</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_rejected_items.map((r) => (
                    <tr key={r.item_id} className="border-b border-gray-100">
                      <td className="py-1.5">
                        {r.item_code ?? r.item_id} — {r.item_name ?? ""}
                      </td>
                      <td className="py-1.5 text-right">{r.rejected_qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Vendor alerts (&gt;5% rejection)</h2>
            {data.vendor_alerts.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">No vendor alerts.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {data.vendor_alerts.map((v) => (
                  <li key={v.vendor_id} className="text-red-700">
                    {v.vendor_name ?? `Vendor #${v.vendor_id}`}: {v.rejection_rate_pct}% rejection
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
