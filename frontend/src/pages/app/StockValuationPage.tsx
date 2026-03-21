import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type StockValuationResponse } from "@/api/client";
import {
  InventoryEmptyState,
  InventoryErrorPanel,
  InventoryValuationSkeleton,
} from "@/components/inventory/InventoryListStates";

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function StockValuationPage() {
  const [data, setData] = useState<StockValuationResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api.getStockValuation());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load valuation");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const csv = useMemo(() => {
    if (!data?.rows.length) return "";
    const headers = ["item_code", "item_name", "warehouse", "on_hand", "unit_cost", "line_value"];
    const lines = [headers.join(",")];
    for (const r of data.rows) {
      const wh = (r.warehouse_name ?? "").replaceAll('"', '""');
      lines.push(
        [
          r.item_code,
          `"${r.item_name.replaceAll('"', '""')}"`,
          `"${wh}"`,
          String(r.on_hand_qty),
          String(r.unit_cost),
          String(r.line_value),
        ].join(","),
      );
    }
    return lines.join("\n");
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Stock Valuation</h1>
          <p className="text-sm text-text-muted">
            Phase 1: <strong>default cost</strong> from item master × on-hand per warehouse (not FIFO). Set default cost on{" "}
            <Link className="text-status-info hover:underline" to="/app/inventory">
              Stock Master → Items
            </Link>
            .
          </p>
        </div>
        {data && !loading && (
          <button
            type="button"
            className="rounded-lg border border-border bg-surface-raised px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle"
            onClick={() => downloadCsv(`stock_valuation_${new Date().toISOString().slice(0, 10)}.csv`, csv)}
          >
            Export CSV
          </button>
        )}
      </div>

      {error ? <InventoryErrorPanel message={error} onRetry={() => void load()} /> : null}
      {loading ? <InventoryValuationSkeleton /> : null}

      {data && !loading && !data.rows.length ? (
        <InventoryEmptyState
          title="No stock to value"
          description="There is no on-hand quantity, or items need default cost on Stock Master."
        />
      ) : null}

      {data && !loading && data.rows.length > 0 ? (
        <>
          <div className="rounded-xl border border-border bg-brand-primary/5 p-4">
            <p className="text-xs font-medium uppercase text-text-muted">Total inventory value ({data.method})</p>
            <p className="text-3xl font-bold text-text-primary">
              {data.total_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-surface-subtle">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Item</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Warehouse</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-text-muted">On hand</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-text-muted">Unit cost</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-text-muted">Line value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.rows.map((row) => (
                  <tr key={`${row.item_id}-${row.warehouse_id ?? 0}`}>
                    <td className="px-3 py-2 text-sm">
                      {row.item_code} — {row.item_name}
                    </td>
                    <td className="px-3 py-2 text-sm">{row.warehouse_name ?? "—"}</td>
                    <td className="px-3 py-2 text-right text-sm">{row.on_hand_qty.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-sm">{row.unit_cost.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-sm font-medium">{row.line_value.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
