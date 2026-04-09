import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type InventoryDocumentPrintPayload,
  type InventoryGlPostingDetail,
  type InventoryItemResponse,
  type WarehouseResponse,
  type WarehouseTransferCreate,
  type WarehouseTransferResponse,
} from "@/api/client";
import { GlPostingsPanel } from "@/components/inventory/GlPostingsPanel";
import { InventoryDocumentPrintSheets } from "@/components/print/InventoryDocumentPrintSheets";
import { PrintPreviewModal } from "@/components/print/PrintPreviewModal";
import { logApiError } from "@/utils/logApiError";
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

export function WarehouseTransfersPage() {
  const [rows, setRows] = useState<WarehouseTransferResponse[]>([]);
  const [items, setItems] = useState<InventoryItemResponse[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseResponse[]>([]);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [form, setForm] = useState<WarehouseTransferCreate>({
    from_warehouse_id: 0,
    to_warehouse_id: 0,
    transfer_date: "",
    notes: "",
    items: [{ item_id: 0, quantity: "1" }],
  });
  const [loading, setLoading] = useState(true);
  const { isNarrow, view, setView, showCards } = useListViewPreference();
  const [printOpen, setPrintOpen] = useState(false);
  const [printData, setPrintData] = useState<InventoryDocumentPrintPayload | null>(null);
  const [printTitle, setPrintTitle] = useState("");
  const [printCopyCount, setPrintCopyCount] = useState(1);
  const [printTemplate, setPrintTemplate] = useState<"standard" | "compact" | "audit">("standard");
  const [postingsOpen, setPostingsOpen] = useState(false);
  const [postingsRows, setPostingsRows] = useState<InventoryGlPostingDetail[]>([]);
  const [postingsTitle, setPostingsTitle] = useState("");

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [tr, itm, wh] = await Promise.all([
        api.listWarehouseTransfers(),
        api.listInventoryItems(),
        api.listWarehouses(),
      ]);
      setRows(tr);
      setItems(itm);
      setWarehouses(wh);
      const firstWh = wh[0];
      const firstIt = itm[0];
      setForm((prev) => ({
        ...prev,
        from_warehouse_id: prev.from_warehouse_id || firstWh?.id || 0,
        to_warehouse_id: prev.to_warehouse_id || (wh[1]?.id ?? firstWh?.id ?? 0),
        items: prev.items.length
          ? prev.items.map((line) => ({
              ...line,
              item_id: line.item_id || firstIt?.id || 0,
            }))
          : [{ item_id: firstIt?.id ?? 0, quantity: "1" }],
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load transfers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const close = () => setOpenActionsId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const filteredRows = useMemo(
    () => (statusFilter ? rows.filter((r) => (r.status || "").toUpperCase() === statusFilter.toUpperCase()) : rows),
    [rows, statusFilter],
  );

  const whName = useCallback(
    (id: number) => warehouses.find((w) => w.id === id)?.name ?? `#${id}`,
    [warehouses],
  );
  const itemLabel = useCallback(
    (id: number) => {
      const it = items.find((i) => i.id === id);
      return it ? `${it.item_code} — ${it.name}` : `#${id}`;
    },
    [items],
  );

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Warehouse Transfers</h1>
        <p className="text-sm text-text-muted">Move stock between warehouses (draft, then post to create IN/OUT movements).</p>
      </div>
      {error ? <InventoryErrorPanel message={error} onRetry={() => void load()} /> : null}

      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-raised p-3 sm:flex-row sm:items-center sm:justify-between">
        {isNarrow ? <InventoryListViewToggle value={view} onChange={setView} /> : null}
        <label className="flex flex-1 flex-wrap items-center gap-2 text-xs font-semibold text-text-secondary">
          Status filter
          <input
            className={`min-w-0 flex-1 rounded border px-2 py-1 text-xs sm:flex-none ${touchFieldClass}`}
            value={statusFilter}
            placeholder="e.g. DRAFT"
            onChange={(e) => setStatusFilter(e.target.value.toUpperCase())}
          />
        </label>
      </div>

      <form
        className="space-y-3 rounded-xl border border-border bg-surface-raised p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            await api.createWarehouseTransfer({
              ...form,
              transfer_date: form.transfer_date || null,
              notes: form.notes || null,
              items: form.items.filter((l) => l.item_id > 0 && parseFloat(l.quantity || "0") > 0),
            });
            await load();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Create failed");
          }
        }}
      >
        <p className="text-sm font-medium text-text-primary">New transfer (draft)</p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-text-muted">
            From warehouse
            <select
              className="mt-0.5 w-full rounded border border-border px-2 py-2 text-sm"
              value={form.from_warehouse_id || ""}
              onChange={(e) => setForm((p) => ({ ...p, from_warehouse_id: Number(e.target.value) }))}
            >
              <option value={0}>Select…</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.warehouse_code} — {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-text-muted">
            To warehouse
            <select
              className="mt-0.5 w-full rounded border border-border px-2 py-2 text-sm"
              value={form.to_warehouse_id || ""}
              onChange={(e) => setForm((p) => ({ ...p, to_warehouse_id: Number(e.target.value) }))}
            >
              <option value={0}>Select…</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.warehouse_code} — {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-text-muted">
            Transfer date
            <input
              type="date"
              className="mt-0.5 w-full rounded border border-border px-2 py-2 text-sm"
              value={form.transfer_date ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, transfer_date: e.target.value }))}
            />
          </label>
          <label className="text-xs text-text-muted">
            Notes
            <input
              className="mt-0.5 w-full rounded border border-border px-2 py-2 text-sm"
              value={form.notes ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            />
          </label>
        </div>
        <div className="space-y-2">
          {form.items.map((line, idx) => (
            <div key={idx} className="flex flex-wrap items-end gap-2">
              <select
                className="min-w-[200px] flex-1 rounded border border-border px-2 py-2 text-sm"
                value={line.item_id || ""}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setForm((p) => ({
                    ...p,
                    items: p.items.map((row, i) => (i === idx ? { ...row, item_id: v } : row)),
                  }));
                }}
              >
                <option value={0}>Item…</option>
                {items.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.item_code} — {it.name}
                  </option>
                ))}
              </select>
              <input
                className="w-28 rounded border border-border px-2 py-2 text-sm"
                placeholder="Qty"
                value={line.quantity}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((p) => ({
                    ...p,
                    items: p.items.map((row, i) => (i === idx ? { ...row, quantity: v } : row)),
                  }));
                }}
              />
              <button
                type="button"
                className="rounded border border-border px-2 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                onClick={() => setForm((p) => ({ ...p, items: p.items.filter((_, i) => i !== idx) }))}
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="rounded border border-dashed border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-subtle"
            onClick={() => setForm((p) => ({ ...p, items: [...p.items, { item_id: items[0]?.id ?? 0, quantity: "1" }] }))}
          >
            + Add line
          </button>
        </div>
        <button type="submit" className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-brand-primary-foreground">
          Save draft
        </button>
      </form>

      {loading ? (
        <InventoryTableSkeleton rows={8} cols={6} />
      ) : !filteredRows.length ? (
        <InventoryEmptyState
          title={rows.length ? "No transfers match this status" : "No warehouse transfers yet"}
          description={rows.length ? "Clear the status filter to see all transfers." : "Save a draft transfer above, then post it to move stock."}
        />
      ) : showCards ? (
        <div className="space-y-3">
          {filteredRows.map((row) => (
            <div key={row.id} className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-text-primary">{row.transfer_code}</div>
                  <div className="text-sm text-text-secondary">
                    {whName(row.from_warehouse_id)} → {whName(row.to_warehouse_id)}
                  </div>
                  <div className="mt-1 text-xs text-text-muted">
                    {row.transfer_date ? new Date(row.transfer_date).toLocaleDateString() : "—"} · {row.status}
                  </div>
                </div>
                {row.status === "DRAFT" || row.status === "POSTED" ? (
                  <div className="relative inline-block shrink-0">
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
                        {row.status === "DRAFT" ? (
                          <button
                            type="button"
                            className="block min-h-[44px] w-full rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 sm:min-h-0 sm:px-2 sm:py-1.5 sm:text-xs"
                            onClick={async (e) => {
                              e.stopPropagation();
                              setOpenActionsId(null);
                              setError("");
                              try {
                                await api.postWarehouseTransfer(row.id);
                                await load();
                              } catch (err) {
                                setError(err instanceof Error ? err.message : "Post failed");
                              }
                            }}
                          >
                            Post to stock
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="block min-h-[44px] w-full rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 sm:min-h-0 sm:px-2 sm:py-1.5 sm:text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenActionsId(null);
                            void (async () => {
                              try {
                                const d = await api.getWarehouseTransferPrintData(row.id);
                                setPrintData(d);
                                setPrintTitle(row.transfer_code);
                                setPrintOpen(true);
                              } catch (err) {
                                logApiError("WarehouseTransfersPage.print", err);
                                setError(err instanceof Error ? err.message : "Print failed");
                              }
                            })();
                          }}
                        >
                          Print preview
                        </button>
                        <button
                          type="button"
                          className="block min-h-[44px] w-full rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 sm:min-h-0 sm:px-2 sm:py-1.5 sm:text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenActionsId(null);
                            void (async () => {
                              try {
                                const p = await api.getWarehouseTransferGlPostings(row.id);
                                setPostingsRows(p);
                                setPostingsTitle(row.transfer_code);
                                setPostingsOpen(true);
                              } catch (err) {
                                logApiError("WarehouseTransfersPage.postings", err);
                                setError(err instanceof Error ? err.message : "Postings failed");
                              }
                            })();
                          }}
                        >
                          GL postings
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-text-muted">—</span>
                )}
              </div>
              <div className="mt-2 text-xs text-text-secondary">
                {row.items.map((l) => (
                  <span key={l.id} className="mr-2 block sm:inline">
                    {itemLabel(l.item_id)}: {l.quantity}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={`rounded-xl border border-border bg-surface-raised ${inventoryScrollTableClass}`}>
          <table className="min-w-[800px] w-full">
            <thead className="bg-surface-subtle">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Code</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">From → To</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Date</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Status</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Lines</th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-text-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredRows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 text-sm font-medium">{row.transfer_code}</td>
                  <td className="px-3 py-2 text-sm">
                    {whName(row.from_warehouse_id)} → {whName(row.to_warehouse_id)}
                  </td>
                  <td className="px-3 py-2 text-sm">{row.transfer_date ? new Date(row.transfer_date).toLocaleDateString() : "—"}</td>
                  <td className="px-3 py-2 text-sm">{row.status}</td>
                  <td className="px-3 py-2 text-sm text-text-secondary">
                    {row.items.map((l) => (
                      <span key={l.id} className="mr-2 block sm:inline">
                        {itemLabel(l.item_id)}: {l.quantity}
                      </span>
                    ))}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {row.status === "DRAFT" || row.status === "POSTED" ? (
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
                          <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                            {row.status === "DRAFT" ? (
                              <button
                                type="button"
                                className="block min-h-[44px] w-full rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 sm:min-h-0 sm:px-2 sm:py-1.5 sm:text-xs"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  setOpenActionsId(null);
                                  setError("");
                                  try {
                                    await api.postWarehouseTransfer(row.id);
                                    await load();
                                  } catch (err) {
                                    setError(err instanceof Error ? err.message : "Post failed");
                                  }
                                }}
                              >
                                Post to stock
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="block min-h-[44px] w-full rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 sm:min-h-0 sm:px-2 sm:py-1.5 sm:text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenActionsId(null);
                                void (async () => {
                                  try {
                                    const d = await api.getWarehouseTransferPrintData(row.id);
                                    setPrintData(d);
                                    setPrintTitle(row.transfer_code);
                                    setPrintOpen(true);
                                  } catch (err) {
                                    logApiError("WarehouseTransfersPage.print", err);
                                    setError(err instanceof Error ? err.message : "Print failed");
                                  }
                                })();
                              }}
                            >
                              Print preview
                            </button>
                            <button
                              type="button"
                              className="block min-h-[44px] w-full rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 sm:min-h-0 sm:px-2 sm:py-1.5 sm:text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenActionsId(null);
                                void (async () => {
                                  try {
                                    const p = await api.getWarehouseTransferGlPostings(row.id);
                                    setPostingsRows(p);
                                    setPostingsTitle(row.transfer_code);
                                    setPostingsOpen(true);
                                  } catch (err) {
                                    logApiError("WarehouseTransfersPage.postings", err);
                                    setError(err instanceof Error ? err.message : "Postings failed");
                                  }
                                })();
                              }}
                            >
                              GL postings
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {printOpen && printData ? (
        <PrintPreviewModal
          open={printOpen}
          title={`Print — ${printTitle}`}
          onClose={() => {
            setPrintOpen(false);
            setPrintData(null);
          }}
          copyCount={printCopyCount}
          onCopyCountChange={setPrintCopyCount}
          template={printTemplate}
          onTemplateChange={setPrintTemplate}
        >
          <InventoryDocumentPrintSheets data={printData} copyCount={printCopyCount} template={printTemplate} />
        </PrintPreviewModal>
      ) : null}

      {postingsOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-surface-raised p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-text-primary">GL postings — {postingsTitle}</h3>
              <button type="button" className="rounded-lg border border-border px-2 py-1 text-xs" onClick={() => setPostingsOpen(false)}>
                Close
              </button>
            </div>
            <GlPostingsPanel postings={postingsRows} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
