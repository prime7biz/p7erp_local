import { useCallback, useEffect, useState } from "react";
import { api, type EoqResult } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";

export function EOQPage() {
  const [rows, setRows] = useState<EoqResult[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setRows(await api.getEoqReport());
    } catch (e) {
      logApiError("EOQPage.load", e);
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title="EOQ Calculator"
        description="Economic order quantity from annual demand, ordering cost, and holding cost"
      />
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2 text-right">Annual demand</th>
              <th className="px-3 py-2 text-right">Ordering cost</th>
              <th className="px-3 py-2 text-right">Holding / unit</th>
              <th className="px-3 py-2 text-right">EOQ</th>
              <th className="px-3 py-2 text-right">Current order qty</th>
              <th className="px-3 py-2 text-right">Est. savings</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                  No items yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.item_id}
                  className={`border-b border-gray-100 ${
                    r.differs_significantly ? "bg-amber-50" : ""
                  }`}
                >
                  <td className="px-3 py-2">
                    {r.item_code} — {r.item_name}
                    {r.differs_significantly ? (
                      <span className="ml-2 text-xs text-amber-800">≠ EOQ</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right">{r.annual_demand}</td>
                  <td className="px-3 py-2 text-right">{r.ordering_cost}</td>
                  <td className="px-3 py-2 text-right">{r.holding_cost_per_unit}</td>
                  <td className="px-3 py-2 text-right font-medium">{r.eoq}</td>
                  <td className="px-3 py-2 text-right">{r.current_order_qty}</td>
                  <td className="px-3 py-2 text-right">{r.estimated_annual_savings}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
