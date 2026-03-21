import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type InventoryItemResponse, type StockLedgerRow, type WarehouseResponse } from "@/api/client";
import { Button } from "@/components/ui/button";
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

const PAGE_SIZE = 50;

function fmtQty(n: number) {
  if (Number.isInteger(n)) return String(n);
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export function StockLedgerPage() {
  const [rows, setRows] = useState<StockLedgerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<InventoryItemResponse[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseResponse[]>([]);
  const [itemId, setItemId] = useState<number | "">("");
  const [warehouseId, setWarehouseId] = useState<number | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { isNarrow, view, setView, showCards } = useListViewPreference();

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeLabel = useMemo(() => {
    if (total === 0) return "0";
    const start = (page - 1) * PAGE_SIZE + 1;
    const end = Math.min(page * PAGE_SIZE, total);
    return `${start}–${end}`;
  }, [page, total]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const [ledgerRes, itm, wh] = await Promise.all([
        api.getStockLedger({
          item_id: itemId === "" ? undefined : itemId,
          warehouse_id: warehouseId === "" ? undefined : warehouseId,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          limit: PAGE_SIZE,
          offset,
        }),
        api.listInventoryItems(),
        api.listWarehouses(),
      ]);
      setRows(ledgerRes.items);
      setTotal(ledgerRes.total);
      setItems(itm);
      setWarehouses(wh);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stock ledger");
    } finally {
      setLoading(false);
    }
  }, [itemId, warehouseId, dateFrom, dateTo, page]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="mr-auto w-full min-w-0 sm:w-auto">
          <h1 className="text-2xl font-bold text-text-primary">Stock Ledger</h1>
          <p className="text-sm text-text-muted">
            Newest first. <strong>Running balance</strong> is cumulative (IN − OUT) per item and warehouse through that movement.
          </p>
        </div>
        {isNarrow ? <InventoryListViewToggle value={view} onChange={setView} /> : null}
        <label className="flex flex-col gap-0.5 text-xs text-text-muted">
          From
          <input
            type="date"
            className={`rounded border border-border px-2 py-1.5 text-sm text-text-primary ${touchFieldClass}`}
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-text-muted">
          To
          <input
            type="date"
            className={`rounded border border-border px-2 py-1.5 text-sm text-text-primary ${touchFieldClass}`}
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <select
          className={`w-full rounded border border-border px-3 py-2 text-sm sm:w-auto ${touchFieldClass}`}
          value={itemId}
          onChange={(e) => {
            setItemId(e.target.value ? Number(e.target.value) : "");
            setPage(1);
          }}
        >
          <option value="">All items</option>
          {items.map((it) => (
            <option key={it.id} value={it.id}>
              {it.item_code}
            </option>
          ))}
        </select>
        <select
          className={`w-full rounded border border-border px-3 py-2 text-sm sm:w-auto ${touchFieldClass}`}
          value={warehouseId}
          onChange={(e) => {
            setWarehouseId(e.target.value ? Number(e.target.value) : "");
            setPage(1);
          }}
        >
          <option value="">All warehouses</option>
          {warehouses.map((wh) => (
            <option key={wh.id} value={wh.id}>
              {wh.name}
            </option>
          ))}
        </select>
      </div>

      {error ? <InventoryErrorPanel message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <InventoryTableSkeleton rows={10} cols={7} />
      ) : !rows.length ? (
        <InventoryEmptyState
          title="No movements found"
          description="Adjust date range or item/warehouse filters, or add stock movements to see history."
        />
      ) : showCards ? (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="text-sm font-medium text-text-primary">
                  {row.movement_date ? new Date(row.movement_date).toLocaleDateString() : "—"} · {row.movement_type}
                </span>
                <span className="text-xs text-text-muted">{row.warehouse_name ?? "—"}</span>
              </div>
              <div className="mt-2 text-sm text-text-secondary">
                {row.item_code} — {row.item_name}
              </div>
              <div className="mt-1 flex flex-wrap gap-3 text-sm">
                <span>
                  Qty <span className="font-medium tabular-nums">{row.quantity}</span>
                </span>
                <span>
                  Balance <span className="font-medium tabular-nums">{fmtQty(row.running_balance)}</span>
                </span>
              </div>
              <div className="mt-2 text-xs text-text-secondary">
                {row.reference_type ?? "—"} {row.reference_id ?? ""}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={`rounded-xl border border-border bg-surface-raised ${inventoryScrollTableClass}`}>
          <table className="min-w-[900px] w-full">
            <thead className="bg-surface-subtle">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Date</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Type</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Item</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Warehouse</th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-text-muted">Qty</th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-text-muted">Running bal.</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 text-sm">{row.movement_date ? new Date(row.movement_date).toLocaleDateString() : "—"}</td>
                  <td className="px-3 py-2 text-sm">{row.movement_type}</td>
                  <td className="px-3 py-2 text-sm">
                    {row.item_code} - {row.item_name}
                  </td>
                  <td className="px-3 py-2 text-sm">{row.warehouse_name ?? "—"}</td>
                  <td className="px-3 py-2 text-sm text-right">{row.quantity}</td>
                  <td className="px-3 py-2 text-sm text-right font-medium tabular-nums">{fmtQty(row.running_balance)}</td>
                  <td className="px-3 py-2 text-sm text-text-secondary">
                    {row.reference_type ?? "—"} {row.reference_id ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && total > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-text-muted">
            Showing <span className="font-medium text-text-secondary">{rangeLabel}</span> of{" "}
            <span className="font-medium text-text-secondary">{total}</span> movement{total === 1 ? "" : "s"} · Page {page} of {totalPages}
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
    </div>
  );
}
