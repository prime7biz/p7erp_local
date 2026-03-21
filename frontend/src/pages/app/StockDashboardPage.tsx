import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type StockDashboardResponse } from "@/api/client";
import {
  InventoryErrorPanel,
  InventoryKpiStripSkeleton,
  InventoryTableSkeleton,
} from "@/components/inventory/InventoryListStates";
import { inventoryScrollTableClass, touchFieldClass } from "@/components/inventory/InventoryMobileList";

export function StockDashboardPage() {
  const [data, setData] = useState<StockDashboardResponse | null>(null);
  const [threshold, setThreshold] = useState(10);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api.getStockDashboard({ low_stock_threshold: threshold }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [threshold]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Stock Dashboard</h1>
          <p className="text-sm text-text-muted">
            Open purchase orders, GRNs to receive, low-stock lines (by threshold), and recent movements.
          </p>
        </div>
        <label className="flex flex-col gap-0.5 text-xs text-text-muted">
          Low-stock threshold (on-hand &lt; this and &gt; 0)
          <input
            type="number"
            min={0}
            step={0.001}
            className={`w-full max-w-[200px] rounded border border-border px-2 py-1.5 text-sm sm:w-32 ${touchFieldClass}`}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value) || 0)}
          />
        </label>
      </div>

      {error ? <InventoryErrorPanel message={error} onRetry={() => void load()} /> : null}
      {loading && (
        <div className="space-y-6">
          <InventoryKpiStripSkeleton cards={4} />
          <div>
            <div className="mb-2 h-7 w-48 animate-pulse rounded bg-surface-subtle" />
            <InventoryTableSkeleton rows={6} cols={6} />
          </div>
        </div>
      )}

      {data && !loading && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
              <p className="text-xs font-medium uppercase text-text-muted">Open POs</p>
              <p className="mt-1 text-2xl font-semibold text-text-primary">{data.open_purchase_orders}</p>
              <Link className="mt-2 inline-block text-xs text-status-info hover:underline" to="/app/inventory/purchase-orders">
                View purchase orders
              </Link>
            </div>
            <div className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
              <p className="text-xs font-medium uppercase text-text-muted">GRNs pending</p>
              <p className="mt-1 text-2xl font-semibold text-text-primary">{data.grns_pending_receive}</p>
              <Link className="mt-2 inline-block text-xs text-status-info hover:underline" to="/app/inventory/goods-receiving">
                View GRNs
              </Link>
            </div>
            <div className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
              <p className="text-xs font-medium uppercase text-text-muted">SKUs in stock</p>
              <p className="mt-1 text-2xl font-semibold text-text-primary">{data.skus_with_positive_stock}</p>
              <Link className="mt-2 inline-block text-xs text-status-info hover:underline" to="/app/inventory/stock-summary">
                Stock summary
              </Link>
            </div>
            <div className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
              <p className="text-xs font-medium uppercase text-text-muted">Low stock lines</p>
              <p className="mt-1 text-2xl font-semibold text-amber-700">{data.low_stock_lines}</p>
              <p className="mt-2 text-[11px] text-text-muted">Threshold: {data.low_stock_threshold}</p>
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold text-text-primary">Recent movements</h2>
            <div className={`rounded-xl border border-border bg-surface-raised ${inventoryScrollTableClass}`}>
              <table className="min-w-[800px] w-full">
                <thead className="bg-surface-subtle">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Date</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Type</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Item</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Warehouse</th>
                    <th className="px-3 py-2 text-right text-xs font-medium uppercase text-text-muted">Qty</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Ref</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {data.recent_movements.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-sm text-text-muted">
                        No recent movements in the selected window.
                      </td>
                    </tr>
                  ) : (
                    data.recent_movements.map((row) => (
                      <tr key={row.id}>
                        <td className="px-3 py-2 text-sm">{row.movement_date ? new Date(row.movement_date).toLocaleDateString() : "—"}</td>
                        <td className="px-3 py-2 text-sm">{row.movement_type}</td>
                        <td className="px-3 py-2 text-sm">
                          {row.item_code} — {row.item_name}
                        </td>
                        <td className="px-3 py-2 text-sm">{row.warehouse_name ?? "—"}</td>
                        <td className="px-3 py-2 text-right text-sm">{row.quantity}</td>
                        <td className="px-3 py-2 text-sm text-text-secondary">
                          {row.reference_type ?? "—"} {row.reference_id ?? ""}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-text-muted">
              <Link className="text-status-info hover:underline" to="/app/inventory/stock-ledger">
                Open full ledger
              </Link>
            </p>
          </div>
        </>
      )}
    </div>
  );
}
