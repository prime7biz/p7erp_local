import { useEffect, useMemo, useState } from "react";
import { api, type InventoryItemResponse, type ManufacturingOrderCreate, type ManufacturingStageResponse } from "@/api/client";

function statusBadgeClass(status: string) {
  switch (status) {
    case "draft":
    case "pending":
      return "bg-slate-100 text-slate-700";
    case "planned":
      return "bg-blue-100 text-blue-700";
    case "in_progress":
      return "bg-amber-100 text-amber-700";
    case "on_hold":
      return "bg-orange-100 text-orange-700";
    case "completed":
      return "bg-green-100 text-green-700";
    case "skipped":
      return "bg-purple-100 text-purple-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export function ManufacturingOrdersPage() {
  const [orders, setOrders] = useState<Awaited<ReturnType<typeof api.listManufacturingOrders>>>([]);
  const [items, setItems] = useState<InventoryItemResponse[]>([]);
  const [stagesByOrder, setStagesByOrder] = useState<Record<number, ManufacturingStageResponse[]>>({});
  const [error, setError] = useState("");
  const [kpi, setKpi] = useState({ openPo: 0, openGrn: 0, pendingCr: 0, lowStock: 0 });
  const [prevKpi, setPrevKpi] = useState<{ openPo: number; openGrn: number; pendingCr: number; lowStock: number } | null>(null);
  const [form, setForm] = useState<ManufacturingOrderCreate>({ finished_item_id: 0, planned_quantity: "0", notes: "" });

  const load = async () => {
    try {
      const [rows, itm] = await Promise.all([api.listManufacturingOrders(), api.listInventoryItems()]);
      const [overview, pendingCrRows, stockRows] = await Promise.all([
        api.getInventoryReconciliationOverview(),
        api.listConsumptionChangeRequests({ status_filter: "PENDING" }),
        api.getStockSummary(),
      ]);
      setOrders(rows);
      setItems(itm);
      const nextKpi = {
        openPo: overview.purchase_orders_open,
        openGrn: overview.goods_receiving_open,
        pendingCr: pendingCrRows.length,
        lowStock: stockRows.filter((r) => r.on_hand_qty > 0 && r.on_hand_qty <= 5).length,
      };
      const prevRaw = localStorage.getItem("p7_inventory_kpi_snapshot");
      if (prevRaw) {
        try {
          setPrevKpi(JSON.parse(prevRaw) as { openPo: number; openGrn: number; pendingCr: number; lowStock: number });
        } catch {
          setPrevKpi(null);
        }
      }
      setKpi(nextKpi);
      localStorage.setItem("p7_inventory_kpi_snapshot", JSON.stringify(nextKpi));
      if (!form.finished_item_id && itm[0]) {
        const firstItem = itm[0];
        if (firstItem) {
          setForm((prev) => ({ ...prev, finished_item_id: firstItem.id }));
        }
      }
      const stagePairs = await Promise.all(rows.slice(0, 20).map(async (row) => [row.id, await api.getManufacturingStages(row.id)] as const));
      setStagesByOrder(Object.fromEntries(stagePairs));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load manufacturing data");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const itemName = useMemo(() => new Map(items.map((i) => [i.id, i.name])), [items]);
  const trend = (key: keyof typeof kpi) => {
    if (!prevKpi) return "";
    if (kpi[key] > prevKpi[key]) return "↑";
    if (kpi[key] < prevKpi[key]) return "↓";
    return "→";
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.finished_item_id) return;
    try {
      await api.createManufacturingOrder(form);
      setForm({ finished_item_id: items[0]?.id ?? 0, planned_quantity: "0", notes: "" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create manufacturing order");
    }
  };

  const action = async (id: number, kind: "start" | "hold" | "resume" | "complete") => {
    try {
      if (kind === "start") await api.startManufacturingOrder(id);
      if (kind === "hold") await api.holdManufacturingOrder(id);
      if (kind === "resume") await api.resumeManufacturingOrder(id);
      if (kind === "complete") await api.completeManufacturingOrder(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed action");
    }
  };

  const stageAction = async (stageId: number, kind: "start" | "complete" | "skip") => {
    try {
      if (kind === "start") await api.startManufacturingStage(stageId);
      if (kind === "complete") await api.completeManufacturingStage(stageId);
      if (kind === "skip") await api.skipManufacturingStage(stageId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed stage action");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Manufacturing Orders</h1>
        <p className="text-sm text-slate-500">Manage stage-by-stage production progress with safe controls.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm"><div className="text-slate-500">Open PO</div><div className="text-xl font-semibold">{kpi.openPo} <span className="text-xs text-slate-400">{trend("openPo")}</span></div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm"><div className="text-slate-500">Open GRN</div><div className="text-xl font-semibold">{kpi.openGrn} <span className="text-xs text-slate-400">{trend("openGrn")}</span></div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm"><div className="text-slate-500">Pending CR</div><div className="text-xl font-semibold">{kpi.pendingCr} <span className="text-xs text-slate-400">{trend("pendingCr")}</span></div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm"><div className="text-slate-500">Low Stock Items</div><div className="text-xl font-semibold">{kpi.lowStock} <span className="text-xs text-slate-400">{trend("lowStock")}</span></div></div>
      </div>

      {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Create Manufacturing Order</h2>
        <form className="grid grid-cols-1 gap-3 md:grid-cols-4" onSubmit={create}>
          <select
            className="rounded border px-3 py-2 text-sm"
            value={String(form.finished_item_id)}
            onChange={(e) => setForm((prev) => ({ ...prev, finished_item_id: Number(e.target.value) }))}
          >
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <input
            className="rounded border px-3 py-2 text-sm"
            placeholder="Planned quantity"
            value={form.planned_quantity}
            onChange={(e) => setForm((prev) => ({ ...prev, planned_quantity: e.target.value }))}
          />
          <input
            className="rounded border px-3 py-2 text-sm md:col-span-2"
            placeholder="Notes"
            value={form.notes ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
          />
          <button className="rounded bg-slate-900 px-4 py-2 text-sm text-white" type="submit">
            Create
          </button>
        </form>
      </div>

      {orders.map((order) => {
        const stages = stagesByOrder[order.id] ?? [];
        return (
          <div key={order.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold text-slate-800">{order.mo_number}</h3>
                <p className="text-xs text-slate-500">
                  {itemName.get(order.finished_item_id) ?? order.finished_item_id} | Planned: {order.planned_quantity}
                </p>
                <div className="mt-1">
                  <span className={`rounded px-2 py-1 text-xs font-semibold ${statusBadgeClass(order.status)}`}>{order.status}</span>
                </div>
              </div>
              <div className="flex gap-2">
                {order.status === "draft" || order.status === "planned" ? (
                  <button className="rounded border px-2 py-1 text-xs" onClick={() => void action(order.id, "start")}>
                    Start
                  </button>
                ) : null}
                {order.status === "in_progress" ? (
                  <button className="rounded border px-2 py-1 text-xs" onClick={() => void action(order.id, "hold")}>
                    Hold
                  </button>
                ) : null}
                {order.status === "on_hold" ? (
                  <button className="rounded border px-2 py-1 text-xs" onClick={() => void action(order.id, "resume")}>
                    Resume
                  </button>
                ) : null}
                {order.status !== "completed" ? (
                  <button className="rounded border px-2 py-1 text-xs" onClick={() => void action(order.id, "complete")}>
                    Complete
                  </button>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              {stages.map((stage) => (
                <div key={stage.id} className="rounded border border-slate-200 p-3">
                  <div className="mb-2 text-sm font-medium text-slate-700">
                    {stage.stage_order}. {stage.stage_name.replaceAll("_", " ")}
                  </div>
                  <div className="mb-2 text-xs">
                    <span className={`rounded px-2 py-1 text-xs font-semibold ${statusBadgeClass(stage.status)}`}>{stage.status}</span>
                  </div>
                  <div className="flex gap-1">
                    {stage.status === "pending" ? (
                      <button className="rounded border px-2 py-1 text-xs" onClick={() => void stageAction(stage.id, "start")}>
                        Start
                      </button>
                    ) : null}
                    {stage.status === "in_progress" ? (
                      <button className="rounded border px-2 py-1 text-xs" onClick={() => void stageAction(stage.id, "complete")}>
                        Complete
                      </button>
                    ) : null}
                    {stage.status === "pending" || stage.status === "in_progress" ? (
                      <button className="rounded border px-2 py-1 text-xs" onClick={() => void stageAction(stage.id, "skip")}>
                        Skip
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

