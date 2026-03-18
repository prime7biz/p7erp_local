import { useEffect, useState } from "react";
import { api, type ConsumptionPlanDetailResponse, type ConsumptionPlanResponse, type OrderResponse } from "@/api/client";

export function ConsumptionPlansPage() {
  const [plans, setPlans] = useState<ConsumptionPlanResponse[]>([]);
  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [selected, setSelected] = useState<ConsumptionPlanDetailResponse | null>(null);
  const [orderId, setOrderId] = useState<number>(0);
  const [requiredQty, setRequiredQty] = useState("0");
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const [p, o] = await Promise.all([api.listConsumptionPlans(), api.listOrders({ limit: 200, offset: 0 })]);
      setPlans(p);
      setOrders(o);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load consumption plans");
    }
  };

  useEffect(() => { load(); }, []);

  const open = async (id: number) => setSelected(await api.getConsumptionPlan(id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Consumption Plans</h1>
          <p className="text-sm text-text-muted mt-0.5">Plan required materials by order.</p>
        </div>
        <div className="flex gap-2">
          <select value={orderId || ""} onChange={(e) => setOrderId(Number(e.target.value) || 0)} className="rounded border border-border px-3 py-2 text-sm">
            <option value="">Select order…</option>
            {orders.map((o) => <option key={o.id} value={o.id}>{o.order_code}</option>)}
          </select>
          <button
            onClick={async () => {
              if (!orderId) return;
              await api.createConsumptionPlan({ order_id: orderId, status: "PLANNED" });
              await load();
            }}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white"
          >
            New Plan
          </button>
        </div>
      </div>
      {error && <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">{error}</div>}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
          <div className="px-4 py-3 border-b border-border text-sm font-semibold">Plans</div>
          <div className="divide-y divide-border">
            {plans.map((p) => (
              <button key={p.id} onClick={() => open(p.id)} className="w-full text-left px-4 py-2 text-sm hover:bg-surface-subtle">
                Plan #{p.id} · Order {p.order_id} · {p.status}
              </button>
            ))}
            {plans.length === 0 && <div className="px-4 py-6 text-sm text-text-muted">No plans yet.</div>}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
          <h2 className="text-sm font-semibold text-text-primary">Plan Items</h2>
          {!selected ? (
            <div className="text-sm text-text-muted">Select a plan.</div>
          ) : (
            <>
              <div className="text-xs text-text-muted">Plan #{selected.plan.id} · Order {selected.plan.order_id}</div>
              <div className="flex gap-2">
                <input value={requiredQty} onChange={(e) => setRequiredQty(e.target.value)} placeholder="Required qty" className="flex-1 rounded border border-border px-2 py-1 text-sm" />
                <button
                  onClick={async () => {
                    await api.createConsumptionPlanItem(selected.plan.id, { required_qty: requiredQty, item_code: "ITEM" });
                    setRequiredQty("0");
                    await open(selected.plan.id);
                  }}
                  className="rounded border border-border px-2 py-1 text-xs"
                >
                  Add
                </button>
              </div>
              <div className="space-y-1">
                {selected.items.map((i) => (
                  <div key={i.id} className="flex items-center justify-between rounded border border-border px-2 py-1 text-sm">
                    <span>{i.item_code ?? "ITEM"} · Qty {i.required_qty} {i.uom ?? ""}</span>
                    <button
                      onClick={async () => {
                        await api.deleteConsumptionPlanItem(selected.plan.id, i.id);
                        await open(selected.plan.id);
                      }}
                      className="text-xs text-status-danger-foreground"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
