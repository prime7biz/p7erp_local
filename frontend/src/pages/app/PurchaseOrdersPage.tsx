import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type InventoryItemResponse,
  type PurchaseOrderCreate,
  type PurchaseOrderItemCreate,
  type PurchaseOrderResponse,
  type VendorResponse,
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
import { logApiError } from "@/utils/logApiError";

export function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<PurchaseOrderResponse[]>([]);
  const [items, setItems] = useState<InventoryItemResponse[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseResponse[]>([]);
  const [vendors, setVendors] = useState<VendorResponse[]>([]);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState(() => {
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    return (params.get("status") || "").toUpperCase();
  });
  const [form, setForm] = useState<PurchaseOrderCreate>({
    supplier_name: "",
    vendor_id: null,
    currency: "USD",
    exchange_rate_to_base: 1,
    base_total_amount: null,
    btb_lc_id: null,
    status: "DRAFT",
    items: [],
  });
  const [line, setLine] = useState<PurchaseOrderItemCreate>({ item_id: 0, warehouse_id: null, quantity: "0", unit_price: "0" });
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [poPage, setPoPage] = useState(1);
  const [poTotalPages, setPoTotalPages] = useState(1);
  const [poTotal, setPoTotal] = useState(0);
  const PO_PAGE_SIZE = 25;
  const { isNarrow, view, setView, showCards } = useListViewPreference();

  const itemName = useMemo(() => new Map(items.map((i) => [i.id, i.name])), [items]);

  useEffect(() => {
    const close = () => setOpenActionsId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [poRes, itmRes, wh, vndRes] = await Promise.all([
        api.listPurchaseOrdersPaginated({
          status_filter: statusFilter.trim() || undefined,
          page: poPage,
          page_size: PO_PAGE_SIZE,
        }),
        api.listInventoryItemsPaginated({ page: 1, page_size: 500 }),
        api.listWarehouses(),
        api.listVendorsPaginated({ is_active: true, page: 1, page_size: 500 }),
      ]);
      setOrders(poRes.items);
      setPoTotalPages(poRes.total_pages);
      setPoTotal(poRes.total);
      const itm = itmRes.items;
      setItems(itm);
      setWarehouses(wh);
      setVendors(vndRes.items);
      const firstItem = itm[0];
      const firstWarehouse = wh[0];
      setLine((p) => {
        let next = { ...p };
        if (!p.item_id && firstItem) next = { ...next, item_id: firstItem.id };
        const whFromItem =
          firstItem && itm.find((i) => i.id === firstItem.id)?.default_warehouse_id;
        if (!p.warehouse_id && (whFromItem ?? firstWarehouse))
          next = { ...next, warehouse_id: whFromItem ?? firstWarehouse!.id };
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load purchase orders");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, poPage]);

  useEffect(() => {
    setPoPage(1);
  }, [statusFilter]);

  const patchPoStatus = useCallback(
    async (id: number, nextStatus: string) => {
      setError("");
      try {
        await api.updatePurchaseOrderStatus(id, nextStatus);
        await load();
      } catch (e) {
        logApiError(`PurchaseOrdersPage.updateStatus(${nextStatus})`, e);
        setError(e instanceof Error ? e.message : "Failed to update purchase order");
      }
    },
    [load],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const visiblePoPages = useMemo(() => {
    const start = Math.max(1, poPage - 2);
    const end = Math.min(poTotalPages, poPage + 2);
    const pages: number[] = [];
    for (let i = start; i <= end; i += 1) pages.push(i);
    return pages;
  }, [poPage, poTotalPages]);
  const selectedVendor = useMemo(
    () => vendors.find((v) => v.id === (form.vendor_id ?? -1)) ?? null,
    [vendors, form.vendor_id]
  );
  const lineTotal = useMemo(
    () => form.items.reduce((acc, ln) => acc + Number(ln.quantity || 0) * Number(ln.unit_price || 0), 0),
    [form.items]
  );

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Purchase Orders</h1>
        <p className="text-sm text-text-muted">Create POs and move them through approval status.</p>
        <p className="text-xs text-text-muted mt-1">Fields marked with ** are mandatory.</p>
      </div>
      {error ? <InventoryErrorPanel message={error} onRetry={() => void load()} /> : null}
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-raised p-3 sm:flex-row sm:items-center sm:justify-between">
        {isNarrow ? <InventoryListViewToggle value={view} onChange={setView} /> : null}
        <label className="flex flex-1 flex-wrap items-center gap-2 text-xs font-semibold text-text-secondary">
          Status Filter
          <input
            className={`min-w-0 flex-1 rounded border px-2 py-1 text-xs sm:flex-none ${touchFieldClass}`}
            value={statusFilter}
            placeholder="e.g. DRAFT"
            onChange={(e) => setStatusFilter(e.target.value.toUpperCase())}
          />
        </label>
      </div>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          if (!(form.vendor_id || (form.supplier_name || "").trim())) {
            setError("Select a vendor or enter supplier name");
            return;
          }
          if (form.items.length === 0) {
            setError("Add at least one item line");
            return;
          }
          const fx = Number(form.exchange_rate_to_base ?? 1);
          const normalizedFx = Number.isFinite(fx) && fx > 0 ? fx : 1;
          const payload: PurchaseOrderCreate = {
            ...form,
            supplier_name: (form.supplier_name || "").trim(),
            exchange_rate_to_base: normalizedFx,
            base_total_amount: Number((lineTotal * normalizedFx).toFixed(2)),
          };
          try {
            await api.createPurchaseOrder(payload);
            setForm({
              supplier_name: "",
              vendor_id: null,
              currency: "USD",
              exchange_rate_to_base: 1,
              base_total_amount: null,
              btb_lc_id: null,
              status: "DRAFT",
              items: [],
            });
            await load();
          } catch (err) {
            logApiError("PurchaseOrdersPage.createPurchaseOrder", err);
            setError(err instanceof Error ? err.message : "Failed to create purchase order");
          }
        }}
        className="rounded-xl border border-border bg-surface-raised p-4 space-y-3"
      >
        <h2 className="text-sm font-semibold text-text-primary">New Purchase Order</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <select
            className="rounded border px-3 py-2 text-sm"
            value={form.vendor_id ?? ""}
            onChange={(e) => {
              const nextId = e.target.value ? Number(e.target.value) : null;
              const nextVendor = vendors.find((v) => v.id === nextId) ?? null;
              setForm((p) => ({
                ...p,
                vendor_id: nextId,
                supplier_name: nextVendor?.name || p.supplier_name || "",
                currency: nextVendor?.default_currency || p.currency || "USD",
              }));
            }}
          >
            <option value="">Select vendor (optional)</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.vendor_code} - {v.name}
              </option>
            ))}
          </select>
          <input
            className="rounded border px-3 py-2 text-sm"
            placeholder="Supplier name **"
            value={form.supplier_name ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, supplier_name: e.target.value }))}
          />
          <input
            className="rounded border px-3 py-2 text-sm"
            placeholder="Currency (USD/BDT)"
            value={form.currency ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value.toUpperCase() }))}
          />
          <input
            className="rounded border px-3 py-2 text-sm"
            placeholder="FX rate to base"
            type="number"
            min="0"
            step="0.000001"
            value={form.exchange_rate_to_base ?? 1}
            onChange={(e) =>
              setForm((p) => ({ ...p, exchange_rate_to_base: e.target.value ? Number(e.target.value) : 1 }))
            }
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input className="rounded border px-3 py-2 text-sm" type="date" value={form.order_date ?? ""} onChange={(e) => setForm((p) => ({ ...p, order_date: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" type="date" value={form.expected_date ?? ""} onChange={(e) => setForm((p) => ({ ...p, expected_date: e.target.value }))} />
          <input
            className="rounded border px-3 py-2 text-sm"
            type="number"
            min="0"
            step="1"
            placeholder="BTB LC ID (optional)"
            value={form.btb_lc_id ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, btb_lc_id: e.target.value ? Number(e.target.value) : null }))}
          />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Notes" value={form.notes ?? ""} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <select
            className="rounded border px-3 py-2 text-sm"
            value={line.item_id || ""}
            onChange={(e) => {
              const itemId = Number(e.target.value);
              const it = items.find((i) => i.id === itemId);
              const fallbackWh = warehouses[0]?.id ?? null;
              setLine((p) => ({
                ...p,
                item_id: itemId,
                warehouse_id: it?.default_warehouse_id ?? p.warehouse_id ?? fallbackWh,
              }));
            }}
          >
            {items.map((it) => (
              <option key={it.id} value={it.id}>
                {it.item_code} - {it.name}
              </option>
            ))}
          </select>
          <select className="rounded border px-3 py-2 text-sm" value={line.warehouse_id ?? ""} onChange={(e) => setLine((p) => ({ ...p, warehouse_id: e.target.value ? Number(e.target.value) : null }))}>
            {warehouses.map((wh) => <option key={wh.id} value={wh.id}>{wh.name}</option>)}
          </select>
          <input className="rounded border px-3 py-2 text-sm" placeholder="Qty" value={line.quantity} onChange={(e) => setLine((p) => ({ ...p, quantity: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Unit price" value={line.unit_price} onChange={(e) => setLine((p) => ({ ...p, unit_price: e.target.value }))} />
          <button type="button" className="rounded border border-border-strong px-3 py-2 text-sm" onClick={() => setForm((p) => ({ ...p, items: [...p.items, line] }))}>
            Add Line
          </button>
        </div>
        {form.items.length > 0 && (
          <div className="text-xs text-text-secondary">
            {form.items.map((ln, i) => (
              <div key={`${ln.item_id}-${i}`}>Line {i + 1}: {itemName.get(ln.item_id)} · Qty {ln.quantity}</div>
            ))}
            <div className="mt-1 font-medium text-text-secondary">
              Est. base total: {(lineTotal * Number(form.exchange_rate_to_base ?? 1)).toFixed(2)}
            </div>
          </div>
        )}
        {selectedVendor?.default_currency && (
          <div className="text-xs text-status-info-foreground bg-status-info-subtle border border-status-info/20 rounded px-2 py-1">
            Vendor default currency applied: {selectedVendor.default_currency}
          </div>
        )}
        <button className="rounded bg-brand-primary px-3 py-2 text-sm font-medium text-brand-primary-foreground">Create Purchase Order</button>
      </form>

      {loading ? (
        <InventoryTableSkeleton rows={8} cols={7} />
      ) : !orders.length ? (
        <InventoryEmptyState
          title={statusFilter.trim() ? "No purchase orders match this status" : "No purchase orders yet"}
          description={
            statusFilter.trim()
              ? "Clear the status filter or try another value."
              : "Create a purchase order using the form above."
          }
        />
      ) : showCards ? (
        <div className="space-y-3">
          {orders.map((row) => (
            <div key={row.id} className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-text-primary">{row.po_code}</div>
                  <div className="text-sm text-text-secondary">{row.supplier_name}</div>
                  <div className="mt-1 text-xs text-text-muted">
                    {row.vendor_id ? `Vendor #${row.vendor_id} · ` : ""}
                    {row.currency || "—"} · {row.status}
                  </div>
                </div>
                <div className="shrink-0">
                  {(() => {
                    const st = (row.status || "").toUpperCase();
                    const canApprove = st === "DRAFT";
                    const canClose = st === "APPROVED" || st === "PARTIALLY_RECEIVED";
                    const canCancel = st === "DRAFT" || st === "APPROVED" || st === "PARTIALLY_RECEIVED";
                    return (
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
                          <div className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                            <button
                              type="button"
                              className="block min-h-[44px] w-full rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 sm:min-h-0 sm:px-2 sm:py-1.5 sm:text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenActionsId(null);
                                window.open(`/app/inventory/purchase-orders/${row.id}/print`, "_blank", "noopener,noreferrer");
                              }}
                            >
                              Print
                            </button>
                            {canApprove && (
                              <button
                                type="button"
                                className="block min-h-[44px] w-full rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 sm:min-h-0 sm:px-2 sm:py-1.5 sm:text-xs"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  setOpenActionsId(null);
                                  await patchPoStatus(row.id, "APPROVED");
                                }}
                              >
                                Approve
                              </button>
                            )}
                            {canClose && (
                              <button
                                type="button"
                                className="block min-h-[44px] w-full rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 sm:min-h-0 sm:px-2 sm:py-1.5 sm:text-xs"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  setOpenActionsId(null);
                                  await patchPoStatus(row.id, "CLOSED");
                                }}
                              >
                                Close
                              </button>
                            )}
                            {canCancel && (
                              <button
                                type="button"
                                className="block min-h-[44px] w-full rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 sm:min-h-0 sm:px-2 sm:py-1.5 sm:text-xs"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  setOpenActionsId(null);
                                  await patchPoStatus(row.id, "CANCELLED");
                                }}
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
              <div className="mt-2 text-xs leading-relaxed text-text-secondary">
                {row.items.map((ln) => `${itemName.get(ln.item_id) || `#${ln.item_id}`} (${ln.quantity})`).join(", ")}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={`rounded-xl border border-border bg-surface-raised ${inventoryScrollTableClass}`}>
          <table className="min-w-[880px] w-full">
            <thead className="bg-surface-subtle">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">PO Code</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Supplier</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Vendor</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Currency</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Status</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Items</th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-text-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {orders.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 text-sm font-medium">{row.po_code}</td>
                  <td className="px-3 py-2 text-sm">{row.supplier_name}</td>
                  <td className="px-3 py-2 text-sm">{row.vendor_id ? `#${row.vendor_id}` : "—"}</td>
                  <td className="px-3 py-2 text-sm">{row.currency || "—"}</td>
                  <td className="px-3 py-2 text-sm">{row.status}</td>
                  <td className="px-3 py-2 text-xs text-text-secondary">
                    {row.items.map((ln) => `${itemName.get(ln.item_id) || `#${ln.item_id}`} (${ln.quantity})`).join(", ")}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {(() => {
                      const st = (row.status || "").toUpperCase();
                      const canApprove = st === "DRAFT";
                      const canClose = st === "APPROVED" || st === "PARTIALLY_RECEIVED";
                      const canCancel = st === "DRAFT" || st === "APPROVED" || st === "PARTIALLY_RECEIVED";
                      return (
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
                            <div className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                              <button
                                type="button"
                                className="block min-h-[44px] w-full rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 sm:min-h-0 sm:px-2 sm:py-1.5 sm:text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenActionsId(null);
                                  window.open(`/app/inventory/purchase-orders/${row.id}/print`, "_blank", "noopener,noreferrer");
                                }}
                              >
                                Print
                              </button>
                              {canApprove && (
                                <button
                                  type="button"
                                  className="block min-h-[44px] w-full rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 sm:min-h-0 sm:px-2 sm:py-1.5 sm:text-xs"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    setOpenActionsId(null);
                                    await patchPoStatus(row.id, "APPROVED");
                                  }}
                                >
                                  Approve
                                </button>
                              )}
                              {canClose && (
                                <button
                                  type="button"
                                  className="block min-h-[44px] w-full rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 sm:min-h-0 sm:px-2 sm:py-1.5 sm:text-xs"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    setOpenActionsId(null);
                                    await patchPoStatus(row.id, "CLOSED");
                                  }}
                                >
                                  Close
                                </button>
                              )}
                              {canCancel && (
                                <button
                                  type="button"
                                  className="block min-h-[44px] w-full rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 sm:min-h-0 sm:px-2 sm:py-1.5 sm:text-xs"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    setOpenActionsId(null);
                                    await patchPoStatus(row.id, "CANCELLED");
                                  }}
                                >
                                  Cancel
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && orders.length > 0 && poTotalPages > 1 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>
            Page {poPage} of {poTotalPages} ({poTotal} total)
          </span>
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setPoPage((p) => Math.max(1, p - 1))}
              disabled={poPage <= 1}
              className="rounded-md border border-border-strong px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            {visiblePoPages.map((pageNo) => (
              <button
                key={pageNo}
                type="button"
                onClick={() => setPoPage(pageNo)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                  pageNo === poPage
                    ? "bg-brand-primary text-brand-primary-foreground"
                    : "border border-border-strong text-text-secondary hover:bg-surface-subtle"
                }`}
              >
                {pageNo}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPoPage((p) => p + 1)}
              disabled={poPage >= poTotalPages}
              className="rounded-md border border-border-strong px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
