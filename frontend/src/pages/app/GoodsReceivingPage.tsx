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
        <h1 className="text-2xl font-bold text-text-primary">Goods Receiving (GRN)</h1>
        <p className="text-sm text-text-muted">Receive materials from approved purchase orders into stock.</p>
      </div>
      {error && <div className="rounded border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">{error}</div>}
      <div className="rounded-xl border border-border bg-surface-raised p-3">
        <label className="mr-2 text-xs font-semibold text-text-secondary">Status Filter</label>
        <input className="rounded border px-2 py-1 text-xs" value={statusFilter} placeholder="e.g. DRAFT" onChange={(e) => setStatusFilter(e.target.value.toUpperCase())} />
      </div>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await api.createGoodsReceiving(form);
          setForm({ purchase_order_id: null, status: "DRAFT", items: [] });
          await load();
        }}
        className="rounded-xl border border-border bg-surface-raised p-4 grid grid-cols-1 md:grid-cols-4 gap-2"
      >
        <select className="rounded border px-3 py-2 text-sm" value={form.purchase_order_id ?? ""} onChange={(e) => setForm((p) => ({ ...p, purchase_order_id: e.target.value ? Number(e.target.value) : null }))}>
          <option value="">Select PO</option>
          {pos.map((po) => (
            <option key={po.id} value={po.id}>{po.po_code} ({po.status})</option>
          ))}
        </select>
        <input className="rounded border px-3 py-2 text-sm" type="date" value={form.received_date ?? ""} onChange={(e) => setForm((p) => ({ ...p, received_date: e.target.value }))} />
        <input className="rounded border px-3 py-2 text-sm" placeholder="Notes" value={form.notes ?? ""} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
        <button className="rounded bg-brand-primary px-3 py-2 text-sm font-medium text-brand-primary-foreground">Create GRN</button>
      </form>

      <div className="rounded-xl border border-border bg-surface-raised overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-surface-subtle">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">GRN Code</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">PO</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Status</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Date</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase text-text-muted">Action</th>
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
                      className="rounded border border-border-strong px-2 py-1 text-xs"
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
