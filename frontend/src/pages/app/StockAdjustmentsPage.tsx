import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type StockAdjustmentCreate,
  type StockAdjustmentResponse,
  type WarehouseResponse,
} from "@/api/client";
import { RemoteSearchSelect } from "@/components/app/RemoteSearchSelect";
import { RowActionsMenu } from "@/components/app/RowActionsMenu";
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
import { useSubmitGuard } from "@/hooks/useSubmitGuard";
import { fetchInventoryItemPage, hydrateInventoryItem } from "@/lib/remoteSelectFetchers";

const REASONS = ["COUNT", "DAMAGE", "SYSTEM", "OTHER"] as const;

export function StockAdjustmentsPage() {
  const [rows, setRows] = useState<StockAdjustmentResponse[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseResponse[]>([]);
  const [itemLabels, setItemLabels] = useState<Record<number, string>>({});
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
  const saveGuard = useSubmitGuard();
  const { isNarrow, view, setView, showCards } = useListViewPreference();

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [adj, wh] = await Promise.all([
        api.listStockAdjustments(),
        api.listWarehouses(),
      ]);
      setRows(adj);
      setItemLabels((prev) => {
        const next = { ...prev };
        for (const r of adj) {
          if (r.item_name) next[r.item_id] = `${r.item_code ?? ""} ${r.item_name}`.trim();
        }
        return next;
      });
      setWarehouses(wh);
      const firstWh = wh[0];
      setForm((prev) => ({
        ...prev,
        warehouse_id: prev.warehouse_id || firstWh?.id || 0,
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
    (id: number) => itemLabels[id] ?? `#${id}`,
    [itemLabels],
  );

  const postAdjustment = (id: number) =>
    saveGuard.run(async () => {
      setError("");
      try {
        await api.postStockAdjustment(id);
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Post failed");
      }
    });

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
          await saveGuard.run(async () => {
            setError("");
            try {
              await api.createStockAdjustment({
                ...form,
                adjustment_date: form.adjustment_date || null,
                notes: form.notes || null,
              });
              setForm((p) => ({ ...p, item_id: 0, quantity: "0", notes: "" }));
              await load();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Create failed");
            }
          });
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
        <RemoteSearchSelect
          className="rounded border border-border px-2 py-2 text-sm"
          placeholder="Search item…"
          value={form.item_id > 0 ? form.item_id : ""}
          onChange={(next, opt) => {
            const id = next === "" ? 0 : Number(next);
            if (opt?.label && id > 0) {
              setItemLabels((prev) => ({ ...prev, [id]: opt.label }));
            }
            setForm((p) => ({ ...p, item_id: id }));
          }}
          fetchPage={fetchInventoryItemPage}
          hydrateById={hydrateInventoryItem}
          allowClear
        />
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
          className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-brand-primary-foreground disabled:opacity-50 lg:col-span-6"
          disabled={saveGuard.busy}
        >
          {saveGuard.busy ? "Saving…" : "Save draft adjustment"}
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
                  <RowActionsMenu
                    className="shrink-0"
                    rowId={row.id}
                    openId={openActionsId}
                    onOpenChange={(id) => setOpenActionsId(id as number | null)}
                    items={[{ key: "post", label: "Post to stock", onClick: () => void postAdjustment(row.id) }]}
                  />
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
                      <RowActionsMenu
                        rowId={row.id}
                        openId={openActionsId}
                        onOpenChange={(id) => setOpenActionsId(id as number | null)}
                        items={[{ key: "post", label: "Post to stock", onClick: () => void postAdjustment(row.id) }]}
                      />
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
