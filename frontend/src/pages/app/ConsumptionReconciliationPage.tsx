import { useState } from "react";
import { api } from "@/api/client";

interface Row {
  item_code: string | null;
  planned_qty: number;
  actual_qty: number;
  variance: number;
  uom: string | null;
}

export function ConsumptionReconciliationPage() {
  const [orderId, setOrderId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<{ total_planned: number; total_actual: number; variance: number } | null>(null);
  const [error, setError] = useState("");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Consumption Reconciliation</h1>
        <p className="text-sm text-gray-500 mt-0.5">Compare planned vs actual consumption by order.</p>
      </div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <div className="rounded-xl border border-gray-200 bg-white p-4 flex gap-2">
        <input value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="Order ID" className="rounded border border-gray-300 px-3 py-2 text-sm" />
        <button
          onClick={async () => {
            try {
              setError("");
              const data = await api.getConsumptionReconciliation(Number(orderId));
              setRows(data.items);
              setSummary(data.summary);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Failed to load reconciliation");
            }
          }}
          className="rounded bg-primary px-4 py-2 text-sm font-semibold text-white"
        >
          Load
        </button>
      </div>

      {summary && (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4"><div className="text-xs text-gray-500">Total planned</div><div className="text-xl font-bold">{summary.total_planned.toFixed(2)}</div></div>
          <div className="rounded-xl border border-gray-200 bg-white p-4"><div className="text-xs text-gray-500">Total actual</div><div className="text-xl font-bold">{summary.total_actual.toFixed(2)}</div></div>
          <div className="rounded-xl border border-gray-200 bg-white p-4"><div className="text-xs text-gray-500">Variance</div><div className="text-xl font-bold">{summary.variance.toFixed(2)}</div></div>
        </div>
      )}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-left text-gray-500">
            <tr>
              <th className="px-4 py-2">Item</th>
              <th className="px-4 py-2 text-right">Planned</th>
              <th className="px-4 py-2 text-right">Actual</th>
              <th className="px-4 py-2 text-right">Variance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-2">{r.item_code ?? "ITEM"}</td>
                <td className="px-4 py-2 text-right">{r.planned_qty.toFixed(2)} {r.uom ?? ""}</td>
                <td className="px-4 py-2 text-right">{r.actual_qty.toFixed(2)} {r.uom ?? ""}</td>
                <td className="px-4 py-2 text-right">{r.variance.toFixed(2)} {r.uom ?? ""}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">Enter an order ID and load data.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
