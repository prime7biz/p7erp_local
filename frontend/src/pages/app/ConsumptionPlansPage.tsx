import { useCallback, useEffect, useState } from "react";
import { logApiError } from "@/utils/logApiError";
import { api, type ConsumptionPlanDetailResponse, type ConsumptionPlanResponse, type OrderResponse } from "@/api/client";
import { DataTablePagination } from "@/components/app/DataTablePagination";
import { useListPagination } from "@/hooks/useListPagination";

export function ConsumptionPlansPage() {
  const { page, setPage, pageSize, setPageSize, offset, limit, allowedSizes } = useListPagination();
  const [plans, setPlans] = useState<ConsumptionPlanResponse[]>([]);
  const [plansTotal, setPlansTotal] = useState(0);
  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [selected, setSelected] = useState<ConsumptionPlanDetailResponse | null>(null);
  const [orderId, setOrderId] = useState<number>(0);
  const [requiredQty, setRequiredQty] = useState("0");
  const [error, setError] = useState("");
  const [loadingPlans, setLoadingPlans] = useState(true);

  const loadOrders = useCallback(async () => {
    try {
      const o = await api.listOrders({ limit: 500, offset: 0 });
      setOrders(o);
    } catch {
      setOrders([]);
    }
  }, []);

  const loadPlansPage = useCallback(async () => {
    setLoadingPlans(true);
    try {
      const res = await api.listConsumptionPlansWithTotal({ limit, offset });
      setPlans(res.rows);
      setPlansTotal(res.total ?? res.rows.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load consumption plans");
      setPlans([]);
      setPlansTotal(0);
    } finally {
      setLoadingPlans(false);
    }
  }, [limit, offset]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    void loadPlansPage();
  }, [loadPlansPage]);

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
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.order_code}
              </option>
            ))}
          </select>
          <button
            onClick={async () => {
              if (!orderId) return;
              try {
                await api.createConsumptionPlan({ order_id: orderId, status: "PLANNED" });
                setPage(1);
                const res = await api.listConsumptionPlansWithTotal({ limit: pageSize, offset: 0 });
                setPlans(res.rows);
                setPlansTotal(res.total ?? res.rows.length);
              } catch (err) {
                logApiError("ConsumptionPlans.createPlan", err);
                setError(err instanceof Error ? err.message : "Failed to create plan");
              }
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
            {loadingPlans ? (
              <div className="px-4 py-6 text-sm text-text-muted">Loading…</div>
            ) : (
              plans.map((p) => (
                <button key={p.id} onClick={() => open(p.id)} className="w-full text-left px-4 py-2 text-sm hover:bg-surface-subtle">
                  Plan #{p.id} · Order {p.order_id} · {p.status}
                </button>
              ))
            )}
            {!loadingPlans && plans.length === 0 && <div className="px-4 py-6 text-sm text-text-muted">No plans on this page.</div>}
          </div>
          {!loadingPlans && plansTotal > 0 ? (
            <DataTablePagination
              page={page}
              pageSize={pageSize}
              total={plansTotal}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              allowedSizes={allowedSizes}
              className="border-t-0"
            />
          ) : null}
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
          <h2 className="text-sm font-semibold text-text-primary">Plan Items</h2>
          {!selected ? (
            <div className="text-sm text-text-muted">Select a plan.</div>
          ) : (
            <>
              <div className="text-xs text-text-muted">
                Plan #{selected.plan.id} · Order {selected.plan.order_id}
              </div>
              <div className="flex gap-2">
                <input
                  value={requiredQty}
                  onChange={(e) => setRequiredQty(e.target.value)}
                  placeholder="Required qty"
                  className="flex-1 rounded border border-border px-2 py-1 text-sm"
                />
                <button
                  onClick={async () => {
                    try {
                      await api.createConsumptionPlanItem(selected.plan.id, { required_qty: requiredQty, item_code: "ITEM" });
                      setRequiredQty("0");
                      await open(selected.plan.id);
                    } catch (err) {
                      logApiError("ConsumptionPlans.createItem", err);
                      setError(err instanceof Error ? err.message : "Failed to add item");
                    }
                  }}
                  className="rounded border border-border px-2 py-1 text-xs"
                >
                  Add
                </button>
              </div>
              <div className="space-y-1">
                {selected.items.map((i) => (
                  <div key={i.id} className="flex items-center justify-between rounded border border-border px-2 py-1 text-sm">
                    <span>
                      {i.item_code ?? "ITEM"} · Qty {i.required_qty} {i.uom ?? ""}
                    </span>
                    <button
                      onClick={async () => {
                        try {
                          await api.deleteConsumptionPlanItem(selected.plan.id, i.id);
                          await open(selected.plan.id);
                        } catch (err) {
                          logApiError("ConsumptionPlans.deleteItem", err);
                          setError(err instanceof Error ? err.message : "Failed to delete item");
                        }
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
