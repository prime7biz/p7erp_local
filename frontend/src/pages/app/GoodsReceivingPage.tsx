import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type GoodsReceivingCreate,
  type GoodsReceivingResponse,
  type PurchaseOrderResponse,
} from "@/api/client";
import {
  InventoryEmptyState,
  InventoryErrorPanel,
  InventoryTableSkeleton,
} from "@/components/inventory/InventoryListStates";
import { inventoryScrollTableClass } from "@/components/inventory/InventoryMobileList";
import { logApiError } from "@/utils/logApiError";

/** Phase 3.4: ~44px min touch targets for warehouse floor / mobile use */
const touchField = "min-h-[44px] w-full rounded border border-border px-3 py-3 text-base sm:text-sm touch-manipulation";
const touchBtn =
  "min-h-[44px] touch-manipulation inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 active:opacity-90";
const touchPrimary =
  "min-h-[44px] touch-manipulation inline-flex items-center justify-center rounded-lg bg-brand-primary px-4 py-3 text-base font-medium text-brand-primary-foreground hover:opacity-95 active:opacity-90 sm:text-sm";

export function GoodsReceivingPage() {
  const [rows, setRows] = useState<GoodsReceivingResponse[]>([]);
  const [pos, setPos] = useState<PurchaseOrderResponse[]>([]);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState(() => {
    if (typeof window === "undefined") return "";
    return (new URLSearchParams(window.location.search).get("status") || "").toUpperCase();
  });
  const [form, setForm] = useState<GoodsReceivingCreate>({
    purchase_order_id: null,
    status: "DRAFT",
    items: [],
  });
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [apMessage, setApMessage] = useState("");
  const [grPage, setGrPage] = useState(1);
  const [grTotalPages, setGrTotalPages] = useState(1);
  const [grTotal, setGrTotal] = useState(0);
  const GR_PAGE_SIZE = 25;

  useEffect(() => {
    const close = () => setOpenActionsId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [grRes, poRes] = await Promise.all([
        api.listGoodsReceivingPaginated({
          status_filter: statusFilter.trim() || undefined,
          page: grPage,
          page_size: GR_PAGE_SIZE,
        }),
        api.listPurchaseOrdersPaginated({ page: 1, page_size: 500 }),
      ]);
      setRows(grRes.items);
      setGrTotalPages(grRes.total_pages);
      setGrTotal(grRes.total);
      setPos(poRes.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load GRN");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, grPage]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setGrPage(1);
  }, [statusFilter]);

  const visibleGrPages = useMemo(() => {
    const start = Math.max(1, grPage - 2);
    const end = Math.min(grTotalPages, grPage + 2);
    const pages: number[] = [];
    for (let i = start; i <= end; i += 1) pages.push(i);
    return pages;
  }, [grPage, grTotalPages]);

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
        setApMessage("Payable bill created from GRN (check Outstanding Bills).");
        await load();
      } catch (e) {
        logApiError("GoodsReceivingPage.createPayableFromGoodsReceiving", e);
        setError(e instanceof Error ? e.message : "Failed to create payable");
      }
    },
    [load],
  );

  return (
    <div className="min-w-0 space-y-6 touch-manipulation">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Goods Receiving (GRN)</h1>
        <p className="text-sm text-text-muted">Receive materials from approved purchase orders into stock.</p>
        <p className="mt-1 text-xs text-text-muted">Controls use larger tap targets on phones and tablets.</p>
      </div>
      {error ? <InventoryErrorPanel message={error} onRetry={() => void load()} /> : null}
      {apMessage ? (
        <div className="rounded-lg border border-status-success/30 bg-status-success-subtle px-3 py-2 text-sm text-status-success-foreground">{apMessage}</div>
      ) : null}
      <div className="rounded-xl border border-border bg-surface-raised p-3 sm:p-4">
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
          try {
            await api.createGoodsReceiving(form);
            setForm({ purchase_order_id: null, status: "DRAFT", items: [] });
            await load();
          } catch (err) {
            logApiError("GoodsReceivingPage.createGoodsReceiving", err);
            setError(err instanceof Error ? err.message : "Failed to create GRN");
          }
        }}
        className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-surface-raised p-4 md:grid-cols-4 md:gap-2"
      >
        <select
          className={touchField}
          value={form.purchase_order_id ?? ""}
          onChange={(e) => setForm((p) => ({ ...p, purchase_order_id: e.target.value ? Number(e.target.value) : null }))}
          aria-label="Purchase order"
        >
          <option value="">Select PO</option>
          {pos.map((po) => (
            <option key={po.id} value={po.id}>
              {po.po_code} ({po.status})
            </option>
          ))}
        </select>
        <input
          className={touchField}
          type="date"
          value={form.received_date ?? ""}
          onChange={(e) => setForm((p) => ({ ...p, received_date: e.target.value }))}
        />
        <input
          className={touchField}
          placeholder="Notes"
          value={form.notes ?? ""}
          onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
        />
        <button type="submit" className={`${touchPrimary} md:col-span-1`}>
          Create GRN
        </button>
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
        <div className={`rounded-xl border border-border bg-surface-raised ${inventoryScrollTableClass}`}>
          <table className="min-w-[640px] w-full">
            <thead className="bg-surface-subtle">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase text-text-muted">GRN Code</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase text-text-muted">PO</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase text-text-muted">Status</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase text-text-muted">Date</th>
                <th className="px-3 py-3 text-right text-xs font-medium uppercase text-text-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-3 text-sm font-medium">{row.grn_code}</td>
                  <td className="px-3 py-3 text-sm">{row.purchase_order_id ? `#${row.purchase_order_id}` : "—"}</td>
                  <td className="px-3 py-3 text-sm">{row.status}</td>
                  <td className="px-3 py-3 text-sm">{row.received_date ? new Date(row.received_date).toLocaleDateString() : "—"}</td>
                  <td className="px-3 py-3 text-right">
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
                        <div className="absolute right-0 z-10 mt-1 w-56 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                          <button
                            type="button"
                            className="block min-h-[44px] w-full rounded-md px-3 py-3 text-left text-sm text-gray-800 hover:bg-gray-50 active:bg-gray-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenActionsId(null);
                              window.open(`/app/inventory/goods-receiving/${row.id}/print`, "_blank", "noopener,noreferrer");
                            }}
                          >
                            Print
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
                            <button
                              type="button"
                              className="block min-h-[44px] w-full rounded-md px-3 py-3 text-left text-sm text-gray-800 hover:bg-gray-50 active:bg-gray-100"
                              onClick={async (e) => {
                                e.stopPropagation();
                                setOpenActionsId(null);
                                await createApFromGrn(row.id);
                              }}
                            >
                              Create AP bill from GRN
                            </button>
                          ) : null}
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
      {!loading && rows.length > 0 && grTotalPages > 1 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>
            Page {grPage} of {grTotalPages} ({grTotal} total)
          </span>
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setGrPage((p) => Math.max(1, p - 1))}
              disabled={grPage <= 1}
              className="rounded-md border border-border-strong px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            {visibleGrPages.map((pageNo) => (
              <button
                key={pageNo}
                type="button"
                onClick={() => setGrPage(pageNo)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                  pageNo === grPage
                    ? "bg-brand-primary text-brand-primary-foreground"
                    : "border border-border-strong text-text-secondary hover:bg-surface-subtle"
                }`}
              >
                {pageNo}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setGrPage((p) => p + 1)}
              disabled={grPage >= grTotalPages}
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
