import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type ConsignmentStockRow,
  type InventoryItemResponse,
  type VendorResponse,
  type WarehouseResponse,
} from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";

export function ConsignmentStockPage() {
  const [rows, setRows] = useState<ConsignmentStockRow[]>([]);
  const [vendors, setVendors] = useState<VendorResponse[]>([]);
  const [items, setItems] = useState<InventoryItemResponse[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseResponse[]>([]);
  const [vendorId, setVendorId] = useState(0);
  const [itemId, setItemId] = useState(0);
  const [whId, setWhId] = useState(0);
  const [qty, setQty] = useState("10");
  const [consumeQty, setConsumeQty] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const [c, v, it, wh] = await Promise.all([
        api.listConsignmentStock(),
        api.listVendors(),
        api.listInventoryItems(),
        api.listWarehouses(),
      ]);
      setRows(c);
      setVendors(v);
      setItems(it);
      setWarehouses(wh);
      if (!vendorId && v[0]) setVendorId(v[0].id);
      if (!itemId && it[0]) setItemId(it[0].id);
      if (!whId && wh[0]) setWhId(wh[0].id);
    } catch (e) {
      logApiError("ConsignmentStockPage.load", e);
      setError((e as Error).message);
    }
  }, [vendorId, itemId, whId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const close = () => setOpenActionsId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  async function receive() {
    setError("");
    setSuccess("");
    try {
      await api.receiveConsignment({
        vendor_id: vendorId,
        item_id: itemId,
        warehouse_id: whId,
        qty,
      });
      setSuccess("Consignment received");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function consume(id: number) {
    try {
      await api.consumeConsignment({
        consignment_id: id,
        qty: consumeQty[id] || "1",
      });
      setSuccess("Consumed");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function settle(vid: number) {
    try {
      const r = await api.settleConsignment({ vendor_id: vid });
      setSuccess(r.message || `PO ${r.po_code} created`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title="Consignment Stock"
        description="Receive vendor-owned stock, consume, settle into a draft PO"
      />
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      {success ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {success}{" "}
          <Link to="/app/inventory/purchase-orders" className="underline">
            Purchase orders
          </Link>
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <label className="text-sm">
          Vendor
          <select
            className="mt-1 block rounded-lg border px-2 py-1.5"
            value={vendorId}
            onChange={(e) => setVendorId(Number(e.target.value))}
          >
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Item
          <select
            className="mt-1 block rounded-lg border px-2 py-1.5"
            value={itemId}
            onChange={(e) => setItemId(Number(e.target.value))}
          >
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.item_code}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Warehouse
          <select
            className="mt-1 block rounded-lg border px-2 py-1.5"
            value={whId}
            onChange={(e) => setWhId(Number(e.target.value))}
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Qty
          <input
            className="mt-1 block w-24 rounded-lg border px-2 py-1.5"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => void receive()}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white"
        >
          Receive
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2">Vendor</th>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2 text-right">Consigned</th>
              <th className="px-3 py-2 text-right">Consumed</th>
              <th className="px-3 py-2 text-right">Remaining</th>
              <th className="px-3 py-2 text-right">Unbilled</th>
              <th className="px-3 py-2 w-36">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                  No consignment stock. Enable <code>consignment_stock_enabled</code>.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-100">
                  <td className="px-3 py-2">{r.vendor_name}</td>
                  <td className="px-3 py-2">
                    {r.item_code} — {r.item_name}
                  </td>
                  <td className="px-3 py-2 text-right">{r.consigned_qty}</td>
                  <td className="px-3 py-2 text-right">{r.consumed_qty}</td>
                  <td className="px-3 py-2 text-right">{r.remaining_qty}</td>
                  <td className="px-3 py-2 text-right">{r.unbilled_consumed_qty}</td>
                  <td className="relative px-3 py-2">
                    <input
                      className="mb-1 w-16 rounded border px-1 py-0.5 text-right text-xs"
                      placeholder="qty"
                      value={consumeQty[r.id] ?? ""}
                      onChange={(e) =>
                        setConsumeQty((p) => ({ ...p, [r.id]: e.target.value }))
                      }
                    />
                    <button
                      type="button"
                      className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenActionsId((v) => (v === r.id ? null : r.id));
                      }}
                    >
                      Actions
                    </button>
                    {openActionsId === r.id ? (
                      <div
                        className="absolute right-0 z-10 mt-1 w-40 rounded-lg border bg-white p-1 shadow-lg"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="block w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-gray-50"
                          onClick={() => {
                            setOpenActionsId(null);
                            void consume(r.id);
                          }}
                        >
                          Consume
                        </button>
                        <button
                          type="button"
                          className="block w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-gray-50"
                          onClick={() => {
                            setOpenActionsId(null);
                            void settle(r.vendor_id);
                          }}
                        >
                          Settle (create PO)
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
