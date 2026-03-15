import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type ConsumptionReconciliationResponse,
  type ConsumptionReconciliationRow,
  type OrderResponse,
} from "@/api/client";

const TOLERANCE_OPTIONS = [2, 5, 10] as const;

function formatNum(n: number) {
  if (n === 0) return "0";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function VarianceBadge({
  variancePct,
  tolerancePct,
}: {
  variancePct: number;
  tolerancePct: number;
}) {
  const abs = Math.abs(variancePct);
  if (abs <= 2)
    return (
      <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 border border-green-200">
        On target
      </span>
    );
  if (abs <= tolerancePct)
    return (
      <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
        Minor variance
      </span>
    );
  return (
    <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800 border border-red-200">
      Exceeds tolerance
    </span>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 animate-pulse">
      <div className="h-3 w-20 bg-gray-200 rounded mb-2" />
      <div className="h-7 w-24 bg-gray-200 rounded" />
    </div>
  );
}

function SkeletonTable() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden animate-pulse">
      <div className="h-10 bg-gray-100 border-b border-gray-200" />
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="h-12 border-b border-gray-100 last:border-0 flex gap-4 px-4 items-center">
          <div className="h-4 bg-gray-200 rounded w-32" />
          <div className="h-4 bg-gray-200 rounded w-16" />
          <div className="h-4 bg-gray-200 rounded w-20" />
        </div>
      ))}
    </div>
  );
}

export function ConsumptionReconciliationPage() {
  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [tolerancePct, setTolerancePct] = useState<number>(5);
  const [data, setData] = useState<ConsumptionReconciliationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [orderSearch, setOrderSearch] = useState("");

  useEffect(() => {
    api.listOrders().then(setOrders).catch(() => setOrders([]));
  }, []);

  const load = useCallback(async () => {
    if (!selectedOrderId.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.getConsumptionReconciliation(Number(selectedOrderId), {
        tolerance_pct: tolerancePct,
      });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load reconciliation");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [selectedOrderId, tolerancePct]);

  useEffect(() => {
    if (selectedOrderId.trim()) load();
    else setData(null);
  }, [selectedOrderId, tolerancePct, load]);

  const handleExport = useCallback(async () => {
    if (!selectedOrderId.trim() || !data) return;
    setExporting(true);
    try {
      const blob = await api.getConsumptionReconciliationExportBlob(Number(selectedOrderId), {
        tolerance_pct: tolerancePct,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `consumption_recon_order_${data.order.order_code || selectedOrderId}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, [selectedOrderId, tolerancePct, data]);

  const filteredOrders = orderSearch.trim()
    ? orders.filter(
        (o) =>
          o.order_code?.toLowerCase().includes(orderSearch.toLowerCase()) ||
          (o.style_name ?? "").toLowerCase().includes(orderSearch.toLowerCase())
      )
    : orders;

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Hero header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Consumption Reconciliation</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Compare BOM planned vs. actual material consumption per order
          </p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Order</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Search order or style..."
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-48 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
              />
              <select
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm min-w-[200px] focus:ring-2 focus:ring-primary/20 focus:border-primary"
                value={selectedOrderId}
                onChange={(e) => setSelectedOrderId(e.target.value)}
              >
                <option value="">Select an order...</option>
                {filteredOrders.slice(0, 200).map((o) => (
                  <option key={o.id} value={String(o.id)}>
                    {o.order_code} — {o.style_name ?? `Order #${o.id}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Tolerance</label>
            <select
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
              value={tolerancePct}
              onChange={(e) => setTolerancePct(Number(e.target.value))}
            >
              {TOLERANCE_OPTIONS.map((p) => (
                <option key={p} value={p}>{p}%</option>
              ))}
            </select>
          </div>
          {data && (
            <>
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
                className="self-end rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {exporting ? "Exporting…" : "Export Excel"}
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="self-end rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Print / PDF
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between gap-2">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => { setError(""); load(); }}
            className="text-red-800 font-medium underline"
          >
            Retry
          </button>
        </div>
      )}

      {!selectedOrderId && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-16 text-center">
          <p className="text-gray-500 font-medium">Select an order to view reconciliation</p>
          <p className="text-sm text-gray-400 mt-1">
            Choose an order from the dropdown above to compare planned vs. actual material usage
          </p>
        </div>
      )}

      {selectedOrderId && (loading || (!data && !error)) && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
          <SkeletonTable />
        </>
      )}

      {selectedOrderId && !loading && data && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Order</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{data.order.order_code}</p>
              <p className="text-sm text-gray-600">{data.order.style_code}</p>
              <Link
                to={`/app/orders/${data.order.id}`}
                className="text-xs text-primary hover:underline mt-1 inline-block"
              >
                View order
              </Link>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total planned</p>
              <p className="mt-1 text-xl font-semibold text-gray-900">{formatNum(data.summary.total_planned)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total actual</p>
              <p className="mt-1 text-xl font-semibold text-gray-900">{formatNum(data.summary.total_actual)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Overall variance %</p>
              <p
                className={`mt-1 text-xl font-semibold ${
                  Math.abs(data.summary.overall_variance_pct) <= 2
                    ? "text-green-600"
                    : Math.abs(data.summary.overall_variance_pct) <= tolerancePct
                      ? "text-amber-600"
                      : "text-red-600"
                }`}
              >
                {data.summary.overall_variance_pct >= 0 ? "+" : ""}
                {data.summary.overall_variance_pct.toFixed(1)}%
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
                Items exceeding {tolerancePct}% tolerance
                {data.summary.items_exceeding_tolerance > 0 && (
                  <span className="text-red-500" aria-hidden>!</span>
                )}
              </p>
              <p
                className={`mt-1 text-xl font-semibold ${
                  data.summary.items_exceeding_tolerance > 0 ? "text-red-600" : "text-green-600"
                }`}
              >
                {data.summary.items_exceeding_tolerance}
              </p>
            </div>
          </div>

          {/* Variance at a glance - top items by |variance_pct| */}
          {data.items.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Variance at a glance</h2>
              <div className="space-y-3">
                {[...data.items]
                  .sort((a, b) => Math.abs(b.variance_pct) - Math.abs(a.variance_pct))
                  .slice(0, 8)
                  .map((item) => {
                    const maxQ = Math.max(item.planned_qty, item.actual_qty, 1);
                    return (
                      <div key={item.item_id} className="flex items-center gap-4">
                        <span className="text-sm text-gray-700 w-32 truncate" title={item.item_name}>
                          {item.item_code}
                        </span>
                        <div className="flex-1 flex gap-1 items-center">
                          <div
                            className="h-6 bg-blue-100 rounded min-w-[4px]"
                            style={{
                              width: `${Math.min(100, (item.planned_qty / maxQ) * 100)}%`,
                              maxWidth: "40%",
                            }}
                            title={`Planned: ${formatNum(item.planned_qty)}`}
                          />
                          <div
                            className="h-6 bg-primary/70 rounded min-w-[4px]"
                            style={{
                              width: `${Math.min(100, (item.actual_qty / maxQ) * 100)}%`,
                              maxWidth: "40%",
                            }}
                            title={`Actual: ${formatNum(item.actual_qty)}`}
                          />
                        </div>
                        <span
                          className={`text-sm font-mono w-16 text-right ${
                            item.variance_pct > 0 ? "text-red-600" : item.variance_pct < 0 ? "text-green-600" : "text-gray-600"
                          }`}
                        >
                          {item.variance_pct >= 0 ? "+" : ""}
                          {item.variance_pct.toFixed(1)}%
                        </span>
                      </div>
                    );
                  })}
              </div>
              <p className="text-xs text-gray-500 mt-2">Top 8 items by variance %. Blue = planned, primary = actual.</p>
            </div>
          )}

          {/* Line-level detail table */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <h2 className="text-sm font-semibold text-gray-900 p-4 pb-0">Material variance detail</h2>
            {data.items.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <p className="font-medium">No BOM data for this order</p>
                <p className="text-sm mt-1">Ensure the order has a quotation with style and BOM.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[900px] w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Planned</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actual</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Variance</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Variance %</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-28">Usage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((r: ConsumptionReconciliationRow) => {
                      const exceedsTolerance = Math.abs(r.variance_pct) > tolerancePct;
                      const usagePct = r.planned_qty > 0 ? Math.min((r.actual_qty / r.planned_qty) * 100, 150) : 0;
                      return (
                        <tr
                          key={r.item_id}
                          className={`border-b border-gray-100 last:border-0 hover:bg-gray-50/50 ${
                            exceedsTolerance ? "bg-red-50/50" : ""
                          }`}
                        >
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {r.item_code} · {r.item_name}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex rounded px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                              {r.material_type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{r.uom ?? "—"}</td>
                          <td className="px-4 py-3 text-right font-mono text-gray-700">
                            {formatNum(r.planned_qty)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-gray-700">
                            {formatNum(r.actual_qty)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-mono ${
                              r.variance > 0 ? "text-red-600" : r.variance < 0 ? "text-green-600" : "text-gray-600"
                            }`}
                          >
                            {r.variance > 0 ? "+" : ""}
                            {formatNum(r.variance)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-mono font-semibold ${
                              exceedsTolerance ? "text-red-600" : Math.abs(r.variance_pct) <= 2 ? "text-green-600" : "text-amber-600"
                            }`}
                          >
                            {r.variance_pct >= 0 ? "+" : ""}
                            {r.variance_pct.toFixed(1)}%
                          </td>
                          <td className="px-4 py-3 text-center">
                            <VarianceBadge variancePct={r.variance_pct} tolerancePct={tolerancePct} />
                          </td>
                          <td className="px-4 py-3 w-28">
                            <div
                              className="h-2 rounded-full bg-gray-200 overflow-hidden"
                              role="progressbar"
                              aria-valuenow={usagePct}
                              aria-valuemin={0}
                              aria-valuemax={150}
                            >
                              <div
                                className={`h-full rounded-full ${
                                  usagePct > 105
                                    ? "bg-red-500"
                                    : usagePct >= 95
                                      ? "bg-green-500"
                                      : "bg-blue-500"
                                }`}
                                style={{ width: `${usagePct}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Legend */}
          {data.items.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Tolerance bands (current: {tolerancePct}%)</p>
              <div className="flex flex-wrap gap-6 text-sm">
                <span className="inline-flex items-center gap-2">
                  <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                    On target
                  </span>
                  <span className="text-gray-600">≤2%</span>
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                    Minor variance
                  </span>
                  <span className="text-gray-600">2%–{tolerancePct}%</span>
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800 border border-red-200">
                    Exceeds tolerance
                  </span>
                  <span className="text-gray-600">&gt;{tolerancePct}%</span>
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
