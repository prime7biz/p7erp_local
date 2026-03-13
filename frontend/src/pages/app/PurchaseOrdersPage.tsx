import { useEffect, useMemo, useState } from "react";
import {
  api,
  type InventoryItemResponse,
  type PurchaseOrderCreate,
  type PurchaseOrderItemCreate,
  type PurchaseOrderResponse,
  type WarehouseResponse,
} from "@/api/client";

export function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<PurchaseOrderResponse[]>([]);
  const [items, setItems] = useState<InventoryItemResponse[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseResponse[]>([]);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [form, setForm] = useState<PurchaseOrderCreate>({
    supplier_name: "",
    status: "DRAFT",
    items: [],
  });
  const [line, setLine] = useState<PurchaseOrderItemCreate>({ item_id: 0, warehouse_id: null, quantity: "0", unit_price: "0" });

  const itemName = useMemo(() => new Map(items.map((i) => [i.id, i.name])), [items]);

  const load = async () => {
    try {
      const [po, itm, wh] = await Promise.all([
        api.listPurchaseOrders(),
        api.listInventoryItems(),
        api.listWarehouses(),
      ]);
      setOrders(po);
      setItems(itm);
      setWarehouses(wh);
      const firstItem = itm[0];
      const firstWarehouse = wh[0];
      if (!line.item_id && firstItem) setLine((p) => ({ ...p, item_id: firstItem.id }));
      if (!line.warehouse_id && firstWarehouse) setLine((p) => ({ ...p, warehouse_id: firstWarehouse.id }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load purchase orders");
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = (params.get("status") || "").toUpperCase();
    if (status) setStatusFilter(status);
    load();
  }, []);

  const filteredOrders = statusFilter ? orders.filter((o) => (o.status || "").toUpperCase() === statusFilter) : orders;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Purchase Orders</h1>
        <p className="text-sm text-gray-500">Create POs and move them through approval status.</p>
        <p className="text-xs text-gray-500 mt-1">Fields marked with ** are mandatory.</p>
      </div>
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <label className="mr-2 text-xs font-semibold text-gray-600">Status Filter</label>
        <input
          className="rounded border px-2 py-1 text-xs"
          value={statusFilter}
          placeholder="e.g. DRAFT"
          onChange={(e) => setStatusFilter(e.target.value.toUpperCase())}
        />
      </div>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (form.items.length === 0) {
            setError("Add at least one item line");
            return;
          }
          await api.createPurchaseOrder(form);
          setForm({ supplier_name: "", status: "DRAFT", items: [] });
          await load();
        }}
        className="rounded-xl border border-gray-200 bg-white p-4 space-y-3"
      >
        <h2 className="text-sm font-semibold text-gray-900">New Purchase Order</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input className="rounded border px-3 py-2 text-sm" placeholder="Supplier name **" value={form.supplier_name} onChange={(e) => setForm((p) => ({ ...p, supplier_name: e.target.value }))} required />
          <input className="rounded border px-3 py-2 text-sm" type="date" value={form.order_date ?? ""} onChange={(e) => setForm((p) => ({ ...p, order_date: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" type="date" value={form.expected_date ?? ""} onChange={(e) => setForm((p) => ({ ...p, expected_date: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Notes" value={form.notes ?? ""} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <select className="rounded border px-3 py-2 text-sm" value={line.item_id || ""} onChange={(e) => setLine((p) => ({ ...p, item_id: Number(e.target.value) }))}>
            {items.map((it) => <option key={it.id} value={it.id}>{it.item_code} - {it.name}</option>)}
          </select>
          <select className="rounded border px-3 py-2 text-sm" value={line.warehouse_id ?? ""} onChange={(e) => setLine((p) => ({ ...p, warehouse_id: e.target.value ? Number(e.target.value) : null }))}>
            {warehouses.map((wh) => <option key={wh.id} value={wh.id}>{wh.name}</option>)}
          </select>
          <input className="rounded border px-3 py-2 text-sm" placeholder="Qty" value={line.quantity} onChange={(e) => setLine((p) => ({ ...p, quantity: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Unit price" value={line.unit_price} onChange={(e) => setLine((p) => ({ ...p, unit_price: e.target.value }))} />
          <button type="button" className="rounded border border-gray-300 px-3 py-2 text-sm" onClick={() => setForm((p) => ({ ...p, items: [...p.items, line] }))}>
            Add Line
          </button>
        </div>
        {form.items.length > 0 && (
          <div className="text-xs text-gray-600">
            {form.items.map((ln, i) => (
              <div key={`${ln.item_id}-${i}`}>Line {i + 1}: {itemName.get(ln.item_id)} · Qty {ln.quantity}</div>
            ))}
          </div>
        )}
        <button className="rounded bg-primary px-3 py-2 text-sm font-medium text-white">Create Purchase Order</button>
      </form>

      <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">PO Code</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Supplier</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Status</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Items</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredOrders.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-2 text-sm font-medium">{row.po_code}</td>
                <td className="px-3 py-2 text-sm">{row.supplier_name}</td>
                <td className="px-3 py-2 text-sm">{row.status}</td>
                <td className="px-3 py-2 text-xs text-gray-600">
                  {row.items.map((ln) => `${itemName.get(ln.item_id) || `#${ln.item_id}`} (${ln.quantity})`).join(", ")}
                </td>
                <td className="px-3 py-2 text-right">
                  {row.status === "DRAFT" && (
                    <button
                      type="button"
                      onClick={async () => {
                        await api.updatePurchaseOrderStatus(row.id, "APPROVED");
                        await load();
                      }}
                      className="rounded border border-gray-300 px-2 py-1 text-xs"
                    >
                      Approve
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
