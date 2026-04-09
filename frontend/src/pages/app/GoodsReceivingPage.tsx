import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  api,
  type GoodsReceivingCreate,
  type GoodsReceivingResponse,
  type InventoryGlPostingDetail,
  type PurchaseOrderResponse,
  type VendorResponse,
} from "@/api/client";
import { GlPostingsPanel } from "@/components/inventory/GlPostingsPanel";
import {
  InventoryEmptyState,
  InventoryErrorPanel,
  InventoryTableSkeleton,
} from "@/components/inventory/InventoryListStates";
import { logApiError } from "@/utils/logApiError";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { DataTablePagination } from "@/components/app/DataTablePagination";
import {
  listPageFilterPanelClass,
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

/** Phase 3.4: ~44px min touch targets for warehouse floor / mobile use */
const touchField = "min-h-[44px] w-full rounded border border-border px-3 py-3 text-base sm:text-sm touch-manipulation";
const touchBtn =
  "min-h-[44px] touch-manipulation inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 active:opacity-90";
const touchPrimary =
  "min-h-[44px] touch-manipulation inline-flex items-center justify-center rounded-lg bg-brand-primary px-4 py-3 text-base font-medium text-brand-primary-foreground hover:opacity-95 active:opacity-90 sm:text-sm";

export function GoodsReceivingPage() {
  const [searchParams] = useSearchParams();
  const poFilterFromUrl = useMemo(() => {
    const raw = searchParams.get("po");
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [searchParams]);

  const [rows, setRows] = useState<GoodsReceivingResponse[]>([]);
  const [pos, setPos] = useState<PurchaseOrderResponse[]>([]);
  const [vendors, setVendors] = useState<VendorResponse[]>([]);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState(() => {
    if (typeof window === "undefined") return "";
    return (new URLSearchParams(window.location.search).get("status") || "").toUpperCase();
  });
  const [form, setForm] = useState<GoodsReceivingCreate>(() => ({
    purchase_order_id: null,
    vendor_id: null,
    default_warehouse_id: null,
    source_type: "PO",
    non_po_reason: "",
    supplier_delivery_challan_no: "",
    supplier_invoice_no: "",
    vehicle_info: "",
    status: "DRAFT",
    items: [],
  }));
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [expandedGrnId, setExpandedGrnId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [apMessage, setApMessage] = useState("");
  const { pageSize, setPageSize } = useListPagination();
  const [grPage, setGrPage] = useState(1);
  const [grTotal, setGrTotal] = useState(0);
  const [grnPostingsFor, setGrnPostingsFor] = useState<number | null>(null);
  const [grnPostings, setGrnPostings] = useState<InventoryGlPostingDetail[]>([]);
  const [grnPostingsLoading, setGrnPostingsLoading] = useState(false);

  useEffect(() => {
    const close = () => setOpenActionsId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  useEffect(() => {
    if (poFilterFromUrl != null) {
      setForm((p) => ({ ...p, purchase_order_id: poFilterFromUrl, source_type: "PO" }));
    }
  }, [poFilterFromUrl]);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [grRes, poRes, vRes] = await Promise.all([
        api.listGoodsReceivingPaginated({
          status_filter: statusFilter.trim() || undefined,
          purchase_order_id: poFilterFromUrl ?? undefined,
          page: grPage,
          page_size: pageSize,
        }),
        api.listPurchaseOrdersPaginated({ page: 1, page_size: 500 }),
        api.listVendorsPaginated({ is_active: true, page: 1, page_size: 500 }),
      ]);
      setRows(grRes.items);
      setGrTotal(grRes.total);
      setPos(poRes.items);
      setVendors(vRes.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load GRN");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, grPage, pageSize, poFilterFromUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setGrPage(1);
  }, [statusFilter, pageSize, poFilterFromUrl]);

  const receiveGrn = useCallback(
    async (id: number) => {
      setError("");
      try {
        await api.receiveGoods(id);
        await load();
      } catch (e) {
        logApiError("GoodsReceivingPage.receiveGoods", e);
        setError(e instanceof Error ? e.message : "Failed to receive goods");
      }
    },
    [load],
  );

  const createApFromGrn = useCallback(
    async (grnId: number) => {
      setError("");
      setApMessage("");
      try {
        await api.createPayableFromGoodsReceiving(grnId, { due_in_days: 30 });
        setApMessage("Legacy payable bill created (Outstanding Bills).");
        await load();
      } catch (e) {
        logApiError("GoodsReceivingPage.createPayableFromGoodsReceiving", e);
        setError(e instanceof Error ? e.message : "Failed to create payable");
      }
    },
    [load],
  );

  const createVendorBillDraft = useCallback(
    async (grnId: number) => {
      setError("");
      setApMessage("");
      try {
        const r = await api.createVendorBillDraftFromGrn(grnId);
        setApMessage(`Finance vendor bill draft ${r.bill_code} created. Open Finance → Vendor bills (GRN) to post.`);
        await load();
      } catch (e) {
        logApiError("GoodsReceivingPage.createVendorBillDraftFromGrn", e);
        setError(e instanceof Error ? e.message : "Failed to create vendor bill draft");
      }
    },
    [load],
  );

  const acknowledgeGrn = useCallback(
    async (grnId: number) => {
      setError("");
      try {
        await api.acknowledgeGoodsReceiving(grnId);
        setApMessage("Vendor acknowledgement record issued for this GRN.");
        await load();
      } catch (e) {
        logApiError("GoodsReceivingPage.acknowledgeGoodsReceiving", e);
        setError(e instanceof Error ? e.message : "Failed to acknowledge GRN");
      }
    },
    [load],
  );

  const openPrintData = useCallback(async (grnId: number) => {
    setError("");
    try {
      const data = await api.getGoodsReceivingPrintData(grnId);
      const w = window.open("", "_blank", "noopener,noreferrer");
      if (w) {
        w.document.write(`<pre style="font:12px monospace;padding:12px">${JSON.stringify(data, null, 2)}</pre>`);
        w.document.close();
      }
    } catch (e) {
      logApiError("GoodsReceivingPage.getGoodsReceivingPrintData", e);
      setError(e instanceof Error ? e.message : "Failed to load print payload");
    }
  }, []);

  return (
    <div className={cn(listPageRootClass, "touch-manipulation")}>
      <AppPageHeader
        title="Goods Receiving (GRN)"
        description="Inventory · PO and non-PO receipts with accepted/rejected quantities, acknowledgement, and finance vendor bills. Larger tap targets for warehouse use."
        actions={
          <Link
            to="/app/purchase-orders"
            className="rounded-lg border border-border-strong px-3 py-2 text-xs font-semibold text-text-secondary hover:bg-surface-subtle min-h-[44px] inline-flex items-center"
          >
            Purchase orders
          </Link>
        }
      />
      {error ? <InventoryErrorPanel message={error} onRetry={() => void load()} /> : null}
      {apMessage ? (
        <div className="rounded-lg border border-status-success/30 bg-status-success-subtle px-3 py-2 text-sm text-status-success-foreground">{apMessage}</div>
      ) : null}
      {poFilterFromUrl != null ? (
        <div className="rounded-lg border border-status-info/30 bg-status-info-subtle px-3 py-2 text-sm text-status-info-foreground">
          Filtered to purchase order #{poFilterFromUrl}.{" "}
          <Link to="/app/inventory/goods-receiving" className="underline font-medium">
            Clear PO filter
          </Link>
        </div>
      ) : null}

      <div className={listPageFilterPanelClass}>
        <label className="mb-2 block text-xs font-semibold text-text-secondary">Status filter</label>
        <input
          className={touchField}
          value={statusFilter}
          placeholder="e.g. DRAFT"
          onChange={(e) => setStatusFilter(e.target.value.toUpperCase())}
          aria-label="Filter by status"
        />
      </div>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          const st = (form.source_type || "PO").toUpperCase();
          if (st === "NON_PO" && !(form.non_po_reason || "").trim()) {
            setError("Non-PO receipts require a reason (governance).");
            return;
          }
          if (st === "NON_PO" && form.purchase_order_id) {
            setError("Non-PO receipt should not include a purchase order.");
            return;
          }
          try {
            const payload: GoodsReceivingCreate = {
              ...form,
              source_type: st,
              non_po_reason: st === "NON_PO" ? (form.non_po_reason || "").trim() : undefined,
              supplier_delivery_challan_no: form.supplier_delivery_challan_no?.trim() || undefined,
              supplier_invoice_no: form.supplier_invoice_no?.trim() || undefined,
              vehicle_info: form.vehicle_info?.trim() || undefined,
            };
            await api.createGoodsReceiving(payload);
            setForm({
              purchase_order_id: poFilterFromUrl,
              vendor_id: null,
              default_warehouse_id: null,
              source_type: poFilterFromUrl ? "PO" : "PO",
              non_po_reason: "",
              supplier_delivery_challan_no: "",
              supplier_invoice_no: "",
              vehicle_info: "",
              status: "DRAFT",
              items: [],
            });
            await load();
          } catch (err) {
            logApiError("GoodsReceivingPage.createGoodsReceiving", err);
            setError(err instanceof Error ? err.message : "Failed to create GRN");
          }
        }}
        className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-surface-raised p-4 shadow-sm md:grid-cols-2 lg:grid-cols-4 md:gap-2"
      >
        <select
          className={touchField}
          value={form.source_type ?? "PO"}
          onChange={(e) =>
            setForm((p) => ({
              ...p,
              source_type: e.target.value,
              purchase_order_id: e.target.value === "NON_PO" ? null : p.purchase_order_id,
            }))
          }
          aria-label="Receipt source type"
        >
          <option value="PO">PO receipt</option>
          <option value="NON_PO">Non-PO receipt</option>
        </select>
        <select
          className={touchField}
          value={form.purchase_order_id ?? ""}
          onChange={(e) => setForm((p) => ({ ...p, purchase_order_id: e.target.value ? Number(e.target.value) : null }))}
          aria-label="Purchase order"
          disabled={(form.source_type || "PO").toUpperCase() === "NON_PO"}
        >
          <option value="">Select PO</option>
          {pos.map((po) => (
            <option key={po.id} value={po.id}>
              {po.po_code} ({po.status})
            </option>
          ))}
        </select>
        <select
          className={touchField}
          value={form.vendor_id ?? ""}
          onChange={(e) => setForm((p) => ({ ...p, vendor_id: e.target.value ? Number(e.target.value) : null }))}
          aria-label="Vendor"
        >
          <option value="">Vendor (optional / non-PO)</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.vendor_code} — {v.name}
            </option>
          ))}
        </select>
        <input
          className={touchField}
          type="number"
          min={0}
          placeholder="Default warehouse ID (optional)"
          value={form.default_warehouse_id ?? ""}
          onChange={(e) =>
            setForm((p) => ({ ...p, default_warehouse_id: e.target.value ? Number(e.target.value) : null }))
          }
        />
        <input
          className={touchField}
          placeholder="Supplier challan no."
          value={form.supplier_delivery_challan_no ?? ""}
          onChange={(e) => setForm((p) => ({ ...p, supplier_delivery_challan_no: e.target.value }))}
        />
        <input
          className={touchField}
          placeholder="Supplier invoice no."
          value={form.supplier_invoice_no ?? ""}
          onChange={(e) => setForm((p) => ({ ...p, supplier_invoice_no: e.target.value }))}
        />
        <input
          className={touchField}
          placeholder="Vehicle info"
          value={form.vehicle_info ?? ""}
          onChange={(e) => setForm((p) => ({ ...p, vehicle_info: e.target.value }))}
        />
        <input
          className={touchField}
          type="date"
          value={form.received_date ?? ""}
          onChange={(e) => setForm((p) => ({ ...p, received_date: e.target.value }))}
        />
        <input
          className={cn(touchField, "md:col-span-2")}
          placeholder="Non-PO reason (required for non-PO)"
          value={form.non_po_reason ?? ""}
          onChange={(e) => setForm((p) => ({ ...p, non_po_reason: e.target.value }))}
        />
        <input
          className={cn(touchField, "md:col-span-2")}
          placeholder="Notes"
          value={form.notes ?? ""}
          onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
        />
        <button type="submit" className={`${touchPrimary} md:col-span-2 lg:col-span-1`}>
          Create GRN (header)
        </button>
        <p className="text-xs text-text-muted md:col-span-2 lg:col-span-3">
          Line items are usually added when receiving from an approved PO via the backend workflow. Use <strong>Receive to stock</strong> on a draft GRN to post quantities.
        </p>
      </form>

      {loading ? (
        <InventoryTableSkeleton rows={8} cols={5} />
      ) : !rows.length ? (
        <InventoryEmptyState
          title={statusFilter.trim() ? "No GRNs match this status" : "No goods receiving notes yet"}
          description={
            statusFilter.trim()
              ? "Clear the status filter to see all GRNs."
              : "Create a GRN from an approved purchase order above."
          }
        />
      ) : (
        <div className={listPageTableCardClass}>
          <ResponsiveTableContainer>
            <table className={cn(listTableBaseClass, "min-w-[720px]")}>
              <thead className={listTableTheadClass}>
                <tr>
                  <th className={listTableThClass} aria-hidden />
                  <th className={listTableThClass}>GRN Code</th>
                  <th className={listTableThClass}>PO / source</th>
                  <th className={listTableThClass}>Status</th>
                  <th className={listTableThClass}>Date</th>
                  <th className={listTableThRightClass}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Fragment key={row.id}>
                    <tr className={listTableTrClass}>
                      <td className={listTableTdClass}>
                        <button
                          type="button"
                          className="text-xs text-brand-primary underline"
                          onClick={() => setExpandedGrnId((id) => (id === row.id ? null : row.id))}
                        >
                          {expandedGrnId === row.id ? "Hide" : "Lines"}
                        </button>
                      </td>
                      <td className={listTableTdPrimaryClass}>{row.grn_code}</td>
                      <td className={cn(listTableTdClass, "text-text-primary")}>
                        {row.purchase_order_id ? `PO #${row.purchase_order_id}` : row.source_type || "—"}
                        {row.vendor_id ? ` · V#${row.vendor_id}` : ""}
                        {row.acknowledgement_issued ? " · Ack ✓" : ""}
                      </td>
                      <td className={listTableTdClass}>{row.status}</td>
                      <td className={listTableTdClass}>{row.received_date ? new Date(row.received_date).toLocaleDateString() : "—"}</td>
                      <td className={cn(listTableTdClass, "text-right")}>
                        <div className="relative inline-block text-left">
                          <button
                            type="button"
                            className={touchBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenActionsId((id) => (id === row.id ? null : row.id));
                            }}
                          >
                            Actions
                          </button>
                          {openActionsId === row.id && (
                            <div className="absolute right-0 z-10 mt-1 w-64 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                              <button
                                type="button"
                                className="block min-h-[44px] w-full rounded-md px-3 py-3 text-left text-sm text-gray-800 hover:bg-gray-50 active:bg-gray-100"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenActionsId(null);
                                  window.open(`/app/inventory/goods-receiving/${row.id}/print`, "_blank", "noopener,noreferrer");
                                }}
                              >
                                Print (layout)
                              </button>
                              <button
                                type="button"
                                className="block min-h-[44px] w-full rounded-md px-3 py-3 text-left text-sm text-gray-800 hover:bg-gray-50 active:bg-gray-100"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenActionsId(null);
                                  void openPrintData(row.id);
                                }}
                              >
                                Print / ack JSON payload
                              </button>
                              {row.status !== "RECEIVED" && (
                                <button
                                  type="button"
                                  className="block min-h-[44px] w-full rounded-md px-3 py-3 text-left text-sm text-gray-800 hover:bg-gray-50 active:bg-gray-100"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    setOpenActionsId(null);
                                    await receiveGrn(row.id);
                                  }}
                                >
                                  Receive to stock
                                </button>
                              )}
                              {row.status === "RECEIVED" ? (
                                <>
                                  <button
                                    type="button"
                                    className="block min-h-[44px] w-full rounded-md px-3 py-3 text-left text-sm text-gray-800 hover:bg-gray-50 active:bg-gray-100"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      setOpenActionsId(null);
                                      setGrnPostingsFor(row.id);
                                      setGrnPostingsLoading(true);
                                      try {
                                        setGrnPostings(await api.getGoodsReceivingGlPostings(row.id));
                                      } catch (err) {
                                        setError(err instanceof Error ? err.message : "Failed to load postings");
                                      } finally {
                                        setGrnPostingsLoading(false);
                                      }
                                    }}
                                  >
                                    GL postings
                                  </button>
                                  <button
                                    type="button"
                                    className="block min-h-[44px] w-full rounded-md px-3 py-3 text-left text-sm text-gray-800 hover:bg-gray-50 active:bg-gray-100"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      setOpenActionsId(null);
                                      await acknowledgeGrn(row.id);
                                    }}
                                  >
                                    Issue acknowledgement
                                  </button>
                                  <button
                                    type="button"
                                    className="block min-h-[44px] w-full rounded-md px-3 py-3 text-left text-sm text-gray-800 hover:bg-gray-50 active:bg-gray-100"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      setOpenActionsId(null);
                                      await createVendorBillDraft(row.id);
                                    }}
                                  >
                                    Create vendor bill draft (Finance)
                                  </button>
                                  <button
                                    type="button"
                                    className="block min-h-[44px] w-full rounded-md px-3 py-3 text-left text-sm text-gray-800 hover:bg-gray-50 active:bg-gray-100"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      setOpenActionsId(null);
                                      await createApFromGrn(row.id);
                                    }}
                                  >
                                    Create legacy payable (Outstanding Bills)
                                  </button>
                                </>
                              ) : null}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedGrnId === row.id ? (
                      <tr className="bg-surface-subtle/50">
                        <td colSpan={6} className="px-3 py-3">
                          <div className="overflow-x-auto text-xs">
                            <table className="w-full text-left">
                              <thead>
                                <tr className="text-text-secondary border-b">
                                  <th className="py-1 pr-2">Item</th>
                                  <th className="py-1 pr-2">WH</th>
                                  <th className="py-1 pr-2 text-right">Qty (legacy)</th>
                                  <th className="py-1 pr-2 text-right">Received</th>
                                  <th className="py-1 pr-2 text-right">Accepted</th>
                                  <th className="py-1 pr-2 text-right">Rejected</th>
                                  <th className="py-1 pr-2">Reject reason</th>
                                  <th className="py-1 text-right">Pending</th>
                                </tr>
                              </thead>
                              <tbody>
                                {row.items.length === 0 ? (
                                  <tr>
                                    <td colSpan={8} className="py-2 text-text-muted">
                                      No line items on this GRN.
                                    </td>
                                  </tr>
                                ) : (
                                  row.items.map((ln) => (
                                    <tr key={ln.id} className="border-b border-border/40">
                                      <td className="py-1 pr-2">#{ln.item_id}</td>
                                      <td className="py-1 pr-2">{ln.warehouse_id}</td>
                                      <td className="py-1 pr-2 text-right">{ln.quantity}</td>
                                      <td className="py-1 pr-2 text-right">{ln.received_qty ?? "—"}</td>
                                      <td className="py-1 pr-2 text-right">{ln.accepted_qty ?? "—"}</td>
                                      <td className="py-1 pr-2 text-right">{ln.rejected_qty ?? "—"}</td>
                                      <td className="py-1 pr-2 max-w-[140px] truncate" title={ln.rejection_reason ?? ""}>
                                        {ln.rejection_reason ?? "—"}
                                      </td>
                                      <td className="py-1 text-right">{ln.pending_qty ?? "—"}</td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </ResponsiveTableContainer>
          {!loading && grTotal > 0 ? (
            <DataTablePagination
              page={grPage}
              pageSize={pageSize}
              total={grTotal}
              onPageChange={setGrPage}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setGrPage(1);
              }}
            />
          ) : null}
        </div>
      )}

      {grnPostingsFor != null ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-surface-raised p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-text-primary">GL postings — GRN #{grnPostingsFor}</h3>
              <button
                type="button"
                className="rounded-lg border border-border px-2 py-1 text-xs"
                onClick={() => {
                  setGrnPostingsFor(null);
                  setGrnPostings([]);
                }}
              >
                Close
              </button>
            </div>
            <GlPostingsPanel postings={grnPostings} loading={grnPostingsLoading} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
