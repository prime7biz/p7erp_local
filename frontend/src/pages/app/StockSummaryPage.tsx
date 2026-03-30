import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type StockSummaryRow, type WarehouseResponse } from "@/api/client";
import { DataTablePagination } from "@/components/app/DataTablePagination";
import { useListPagination } from "@/hooks/useListPagination";
import {
  InventoryEmptyState,
  InventoryErrorPanel,
  InventoryTableSkeleton,
} from "@/components/inventory/InventoryListStates";
import {
  InventoryListViewToggle,
  inventoryScrollTableClass,
  touchFieldClass,
} from "@/components/inventory/InventoryMobileList";
import { useListViewPreference } from "@/hooks/useInventoryListView";

type SortKey = "item" | "warehouse" | "in" | "out" | "on_hand";

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function StockSummaryPage() {
  const [rows, setRows] = useState<StockSummaryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [warehouses, setWarehouses] = useState<WarehouseResponse[]>([]);
  const [search, setSearch] = useState("");
  const [warehouseId, setWarehouseId] = useState<number | "">("");
  const [hideZero, setHideZero] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("item");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const { page, setPage, pageSize, setPageSize, offset, limit, allowedSizes } = useListPagination();
  const { isNarrow, view, setView, showCards } = useListViewPreference();

  const loadWarehouses = useCallback(async () => {
    try {
      const wh = await api.listWarehouses();
      setWarehouses(wh);
    } catch {
      setWarehouses([]);
    }
  }, []);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const res = await api.getStockSummaryWithTotal({
        limit,
        offset,
        search: search.trim() || undefined,
        warehouse_id: warehouseId === "" ? undefined : warehouseId,
        hide_zero: hideZero,
        sort: sortKey,
        sort_dir: sortDir,
      });
      setRows(res.rows);
      setTotal(res.total ?? res.rows.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stock summary");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [limit, offset, search, warehouseId, hideZero, sortKey, sortDir]);

  useEffect(() => {
    void loadWarehouses();
  }, [loadWarehouses]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleSort = (key: SortKey) => {
    setPage(1);
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "item" || key === "warehouse" ? "asc" : "desc");
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    const headers = ["item_code", "item_name", "warehouse", "in_qty", "out_qty", "on_hand_qty"];
    const lines = [headers.join(",")];
    const chunk = 500;
    let off = 0;
    try {
      for (let i = 0; i < 40; i += 1) {
        const res = await api.getStockSummaryWithTotal({
          limit: chunk,
          offset: off,
          search: search.trim() || undefined,
          warehouse_id: warehouseId === "" ? undefined : warehouseId,
          hide_zero: hideZero,
          sort: sortKey,
          sort_dir: sortDir,
        });
        for (const r of res.rows) {
          const name = `"${r.item_name.replaceAll('"', '""')}"`;
          const wh = `"${(r.warehouse_name ?? "").replaceAll('"', '""')}"`;
          lines.push([r.item_code, name, wh, String(r.in_qty), String(r.out_qty), String(r.on_hand_qty)].join(","));
        }
        if (res.rows.length < chunk) break;
        off += chunk;
      }
      downloadCsv(`stock_summary_${new Date().toISOString().slice(0, 10)}.csv`, lines.join("\n"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const sortIndicator = (key: SortKey) => (sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "");

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Stock Summary</h1>
          <p className="text-sm text-text-muted">Live stock on hand by item and warehouse (server-paged).</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          {isNarrow ? <InventoryListViewToggle value={view} onChange={setView} /> : null}
          <input
            className={`min-w-0 flex-1 rounded border border-border px-3 py-2 text-sm sm:min-w-[200px] ${touchFieldClass}`}
            placeholder="Search item code or name…"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
          />
          <select
            className={`w-full rounded border border-border px-3 py-2 text-sm sm:w-auto ${touchFieldClass}`}
            value={warehouseId === "" ? "" : warehouseId}
            onChange={(e) => {
              setPage(1);
              setWarehouseId(e.target.value ? Number(e.target.value) : "");
            }}
          >
            <option value="">All warehouses</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.warehouse_code} — {w.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={hideZero}
              onChange={(e) => {
                setPage(1);
                setHideZero(e.target.checked);
              }}
            />
            Hide zero on-hand
          </label>
          <button
            type="button"
            disabled={exporting}
            className={`rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle disabled:opacity-50 ${touchFieldClass}`}
            onClick={() => void exportCsv()}
          >
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>
      </div>
      <p className="text-xs text-text-muted">
        Filters and sorting run on the server. Export walks pages (up to ~20k rows) with the same filters.
      </p>
      {error ? <InventoryErrorPanel message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <InventoryTableSkeleton rows={10} cols={5} />
      ) : !rows.length ? (
        <InventoryEmptyState
          title={total > 0 ? "No rows on this page" : "No stock data yet"}
          description={
            total > 0
              ? "Try another page."
              : "Receive or adjust stock to see balances here, or clear filters if nothing matches."
          }
        />
      ) : showCards ? (
        <div className="space-y-3">
          {rows.map((row) => (
            <div
              key={`${row.item_id}-${row.warehouse_id ?? 0}`}
              className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm"
            >
              <div className="font-semibold text-text-primary">
                {row.item_code} — {row.item_name}
              </div>
              <div className="mt-1 text-sm text-text-secondary">{row.warehouse_name ?? "—"}</div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                <div>
                  <div className="text-[10px] font-medium uppercase text-text-muted">In</div>
                  <div className="tabular-nums">{row.in_qty.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[10px] font-medium uppercase text-text-muted">Out</div>
                  <div className="tabular-nums">{row.out_qty.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[10px] font-medium uppercase text-text-muted">On hand</div>
                  <div className="font-semibold tabular-nums">{row.on_hand_qty.toLocaleString()}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={`rounded-xl border border-border bg-surface-raised ${inventoryScrollTableClass}`}>
          <table className="min-w-[640px] w-full">
            <thead className="bg-surface-subtle">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">
                  <button type="button" className="underline-offset-2 hover:underline" onClick={() => toggleSort("item")}>
                    Item{sortIndicator("item")}
                  </button>
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">
                  <button type="button" className="underline-offset-2 hover:underline" onClick={() => toggleSort("warehouse")}>
                    Warehouse{sortIndicator("warehouse")}
                  </button>
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-text-muted">
                  <button type="button" className="underline-offset-2 hover:underline" onClick={() => toggleSort("in")}>
                    In Qty{sortIndicator("in")}
                  </button>
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-text-muted">
                  <button type="button" className="underline-offset-2 hover:underline" onClick={() => toggleSort("out")}>
                    Out Qty{sortIndicator("out")}
                  </button>
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-text-muted">
                  <button type="button" className="underline-offset-2 hover:underline" onClick={() => toggleSort("on_hand")}>
                    On Hand{sortIndicator("on_hand")}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {rows.map((row) => (
                <tr key={`${row.item_id}-${row.warehouse_id ?? 0}`}>
                  <td className="px-3 py-2 text-sm">
                    {row.item_code} - {row.item_name}
                  </td>
                  <td className="px-3 py-2 text-sm">{row.warehouse_name ?? "—"}</td>
                  <td className="px-3 py-2 text-sm text-right">{row.in_qty.toLocaleString()}</td>
                  <td className="px-3 py-2 text-sm text-right">{row.out_qty.toLocaleString()}</td>
                  <td className="px-3 py-2 text-sm text-right font-semibold">{row.on_hand_qty.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && total > 0 ? (
        <DataTablePagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          allowedSizes={allowedSizes}
        />
      ) : null}
      <p className="text-xs text-text-muted">
        Tip: FIFO valuation and group/warehouse summaries:{" "}
        <Link className="text-status-info hover:underline" to="/app/inventory/stock-inventory-summary">
          Inventory Summary (FIFO)
        </Link>
        {" · "}
        <Link className="text-status-info hover:underline" to="/app/inventory/stock-valuation">
          Stock Valuation
        </Link>
        .
      </p>
    </div>
  );
}
