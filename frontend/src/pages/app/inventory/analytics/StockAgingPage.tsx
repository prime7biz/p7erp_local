import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type StockAgingReport } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";

export function StockAgingPage() {
  const [report, setReport] = useState<StockAgingReport | null>(null);
  const [bucket, setBucket] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setReport(await api.getStockAgingReport({ bucket: bucket || undefined }));
    } catch (e) {
      logApiError("StockAgingPage.load", e);
      setError((e as Error).message);
    }
  }, [bucket]);

  useEffect(() => {
    void load();
  }, [load]);

  const maxVal = useMemo(() => {
    const vals = (report?.buckets || []).map((b) => Number(b.value) || 0);
    return Math.max(...vals, 1);
  }, [report]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title="Stock Aging"
        description="Batch age buckets by receipt date — highlight slow-moving value at risk"
      />
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      {report?.alert ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {report.alert}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <label className="text-sm">
          Bucket
          <select
            className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5"
            value={bucket}
            onChange={(e) => setBucket(e.target.value)}
          >
            <option value="">All</option>
            {["0-30", "31-60", "61-90", "91-180", "181-365", "365+"].map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700"
        >
          Refresh
        </button>
      </div>

      {report ? (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold">Value by aging bucket</h2>
          <div className="mt-3 space-y-2">
            {report.buckets.map((b) => {
              const w = Math.round((100 * (Number(b.value) || 0)) / maxVal);
              return (
                <div key={b.bucket} className="flex items-center gap-3 text-sm">
                  <span className="w-20 text-gray-600">{b.bucket}</span>
                  <div className="h-4 flex-1 rounded bg-gray-100">
                    <div className="h-4 rounded bg-slate-700" style={{ width: `${w}%` }} />
                  </div>
                  <span className="w-28 text-right tabular-nums">{b.value}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Slow-moving (&gt;180d): {report.slow_moving_value_180_plus} · Total: {report.total_value}
          </p>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">Batch</th>
              <th className="px-3 py-2">Receipt</th>
              <th className="px-3 py-2 text-right">Days</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Value</th>
              <th className="px-3 py-2">Bucket</th>
            </tr>
          </thead>
          <tbody>
            {(report?.lines || []).length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                  No open batches to age.
                </td>
              </tr>
            ) : (
              (report?.lines || []).map((r) => (
                <tr key={r.batch_id} className="border-b border-gray-100">
                  <td className="px-3 py-2">
                    {r.item_code} — {r.item_name}
                  </td>
                  <td className="px-3 py-2">{r.batch_number}</td>
                  <td className="px-3 py-2">{r.receipt_date}</td>
                  <td className="px-3 py-2 text-right">{r.days_in_stock}</td>
                  <td className="px-3 py-2 text-right">{r.qty}</td>
                  <td className="px-3 py-2 text-right">{r.value}</td>
                  <td className="px-3 py-2">{r.bucket}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
