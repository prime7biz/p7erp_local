import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { logApiError } from "@/utils/logApiError";
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
      <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-status-success-subtle text-status-success-foreground border border-status-success/30">
        On target
      </span>
    );
  if (abs <= tolerancePct)
    return (
      <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-status-warning-subtle text-status-warning-foreground border border-status-warning/30">
        Minor variance
      </span>
    );
  return (
    <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-status-danger-subtle text-status-danger-foreground border border-status-danger/20">
      Exceeds tolerance
    </span>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-surface-raised shadow-sm p-4 animate-pulse">
      <div className="h-3 w-20 bg-border-subtle rounded mb-2" />
      <div className="h-7 w-24 bg-border-subtle rounded" />
    </div>
  );
}

function SkeletonTable() {
  return (
    <div className="rounded-xl border border-border bg-surface-raised overflow-hidden animate-pulse">
      <div className="h-10 bg-surface-subtle border-b border-border" />
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="h-12 border-b border-border-subtle last:border-0 flex gap-4 px-4 items-center">
          <div className="h-4 bg-border-subtle rounded w-32" />
          <div className="h-4 bg-border-subtle rounded w-16" />
          <div className="h-4 bg-border-subtle rounded w-20" />
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
  const [ordersLoadError, setOrdersLoadError] = useState("");

  useEffect(() => {
    api
      .listOrders()
      .then((list) => {
        setOrders(list);
        setOrdersLoadError("");
      })
      .catch((e) => {
        logApiError("ConsumptionReconciliationPage.listOrders", e);
        setOrders([]);
        setOrdersLoadError("Could not load the order list. Try refreshing the page.");
      });
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
          <h1 className="text-2xl font-bold text-brand-primary">Consumption Reconciliation</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Compare BOM planned vs. actual material consumption per order
          </p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-muted">Order</label>
            <div className="flex flex-col gap-1">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Search order or style..."
                className="rounded-lg border border-border-strong px-3 py-2 text-sm w-48 focus:ring-2 focus:ring-focus-ring/20 focus:border-brand-primary"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
              />
              <select
                className="rounded-lg border border-border-strong px-3 py-2 text-sm min-w-[200px] focus:ring-2 focus:ring-focus-ring/20 focus:border-brand-primary"
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
            {ordersLoadError && (
              <p className="text-xs text-status-warning-foreground max-w-md">{ordersLoadError}</p>
            )}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-muted">Tolerance</label>
            <select
              className="rounded-lg border border-border-strong px-3 py-2 text-sm focus:ring-2 focus:ring-focus-ring/20 focus:border-brand-primary"
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
                className="self-end rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
              >
                {exporting ? "Exporting…" : "Export Excel"}
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="self-end rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle"
              >
                Print / PDF
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground flex items-center justify-between gap-2">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => { setError(""); load(); }}
            className="text-status-danger-foreground font-medium underline"
          >
            Retry
          </button>
        </div>
      )}

      {!selectedOrderId && (
        <div className="rounded-xl border border-border bg-surface-raised shadow-sm p-16 text-center">
          <p className="text-text-muted font-medium">Select an order to view reconciliation</p>
          <p className="text-sm text-text-muted mt-1">
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
            <div className="rounded-xl border border-border bg-surface-raised shadow-sm p-4">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Order</p>
              <p className="mt-1 text-lg font-semibold text-brand-primary">{data.order.order_code}</p>
              <p className="text-sm text-text-secondary">{data.order.style_code}</p>
              <Link
                to={`/app/orders/${data.order.id}`}
                className="text-xs text-brand-primary hover:underline mt-1 inline-block"
              >
                View order
              </Link>
            </div>
            <div className="rounded-xl border border-border bg-surface-raised shadow-sm p-4">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Total planned</p>
              <p className="mt-1 text-xl font-semibold text-brand-primary">{formatNum(data.summary.total_planned)}</p>
            </div>
            <div className="rounded-xl border border-border bg-surface-raised shadow-sm p-4">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Total actual</p>
              <p className="mt-1 text-xl font-semibold text-brand-primary">{formatNum(data.summary.total_actual)}</p>
            </div>
            <div className="rounded-xl border border-border bg-surface-raised shadow-sm p-4">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Overall variance %</p>
              <p
                className={`mt-1 text-xl font-semibold ${
                  Math.abs(data.summary.overall_variance_pct) <= 2
                    ? "text-status-success"
                    : Math.abs(data.summary.overall_variance_pct) <= tolerancePct
                      ? "text-status-warning"
                      : "text-status-danger"
                }`}
              >
                {data.summary.overall_variance_pct >= 0 ? "+" : ""}
                {data.summary.overall_variance_pct.toFixed(1)}%
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface-raised shadow-sm p-4">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide flex items-center gap-1">
                Items exceeding {tolerancePct}% tolerance
                {data.summary.items_exceeding_tolerance > 0 && (
                  <span className="text-status-danger" aria-hidden>!</span>
                )}
              </p>
              <p
                className={`mt-1 text-xl font-semibold ${
                  data.summary.items_exceeding_tolerance > 0 ? "text-status-danger" : "text-status-success"
                }`}
              >
                {data.summary.items_exceeding_tolerance}
              </p>
            </div>
          </div>

          {/* Variance at a glance - top items by |variance_pct| */}
          {data.items.length > 0 && (
            <div className="rounded-xl border border-border bg-surface-raised shadow-sm p-4">
              <h2 className="text-sm font-semibold text-brand-primary mb-4">Variance at a glance</h2>
              <div className="space-y-3">
                {[...data.items]
                  .sort((a, b) => Math.abs(b.variance_pct) - Math.abs(a.variance_pct))
                  .slice(0, 8)
                  .map((item) => {
                    const maxQ = Math.max(item.planned_qty, item.actual_qty, 1);
                    return (
                      <div key={item.item_id} className="flex items-center gap-4">
                        <span className="text-sm text-text-secondary w-32 truncate" title={item.item_name}>
                          {item.item_code}
                        </span>
                        <div className="flex-1 flex gap-1 items-center">
                          <div
                            className="h-6 bg-status-info-subtle rounded min-w-[4px]"
                            style={{
                              width: `${Math.min(100, (item.planned_qty / maxQ) * 100)}%`,
                              maxWidth: "40%",
                            }}
                            title={`Planned: ${formatNum(item.planned_qty)}`}
                          />
                          <div
                            className="h-6 bg-brand-primary/70 rounded min-w-[4px]"
                            style={{
                              width: `${Math.min(100, (item.actual_qty / maxQ) * 100)}%`,
                              maxWidth: "40%",
                            }}
                            title={`Actual: ${formatNum(item.actual_qty)}`}
                          />
                        </div>
                        <span
                          className={`text-sm font-mono w-16 text-right ${
                            item.variance_pct > 0 ? "text-status-danger" : item.variance_pct < 0 ? "text-status-success" : "text-text-secondary"
                          }`}
                        >
                          {item.variance_pct >= 0 ? "+" : ""}
                          {item.variance_pct.toFixed(1)}%
                        </span>
                      </div>
                    );
                  })}
              </div>
              <p className="text-xs text-text-muted mt-2">Top 8 items by variance %. Blue = planned, primary = actual.</p>
            </div>
          )}

          {/* Line-level detail table */}
          <div className="rounded-xl border border-border bg-surface-raised shadow-sm overflow-hidden">
            <h2 className="text-sm font-semibold text-brand-primary p-4 pb-0">Material variance detail</h2>
            {data.items.length === 0 ? (
              <div className="p-12 text-center text-text-muted">
                <p className="font-medium">No BOM data for this order</p>
                <p className="text-sm mt-1">Ensure the order has a quotation with style and BOM.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[900px] w-full text-sm">
                  <thead className="bg-surface-subtle border-b border-border">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Material</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Unit</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Planned</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Actual</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Variance</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Variance %</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase w-28">Usage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((r: ConsumptionReconciliationRow) => {
                      const exceedsTolerance = Math.abs(r.variance_pct) > tolerancePct;
                      const usagePct = r.planned_qty > 0 ? Math.min((r.actual_qty / r.planned_qty) * 100, 150) : 0;
                      return (
                        <tr
                          key={r.item_id}
                          className={`border-b border-border-subtle last:border-0 hover:bg-surface-subtle/50 ${
                            exceedsTolerance ? "bg-status-danger-subtle/50" : ""
                          }`}
                        >
                          <td className="px-4 py-3 font-medium text-brand-primary">
                            {r.item_code} · {r.item_name}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex rounded px-2 py-0.5 text-xs font-medium bg-surface-subtle text-text-secondary border border-border">
                              {r.material_type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-text-secondary">{r.uom ?? "—"}</td>
                          <td className="px-4 py-3 text-right font-mono text-text-secondary">
                            {formatNum(r.planned_qty)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-text-secondary">
                            {formatNum(r.actual_qty)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-mono ${
                              r.variance > 0 ? "text-status-danger" : r.variance < 0 ? "text-status-success" : "text-text-secondary"
                            }`}
                          >
                            {r.variance > 0 ? "+" : ""}
                            {formatNum(r.variance)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-mono font-semibold ${
                              exceedsTolerance ? "text-status-danger" : Math.abs(r.variance_pct) <= 2 ? "text-status-success" : "text-status-warning"
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
                              className="h-2 rounded-full bg-border-subtle overflow-hidden"
                              role="progressbar"
                              aria-valuenow={usagePct}
                              aria-valuemin={0}
                              aria-valuemax={150}
                            >
                              <div
                                className={`h-full rounded-full ${
                                  usagePct > 105
                                    ? "bg-status-danger"
                                    : usagePct >= 95
                                      ? "bg-status-success"
                                      : "bg-status-info"
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
            <div className="rounded-xl border border-border bg-surface-raised shadow-sm p-4">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">Tolerance bands (current: {tolerancePct}%)</p>
              <div className="flex flex-wrap gap-6 text-sm">
                <span className="inline-flex items-center gap-2">
                  <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-status-success-subtle text-status-success-foreground border border-status-success/30">
                    On target
                  </span>
                  <span className="text-text-secondary">≤2%</span>
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-status-warning-subtle text-status-warning-foreground border border-status-warning/30">
                    Minor variance
                  </span>
                  <span className="text-text-secondary">2%–{tolerancePct}%</span>
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-status-danger-subtle text-status-danger-foreground border border-status-danger/20">
                    Exceeds tolerance
                  </span>
                  <span className="text-text-secondary">&gt;{tolerancePct}%</span>
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
