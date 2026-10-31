import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type VendorScorecardRow } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";

export function VendorScorecardPage() {
  const [days, setDays] = useState(90);
  const [rows, setRows] = useState<VendorScorecardRow[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setRows(await api.getVendorQualityScorecard(days));
    } catch (e) {
      logApiError("VendorScorecardPage.load", e);
      setError((e as Error).message);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title="Vendor Quality Scorecard"
        description="GRN inspection counts, rejection rates, and alerts for vendors over 5% rejection"
      />
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <label className="text-sm">
          Window (days)
          <input
            type="number"
            className="mt-1 block w-28 rounded-lg border border-gray-300 px-2 py-1.5"
            value={days}
            onChange={(e) => setDays(Number(e.target.value) || 90)}
          />
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700"
        >
          Refresh
        </button>
        <Link to="/app/inventory/quality-dashboard" className="text-sm text-slate-700 underline">
          Dashboard
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2">Vendor</th>
              <th className="px-3 py-2 text-right">Inspections</th>
              <th className="px-3 py-2 text-right">Received</th>
              <th className="px-3 py-2 text-right">Rejected</th>
              <th className="px-3 py-2 text-right">Accepted</th>
              <th className="px-3 py-2 text-right">Rejection %</th>
              <th className="px-3 py-2">Alert</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                  No completed QC inspections in this window.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.vendor_id} className="border-b border-gray-100">
                  <td className="px-3 py-2 font-medium">{r.vendor_name ?? `#${r.vendor_id}`}</td>
                  <td className="px-3 py-2 text-right">{r.inspection_count}</td>
                  <td className="px-3 py-2 text-right">{r.received_qty}</td>
                  <td className="px-3 py-2 text-right">{r.rejected_qty}</td>
                  <td className="px-3 py-2 text-right">{r.accepted_qty}</td>
                  <td className="px-3 py-2 text-right">{r.rejection_rate_pct}%</td>
                  <td className="px-3 py-2">
                    {r.alert ? (
                      <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">&gt;5%</span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
