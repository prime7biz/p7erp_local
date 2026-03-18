import { useEffect, useMemo, useState } from "react";

import { api, type InventoryItemResponse } from "@/api/client";

export function ProductionOverviewPage() {
  const [items, setItems] = useState<InventoryItemResponse[]>([]);
  const [workOrders, setWorkOrders] = useState<Awaited<ReturnType<typeof api.listMfgWorkOrders>>>([]);
  const [capacity, setCapacity] = useState<Awaited<ReturnType<typeof api.getMfgCapacityLoads>>>([]);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const load = async () => {
      setError("");
      try {
        const [itemRows, workOrderRows, capacityRows] = await Promise.all([
          api.listInventoryItems(),
          api.listMfgWorkOrders(),
          api.getMfgCapacityLoads(),
        ]);
        setItems(itemRows);
        setWorkOrders(workOrderRows);
        setCapacity(capacityRows);
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
    </div>
  );
}
