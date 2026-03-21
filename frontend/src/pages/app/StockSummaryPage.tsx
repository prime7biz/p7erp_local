import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { api, type StockSummaryRow, type WarehouseResponse } from "@/api/client";
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
  const [warehouses, setWarehouses] = useState<WarehouseResponse[]>([]);
  const [search, setSearch] = useState("");
  const [warehouseId, setWarehouseId] = useState<number | "">("");
  const [hideZero, setHideZero] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("item");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const { isNarrow, view, setView, showCards } = useListViewPreference();

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [sum, wh] = await Promise.all([api.getStockSummary(), api.listWarehouses()]);
      setRows(sum);
      setWarehouses(wh);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stock summary");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = rows;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => r.item_code.toLowerCase().includes(q) || r.item_name.toLowerCase().includes(q));
    }
    if (warehouseId !== "") {
      list = list.filter((r) => r.warehouse_id === warehouseId);
    }
    if (hideZero) {
      list = list.filter((r) => r.on_hand_qty !== 0);
    }
    const dir = sortDir === "asc" ? 1 : -1;
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "item":
          cmp = `${a.item_code} ${a.item_name}`.localeCompare(`${b.item_code} ${b.item_name}`);
          break;
        case "warehouse":
          cmp = (a.warehouse_name ?? "").localeCompare(b.warehouse_name ?? "");
          break;
        case "in":
          cmp = a.in_qty - b.in_qty;
          break;
        case "out":
          cmp = a.out_qty - b.out_qty;
          break;
        case "on_hand":
          cmp = a.on_hand_qty - b.on_hand_qty;
          break;
        default:
          cmp = 0;
      }
      return cmp * dir;
    });
    return sorted;
  }, [rows, search, warehouseId, hideZero, sortKey, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [search, warehouseId, hideZero, sortKey, sortDir, pageSize]);

  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const rangeLabel =
    totalFiltered === 0 ? "0" : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalFiltered)}`;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "item" || key === "warehouse" ? "asc" : "desc");
    }
  };

  const exportCsv = () => {
    const headers = ["item_code", "item_name", "warehouse", "in_qty", "out_qty", "on_hand_qty"];
    const lines = [headers.join(",")];
    for (const r of filtered) {
      const name = `"${r.item_name.replaceAll('"', '""')}"`;
      const wh = `"${(r.warehouse_name ?? "").replaceAll('"', '""')}"`;
      lines.push([r.item_code, name, wh, String(r.in_qty), String(r.out_qty), String(r.on_hand_qty)].join(","));
    }
    downloadCsv(`stock_summary_${new Date().toISOString().slice(0, 10)}.csv`, lines.join("\n"));
  };

  const sortIndicator = (key: SortKey) => (sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "");

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Stock Summary</h1>
          <p className="text-sm text-text-muted">Live stock on hand by item and warehouse.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          {isNarrow ? <InventoryListViewToggle value={view} onChange={setView} /> : null}
          <input
            className={`min-w-0 flex-1 rounded border border-border px-3 py-2 text-sm sm:min-w-[200px] ${touchFieldClass}`}
            placeholder="Search item code or name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className={`w-full rounded border border-border px-3 py-2 text-sm sm:w-auto ${touchFieldClass}`}
            value={warehouseId === "" ? "" : warehouseId}
            onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">All warehouses</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.warehouse_code} — {w.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} />
            Hide zero on-hand
          </label>
          <label className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
            Rows per page
            <select
              className={`rounded border border-border px-2 py-1 text-sm ${touchFieldClass}`}
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
          <button
            type="button"
            className={`rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle ${touchFieldClass}`}
            onClick={exportCsv}
          >
            Export CSV
          </button>
        </div>
      </div>
      {error ? <InventoryErrorPanel message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <InventoryTableSkeleton rows={10} cols={5} />
      ) : !filtered.length ? (
        <InventoryEmptyState
          title={rows.length ? "No rows match your filters" : "No stock data yet"}
          description={
            rows.length
              ? "Try clearing search, choosing “All warehouses”, or unchecking “Hide zero on-hand”."
              : "Receive or adjust stock to see balances here."
          }
        />
      ) : showCards ? (
        <div className="space-y-3">
          {paginated.map((row) => (
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
              {paginated.map((row) => (
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
      {!loading && totalFiltered > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-text-muted">
            Showing <span className="font-medium text-text-secondary">{rangeLabel}</span> of{" "}
            <span className="font-medium text-text-secondary">{totalFiltered}</span> row{totalFiltered === 1 ? "" : "s"} · Page {page} of {totalPages}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-[44px] min-w-[100px] touch-manipulation sm:min-h-9"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-[44px] min-w-[100px] touch-manipulation sm:min-h-9"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
      <p className="text-xs text-text-muted">
        Tip: see valuation at <Link className="text-status-info hover:underline" to="/app/inventory/stock-valuation">Stock Valuation</Link> using item default cost.
      </p>
    </div>
  );
}
