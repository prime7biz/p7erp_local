import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { api, type InventoryItemResponse } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { logApiError } from "@/utils/logApiError";

type WipJournalRow = {
  id: number;
  from_department?: string | null;
  to_department?: string | null;
  order_id?: number | null;
  total_value?: number;
  material_value?: number;
  conversion_cost?: number;
  voucher_id?: number | null;
  journal_date?: string;
};

export function ProductionOverviewPage() {
  const { me } = useAuth();
  const [items, setItems] = useState<InventoryItemResponse[]>([]);
  const [workOrders, setWorkOrders] = useState<Awaited<ReturnType<typeof api.listMfgWorkOrders>>>([]);
  const [capacity, setCapacity] = useState<Awaited<ReturnType<typeof api.getMfgCapacityLoads>>>([]);
  const [wipJournals, setWipJournals] = useState<WipJournalRow[]>([]);
  const [error, setError] = useState<string>("");
  const [maintenanceItems, setMaintenanceItems] = useState<Array<Record<string, unknown>>>([]);

  const autoPostWip =
    me?.feature_flags?.auto_post_wip_journal === false
      ? false
      : me?.feature_flags?.auto_post_wip_journal == null
        ? true
        : Boolean(me.feature_flags.auto_post_wip_journal);

  useEffect(() => {
    const load = async () => {
      setError("");
      try {
        const [itemRows, workOrderRows, capacityRows, wip, maint] = await Promise.all([
          api.listInventoryItems(),
          api.listMfgWorkOrders(),
          api.getMfgCapacityLoads(),
          api.listWipJournals().catch((e) => {
            logApiError("ProductionOverviewPage.listWipJournals", e);
            return { items: [] as unknown[] };
          }),
          api.getPredictiveMaintenance(30).catch((e) => {
            logApiError("ProductionOverviewPage.maintenance", e);
            return { items: [] as Array<Record<string, unknown>> };
          }),
        ]);
        setItems(itemRows);
        setWorkOrders(workOrderRows);
        setCapacity(capacityRows);
        setWipJournals((wip.items as WipJournalRow[]) ?? []);
        setMaintenanceItems(
          (maint.items || []).filter((i) => Number(i.breakdown_probability ?? 0) >= 31),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load production overview");
      }
    };
    void load();
  }, []);

  const itemName = useMemo(() => new Map(items.map((i) => [i.id, i.name])), [items]);
  const totals = useMemo(() => {
    const total = workOrders.length;
    const inProgress = workOrders.filter((row) => row.status === "in_progress").length;
    const completed = workOrders.filter((row) => row.status === "completed").length;
    const plannedQty = workOrders.reduce((sum, row) => sum + Number(row.qty_planned || 0), 0);
    const completedQty = workOrders.reduce((sum, row) => sum + Number(row.qty_completed || 0), 0);
    return { total, inProgress, completed, plannedQty, completedQty };
  }, [workOrders]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Production Overview</h1>
        <p className="text-sm text-text-muted">Advanced manufacturing visibility for work orders and capacity loads.</p>
      </div>

      {error ? <div className="rounded border border-status-danger/20 bg-status-danger-subtle p-3 text-sm text-status-danger-foreground">{error}</div> : null}

      {maintenanceItems.length > 0 ? (
        <div className="space-y-2">
          {maintenanceItems.slice(0, 3).map((m, i) => (
            <div
              key={String(m.machine_id ?? i)}
              className="rounded-lg border border-status-warning/40 bg-status-warning-subtle/50 px-3 py-2 text-sm text-status-warning-foreground"
            >
              Machine {String(m.machine_id ?? m.machine_code ?? "?")}: {String(m.breakdown_probability ?? "?")}%
              breakdown risk. {String(m.recommended_action ?? "Schedule maintenance?")}
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="rounded-xl border border-border bg-surface-raised p-3"><div className="text-xs text-text-muted">Work Orders</div><div className="text-xl font-semibold">{totals.total}</div></div>
        <div className="rounded-xl border border-border bg-surface-raised p-3"><div className="text-xs text-text-muted">In Progress</div><div className="text-xl font-semibold">{totals.inProgress}</div></div>
        <div className="rounded-xl border border-border bg-surface-raised p-3"><div className="text-xs text-text-muted">Completed</div><div className="text-xl font-semibold">{totals.completed}</div></div>
        <div className="rounded-xl border border-border bg-surface-raised p-3"><div className="text-xs text-text-muted">Planned Qty</div><div className="text-xl font-semibold">{totals.plannedQty.toFixed(2)}</div></div>
        <div className="rounded-xl border border-border bg-surface-raised p-3"><div className="text-xs text-text-muted">Completed Qty</div><div className="text-xl font-semibold">{totals.completedQty.toFixed(2)}</div></div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
          <div className="border-b px-4 py-3 text-sm font-semibold text-text-secondary">Recent Work Orders</div>
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle text-left text-text-secondary">
              <tr>
                <th className="px-4 py-2">MO</th>
                <th className="px-4 py-2">Item</th>
                <th className="px-4 py-2">Planned</th>
                <th className="px-4 py-2">Completed</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {workOrders.slice(0, 12).map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-4 py-2 font-medium">{row.mo_number}</td>
                  <td className="px-4 py-2">{itemName.get(row.item_id) ?? `Item #${row.item_id}`}</td>
                  <td className="px-4 py-2">{Number(row.qty_planned).toFixed(2)}</td>
                  <td className="px-4 py-2">{Number(row.qty_completed).toFixed(2)}</td>
                  <td className="px-4 py-2">{row.status}</td>
                </tr>
              ))}
              {workOrders.length === 0 ? (
                <tr><td className="px-4 py-8 text-center text-text-muted" colSpan={5}>No work orders found.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
          <div className="border-b px-4 py-3 text-sm font-semibold text-text-secondary">Capacity Load</div>
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle text-left text-text-secondary">
              <tr>
                <th className="px-4 py-2">Work Center</th>
                <th className="px-4 py-2">Orders</th>
                <th className="px-4 py-2">Planned Qty</th>
                <th className="px-4 py-2">Completed Qty</th>
                <th className="px-4 py-2">Load %</th>
              </tr>
            </thead>
            <tbody>
              {capacity.map((row, idx) => (
                <tr key={`${row.work_center_id ?? "na"}-${idx}`} className="border-t">
                  <td className="px-4 py-2">{row.work_center_name}</td>
                  <td className="px-4 py-2">{row.total_orders}</td>
                  <td className="px-4 py-2">{row.total_qty_planned.toFixed(2)}</td>
                  <td className="px-4 py-2">{row.total_qty_completed.toFixed(2)}</td>
                  <td className="px-4 py-2">{row.load_percent.toFixed(2)}%</td>
                </tr>
              ))}
              {capacity.length === 0 ? (
                <tr><td className="px-4 py-8 text-center text-text-muted" colSpan={5}>No capacity records yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-text-secondary">WIP Journal Vouchers</div>
            <p className="text-xs text-text-muted">
              Auto-post WIP journals:{" "}
              <span className="font-medium text-text-primary">{autoPostWip ? "On" : "Off"}</span>
              {" · "}
              <Link to="/app/settings/config" className="text-status-info hover:underline">
                Change in Settings
              </Link>
            </p>
          </div>
          <Link to="/app/production/costs" className="text-xs font-medium text-status-info hover:underline">
            Open production costs
          </Link>
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-surface-subtle text-left text-text-secondary">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">From → To</th>
              <th className="px-4 py-2">Order</th>
              <th className="px-4 py-2">Amount</th>
              <th className="px-4 py-2">Voucher</th>
            </tr>
          </thead>
          <tbody>
            {wipJournals.slice(0, 15).map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-4 py-2">{row.journal_date ?? "—"}</td>
                <td className="px-4 py-2">
                  {(row.from_department || "—") + " → " + (row.to_department || "—")}
                </td>
                <td className="px-4 py-2">
                  {row.order_id ? (
                    <Link className="text-status-info hover:underline" to={`/app/orders/${row.order_id}`}>
                      #{row.order_id}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2 tabular-nums">{Number(row.total_value || 0).toLocaleString()}</td>
                <td className="px-4 py-2">
                  {row.voucher_id ? (
                    <Link
                      className="text-status-info hover:underline"
                      to={`/app/accounts/vouchers/${row.voucher_id}`}
                    >
                      #{row.voucher_id}
                    </Link>
                  ) : (
                    <span className="text-text-muted">Not linked</span>
                  )}
                </td>
              </tr>
            ))}
            {wipJournals.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-text-muted" colSpan={5}>
                  No WIP journals yet. Material issues / FG receipts create them when auto-post is on.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
