import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type InventoryItemResponse, type ManufacturingOrderCreate, type ManufacturingStageResponse } from "@/api/client";
import {
  InventoryCardListSkeleton,
  InventoryEmptyState,
  InventoryErrorPanel,
  InventoryKpiStripSkeleton,
} from "@/components/inventory/InventoryListStates";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { DataTablePagination } from "@/components/app/DataTablePagination";
import { useListPagination } from "@/hooks/useListPagination";

function statusBadgeClass(status: string) {
  switch (status) {
    case "draft":
    case "pending":
      return "bg-surface-subtle text-text-secondary";
    case "planned":
      return "bg-status-info-subtle text-status-info-foreground";
    case "in_progress":
      return "bg-status-warning-subtle text-status-warning-foreground";
    case "on_hold":
      return "bg-status-warning-subtle text-status-warning-foreground";
    case "completed":
      return "bg-status-success-subtle text-status-success-foreground";
    case "skipped":
      return "bg-purple-100 text-purple-700";
    default:
      return "bg-surface-subtle text-text-secondary";
  }
}

export function ManufacturingOrdersPage() {
  const { page, setPage, pageSize, setPageSize, offset, limit, allowedSizes } = useListPagination();
  const [orders, setOrders] = useState<Awaited<ReturnType<typeof api.listManufacturingOrders>>>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [items, setItems] = useState<InventoryItemResponse[]>([]);
  const [stagesByOrder, setStagesByOrder] = useState<Record<number, ManufacturingStageResponse[]>>({});
  const [error, setError] = useState("");
  const [kpi, setKpi] = useState({ openPo: 0, openGrn: 0, pendingCr: 0, lowStock: 0 });
  const [prevKpi, setPrevKpi] = useState<{ openPo: number; openGrn: number; pendingCr: number; lowStock: number } | null>(null);
  const [form, setForm] = useState<ManufacturingOrderCreate>({ finished_item_id: 0, planned_quantity: "0", notes: "" });
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const loadKpiAndMasters = useCallback(async () => {
    const [itmPage, overview, pendingCrRows, stockSample] = await Promise.all([
      api.listInventoryItemsPaginated({ page: 1, page_size: 500 }),
      api.getInventoryReconciliationOverview(),
      api.listConsumptionChangeRequests({ status_filter: "PENDING" }),
      api.getStockSummary({ limit: 500, offset: 0 }),
    ]);
    setItems(itmPage.items);
    const nextKpi = {
      openPo: overview.purchase_orders_open,
      openGrn: overview.goods_receiving_open,
      pendingCr: pendingCrRows.length,
      lowStock: stockSample.filter((r) => r.on_hand_qty > 0 && r.on_hand_qty <= 5).length,
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
    const firstItem = itmPage.items[0];
    if (firstItem) {
      setForm((prev) => (!prev.finished_item_id ? { ...prev, finished_item_id: firstItem.id } : prev));
    }
  }, []);

  const loadOrdersPage = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const moRes = await api.listManufacturingOrdersWithTotal({ limit, offset });
      setOrders(moRes.rows);
      setOrdersTotal(moRes.total ?? moRes.rows.length);
      const stagePairs = await Promise.all(
        moRes.rows.map(async (row) => [row.id, await api.getManufacturingStages(row.id)] as const),
      );
      setStagesByOrder(Object.fromEntries(stagePairs));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load manufacturing data");
    } finally {
      setLoading(false);
    }
  }, [limit, offset]);

  useEffect(() => {
    void loadKpiAndMasters();
  }, [loadKpiAndMasters]);

  useEffect(() => {
    void loadOrdersPage();
  }, [loadOrdersPage]);

  useEffect(() => {
    const close = () => setOpenActionsId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
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
      await loadKpiAndMasters();
      await loadOrdersPage();
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
      await loadKpiAndMasters();
      await loadOrdersPage();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed action");
    }
  };

  const stageAction = async (stageId: number, kind: "start" | "complete" | "skip") => {
    try {
      if (kind === "start") await api.startManufacturingStage(stageId);
      if (kind === "complete") await api.completeManufacturingStage(stageId);
      if (kind === "skip") await api.skipManufacturingStage(stageId);
      await loadKpiAndMasters();
      await loadOrdersPage();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed stage action");
    }
  };

  return (
    <div className="space-y-6">
      <AppPageHeader
        title="Manufacturing Orders"
        description="Production execution · Stage progress tied to inventory KPIs (open PO/GRN, consumption changes, low stock). Use Planning for pipeline readiness."
        actions={
          <Link
            to="/app/manufacturing/planning"
            className="rounded-lg border border-border-strong px-3 py-2 text-xs font-semibold text-text-secondary hover:bg-surface-subtle"
          >
            Production planning
          </Link>
        }
      />

      {error ? (
        <InventoryErrorPanel
          message={error}
          onRetry={() => {
            void loadKpiAndMasters();
            void loadOrdersPage();
          }}
        />
      ) : null}

      {loading ? (
        <>
          <InventoryKpiStripSkeleton cards={4} />
          <InventoryCardListSkeleton count={3} />
        </>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-border bg-surface-raised p-3 text-sm">
            <div className="text-text-muted">Open PO</div>
            <div className="text-xl font-semibold">
              {kpi.openPo} <span className="text-xs text-text-muted">{trend("openPo")}</span>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised p-3 text-sm">
            <div className="text-text-muted">Open GRN</div>
            <div className="text-xl font-semibold">
              {kpi.openGrn} <span className="text-xs text-text-muted">{trend("openGrn")}</span>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised p-3 text-sm">
            <div className="text-text-muted">Pending CR</div>
            <div className="text-xl font-semibold">
              {kpi.pendingCr} <span className="text-xs text-text-muted">{trend("pendingCr")}</span>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised p-3 text-sm">
            <div className="text-text-muted">Low Stock Items</div>
            <div className="text-xl font-semibold">
              {kpi.lowStock} <span className="text-xs text-text-muted">{trend("lowStock")}</span>
            </div>
          </div>
        </div>
      )}

      {!loading && (
      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <h2 className="mb-3 text-sm font-semibold text-text-secondary">Create Manufacturing Order</h2>
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
          <button
            type="submit"
            className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90"
          >
            Create
          </button>
        </form>
      </div>
      )}

      {!loading && ordersTotal === 0 ? (
        <InventoryEmptyState title="No manufacturing orders yet" description="Create a manufacturing order above to start production." />
      ) : null}

      {!loading &&
      orders.map((order) => {
        const stages = stagesByOrder[order.id] ?? [];
        return (
          <div key={order.id} id={`mo-${order.id}`} className="scroll-mt-4 rounded-xl border border-border bg-surface-raised p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold text-text-primary">{order.mo_number}</h3>
                <p className="text-xs text-text-muted">
                  {itemName.get(order.finished_item_id) ?? order.finished_item_id} | Planned: {order.planned_quantity}
                </p>
                <div className="mt-1">
                  <span className={`rounded px-2 py-1 text-xs font-semibold ${statusBadgeClass(order.status)}`}>{order.status}</span>
                </div>
              </div>
              <div className="relative shrink-0">
                <button
                  type="button"
                  className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenActionsId((id) => (id === order.id ? null : order.id));
                  }}
                >
                  Actions
                </button>
                {openActionsId === order.id && (
                  <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                    <button
                      type="button"
                      className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenActionsId(null);
                        document.getElementById(`mo-${order.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                    >
                      View
                    </button>
                    {order.status === "draft" || order.status === "planned" ? (
                      <button
                        type="button"
                        className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenActionsId(null);
                          void action(order.id, "start");
                        }}
                      >
                        Start
                      </button>
                    ) : null}
                    {order.status === "in_progress" ? (
                      <button
                        type="button"
                        className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenActionsId(null);
                          void action(order.id, "hold");
                        }}
                      >
                        Hold
                      </button>
                    ) : null}
                    {order.status === "on_hold" ? (
                      <button
                        type="button"
                        className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenActionsId(null);
                          void action(order.id, "resume");
                        }}
                      >
                        Resume
                      </button>
                    ) : null}
                    {order.status !== "completed" ? (
                      <button
                        type="button"
                        className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenActionsId(null);
                          void action(order.id, "complete");
                        }}
                      >
                        Complete
                      </button>
                    ) : null}
                    {order.status === "completed" ? (
                      <Link
                        to={`/app/inventory/delivery-challans?item_id=${order.finished_item_id}&qty=${order.planned_quantity}`}
                        className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                        onClick={() => setOpenActionsId(null)}
                      >
                        Create Delivery Challan
                      </Link>
                    ) : null}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              {stages.map((stage) => (
                <div key={stage.id} className="rounded border border-border p-3">
                  <div className="mb-2 text-sm font-medium text-text-secondary">
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
      {!loading && ordersTotal > 0 ? (
        <DataTablePagination
          page={page}
          pageSize={pageSize}
          total={ordersTotal}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          allowedSizes={allowedSizes}
        />
      ) : null}
      <p className="text-xs text-text-muted">
        Finished-item dropdown loads up to 500 inventory items. KPI “Low stock” is estimated from the first 500 stock-summary rows.
      </p>
    </div>
  );
}

