import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
import { PoColorSizeGrid } from "@/components/inventory/PoColorSizeGrid";
import { MasterQuickAddModal } from "@/components/app/MasterQuickAddModal";
import { VendorQuickCreateModal } from "@/components/quick-create/VendorQuickCreateModal";
import { VoucherActionReasonModal } from "@/components/vouchers/VoucherActionReasonModal";
import { alternateToBase, parseFactor, type LineUnitMode } from "@/lib/unitConversion";
import { useListViewPreference } from "@/hooks/useInventoryListView";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { sumMoneyBy } from "@/lib/money";
import { logApiError } from "@/utils/logApiError";
import { useAuth } from "@/context/AuthContext";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { DataTablePagination } from "@/components/app/DataTablePagination";
import { DataGrid, type GridColumn } from "@/components/app/data-grid/DataGrid";
import { RowActionsMenu, type RowActionItem } from "@/components/app/RowActionsMenu";
import { useConfirm } from "@/components/app/useConfirm";
import { toast } from "sonner";
import {
  listPageFilterBarClass,
  listPageFilterPanelClass,
  listPageKpiCardClass,
  listPageRootClass,
  listPageTableCardClass,
} from "@/components/app/listPageLayout";
import { useListPagination } from "@/hooks/useListPagination";
import { useFormDirty } from "@/hooks/useFormDirty";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { cn } from "@/lib/utils";
import { getInventoryItemsCached, getVendorsCached, getWarehousesCached } from "@/lib/masterData";
import { RemoteSearchSelect } from "@/components/app/RemoteSearchSelect";
import { fetchInventoryItemPage, fetchVendorPage, hydrateInventoryItem, hydrateVendor } from "@/lib/remoteSelectFetchers";

export function PurchaseOrdersPage() {
  const navigate = useNavigate();
  const { me } = useAuth();
  const supplierPortalOn = me?.feature_flags?.supplier_portal_enabled === true;
  const poGridOn = me?.feature_flags?.po_color_size_matrix_enabled === true;
  const [searchParams] = useSearchParams();
  const orderIdFilter = Number(searchParams.get("order_id") || 0) || undefined;
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
  const formDirty = useFormDirty(form);
  useUnsavedChangesGuard(formDirty);
  const [line, setLine] = useState<PurchaseOrderItemCreate>({ item_id: 0, warehouse_id: null, quantity: "0", unit_price: "0" });
  const [lineHint, setLineHint] = useState("");
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const { pageSize, setPageSize } = useListPagination();
  const [poPage, setPoPage] = useState(1);
  const [poTotal, setPoTotal] = useState(0);
  const { isNarrow, view, setView, showCards } = useListViewPreference();
  const latest = useLatestRequest();

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
  const [vendorCreateOpen, setVendorCreateOpen] = useState(false);
  const [itemCreateLists, setItemCreateLists] = useState<{
    categories: { id: number; name: string }[];
    subcategories: { id: number; name: string; category_id: number }[];
    units: { id: number; name: string }[];
  } | null>(null);

  const itemName = useMemo(() => new Map(items.map((i) => [i.id, i.name])), [items]);

  const [lineUnit, setLineUnit] = useState<LineUnitMode>("base");
  const [lineFactor, setLineFactor] = useState("");
  const lineItem = items.find((i) => i.id === line.item_id);
  const lineAltUnit = (lineItem?.alternate_unit ?? "").trim() || null;
  const lineBaseUnit = (lineItem?.base_unit ?? "").trim() || "base unit";
  const lineFactorNum = parseFactor(lineFactor);

  useEffect(() => {
    setLineUnit("base");
    setLineFactor(lineItem?.conversion_factor ?? "");
  }, [lineItem?.id, lineItem?.conversion_factor]);

  function addPoLine() {
    if (lineUnit === "alternate" && lineAltUnit) {
      if (!lineFactorNum) {
        setError(`Enter how many ${lineBaseUnit} make one ${lineAltUnit}.`);
        return;
      }
      const base = alternateToBase(line.quantity, line.unit_price, lineFactorNum);
      setForm((p) => ({ ...p, items: [...p.items, { ...line, ...base }] }));
      setLineHint(`Added ${line.quantity} ${lineAltUnit} = ${base.quantity} ${lineBaseUnit} @ ${base.unit_price}`);
      return;
    }
    setForm((p) => ({ ...p, items: [...p.items, line] }));
  }

  async function openItemCreate() {
    try {
      const [categories, subcategories, units] = await Promise.all([
        api.listInventoryItemCategories({ limit: 500 }),
        api.listInventoryItemSubcategories({ limit: 500 }),
        api.listInventoryItemUnits({ limit: 500 }),
      ]);
      if (categories.length === 0 || units.length === 0) {
        toast.error("Add at least one item category and unit first (Inventory → Items).");
        return;
      }
      setItemCreateLists({ categories, subcategories, units });
    } catch (e) {
      logApiError("PurchaseOrdersPage.openItemCreate", e);
      toast.error("Could not load categories and units.");
    }
  }

  useEffect(() => {
    const close = () => setOpenActionsId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const load = useCallback(async () => {
    const token = latest.begin();
    setError("");
    setLoading(true);
    try {
      const [poRes, itmRes, wh, vndRes] = await Promise.all([
        api.listPurchaseOrdersPaginated({
          status_filter: statusFilter.trim() || undefined,
          order_id: orderIdFilter,
          page: poPage,
          page_size: pageSize,
        }),
        getInventoryItemsCached(),
        getWarehousesCached(),
        getVendorsCached({ is_active: true }),
      ]);
      if (!latest.isCurrent(token)) return;
      setOrders(poRes.items);
      setPoTotal(poRes.total);
      const itm = itmRes;
      setItems(itm);
      setWarehouses(wh);
      setVendors(vndRes);
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
      logApiError("PurchaseOrdersPage.load", e);
      if (!latest.isCurrent(token)) return;
      setError(e instanceof Error ? e.message : "Failed to load purchase orders");
    } finally {
      if (latest.isCurrent(token)) setLoading(false);
    }
  }, [latest, statusFilter, poPage, pageSize, orderIdFilter]);

  useEffect(() => {
    setPoPage(1);
  }, [statusFilter, pageSize, orderIdFilter]);

  const openPoTrace = useCallback(async (po: PurchaseOrderResponse) => {
    setPoTrace({ po, progress: null, grns: [], loading: true, error: "", vendorBillBusyId: null });
    try {
      const [progress, grnPage, poDetail] = await Promise.all([
        api.getPurchaseOrderReceiptProgress(po.id),
        api.listGoodsReceivingPaginated({
          purchase_order_id: po.id,
          status_filter: "RECEIVED",
          page: 1,
          page_size: 50,
        }),
        api.getPurchaseOrder(po.id).catch((e) => {
          logApiError("PurchaseOrdersPage.getPurchaseOrder", e);
          return po;
        }),
      ]);
      setPoTrace((prev) =>
        prev && prev.po.id === po.id
          ? { ...prev, po: poDetail, progress, grns: grnPage.items, loading: false, error: "" }
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

  const [statusReason, setStatusReason] = useState<{
    ids: number[];
    target: "CLOSED" | "CANCELLED";
    clear?: () => void;
  } | null>(null);

  const patchPoStatus = useCallback(
    async (id: number, nextStatus: string, reason?: string) => {
      setError("");
      try {
        await api.updatePurchaseOrderStatus(id, nextStatus, reason);
        await load();
      } catch (e) {
        logApiError(`PurchaseOrdersPage.updateStatus(${nextStatus})`, e);
        setError(e instanceof Error ? e.message : "Failed to update purchase order");
      }
    },
    [load],
  );

  /** Close / Cancel ask for a reason first (kept in the PO history); other status changes run directly. */
  const requestPoStatus = useCallback(
    (id: number, nextStatus: string) => {
      if (nextStatus === "CLOSED" || nextStatus === "CANCELLED") setStatusReason({ ids: [id], target: nextStatus });
      else void patchPoStatus(id, nextStatus);
    },
    [patchPoStatus],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const [bulkBusy, setBulkBusy] = useState(false);
  const confirm = useConfirm();
  const vendorName = useMemo(() => new Map(vendors.map((v) => [v.id, v.name])), [vendors]);

  const runBulkPoStatus = useCallback(
    async (ids: number[], target: "APPROVED" | "CLOSED" | "CANCELLED", clear: () => void, reason?: string) => {
      const verb = target === "APPROVED" ? "approve" : target === "CLOSED" ? "close" : "cancel";
      setBulkBusy(true);
      try {
        const res = await api.bulkPurchaseOrderStatus(ids, target, reason);
        const skipped = res.skipped?.length ?? 0;
        if (skipped) toast.warning(`${res.updated} updated, ${skipped} skipped (status does not allow ${verb})`);
        else toast.success(`${res.updated} purchase order${res.updated === 1 ? "" : "s"} updated`);
        clear();
        await load();
      } catch (e) {
        logApiError("PurchaseOrdersPage.bulkStatus", e);
        toast.error(e instanceof Error ? e.message : "Bulk update failed");
      } finally {
        setBulkBusy(false);
      }
    },
    [load],
  );

  const bulkSetPoStatus = useCallback(
    async (selected: PurchaseOrderResponse[], target: "APPROVED" | "CLOSED" | "CANCELLED", clear: () => void) => {
      if (target !== "APPROVED") {
        setStatusReason({ ids: selected.map((r) => r.id), target, clear });
        return;
      }
      const verb = "Approve";
      const ok = await confirm({
        title: `${verb} ${selected.length} purchase order${selected.length === 1 ? "" : "s"}?`,
        description: "Orders whose current status does not allow this change are skipped.",
        confirmLabel: verb,
        danger: false,
      });
      if (!ok) return;
      await runBulkPoStatus(selected.map((r) => r.id), target, clear);
    },
    [confirm, runBulkPoStatus],
  );

  const poColumns = useMemo<GridColumn<PurchaseOrderResponse>[]>(
    () => [
      {
        id: "po_code",
        header: "PO Code",
        alwaysVisible: true,
        value: (r) => r.po_code,
        cell: (r) => <span className="font-semibold text-text-primary">{r.po_code}</span>,
      },
      { id: "supplier", header: "Supplier", value: (r) => r.supplier_name, cell: (r) => <span className="text-text-primary">{r.supplier_name}</span> },
      {
        id: "vendor",
        header: "Vendor",
        value: (r) => (r.vendor_id ? vendorName.get(r.vendor_id) ?? `#${r.vendor_id}` : ""),
        cell: (r) => (r.vendor_id ? vendorName.get(r.vendor_id) ?? `#${r.vendor_id}` : "—"),
      },
      { id: "currency", header: "Currency", value: (r) => r.currency ?? "", cell: (r) => r.currency || "—" },
      { id: "status", header: "Status", value: (r) => r.status, cell: (r) => r.status },
      {
        id: "items",
        header: "Items",
        enableSorting: false,
        value: (r) => r.items.map((ln) => `${itemName.get(ln.item_id) || `#${ln.item_id}`} (${ln.quantity})`).join(", "),
        cell: (r) => (
          <span className="text-xs">
            {r.items.map((ln) => `${itemName.get(ln.item_id) || `#${ln.item_id}`} (${ln.quantity})`).join(", ")}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        align: "right",
        alwaysVisible: true,
        noExport: true,
        enableSorting: false,
        cell: (r) => {
          const st = (r.status || "").toUpperCase();
          const items: RowActionItem[] = [
            { key: "print", label: "Print", href: `/app/inventory/purchase-orders/${r.id}/print` },
            { key: "trace", label: "Receipt progress & vendor bill", onClick: () => void openPoTrace(r) },
            { key: "grn", label: "Goods receiving (this PO)", href: `/app/inventory/goods-receiving?po=${r.id}` },
          ];
          if (st === "DRAFT") items.push({ key: "approve", label: "Approve", onClick: () => void patchPoStatus(r.id, "APPROVED") });
          if (st === "APPROVED" || st === "PARTIALLY_RECEIVED")
            items.push({ key: "close", label: "Close (pre-close)", onClick: () => requestPoStatus(r.id, "CLOSED") });
          if (st === "DRAFT" || st === "APPROVED" || st === "PARTIALLY_RECEIVED")
            items.push({ key: "cancel", label: "Cancel", danger: true, onClick: () => requestPoStatus(r.id, "CANCELLED") });
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <RowActionsMenu rowId={r.id} openId={openActionsId} onOpenChange={(id) => setOpenActionsId(id as number | null)} items={items} />
            </div>
          );
        },
      },
    ],
    [itemName, vendorName, openActionsId, openPoTrace, patchPoStatus, requestPoStatus],
  );

  const selectedVendor = useMemo(
    () => vendors.find((v) => v.id === (form.vendor_id ?? -1)) ?? null,
    [vendors, form.vendor_id]
  );
  const lineTotal = useMemo(
    () => sumMoneyBy(form.items, (ln) => Number(ln.quantity || 0) * Number(ln.unit_price || 0)),
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
              to="/app/inventory/vendors"
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
          <div className="flex gap-1">
          <RemoteSearchSelect<VendorResponse>
            className="flex-1"
            value={form.vendor_id ?? ""}
            aria-label="Vendor"
            placeholder="Select vendor (optional)"
            fetchPage={fetchVendorPage}
            hydrateById={hydrateVendor}
            onCreateNew={() => setVendorCreateOpen(true)}
            createLabel="supplier"
            onChange={(next, opt) => {
              const nextId = next === "" ? null : next;
              const nextVendor = opt?.meta ?? vendors.find((v) => v.id === nextId) ?? null;
              if (nextVendor && !vendors.some((v) => v.id === nextVendor.id)) setVendors((prev) => [...prev, nextVendor]);
              setForm((p) => ({
                ...p,
                vendor_id: nextId,
                supplier_name: nextVendor?.name || p.supplier_name || "",
                currency: nextVendor?.default_currency || p.currency || "USD",
              }));
            }}
          />
          <button
            type="button"
            className="shrink-0 rounded border px-2 text-xs font-medium text-brand-primary hover:bg-surface-subtle"
            title="New supplier (Alt+C)"
            onClick={() => setVendorCreateOpen(true)}
          >
            + New
          </button>
          </div>
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
          <div className="flex gap-1">
          <RemoteSearchSelect<InventoryItemResponse>
            className="flex-1"
            value={line.item_id || ""}
            aria-label="Item"
            placeholder="Search item…"
            allowClear={false}
            fetchPage={fetchInventoryItemPage}
            hydrateById={hydrateInventoryItem}
            onCreateNew={() => void openItemCreate()}
            createLabel="item"
            onChange={(next, opt) => {
              if (next === "") return;
              const itemId = next;
              const it = opt?.meta ?? items.find((i) => i.id === itemId);
              if (it && !items.some((i) => i.id === it.id)) setItems((prev) => [...prev, it]);
              const fallbackWh = warehouses[0]?.id ?? null;
              setLine((p) => ({
                ...p,
                item_id: itemId,
                warehouse_id: it?.default_warehouse_id ?? p.warehouse_id ?? fallbackWh,
                unit_price:
                  it?.standard_price && Number(it.standard_price) > 0
                    ? String(it.standard_price)
                    : p.unit_price,
              }));
              const groupLabel =
                it?.stock_group_id != null ? `Group #${it.stock_group_id}` : "No stock group";
              setLineHint(
                it
                  ? `${groupLabel} · stock ${it.current_stock ?? it.default_cost ?? "—"} · avg ${it.avg_cost ?? "—"}`
                  : "",
              );
              if (it?.id) {
                void api
                  .getStockItemDetail(it.id)
                  .then((detail) => {
                    const wholesale = detail.prices.find(
                      (pr) => pr.price_list_name.toLowerCase() === "wholesale" && pr.is_active,
                    );
                    if (wholesale) {
                      setLine((p) => ({ ...p, unit_price: wholesale.price }));
                      setLineHint(
                        `${detail.stock_group_id != null ? `Group #${detail.stock_group_id}` : "No group"} · Wholesale ${wholesale.price} · stock ${detail.current_stock}`,
                      );
                    }
                  })
                  .catch((e) => {
                    logApiError("PurchaseOrdersPage.getStockItemDetail", e);
                  });
              }
            }}
          />
          <button
            type="button"
            className="shrink-0 rounded border px-2 text-xs font-medium text-brand-primary hover:bg-surface-subtle"
            title="New item (Alt+C)"
            onClick={() => void openItemCreate()}
          >
            + New
          </button>
          </div>
          <select className="rounded border px-3 py-2 text-sm" value={line.warehouse_id ?? ""} onChange={(e) => setLine((p) => ({ ...p, warehouse_id: e.target.value ? Number(e.target.value) : null }))}>
            {warehouses.map((wh) => <option key={wh.id} value={wh.id}>{wh.name}</option>)}
          </select>
          <input
            className="rounded border px-3 py-2 text-sm"
            placeholder={lineUnit === "alternate" && lineAltUnit ? `Qty (${lineAltUnit})` : "Qty"}
            value={line.quantity}
            onChange={(e) => setLine((p) => ({ ...p, quantity: e.target.value }))}
          />
          <input
            className="rounded border px-3 py-2 text-sm"
            placeholder={lineUnit === "alternate" && lineAltUnit ? `Price per ${lineAltUnit}` : "Unit price"}
            value={line.unit_price}
            onChange={(e) => setLine((p) => ({ ...p, unit_price: e.target.value }))}
          />
          <button type="button" className="rounded border border-border-strong px-3 py-2 text-sm" onClick={addPoLine}>
            Add Line
          </button>
        </div>
        {lineAltUnit ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
            <span>Enter in:</span>
            <select
              className="rounded border px-2 py-1 text-xs"
              value={lineUnit}
              onChange={(e) => setLineUnit(e.target.value as LineUnitMode)}
            >
              <option value="base">{lineBaseUnit} (base unit)</option>
              <option value="alternate">{lineAltUnit} (alternate unit)</option>
            </select>
            {lineUnit === "alternate" ? (
              <>
                <span>1 {lineAltUnit} =</span>
                <input
                  className="w-24 rounded border px-2 py-1 text-xs"
                  type="number"
                  min="0"
                  step="0.000001"
                  value={lineFactor}
                  onChange={(e) => setLineFactor(e.target.value)}
                  title="Override for this PO only (e.g. this supplier's roll is 48 yards)"
                />
                <span>{lineBaseUnit}</span>
                {lineFactorNum ? (
                  <span className="text-text-muted">
                    → saved as {alternateToBase(line.quantity, line.unit_price, lineFactorNum).quantity} {lineBaseUnit} @{" "}
                    {alternateToBase(line.quantity, line.unit_price, lineFactorNum).unit_price}
                  </span>
                ) : (
                  <span className="text-status-danger-foreground">Enter a factor greater than 0</span>
                )}
              </>
            ) : null}
          </div>
        ) : null}
        {lineHint ? <p className="text-xs text-text-muted">{lineHint}</p> : null}
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
                                  requestPoStatus(row.id, "CLOSED");
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
                                  requestPoStatus(row.id, "CANCELLED");
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
          <DataGrid
            tableKey="inventory.purchase-orders"
            exportName="purchase-orders"
            columns={poColumns}
            rows={orders}
            getRowId={(r) => r.id}
            savedViews={{
              getQuery: () => (statusFilter.trim() ? `status=${encodeURIComponent(statusFilter.trim())}` : ""),
              applyQuery: (query) => setStatusFilter((new URLSearchParams(query).get("status") || "").toUpperCase()),
            }}
            bulkActions={(selected, clear) => (
              <>
                {(["APPROVED", "CLOSED", "CANCELLED"] as const).map((target) => (
                  <button
                    key={target}
                    type="button"
                    disabled={bulkBusy}
                    onClick={() => void bulkSetPoStatus(selected, target, clear)}
                    className={cn(
                      "rounded-lg border bg-surface-raised px-2.5 py-1 font-medium disabled:opacity-50",
                      target === "CANCELLED"
                        ? "border-status-danger/40 text-status-danger hover:bg-status-danger-subtle"
                        : "border-border-strong text-text-secondary hover:bg-surface-subtle",
                    )}
                  >
                    {target === "APPROVED" ? "Approve" : target === "CLOSED" ? "Close" : "Cancel"}
                  </button>
                ))}
              </>
            )}
            footer={
              poTotal > 0 ? (
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
              ) : null
            }
          />
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
            {poTrace.po.vendor_qc_rejection_rate_pct != null ? (
              <p
                className={`mt-2 text-sm ${
                  poTrace.po.vendor_qc_rejection_rate_pct > 5
                    ? "text-status-danger-foreground"
                    : "text-text-secondary"
                }`}
              >
                Vendor QC rejection rate (90d): {poTrace.po.vendor_qc_rejection_rate_pct}%
                {poTrace.po.vendor_qc_rejection_rate_pct > 5 ? " — alert (&gt;5%)" : ""}
                {" · "}
                <Link to="/app/inventory/vendor-scorecard" className="underline">
                  Scorecard
                </Link>
              </p>
            ) : null}
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
            <PoHistory poId={poTrace.po.id} status={poTrace.po.status} />
            {supplierPortalOn ? <PoSupplierUpdates poId={poTrace.po.id} /> : null}
            {poGridOn ? <PoColorSizeGrid poId={poTrace.po.id} /> : null}
          </div>
        </div>
      ) : null}

      <VoucherActionReasonModal
        open={statusReason != null}
        title={
          statusReason
            ? `${statusReason.target === "CLOSED" ? "Close" : "Cancel"} ${statusReason.ids.length > 1 ? `${statusReason.ids.length} purchase orders` : "purchase order"}`
            : "Confirm"
        }
        description={
          statusReason?.target === "CLOSED"
            ? "Pre-close stops waiting for the remaining quantity. The reason and the pending quantity are kept in the PO history."
            : "Cancelled POs cannot be received against. The reason is kept in the PO history."
        }
        confirmLabel={statusReason?.target === "CLOSED" ? "Close PO" : "Cancel PO"}
        onClose={() => setStatusReason(null)}
        onConfirm={(reason) => {
          if (!statusReason) return;
          const { ids, target, clear } = statusReason;
          setStatusReason(null);
          if (clear) void runBulkPoStatus(ids, target, clear, reason);
          else if (ids[0] != null) void patchPoStatus(ids[0], target, reason);
        }}
      />

      <VendorQuickCreateModal
        open={vendorCreateOpen}
        initialName={form.vendor_id ? "" : form.supplier_name ?? ""}
        defaultCurrency={form.currency ?? "USD"}
        onClose={() => setVendorCreateOpen(false)}
        onCreated={(v) => {
          setVendors((prev) => [...prev, v]);
          setForm((p) => ({
            ...p,
            vendor_id: v.id,
            supplier_name: v.name,
            currency: v.default_currency || p.currency || "USD",
          }));
          toast.success(`Supplier ${v.vendor_code} created and selected.`);
        }}
      />
      {itemCreateLists ? (
        <MasterQuickAddModal
          open
          masterType="item"
          categories={itemCreateLists.categories}
          subcategories={itemCreateLists.subcategories}
          units={itemCreateLists.units}
          onClose={() => setItemCreateLists(null)}
          onCreated={(rec) => {
            const created = rec as InventoryItemResponse;
            setItems((prev) => [...prev, created]);
            setLine((p) => ({ ...p, item_id: created.id, warehouse_id: created.default_warehouse_id ?? p.warehouse_id }));
            toast.success(`Item ${created.name} created and selected.`);
          }}
        />
      ) : null}
    </div>
  );
}

function PoHistory({ poId, status }: { poId: number; status: string }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.getPurchaseOrderHistory>>["events"] | null>(null);
  useEffect(() => {
    api
      .getPurchaseOrderHistory(poId)
      .then((r) => setRows(r.events))
      .catch((e) => logApiError("PurchaseOrdersPage.history", e));
  }, [poId, status]);
  return (
    <>
      <h3 className="mt-6 text-sm font-semibold text-text-primary">History</h3>
      {rows == null ? (
        <p className="mt-1 text-xs text-text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-1 text-xs text-text-muted">No status changes recorded yet.</p>
      ) : (
        <ul className="mt-2 space-y-1.5 text-sm">
          {rows.map((ev) => {
            const pending = (ev.extra?.pending_lines as { item_id: number; pending_qty: number }[] | undefined) ?? [];
            return (
              <li key={ev.id} className="rounded border border-border px-2 py-1.5">
                <span className="font-medium">{ev.summary ?? ev.event}</span>
                <span className="text-xs text-text-muted">
                  {" "}
                  · {ev.username ?? "system"} · {ev.at ? new Date(`${ev.at}Z`).toLocaleString() : ""}
                </span>
                {ev.reason ? <p className="text-xs text-text-secondary">Reason: {ev.reason}</p> : null}
                {pending.length > 0 ? (
                  <p className="text-xs text-text-muted">
                    Pending when closed: {pending.map((p) => `item #${p.item_id} × ${p.pending_qty}`).join(", ")}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function PoSupplierUpdates({ poId }: { poId: number }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.listPurchaseOrderSupplierUpdates>> | null>(null);
  useEffect(() => {
    api.listPurchaseOrderSupplierUpdates(poId).then(setRows).catch((e) => logApiError("PurchaseOrdersPage.supplierUpdates", e));
  }, [poId]);
  const label: Record<string, string> = { CONFIRMED: "Confirmed", DECLINED: "Declined", SHIP_DATE: "Ship date", NOTE: "Note" };
  return (
    <>
      <h3 className="mt-6 text-sm font-semibold text-text-primary">Supplier replies (supplier portal)</h3>
      {rows == null ? (
        <p className="mt-1 text-xs text-text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-1 text-xs text-text-muted">The supplier has not replied yet.</p>
      ) : (
        <ul className="mt-2 space-y-1.5 text-sm">
          {rows.map((u) => (
            <li key={u.id} className="rounded border border-border px-2 py-1.5">
              <span className="font-medium">{label[u.kind] ?? u.kind}</span>
              {u.expected_ship_date ? ` · ship ${u.expected_ship_date}` : ""}
              <span className="text-xs text-text-muted"> · {u.supplier_user ?? "supplier"} · {new Date(`${u.created_at}Z`).toLocaleString()}</span>
              {u.message ? <p className="text-xs text-text-secondary">{u.message}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
