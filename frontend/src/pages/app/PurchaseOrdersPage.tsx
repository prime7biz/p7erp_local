import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  api,
  type GoodsReceivingResponse,
  type InventoryItemResponse,
  type PurchaseOrderCreate,
  type PurchaseOrderItemCreate,
  type PurchaseOrderReceiptProgress,
  type PurchaseOrderResponse,
  type VendorResponse,
  type WarehouseResponse,
} from "@/api/client";
import {
  InventoryEmptyState,
  InventoryErrorPanel,
  InventoryTableSkeleton,
} from "@/components/inventory/InventoryListStates";
import { InventoryListViewToggle, touchFieldClass } from "@/components/inventory/InventoryMobileList";
import { useListViewPreference } from "@/hooks/useInventoryListView";
import { logApiError } from "@/utils/logApiError";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { DataTablePagination } from "@/components/app/DataTablePagination";
import {
  listPageFilterBarClass,
  listPageFilterPanelClass,
  listPageKpiCardClass,
  listPageRootClass,
  listPageTableCardClass,
  listTableBaseClass,
  listTableTdClass,
  listTableTdPrimaryClass,
  listTableThClass,
  listTableThRightClass,
  listTableTheadClass,
  listTableTrClass,
} from "@/components/app/listPageLayout";
import { ResponsiveTableContainer } from "@/components/app/ResponsiveTableContainer";
import { useListPagination } from "@/hooks/useListPagination";
import { cn } from "@/lib/utils";

export function PurchaseOrdersPage() {
  const navigate = useNavigate();
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
  const { pageSize, setPageSize } = useListPagination();
  const [poPage, setPoPage] = useState(1);
  const [poTotal, setPoTotal] = useState(0);
  const { isNarrow, view, setView, showCards } = useListViewPreference();

  /** Receipt progress + received GRNs for vendor bill drafts */
  const [poTrace, setPoTrace] = useState<{
    po: PurchaseOrderResponse;
    progress: PurchaseOrderReceiptProgress | null;
    grns: GoodsReceivingResponse[];
    loading: boolean;
    error: string;
    vendorBillBusyId: number | null;
  } | null>(null);
  const [poBanner, setPoBanner] = useState("");

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
          page_size: pageSize,
        }),
        api.listInventoryItemsPaginated({ page: 1, page_size: 500 }),
        api.listWarehouses(),
        api.listVendorsPaginated({ is_active: true, page: 1, page_size: 500 }),
      ]);
      setOrders(poRes.items);
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
  }, [statusFilter, poPage, pageSize]);

  useEffect(() => {
    setPoPage(1);
  }, [statusFilter, pageSize]);

  const openPoTrace = useCallback(async (po: PurchaseOrderResponse) => {
    setPoTrace({ po, progress: null, grns: [], loading: true, error: "", vendorBillBusyId: null });
    try {
      const [progress, grnPage] = await Promise.all([
        api.getPurchaseOrderReceiptProgress(po.id),
        api.listGoodsReceivingPaginated({
          purchase_order_id: po.id,
          status_filter: "RECEIVED",
          page: 1,
          page_size: 50,
        }),
      ]);
      setPoTrace((prev) =>
        prev && prev.po.id === po.id
          ? { ...prev, progress, grns: grnPage.items, loading: false, error: "" }
          : prev,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load receipt data";
      setPoTrace((prev) => (prev && prev.po.id === po.id ? { ...prev, loading: false, error: msg } : prev));
      logApiError("PurchaseOrdersPage.openPoTrace", e);
    }
  }, []);

  const createVendorBillFromGrn = useCallback(
    async (grnId: number) => {
      setPoTrace((prev) => (prev ? { ...prev, vendorBillBusyId: grnId, error: "" } : prev));
      try {
        const r = await api.createVendorBillDraftFromGrn(grnId);
        setPoBanner(`Vendor bill draft ${r.bill_code} created. Go to Finance → Vendor bills (GRN) to enter invoice ref and post.`);
        setPoTrace(null);
        navigate(`/app/accounts/vendor-bills`);
        void load();
      } catch (e) {
        logApiError("PurchaseOrdersPage.createVendorBillFromGrn", e);
        const msg = e instanceof Error ? e.message : "Failed to create vendor bill";
        setPoTrace((prev) => (prev ? { ...prev, vendorBillBusyId: null, error: msg } : prev));
      }
    },
    [navigate, load],
  );

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

  const selectedVendor = useMemo(
    () => vendors.find((v) => v.id === (form.vendor_id ?? -1)) ?? null,
    [vendors, form.vendor_id]
  );
  const lineTotal = useMemo(
    () => form.items.reduce((acc, ln) => acc + Number(ln.quantity || 0) * Number(ln.unit_price || 0), 0),
    [form.items]
  );

  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Purchase Orders"
        description="Procurement · Create POs and move them through approval. Link vendors from the supplier master; receive into stock via Goods Receiving. Fields marked with ** are mandatory."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/app/vendors"
              className="rounded-lg border border-border-strong px-3 py-2 text-xs font-semibold text-text-secondary hover:bg-surface-subtle"
            >
              Vendors
            </Link>
            <Link
              to="/app/inventory/goods-receiving"
              className="rounded-lg border border-border-strong px-3 py-2 text-xs font-semibold text-text-secondary hover:bg-surface-subtle"
            >
              Goods receiving
            </Link>
          </div>
        }
      />
      {error ? <InventoryErrorPanel message={error} onRetry={() => void load()} /> : null}
      {poBanner ? (
        <div className="rounded-lg border border-status-success/30 bg-status-success-subtle px-3 py-2 text-sm text-status-success-foreground">
          {poBanner}{" "}
          <button type="button" className="underline" onClick={() => setPoBanner("")}>
            Dismiss
          </button>
        </div>
      ) : null}
      <div className={cn(listPageFilterBarClass, "sm:justify-between")}>
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
        className={listPageFilterPanelClass}
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
      ) : (
        <>
        {showCards ? (
        <div className="space-y-3">
          {orders.map((row) => (
            <div key={row.id} className={listPageKpiCardClass}>
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
                            <button
                              type="button"
                              className="block min-h-[44px] w-full rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 sm:min-h-0 sm:px-2 sm:py-1.5 sm:text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenActionsId(null);
                                void openPoTrace(row);
                              }}
                            >
                              Receipt progress &amp; vendor bill
                            </button>
                            <Link
                              to={`/app/inventory/goods-receiving?po=${row.id}`}
                              className="block min-h-[44px] w-full rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 sm:min-h-0 sm:px-2 sm:py-1.5 sm:text-xs"
                              onClick={() => setOpenActionsId(null)}
                            >
                              Goods receiving (this PO)
                            </Link>
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
        <div className={listPageTableCardClass}>
          <ResponsiveTableContainer>
            <table className={cn(listTableBaseClass, "min-w-[880px]")}>
              <thead className={listTableTheadClass}>
              <tr>
                <th className={listTableThClass}>PO Code</th>
                <th className={listTableThClass}>Supplier</th>
                <th className={listTableThClass}>Vendor</th>
                <th className={listTableThClass}>Currency</th>
                <th className={listTableThClass}>Status</th>
                <th className={listTableThClass}>Items</th>
                <th className={listTableThRightClass}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((row) => (
                <tr key={row.id} className={listTableTrClass}>
                  <td className={listTableTdPrimaryClass}>{row.po_code}</td>
                  <td className={cn(listTableTdClass, "text-text-primary")}>{row.supplier_name}</td>
                  <td className={listTableTdClass}>{row.vendor_id ? `#${row.vendor_id}` : "—"}</td>
                  <td className={listTableTdClass}>{row.currency || "—"}</td>
                  <td className={listTableTdClass}>{row.status}</td>
                  <td className={cn(listTableTdClass, "text-xs")}>
                    {row.items.map((ln) => `${itemName.get(ln.item_id) || `#${ln.item_id}`} (${ln.quantity})`).join(", ")}
                  </td>
                  <td className={cn(listTableTdClass, "text-right")}>
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
                              <button
                                type="button"
                                className="block min-h-[44px] w-full rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 sm:min-h-0 sm:px-2 sm:py-1.5 sm:text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenActionsId(null);
                                  void openPoTrace(row);
                                }}
                              >
                                Receipt progress &amp; vendor bill
                              </button>
                              <Link
                                to={`/app/inventory/goods-receiving?po=${row.id}`}
                                className="block min-h-[44px] w-full rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 sm:min-h-0 sm:px-2 sm:py-1.5 sm:text-xs"
                                onClick={() => setOpenActionsId(null)}
                              >
                                Goods receiving (this PO)
                              </Link>
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
          </ResponsiveTableContainer>
          {!loading && poTotal > 0 ? (
            <DataTablePagination
              page={poPage}
              pageSize={pageSize}
              total={poTotal}
              onPageChange={setPoPage}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setPoPage(1);
              }}
            />
          ) : null}
        </div>
      )}
      {!loading && poTotal > 0 && showCards ? (
        <div className={listPageTableCardClass}>
          <DataTablePagination
            page={poPage}
            pageSize={pageSize}
            total={poTotal}
            onPageChange={setPoPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPoPage(1);
            }}
          />
        </div>
      ) : null}
        </>
      )}

      {poTrace ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="po-trace-title"
        >
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-border bg-surface-raised p-4 shadow-lg">
            <div className="flex items-start justify-between gap-2">
              <h2 id="po-trace-title" className="text-lg font-semibold text-text-primary">
                {poTrace.po.po_code} — receipt &amp; AP
              </h2>
              <button
                type="button"
                className="rounded border px-2 py-1 text-sm text-text-secondary"
                onClick={() => setPoTrace(null)}
              >
                Close
              </button>
            </div>
            <p className="mt-1 text-xs text-text-muted">
              Ordered vs accepted-received vs pending (per PO line). Create a finance vendor bill draft from a received GRN.
            </p>
            {poTrace.error ? (
              <div className="mt-2 rounded border border-status-danger/20 bg-status-danger-subtle p-2 text-sm text-status-danger-foreground">
                {poTrace.error}
              </div>
            ) : null}
            {poTrace.loading ? (
              <p className="mt-4 text-sm text-text-muted">Loading…</p>
            ) : poTrace.progress ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b text-text-secondary">
                      <th className="py-1 pr-2">Line</th>
                      <th className="py-1 pr-2">Item</th>
                      <th className="py-1 pr-2 text-right">Ordered</th>
                      <th className="py-1 pr-2 text-right">Accepted recv.</th>
                      <th className="py-1 text-right">Pending</th>
                    </tr>
                  </thead>
                  <tbody>
                    {poTrace.progress.lines.map((ln) => (
                      <tr key={ln.purchase_order_line_id} className="border-b border-border/50">
                        <td className="py-1 pr-2">#{ln.purchase_order_line_id}</td>
                        <td className="py-1 pr-2">{itemName.get(ln.item_id) ?? `#${ln.item_id}`}</td>
                        <td className="py-1 pr-2 text-right">{ln.ordered_qty}</td>
                        <td className="py-1 pr-2 text-right">{ln.accepted_received_qty}</td>
                        <td className="py-1 text-right">{ln.pending_qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <h3 className="mt-6 text-sm font-semibold text-text-primary">Received GRNs — vendor bill draft</h3>
            {poTrace.loading ? null : poTrace.grns.length === 0 ? (
              <p className="mt-1 text-xs text-text-muted">No RECEIVED GRNs for this PO yet.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {poTrace.grns.map((g) => (
                  <li
                    key={g.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-border px-2 py-2"
                  >
                    <span>
                      {g.grn_code} · status {g.status}
                      {g.received_date ? ` · ${g.received_date}` : ""}
                    </span>
                    <button
                      type="button"
                      disabled={poTrace.vendorBillBusyId === g.id}
                      className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      onClick={() => void createVendorBillFromGrn(g.id)}
                    >
                      {poTrace.vendorBillBusyId === g.id ? "Creating…" : "Create vendor bill draft"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
