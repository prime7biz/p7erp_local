import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type DeliveryChallanCreate,
  type DeliveryChallanItemCreate,
  type DeliveryChallanResponse,
  type InventoryItemResponse,
  type WarehouseResponse,
} from "@/api/client";
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
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const { isNarrow, view, setView, showCards } = useListViewPreference();

  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, `${i.item_code} - ${i.name}`])), [items]);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [dc, itm, wh] = await Promise.all([
        api.listDeliveryChallans(),
        api.listInventoryItems(),
        api.listWarehouses(),
      ]);
      setRows(dc);
      setItems(itm);
      setWarehouses(wh);
      setLine((p) => {
        let next = { ...p };
        if (!p.item_id && itm[0]) next = { ...next, item_id: itm[0]!.id };
        if (!p.warehouse_id && wh[0]) next = { ...next, warehouse_id: wh[0]!.id };
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load delivery challans");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = (params.get("status") || "").toUpperCase();
    if (status) setStatusFilter(status);
    void load();
  }, [load]);

  useEffect(() => {
    const close = () => setOpenActionsId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const statuses = ["DRAFT", "SUBMITTED", "CHECKED", "RECOMMENDED", "APPROVED", "POSTED", "REJECTED"];
  const filteredRows = statusFilter ? rows.filter((r) => (r.status || "").toUpperCase() === statusFilter) : rows;

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-primary">Delivery Challans</h1>
        <p className="text-sm text-text-muted">Manage dispatch workflow and post stock-out on final posting.</p>
      </div>
      {error ? <InventoryErrorPanel message={error} onRetry={() => void load()} /> : null}
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-raised p-3 sm:flex-row sm:items-center sm:justify-between">
        {isNarrow ? <InventoryListViewToggle value={view} onChange={setView} /> : null}
        <label className="flex flex-1 flex-wrap items-center gap-2 text-xs font-semibold text-text-secondary">
          Status Filter
          <input
            className={`min-w-0 flex-1 rounded border px-2 py-1 text-xs sm:flex-none ${touchFieldClass}`}
            value={statusFilter}
            placeholder="e.g. POSTED"
            onChange={(e) => setStatusFilter(e.target.value.toUpperCase())}
          />
        </label>
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
        className="rounded-xl border border-border bg-surface-raised p-4 space-y-3"
      >
        <h2 className="text-sm font-semibold text-brand-primary">New Challan</h2>
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
          <button type="button" className="rounded border border-border-strong px-3 py-2 text-sm" onClick={() => setForm((p) => ({ ...p, items: [...p.items, line] }))}>Add Line</button>
        </div>
        {form.items.length > 0 && (
          <div className="text-xs text-text-secondary space-y-0.5">
            {form.items.map((ln, i) => <div key={`${ln.item_id}-${i}`}>Line {i + 1}: {itemMap.get(ln.item_id) ?? `#${ln.item_id}`} · Qty {ln.quantity}</div>)}
          </div>
        )}
        <button className="rounded bg-brand-primary px-3 py-2 text-sm font-medium text-brand-primary-foreground">Create Challan</button>
      </form>

      {loading ? (
        <InventoryTableSkeleton rows={8} cols={5} />
      ) : !filteredRows.length ? (
        <InventoryEmptyState
          title={rows.length ? "No challans match this status" : "No delivery challans yet"}
          description={rows.length ? "Clear the status filter to see all challans." : "Create a challan using the form above."}
        />
      ) : showCards ? (
        <div className="space-y-3">
          {filteredRows.map((row) => (
            <div key={row.id} className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-text-primary">{row.challan_code}</div>
                  <div className="text-sm text-text-secondary">{row.customer_name}</div>
                  <div className="mt-1 text-xs text-text-muted">
                    {row.status} · {row.items.length} line{row.items.length === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="relative inline-block shrink-0 text-left">
                  <button
                    type="button"
                    className="min-h-[44px] min-w-[88px] touch-manipulation rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 sm:min-h-0 sm:min-w-0 sm:px-2.5 sm:py-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenActionsId((id) => (id === row.id ? null : row.id));
                    }}
                  >
                    Actions
                  </button>
                  {openActionsId === row.id && (
                    <div className="absolute right-0 z-10 mt-1 max-h-64 w-44 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                      <p className="px-2 py-1 text-[10px] font-semibold uppercase text-gray-500">Set status</p>
                      {statuses.map((s) => (
                        <button
                          key={s}
                          type="button"
                          className={`block min-h-[44px] w-full rounded-md px-3 py-2 text-left text-sm hover:bg-gray-50 sm:min-h-0 sm:px-2 sm:py-1.5 sm:text-xs ${
                            (row.status || "").toUpperCase() === s ? "font-medium text-gray-900" : "text-gray-700"
                          }`}
                          onClick={async (e) => {
                            e.stopPropagation();
                            setOpenActionsId(null);
                            await api.updateDeliveryChallanStatus(row.id, s);
                            await load();
                          }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={`rounded-xl border border-border bg-surface-raised ${inventoryScrollTableClass}`}>
          <table className="min-w-[640px] w-full">
            <thead className="bg-surface-subtle">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Code</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Customer</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Status</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Lines</th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-text-muted">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredRows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 text-sm font-medium">{row.challan_code}</td>
                  <td className="px-3 py-2 text-sm">{row.customer_name}</td>
                  <td className="px-3 py-2 text-sm">{row.status}</td>
                  <td className="px-3 py-2 text-xs text-text-secondary">{row.items.length}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="relative inline-block text-left">
                      <button
                        type="button"
                        className="min-h-[44px] min-w-[88px] touch-manipulation rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 sm:min-h-0 sm:min-w-0 sm:px-2.5 sm:py-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenActionsId((id) => (id === row.id ? null : row.id));
                        }}
                      >
                        Actions
                      </button>
                      {openActionsId === row.id && (
                        <div className="absolute right-0 z-10 mt-1 max-h-64 w-44 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                          <p className="px-2 py-1 text-[10px] font-semibold uppercase text-gray-500">Set status</p>
                          {statuses.map((s) => (
                            <button
                              key={s}
                              type="button"
                              className={`block min-h-[44px] w-full rounded-md px-3 py-2 text-left text-sm hover:bg-gray-50 sm:min-h-0 sm:px-2 sm:py-1.5 sm:text-xs ${
                                (row.status || "").toUpperCase() === s ? "font-medium text-gray-900" : "text-gray-700"
                              }`}
                              onClick={async (e) => {
                                e.stopPropagation();
                                setOpenActionsId(null);
                                await api.updateDeliveryChallanStatus(row.id, s);
                                await load();
                              }}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
