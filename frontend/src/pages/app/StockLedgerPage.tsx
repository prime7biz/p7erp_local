import { useEffect, useState } from "react";
import { api, type InventoryItemResponse, type StockLedgerRow, type WarehouseResponse } from "@/api/client";

export function StockLedgerPage() {
  const [rows, setRows] = useState<StockLedgerRow[]>([]);
  const [items, setItems] = useState<InventoryItemResponse[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseResponse[]>([]);
  const [itemId, setItemId] = useState<number | "">("");
  const [warehouseId, setWarehouseId] = useState<number | "">("");
  const [error, setError] = useState("");

  const load = async () => {
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
  };

  useEffect(() => {
    load();
  }, [itemId, warehouseId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-2">
        <div className="mr-auto">
          <h1 className="text-2xl font-bold text-gray-900">Stock Ledger</h1>
          <p className="text-sm text-gray-500">View stock movement history.</p>
        </div>
        <select className="rounded border px-3 py-2 text-sm" value={itemId} onChange={(e) => setItemId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">All items</option>
          {items.map((it) => <option key={it.id} value={it.id}>{it.item_code}</option>)}
        </select>
        <select className="rounded border px-3 py-2 text-sm" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">All warehouses</option>
          {warehouses.map((wh) => <option key={wh.id} value={wh.id}>{wh.name}</option>)}
        </select>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Date</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Type</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Item</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Warehouse</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">Qty</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Reference</th>
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
                <td className="px-3 py-2 text-sm text-gray-600">{row.reference_type ?? "—"} {row.reference_id ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
