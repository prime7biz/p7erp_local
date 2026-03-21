import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type InventoryItemResponse,
  type StockAdjustmentCreate,
  type StockAdjustmentResponse,
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

const REASONS = ["COUNT", "DAMAGE", "SYSTEM", "OTHER"] as const;

export function StockAdjustmentsPage() {
  const [rows, setRows] = useState<StockAdjustmentResponse[]>([]);
  const [items, setItems] = useState<InventoryItemResponse[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseResponse[]>([]);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [form, setForm] = useState<StockAdjustmentCreate>({
    warehouse_id: 0,
    item_id: 0,
    quantity: "0",
    reason_code: "OTHER",
    adjustment_date: "",
    notes: "",
  });
  const [loading, setLoading] = useState(true);
  const { isNarrow, view, setView, showCards } = useListViewPreference();

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [adj, itm, wh] = await Promise.all([
        api.listStockAdjustments(),
        api.listInventoryItems(),
        api.listWarehouses(),
      ]);
      setRows(adj);
      setItems(itm);
      setWarehouses(wh);
      const firstWh = wh[0];
      const firstIt = itm[0];
      setForm((prev) => ({
        ...prev,
        warehouse_id: prev.warehouse_id || firstWh?.id || 0,
        item_id: prev.item_id || firstIt?.id || 0,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load adjustments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
        <h1 className="text-2xl font-bold text-text-primary">Stock Adjustments</h1>
        <p className="text-sm text-text-muted">
          Positive quantity increases stock (IN); negative decreases (OUT). Post to apply movements.
        </p>
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
        className="grid grid-cols-1 gap-2 rounded-xl border border-border bg-surface-raised p-4 md:grid-cols-2 lg:grid-cols-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            await api.createStockAdjustment({
              ...form,
              adjustment_date: form.adjustment_date || null,
              notes: form.notes || null,
            });
            await load();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Create failed");
          }
        }}
      >
        <select
          className="rounded border border-border px-2 py-2 text-sm"
          value={form.warehouse_id || ""}
          onChange={(e) => setForm((p) => ({ ...p, warehouse_id: Number(e.target.value) }))}
        >
          <option value={0}>Warehouse…</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.warehouse_code} — {w.name}
            </option>
          ))}
        </select>
        <select
          className="rounded border border-border px-2 py-2 text-sm"
          value={form.item_id || ""}
          onChange={(e) => setForm((p) => ({ ...p, item_id: Number(e.target.value) }))}
        >
          <option value={0}>Item…</option>
          {items.map((it) => (
            <option key={it.id} value={it.id}>
              {it.item_code}
            </option>
          ))}
        </select>
        <input
          className="rounded border border-border px-2 py-2 text-sm"
          placeholder="Qty (+ or −)"
          value={form.quantity}
          onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))}
        />
        <select
          className="rounded border border-border px-2 py-2 text-sm"
          value={form.reason_code}
          onChange={(e) => setForm((p) => ({ ...p, reason_code: e.target.value }))}
        >
          {REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <input
          type="date"
          className="rounded border border-border px-2 py-2 text-sm"
          value={form.adjustment_date ?? ""}
          onChange={(e) => setForm((p) => ({ ...p, adjustment_date: e.target.value }))}
        />
        <input
          className="rounded border border-border px-2 py-2 text-sm"
          placeholder="Notes"
          value={form.notes ?? ""}
          onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
        />
        <button
          type="submit"
          className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-brand-primary-foreground lg:col-span-6"
        >
          Save draft adjustment
        </button>
      </form>

      {loading ? (
        <InventoryTableSkeleton rows={8} cols={6} />
      ) : !filteredRows.length ? (
        <InventoryEmptyState
          title={rows.length ? "No adjustments match this status" : "No stock adjustments yet"}
          description={rows.length ? "Clear the status filter to see all adjustments." : "Save a draft adjustment above, then post it to apply."}
        />
      ) : showCards ? (
        <div className="space-y-3">
          {filteredRows.map((row) => (
            <div key={row.id} className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-text-primary">{row.adjust_code}</div>
                  <div className="text-sm text-text-secondary">{whName(row.warehouse_id)}</div>
                  <div className="text-xs text-text-secondary">{itemLabel(row.item_id)}</div>
                  <div className="mt-1 text-xs text-text-muted">
                    Qty {row.quantity} · {row.reason_code} · {row.status}
                  </div>
                </div>
                {row.status === "DRAFT" ? (
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
                        <button
                          type="button"
                          className="block min-h-[44px] w-full rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 sm:min-h-0 sm:px-2 sm:py-1.5 sm:text-xs"
                          onClick={async (e) => {
                            e.stopPropagation();
                            setOpenActionsId(null);
                            setError("");
                            try {
                              await api.postStockAdjustment(row.id);
                              await load();
                            } catch (err) {
                              setError(err instanceof Error ? err.message : "Post failed");
                            }
                          }}
                        >
                          Post to stock
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-text-muted">—</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={`rounded-xl border border-border bg-surface-raised ${inventoryScrollTableClass}`}>
          <table className="min-w-[720px] w-full">
            <thead className="bg-surface-subtle">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Code</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Warehouse / Item</th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-text-muted">Qty</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Reason</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Status</th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-text-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredRows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 text-sm font-medium">{row.adjust_code}</td>
                  <td className="px-3 py-2 text-sm">
                    {whName(row.warehouse_id)}
                    <br />
                    <span className="text-text-secondary">{itemLabel(row.item_id)}</span>
                  </td>
                  <td className="px-3 py-2 text-right text-sm font-medium">{row.quantity}</td>
                  <td className="px-3 py-2 text-sm">{row.reason_code}</td>
                  <td className="px-3 py-2 text-sm">{row.status}</td>
                  <td className="px-3 py-2 text-right">
                    {row.status === "DRAFT" ? (
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
                            <button
                              type="button"
                              className="block min-h-[44px] w-full rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 sm:min-h-0 sm:px-2 sm:py-1.5 sm:text-xs"
                              onClick={async (e) => {
                                e.stopPropagation();
                                setOpenActionsId(null);
                                setError("");
                                try {
                                  await api.postStockAdjustment(row.id);
                                  await load();
                                } catch (err) {
                                  setError(err instanceof Error ? err.message : "Post failed");
                                }
                              }}
                            >
                              Post to stock
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
    </div>
  );
}
