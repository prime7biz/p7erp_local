import { useEffect, useMemo, useState } from "react";
import { api, type StockSummaryRow } from "@/api/client";

export function StockSummaryPage() {
  const [rows, setRows] = useState<StockSummaryRow[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setRows(await api.getStockSummary());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stock summary");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.item_code.toLowerCase().includes(q) || r.item_name.toLowerCase().includes(q));
  }, [rows, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stock Summary</h1>
          <p className="text-sm text-gray-500">Live stock on hand by item and warehouse.</p>
        </div>
        <input className="w-64 rounded border px-3 py-2 text-sm" placeholder="Search item code or name…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Item</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Warehouse</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">In Qty</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">Out Qty</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">On Hand</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filtered.map((row) => (
              <tr key={`${row.item_id}-${row.warehouse_id ?? 0}`}>
                <td className="px-3 py-2 text-sm">{row.item_code} - {row.item_name}</td>
                <td className="px-3 py-2 text-sm">{row.warehouse_name ?? "—"}</td>
                <td className="px-3 py-2 text-sm text-right">{row.in_qty.toLocaleString()}</td>
                <td className="px-3 py-2 text-sm text-right">{row.out_qty.toLocaleString()}</td>
                <td className="px-3 py-2 text-sm text-right font-semibold">{row.on_hand_qty.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
