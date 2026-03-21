import { useCallback, useEffect, useState } from "react";
import {
  api,
  type DeliveryChallanResponse,
  type EnhancedGatePassCreate,
  type EnhancedGatePassResponse,
} from "@/api/client";
import {
  InventoryEmptyState,
  InventoryErrorPanel,
  InventoryTableSkeleton,
} from "@/components/inventory/InventoryListStates";
import { inventoryScrollTableClass } from "@/components/inventory/InventoryMobileList";

const touchField = "min-h-[44px] w-full rounded border border-border px-3 py-3 text-base sm:text-sm touch-manipulation";
const touchBtn =
  "min-h-[44px] touch-manipulation inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 active:opacity-90";
const touchPrimary =
  "min-h-[44px] touch-manipulation inline-flex items-center justify-center rounded-lg bg-brand-primary px-4 py-3 text-base font-medium text-brand-primary-foreground hover:opacity-95 active:opacity-90 sm:text-sm";

export function EnhancedGatePassesPage() {
  const [rows, setRows] = useState<EnhancedGatePassResponse[]>([]);
  const [challans, setChallans] = useState<DeliveryChallanResponse[]>([]);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<EnhancedGatePassCreate>({
    challan_id: null,
    purpose: "",
    status: "DRAFT",
  });

  const statuses = ["DRAFT", "SUBMITTED", "APPROVED", "RELEASED", "REJECTED"];

  useEffect(() => {
    const close = () => setOpenActionsId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [gps, dcs] = await Promise.all([api.listEnhancedGatePasses(), api.listDeliveryChallans()]);
      setRows(gps);
      setChallans(dcs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load gate passes");
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

  const filteredRows = statusFilter ? rows.filter((r) => (r.status || "").toUpperCase() === statusFilter) : rows;

  return (
    <div className="min-w-0 space-y-6 touch-manipulation">
      <div>
        <h1 className="text-2xl font-bold text-brand-primary">Enhanced Gate Passes</h1>
        <p className="text-sm text-text-muted">Release control with approval and guard acknowledgement.</p>
        <p className="mt-1 text-xs text-text-muted">Larger controls for tablet / phone use in the yard.</p>
      </div>
      {error ? <InventoryErrorPanel message={error} onRetry={() => void load()} /> : null}
      <div className="rounded-xl border border-border bg-surface-raised p-3 sm:p-4">
        <label className="mb-2 block text-xs font-semibold text-text-secondary">Status filter</label>
        <input
          className={touchField}
          value={statusFilter}
          placeholder="e.g. RELEASED"
          onChange={(e) => setStatusFilter(e.target.value.toUpperCase())}
          aria-label="Filter by status"
        />
      </div>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await api.createEnhancedGatePass(form);
          setForm({ challan_id: null, purpose: "", status: "DRAFT" });
          await load();
        }}
        className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-surface-raised p-4 md:grid-cols-5 md:gap-2"
      >
        <select
          className={touchField}
          value={form.challan_id ?? ""}
          onChange={(e) => setForm((p) => ({ ...p, challan_id: e.target.value ? Number(e.target.value) : null }))}
          aria-label="Link delivery challan"
        >
          <option value="">No challan linked</option>
          {challans.map((dc) => (
            <option key={dc.id} value={dc.id}>
              {dc.challan_code}
            </option>
          ))}
        </select>
        <input
          className={touchField}
          placeholder="Purpose"
          value={form.purpose}
          onChange={(e) => setForm((p) => ({ ...p, purpose: e.target.value }))}
          required
        />
        <input
          className={touchField}
          placeholder="Destination"
          value={form.destination ?? ""}
          onChange={(e) => setForm((p) => ({ ...p, destination: e.target.value }))}
        />
        <input
          className={touchField}
          placeholder="Vehicle no"
          value={form.vehicle_no ?? ""}
          onChange={(e) => setForm((p) => ({ ...p, vehicle_no: e.target.value }))}
        />
        <button type="submit" className={touchPrimary}>
          Create gate pass
        </button>
      </form>

      {loading ? (
        <InventoryTableSkeleton rows={8} cols={5} />
      ) : !filteredRows.length ? (
        <InventoryEmptyState
          title={rows.length ? "No gate passes match this status" : "No gate passes yet"}
          description={rows.length ? "Clear the status filter to see all passes." : "Create a gate pass using the form above."}
        />
      ) : (
        <div className={`rounded-xl border border-border bg-surface-raised ${inventoryScrollTableClass}`}>
          <table className="min-w-[720px] w-full">
            <thead className="bg-surface-subtle">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase text-text-muted">Code</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase text-text-muted">Purpose</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase text-text-muted">Challan</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase text-text-muted">Status</th>
                <th className="px-3 py-3 text-right text-xs font-medium uppercase text-text-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredRows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-3 text-sm font-medium">{row.gate_pass_code}</td>
                  <td className="px-3 py-3 text-sm">{row.purpose}</td>
                  <td className="px-3 py-3 text-sm">{row.challan_id ? `#${row.challan_id}` : "—"}</td>
                  <td className="px-3 py-3 text-sm">{row.status}</td>
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
                        <div className="absolute right-0 z-10 mt-1 max-h-[min(70vh,320px)] w-52 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                          <p className="px-2 py-1.5 text-[10px] font-semibold uppercase text-gray-500">Set status</p>
                          {statuses.map((s) => (
                            <button
                              key={s}
                              type="button"
                              className={`block min-h-[44px] w-full rounded-md px-3 py-2 text-left text-sm hover:bg-gray-50 active:bg-gray-100 ${
                                (row.status || "").toUpperCase() === s ? "font-semibold text-gray-900" : "text-gray-800"
                              }`}
                              onClick={async (e) => {
                                e.stopPropagation();
                                setOpenActionsId(null);
                                await api.updateEnhancedGatePassStatus(row.id, { status: s });
                                await load();
                              }}
                            >
                              {s}
                            </button>
                          ))}
                          <div className="my-1 border-t border-gray-100" />
                          <button
                            type="button"
                            className="block min-h-[44px] w-full rounded-md px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
                            onClick={async (e) => {
                              e.stopPropagation();
                              setOpenActionsId(null);
                              await api.updateEnhancedGatePassStatus(row.id, { guard_acknowledged: !row.guard_acknowledged });
                              await load();
                            }}
                          >
                            {row.guard_acknowledged ? "Clear guard acknowledgement" : "Mark guard acknowledged"}
                          </button>
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
