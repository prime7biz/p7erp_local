import { useEffect, useMemo, useState } from "react";
import {
  api,
  type DeliveryChallanCreate,
  type DeliveryChallanItemCreate,
  type DeliveryChallanResponse,
  type InventoryItemResponse,
  type WarehouseResponse,
} from "@/api/client";

export function DeliveryChallansPage() {
  const [rows, setRows] = useState<DeliveryChallanResponse[]>([]);
  const [items, setItems] = useState<InventoryItemResponse[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseResponse[]>([]);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [form, setForm] = useState<DeliveryChallanCreate>({
    customer_name: "",
    status: "DRAFT",
    items: [],
  });
  const [line, setLine] = useState<DeliveryChallanItemCreate>({ item_id: 0, warehouse_id: 0, quantity: "0" });

  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, `${i.item_code} - ${i.name}`])), [items]);

  const load = async () => {
    try {
      const [dc, itm, wh] = await Promise.all([
        api.listDeliveryChallans(),
        api.listInventoryItems(),
        api.listWarehouses(),
      ]);
      setRows(dc);
      setItems(itm);
      setWarehouses(wh);
      if (!line.item_id && itm[0]) setLine((p) => ({ ...p, item_id: itm[0]!.id }));
      if (!line.warehouse_id && wh[0]) setLine((p) => ({ ...p, warehouse_id: wh[0]!.id }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load delivery challans");
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = (params.get("status") || "").toUpperCase();
    if (status) setStatusFilter(status);
    load();
  }, []);

  const statuses = ["DRAFT", "SUBMITTED", "CHECKED", "RECOMMENDED", "APPROVED", "POSTED", "REJECTED"];
  const filteredRows = statusFilter ? rows.filter((r) => (r.status || "").toUpperCase() === statusFilter) : rows;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Delivery Challans</h1>
        <p className="text-sm text-gray-500">Manage dispatch workflow and post stock-out on final posting.</p>
      </div>
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <label className="mr-2 text-xs font-semibold text-gray-600">Status Filter</label>
        <input className="rounded border px-2 py-1 text-xs" value={statusFilter} placeholder="e.g. POSTED" onChange={(e) => setStatusFilter(e.target.value.toUpperCase())} />
      </div>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (form.items.length === 0) {
            setError("Add at least one challan line");
            return;
          }
          await api.createDeliveryChallan(form);
          setForm({ customer_name: "", status: "DRAFT", items: [] });
          await load();
        }}
        className="rounded-xl border border-gray-200 bg-white p-4 space-y-3"
      >
        <h2 className="text-sm font-semibold text-gray-900">New Challan</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input className="rounded border px-3 py-2 text-sm" placeholder="Customer name" value={form.customer_name} onChange={(e) => setForm((p) => ({ ...p, customer_name: e.target.value }))} required />
          <input className="rounded border px-3 py-2 text-sm" type="date" value={form.delivery_date ?? ""} onChange={(e) => setForm((p) => ({ ...p, delivery_date: e.target.value }))} />
          <select className="rounded border px-3 py-2 text-sm" value={form.status ?? "DRAFT"} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
            {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input className="rounded border px-3 py-2 text-sm" placeholder="Notes" value={form.notes ?? ""} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <select className="rounded border px-3 py-2 text-sm" value={line.item_id || ""} onChange={(e) => setLine((p) => ({ ...p, item_id: Number(e.target.value) }))}>
            {items.map((it) => <option key={it.id} value={it.id}>{it.item_code}</option>)}
          </select>
          <select className="rounded border px-3 py-2 text-sm" value={line.warehouse_id || ""} onChange={(e) => setLine((p) => ({ ...p, warehouse_id: Number(e.target.value) }))}>
            {warehouses.map((wh) => <option key={wh.id} value={wh.id}>{wh.name}</option>)}
          </select>
          <input className="rounded border px-3 py-2 text-sm" placeholder="Quantity" value={line.quantity} onChange={(e) => setLine((p) => ({ ...p, quantity: e.target.value }))} />
          <button type="button" className="rounded border border-gray-300 px-3 py-2 text-sm" onClick={() => setForm((p) => ({ ...p, items: [...p.items, line] }))}>Add Line</button>
        </div>
        {form.items.length > 0 && (
          <div className="text-xs text-gray-600 space-y-0.5">
            {form.items.map((ln, i) => <div key={`${ln.item_id}-${i}`}>Line {i + 1}: {itemMap.get(ln.item_id) ?? `#${ln.item_id}`} · Qty {ln.quantity}</div>)}
          </div>
        )}
        <button className="rounded bg-primary px-3 py-2 text-sm font-medium text-white">Create Challan</button>
      </form>

      <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Code</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Customer</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Status</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Lines</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredRows.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-2 text-sm font-medium">{row.challan_code}</td>
                <td className="px-3 py-2 text-sm">{row.customer_name}</td>
                <td className="px-3 py-2 text-sm">{row.status}</td>
                <td className="px-3 py-2 text-xs text-gray-600">{row.items.length}</td>
                <td className="px-3 py-2 text-right">
                  <select
                    className="rounded border px-2 py-1 text-xs"
                    value={row.status}
                    onChange={async (e) => {
                      await api.updateDeliveryChallanStatus(row.id, e.target.value);
                      await load();
                    }}
                  >
                    {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
