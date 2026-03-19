import { useCallback, useEffect, useState } from "react";
import { api, type InventoryItemResponse, type StockLedgerRow, type WarehouseResponse } from "@/api/client";

export function StockLedgerPage() {
  const [rows, setRows] = useState<StockLedgerRow[]>([]);
  const [items, setItems] = useState<InventoryItemResponse[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseResponse[]>([]);
  const [itemId, setItemId] = useState<number | "">("");
  const [warehouseId, setWarehouseId] = useState<number | "">("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [ledger, itm, wh] = await Promise.all([
        api.getStockLedger({
          item_id: itemId === "" ? undefined : itemId,
          warehouse_id: warehouseId === "" ? undefined : warehouseId,
        }),
        api.listInventoryItems(),
        api.listWarehouses(),
      ]);
      setRows(ledger);
      setItems(itm);
      setWarehouses(wh);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stock ledger");
    }
  }, [itemId, warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-2">
        <div className="mr-auto">
          <h1 className="text-2xl font-bold text-text-primary">Stock Ledger</h1>
          <p className="text-sm text-text-muted">View stock movement history.</p>
        </div>
        <select className="rounded border border-border px-3 py-2 text-sm" value={itemId} onChange={(e) => setItemId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">All items</option>
          {items.map((it) => <option key={it.id} value={it.id}>{it.item_code}</option>)}
        </select>
        <select className="rounded border border-border px-3 py-2 text-sm" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">All warehouses</option>
          {warehouses.map((wh) => <option key={wh.id} value={wh.id}>{wh.name}</option>)}
        </select>
      </div>

      {error && <div className="rounded border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">{error}</div>}
      <div className="rounded-xl border border-border bg-surface-raised overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-surface-subtle">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Date</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Type</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Item</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Warehouse</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase text-text-muted">Qty</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Reference</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-2 text-sm">{row.movement_date ? new Date(row.movement_date).toLocaleDateString() : "—"}</td>
                <td className="px-3 py-2 text-sm">{row.movement_type}</td>
                <td className="px-3 py-2 text-sm">{row.item_code} - {row.item_name}</td>
                <td className="px-3 py-2 text-sm">{row.warehouse_name ?? "—"}</td>
                <td className="px-3 py-2 text-sm text-right">{row.quantity}</td>
                <td className="px-3 py-2 text-sm text-text-secondary">{row.reference_type ?? "—"} {row.reference_id ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
