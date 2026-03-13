import { useEffect, useState } from "react";
import {
  api,
  type GoodsReceivingCreate,
  type GoodsReceivingResponse,
  type PurchaseOrderResponse,
} from "@/api/client";

export function GoodsReceivingPage() {
  const [rows, setRows] = useState<GoodsReceivingResponse[]>([]);
  const [pos, setPos] = useState<PurchaseOrderResponse[]>([]);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [form, setForm] = useState<GoodsReceivingCreate>({
    purchase_order_id: null,
    status: "DRAFT",
    items: [],
  });

  const load = async () => {
    try {
      const [grn, po] = await Promise.all([api.listGoodsReceiving(), api.listPurchaseOrders()]);
      setRows(grn);
      setPos(po);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load GRN");
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = (params.get("status") || "").toUpperCase();
    if (status) setStatusFilter(status);
    load();
  }, []);

  const filteredRows = statusFilter ? rows.filter((r) => (r.status || "").toUpperCase() === statusFilter) : rows;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Goods Receiving (GRN)</h1>
        <p className="text-sm text-gray-500">Receive materials from approved purchase orders into stock.</p>
      </div>
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <label className="mr-2 text-xs font-semibold text-gray-600">Status Filter</label>
        <input className="rounded border px-2 py-1 text-xs" value={statusFilter} placeholder="e.g. DRAFT" onChange={(e) => setStatusFilter(e.target.value.toUpperCase())} />
      </div>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await api.createGoodsReceiving(form);
          setForm({ purchase_order_id: null, status: "DRAFT", items: [] });
          await load();
        }}
        className="rounded-xl border border-gray-200 bg-white p-4 grid grid-cols-1 md:grid-cols-4 gap-2"
      >
        <select className="rounded border px-3 py-2 text-sm" value={form.purchase_order_id ?? ""} onChange={(e) => setForm((p) => ({ ...p, purchase_order_id: e.target.value ? Number(e.target.value) : null }))}>
          <option value="">Select PO</option>
          {pos.map((po) => (
            <option key={po.id} value={po.id}>{po.po_code} ({po.status})</option>
          ))}
        </select>
        <input className="rounded border px-3 py-2 text-sm" type="date" value={form.received_date ?? ""} onChange={(e) => setForm((p) => ({ ...p, received_date: e.target.value }))} />
        <input className="rounded border px-3 py-2 text-sm" placeholder="Notes" value={form.notes ?? ""} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
        <button className="rounded bg-primary px-3 py-2 text-sm font-medium text-white">Create GRN</button>
      </form>

      <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">GRN Code</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">PO</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Status</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Date</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredRows.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-2 text-sm font-medium">{row.grn_code}</td>
                <td className="px-3 py-2 text-sm">{row.purchase_order_id ? `#${row.purchase_order_id}` : "—"}</td>
                <td className="px-3 py-2 text-sm">{row.status}</td>
                <td className="px-3 py-2 text-sm">{row.received_date ? new Date(row.received_date).toLocaleDateString() : "—"}</td>
                <td className="px-3 py-2 text-right">
                  {row.status !== "RECEIVED" && (
                    <button
                      type="button"
                      onClick={async () => {
                        await api.receiveGoods(row.id);
                        await load();
                      }}
                      className="rounded border border-gray-300 px-2 py-1 text-xs"
                    >
                      Receive to Stock
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
