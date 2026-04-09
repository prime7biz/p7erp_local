import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { logApiError } from "@/utils/logApiError";
import {
  api,
  type ConsumptionReconciliationResponse,
  type ConsumptionReconciliationRow,
  type CustomerResponse,
  type StyleResponse,
  type OrderResponse,
} from "@/api/client";

const TOLERANCE_OPTIONS = [2, 5, 10] as const;
const DASH_PAGE_SIZE = 20;
const MATERIAL_TYPES = [
  { value: "", label: "All types" },
  { value: "fabric", label: "Fabric" },
  { value: "trim", label: "Trim" },
  { value: "other", label: "Other" },
];
const STATUS_FILTERS = [
  { value: "", label: "All statuses" },
  { value: "on_target", label: "On target" },
  { value: "minor", label: "Minor" },
  { value: "exceeds", label: "Exceeds" },
];

function formatNum(n: number) {
  if (n === 0) return "0";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMoney(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function VarianceBadge({
  variancePct,
  tolerancePct,
}: {
  variancePct: number;
  tolerancePct: number;
}) {
  const abs = Math.abs(variancePct);
  if (abs <= 2)
    return (
      <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-status-success-subtle text-status-success-foreground border border-status-success/30">
        On target
      </span>
    );
  if (abs <= tolerancePct)
    return (
      <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-status-warning-subtle text-status-warning-foreground border border-status-warning/30">
        Minor variance
      </span>
    );
  return (
    <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-status-danger-subtle text-status-danger-foreground border border-status-danger/20">
      Exceeds tolerance
    </span>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-surface-raised shadow-sm p-4 animate-pulse">
      <div className="h-3 w-20 bg-border-subtle rounded mb-2" />
      <div className="h-7 w-24 bg-border-subtle rounded" />
    </div>
  );
}

function SkeletonTable() {
  return (
    <div className="rounded-xl border border-border bg-surface-raised overflow-hidden animate-pulse">
      <div className="h-10 bg-surface-subtle border-b border-border" />
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          className="h-12 border-b border-border-subtle last:border-0 flex gap-4 px-4 items-center"
        >
          <div className="h-4 bg-border-subtle rounded w-32" />
          <div className="h-4 bg-border-subtle rounded w-16" />
          <div className="h-4 bg-border-subtle rounded w-20" />
        </div>
      ))}
    </div>
  );
}

type DetailSortKey =
  | "item_name"
  | "planned_qty"
  | "actual_qty"
  | "variance_pct"
  | "cost_variance";

export function ConsumptionReconciliationPage() {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<"dashboard" | "detail">("dashboard");

  const [customers, setCustomers] = useState<CustomerResponse[]>([]);
  const [styles, setStyles] = useState<StyleResponse[]>([]);
  const [dashBuyerId, setDashBuyerId] = useState("");
  const [dashStyleId, setDashStyleId] = useState("");
  const [dashDateFrom, setDashDateFrom] = useState("");
  const [dashDateTo, setDashDateTo] = useState("");
  const [dashMaterialType, setDashMaterialType] = useState("");
  const [dashStatus, setDashStatus] = useState("");
  const [dashTolerance, setDashTolerance] = useState(5);
  const [dashPage, setDashPage] = useState(1);
  const [dashSortBy, setDashSortBy] = useState("overall_variance_pct");
  const [dashSortDir, setDashSortDir] = useState<"asc" | "desc">("desc");
  const [dashboardData, setDashboardData] = useState<Awaited<
    ReturnType<typeof api.getConsumptionReconciliationDashboard>
  > | null>(null);
  const [trendsData, setTrendsData] = useState<Awaited<
    ReturnType<typeof api.getConsumptionReconciliationTrends>
  > | null>(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [dashError, setDashError] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dashExporting, setDashExporting] = useState(false);

  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderComboOpen, setOrderComboOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [tolerancePct, setTolerancePct] = useState(5);
  const [data, setData] = useState<ConsumptionReconciliationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  const [detailSort, setDetailSort] = useState<{ key: DetailSortKey; dir: "asc" | "desc" }>({
    key: "variance_pct",
    dir: "desc",
  });
  const [detailMatFilter, setDetailMatFilter] = useState("");
  const [detailItemSearch, setDetailItemSearch] = useState("");

  const [drawerItemId, setDrawerItemId] = useState<number | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState("");
  const [movementData, setMovementData] = useState<Awaited<
    ReturnType<typeof api.getConsumptionReconciliationMovements>
  > | null>(null);

  const [openActionsId, setOpenActionsId] = useState<number | null>(null);

  useEffect(() => {
    const oid = searchParams.get("orderId");
    if (oid && /^\d+$/.test(oid)) {
      setSelectedOrderId(oid);
      setActiveTab("detail");
      setOrderSearch("");
    }
  }, [searchParams]);

  useEffect(() => {
    api
      .listCustomers()
      .then(setCustomers)
      .catch((e) => logApiError("ConsumptionReconciliationPage.listCustomers", e));
    api
      .listStyles({ limit: 300 })
      .then(setStyles)
      .catch((e) => logApiError("ConsumptionReconciliationPage.listStyles", e));
  }, []);

  useEffect(() => {
    api
      .listOrders({ search: orderSearch.trim() || undefined, limit: 80 })
      .then(setOrders)
      .catch((e) => {
        logApiError("ConsumptionReconciliationPage.listOrders", e);
        setOrders([]);
      });
  }, [orderSearch]);

  const loadDashboard = useCallback(async () => {
    setDashLoading(true);
    setDashError("");
    try {
      const offset = (dashPage - 1) * DASH_PAGE_SIZE;
      const [dash, tr] = await Promise.all([
        api.getConsumptionReconciliationDashboard({
          buyer_id: dashBuyerId ? Number(dashBuyerId) : undefined,
          style_id: dashStyleId ? Number(dashStyleId) : undefined,
          date_from: dashDateFrom || undefined,
          date_to: dashDateTo || undefined,
          status: dashStatus || undefined,
          material_type: dashMaterialType || undefined,
          tolerance_pct: dashTolerance,
          limit: DASH_PAGE_SIZE,
          offset,
          sort_by: dashSortBy,
          sort_dir: dashSortDir,
        }),
        api.getConsumptionReconciliationTrends({
          months: 6,
          buyer_id: dashBuyerId ? Number(dashBuyerId) : undefined,
          style_id: dashStyleId ? Number(dashStyleId) : undefined,
          tolerance_pct: dashTolerance,
        }),
      ]);
      setDashboardData(dash);
      setTrendsData(tr);
    } catch (e) {
      setDashError(e instanceof Error ? e.message : "Failed to load dashboard");
      setDashboardData(null);
      setTrendsData(null);
    } finally {
      setDashLoading(false);
    }
  }, [
    dashPage,
    dashBuyerId,
    dashStyleId,
    dashDateFrom,
    dashDateTo,
    dashMaterialType,
    dashStatus,
    dashTolerance,
    dashSortBy,
    dashSortDir,
  ]);

  useEffect(() => {
    if (activeTab === "dashboard") loadDashboard();
  }, [activeTab, loadDashboard]);

  const loadDetail = useCallback(async () => {
    if (!selectedOrderId.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.getConsumptionReconciliation(Number(selectedOrderId), {
        tolerance_pct: tolerancePct,
      });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load reconciliation");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [selectedOrderId, tolerancePct]);

  useEffect(() => {
    if (activeTab === "detail" && selectedOrderId.trim()) loadDetail();
    else if (activeTab === "detail" && !selectedOrderId.trim()) setData(null);
  }, [activeTab, selectedOrderId, tolerancePct, loadDetail]);

  const handleExportDetail = useCallback(async () => {
    if (!selectedOrderId.trim() || !data) return;
    setExporting(true);
    try {
      const blob = await api.getConsumptionReconciliationExportBlob(Number(selectedOrderId), {
        tolerance_pct: tolerancePct,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `consumption_recon_order_${data.order.order_code || selectedOrderId}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, [selectedOrderId, tolerancePct, data]);

  const handleDashExport = useCallback(async () => {
    setDashExporting(true);
    try {
      const blob = await api.getConsumptionReconciliationDashboardExportBlob({
        buyer_id: dashBuyerId ? Number(dashBuyerId) : undefined,
        style_id: dashStyleId ? Number(dashStyleId) : undefined,
        date_from: dashDateFrom || undefined,
        date_to: dashDateTo || undefined,
        status: dashStatus || undefined,
        material_type: dashMaterialType || undefined,
        tolerance_pct: dashTolerance,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "consumption_recon_dashboard.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setDashError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setDashExporting(false);
    }
  }, [dashBuyerId, dashStyleId, dashDateFrom, dashDateTo, dashStatus, dashMaterialType, dashTolerance]);

  const openMovementDrawer = useCallback(
    async (itemId: number) => {
      if (!selectedOrderId) return;
      setDrawerItemId(itemId);
      setDrawerLoading(true);
      setDrawerError("");
      setMovementData(null);
      try {
        const m = await api.getConsumptionReconciliationMovements(Number(selectedOrderId), itemId);
        setMovementData(m);
      } catch (e) {
        setDrawerError(e instanceof Error ? e.message : "Failed to load movements");
      } finally {
        setDrawerLoading(false);
      }
    },
    [selectedOrderId]
  );

  const closeDrawer = useCallback(() => {
    setDrawerItemId(null);
    setMovementData(null);
    setDrawerError("");
  }, []);

  const filteredDetailItems = useMemo(() => {
    if (!data?.items) return [];
    let rows = [...data.items];
    if (detailMatFilter.trim()) {
      const m = detailMatFilter.trim().toLowerCase();
      rows = rows.filter((r) => r.material_type.toLowerCase() === m);
    }
    if (detailItemSearch.trim()) {
      const s = detailItemSearch.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.item_code.toLowerCase().includes(s) ||
          r.item_name.toLowerCase().includes(s)
      );
    }
    const mult = detailSort.dir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      let va: number | string = 0;
      let vb: number | string = 0;
      switch (detailSort.key) {
        case "item_name":
          va = `${a.item_code} ${a.item_name}`;
          vb = `${b.item_code} ${b.item_name}`;
          return mult * String(va).localeCompare(String(vb));
        case "planned_qty":
          va = a.planned_qty;
          vb = b.planned_qty;
          break;
        case "actual_qty":
          va = a.actual_qty;
          vb = b.actual_qty;
          break;
        case "variance_pct":
          va = a.variance_pct;
          vb = b.variance_pct;
          break;
        case "cost_variance":
          va = a.cost_variance ?? 0;
          vb = b.cost_variance ?? 0;
          break;
        default:
          va = a.variance_pct;
          vb = b.variance_pct;
      }
      return mult * (Number(va) - Number(vb));
    });
    return rows;
  }, [data, detailSort, detailMatFilter, detailItemSearch]);

  const toggleDashSort = (col: string) => {
    if (dashSortBy === col) {
      setDashSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setDashSortBy(col);
      setDashSortDir("desc");
    }
    setDashPage(1);
  };

  const toggleDetailSort = (key: DetailSortKey) => {
    setDetailSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }
    );
  };

  const goToOrderDetail = (orderId: number) => {
    setSelectedOrderId(String(orderId));
    setActiveTab("detail");
    setOpenActionsId(null);
  };

  const resetDashFilters = () => {
    setDashBuyerId("");
    setDashStyleId("");
    setDashDateFrom("");
    setDashDateTo("");
    setDashMaterialType("");
    setDashStatus("");
    setDashTolerance(5);
    setDashPage(1);
  };

  const maxTrend = useMemo(() => {
    if (!trendsData?.points.length) return 10;
    return Math.max(10, ...trendsData.points.map((p) => Math.abs(p.avg_variance_pct)));
  }, [trendsData]);

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-brand-primary">Consumption Reconciliation</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Compare BOM planned vs. actual material consumption (dashboard + per-order detail)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("dashboard")}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "dashboard"
                ? "border-brand-primary text-brand-primary"
                : "border-transparent text-text-muted hover:text-text-secondary"
            }`}
          >
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("detail")}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "detail"
                ? "border-brand-primary text-brand-primary"
                : "border-transparent text-text-muted hover:text-text-secondary"
            }`}
          >
            Order detail
          </button>
        </div>
      </div>

      {activeTab === "dashboard" && (
        <>
          <div className="lg:hidden print:hidden">
            <button
              type="button"
              onClick={() => setFiltersOpen((o) => !o)}
              className="rounded-lg border border-border-strong px-3 py-2 text-sm w-full text-left"
            >
              {filtersOpen ? "Hide filters" : "Show filters"}
            </button>
          </div>

          <div
            className={`flex flex-wrap gap-3 items-end print:hidden ${
              filtersOpen ? "flex" : "hidden"
            } lg:flex`}
          >
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-text-muted">Buyer</label>
              <select
                className="rounded-lg border border-border-strong px-3 py-2 text-sm min-w-[160px]"
                value={dashBuyerId}
                onChange={(e) => {
                  setDashBuyerId(e.target.value);
                  setDashPage(1);
                }}
              >
                <option value="">All buyers</option>
                {customers.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-text-muted">Style</label>
              <select
                className="rounded-lg border border-border-strong px-3 py-2 text-sm min-w-[180px]"
                value={dashStyleId}
                onChange={(e) => {
                  setDashStyleId(e.target.value);
                  setDashPage(1);
                }}
              >
                <option value="">All styles</option>
                {styles.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.style_code} — {s.name ?? s.id}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-text-muted">From</label>
              <input
                type="date"
                className="rounded-lg border border-border-strong px-3 py-2 text-sm"
                value={dashDateFrom}
                onChange={(e) => {
                  setDashDateFrom(e.target.value);
                  setDashPage(1);
                }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-text-muted">To</label>
              <input
                type="date"
                className="rounded-lg border border-border-strong px-3 py-2 text-sm"
                value={dashDateTo}
                onChange={(e) => {
                  setDashDateTo(e.target.value);
                  setDashPage(1);
                }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-text-muted">Material</label>
              <select
                className="rounded-lg border border-border-strong px-3 py-2 text-sm"
                value={dashMaterialType}
                onChange={(e) => {
                  setDashMaterialType(e.target.value);
                  setDashPage(1);
                }}
              >
                {MATERIAL_TYPES.map((m) => (
                  <option key={m.value || "all"} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-text-muted">Status</label>
              <select
                className="rounded-lg border border-border-strong px-3 py-2 text-sm"
                value={dashStatus}
                onChange={(e) => {
                  setDashStatus(e.target.value);
                  setDashPage(1);
                }}
              >
                {STATUS_FILTERS.map((s) => (
                  <option key={s.value || "allst"} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-text-muted">Tolerance</label>
              <select
                className="rounded-lg border border-border-strong px-3 py-2 text-sm"
                value={dashTolerance}
                onChange={(e) => {
                  setDashTolerance(Number(e.target.value));
                  setDashPage(1);
                }}
              >
                {TOLERANCE_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}%
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={resetDashFilters}
              className="rounded-lg border border-border-strong px-3 py-2 text-sm self-end"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={handleDashExport}
              disabled={dashExporting || dashLoading}
              className="rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm font-medium self-end disabled:opacity-50"
            >
              {dashExporting ? "Exporting…" : "Export Excel"}
            </button>
          </div>

          {dashError && (
            <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
              {dashError}
            </div>
          )}

          {dashLoading && !dashboardData && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
              <SkeletonTable />
            </>
          )}

          {dashboardData && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="rounded-xl border border-border bg-surface-raised shadow-sm p-4">
                  <p className="text-xs font-medium text-text-muted uppercase">Total orders</p>
                  <p className="mt-1 text-xl font-semibold text-brand-primary">
                    {dashboardData.summary.total_orders}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-surface-raised shadow-sm p-4">
                  <p className="text-xs font-medium text-text-muted uppercase">On target</p>
                  <p className="mt-1 text-xl font-semibold text-status-success">
                    {dashboardData.summary.orders_on_target}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-surface-raised shadow-sm p-4">
                  <p className="text-xs font-medium text-text-muted uppercase">Minor</p>
                  <p className="mt-1 text-xl font-semibold text-status-warning">
                    {dashboardData.summary.orders_minor}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-surface-raised shadow-sm p-4">
                  <p className="text-xs font-medium text-text-muted uppercase">Exceeds</p>
                  <p className="mt-1 text-xl font-semibold text-status-danger">
                    {dashboardData.summary.orders_exceeding}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-surface-raised shadow-sm p-4">
                  <p className="text-xs font-medium text-text-muted uppercase">Avg variance %</p>
                  <p className="mt-1 text-xl font-semibold text-brand-primary">
                    {dashboardData.summary.avg_variance_pct.toFixed(1)}%
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-surface-raised shadow-sm p-4">
                  <p className="text-xs font-medium text-text-muted uppercase">Planned / Actual qty</p>
                  <p className="mt-1 text-sm font-semibold text-brand-primary">
                    {formatNum(dashboardData.summary.total_planned_qty)} /{" "}
                    {formatNum(dashboardData.summary.total_actual_qty)}
                  </p>
                </div>
              </div>

              {dashboardData.category_breakdown.length > 0 && (
                <div className="rounded-xl border border-border bg-surface-raised shadow-sm p-4">
                  <h2 className="text-sm font-semibold text-brand-primary mb-3">By material type</h2>
                  <div className="space-y-2">
                    {dashboardData.category_breakdown.map((c) => {
                      const maxv = Math.max(c.total_planned, c.total_actual, 1);
                      return (
                        <div key={c.material_type} className="flex items-center gap-3 text-sm">
                          <span className="w-20 capitalize text-text-secondary">{c.material_type}</span>
                          <div className="flex-1 flex gap-1 h-6 items-center">
                            <div
                              className="h-4 bg-status-info-subtle rounded"
                              style={{ width: `${Math.min(100, (c.total_planned / maxv) * 100)}%` }}
                              title={`Planned ${formatNum(c.total_planned)}`}
                            />
                            <div
                              className="h-4 bg-brand-primary/70 rounded"
                              style={{ width: `${Math.min(100, (c.total_actual / maxv) * 100)}%` }}
                              title={`Actual ${formatNum(c.total_actual)}`}
                            />
                          </div>
                          <span className="w-16 text-right font-mono text-xs">
                            {c.variance_pct >= 0 ? "+" : ""}
                            {c.variance_pct.toFixed(1)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-text-muted mt-2">Light = planned, solid = actual.</p>
                </div>
              )}

              {trendsData && trendsData.points.length > 0 && (
                <div className="rounded-xl border border-border bg-surface-raised shadow-sm p-4 overflow-x-auto">
                  <h2 className="text-sm font-semibold text-brand-primary mb-3">
                    Variance trend (monthly avg %)
                  </h2>
                  <div className="flex items-end gap-2 min-h-[120px] pb-6 relative">
                    <div
                      className="absolute left-0 right-0 border-t border-dashed border-status-danger/50"
                      style={{
                        bottom: `${(Math.min(dashTolerance, maxTrend) / maxTrend) * 100}%`,
                      }}
                      title={`Tolerance ${dashTolerance}%`}
                    />
                    {trendsData.points.map((p) => {
                      const h = (Math.abs(p.avg_variance_pct) / maxTrend) * 100;
                      return (
                        <div key={p.period} className="flex flex-col items-center flex-1 min-w-[48px]">
                          <div
                            className={`w-full rounded-t ${
                              Math.abs(p.avg_variance_pct) > dashTolerance
                                ? "bg-status-danger/80"
                                : "bg-brand-primary/70"
                            }`}
                            style={{ height: `${Math.max(8, h)}%`, minHeight: "8px" }}
                            title={`${p.period}: ${p.avg_variance_pct.toFixed(1)}% (${p.orders_count} orders)`}
                          />
                          <span className="text-[10px] text-text-muted mt-1 rotate-[-45deg] origin-top-left whitespace-nowrap">
                            {p.period}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-border bg-surface-raised shadow-sm overflow-hidden">
                <div className="p-4 pb-0 flex justify-between items-center">
                  <h2 className="text-sm font-semibold text-brand-primary">Orders</h2>
                  <span className="text-xs text-text-muted">
                    {dashboardData.total_count} match · page {dashPage}
                  </span>
                </div>
                {dashboardData.orders.length === 0 ? (
                  <p className="p-8 text-center text-text-muted">No orders match your filters.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-[960px] w-full text-sm">
                      <thead className="bg-surface-subtle border-b border-border">
                        <tr>
                          <th className="px-3 py-2 text-left sticky left-0 bg-surface-subtle z-[1]">
                            <button
                              type="button"
                              className="text-xs font-medium text-text-muted uppercase hover:underline"
                              onClick={() => toggleDashSort("order_code")}
                            >
                              Order {dashSortBy === "order_code" ? (dashSortDir === "asc" ? "↑" : "↓") : ""}
                            </button>
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-text-muted uppercase">
                            Style
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-text-muted uppercase">
                            Buyer
                          </th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-text-muted uppercase">
                            Qty
                          </th>
                          <th className="px-3 py-2 text-right">
                            <button
                              type="button"
                              className="text-xs font-medium text-text-muted uppercase hover:underline"
                              onClick={() => toggleDashSort("total_planned")}
                            >
                              Planned
                            </button>
                          </th>
                          <th className="px-3 py-2 text-right">
                            <button
                              type="button"
                              className="text-xs font-medium text-text-muted uppercase hover:underline"
                              onClick={() => toggleDashSort("total_actual")}
                            >
                              Actual
                            </button>
                          </th>
                          <th className="px-3 py-2 text-right">
                            <button
                              type="button"
                              className="text-xs font-medium text-text-muted uppercase hover:underline"
                              onClick={() => toggleDashSort("overall_variance_pct")}
                            >
                              Var %
                            </button>
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-text-muted uppercase">
                            Worst item
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-text-muted uppercase">
                            Status
                          </th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-text-muted uppercase w-28">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {dashboardData.orders.map((row) => (
                          <tr
                            key={row.order_id}
                            className="border-b border-border-subtle hover:bg-surface-subtle/50 cursor-pointer"
                            onClick={() => goToOrderDetail(row.order_id)}
                          >
                            <td className="px-3 py-2 font-medium text-brand-primary sticky left-0 bg-surface-raised">
                              {row.order_code}
                            </td>
                            <td className="px-3 py-2 text-text-secondary">{row.style_code}</td>
                            <td className="px-3 py-2 text-text-secondary">{row.buyer_name ?? "—"}</td>
                            <td className="px-3 py-2 text-right font-mono">{row.order_qty ?? "—"}</td>
                            <td className="px-3 py-2 text-right font-mono">{formatNum(row.total_planned)}</td>
                            <td className="px-3 py-2 text-right font-mono">{formatNum(row.total_actual)}</td>
                            <td
                              className={`px-3 py-2 text-right font-mono ${
                                Math.abs(row.overall_variance_pct) > dashTolerance
                                  ? "text-status-danger"
                                  : "text-text-secondary"
                              }`}
                            >
                              {row.overall_variance_pct >= 0 ? "+" : ""}
                              {row.overall_variance_pct.toFixed(1)}%
                            </td>
                            <td className="px-3 py-2 text-text-secondary max-w-[180px] truncate" title={row.worst_item_name ?? ""}>
                              {row.worst_item_name ?? "—"}
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={`text-xs capitalize ${
                                  row.status === "exceeds"
                                    ? "text-status-danger"
                                    : row.status === "minor"
                                      ? "text-status-warning"
                                      : "text-status-success"
                                }`}
                              >
                                {row.status.replace("_", " ")}
                              </span>
                            </td>
                            <td
                              className="px-3 py-2 text-right relative"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                                onClick={() =>
                                  setOpenActionsId((id) => (id === row.order_id ? null : row.order_id))
                                }
                              >
                                Actions
                              </button>
                              {openActionsId === row.order_id && (
                                <div className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-gray-200 bg-white p-1 shadow-lg text-left">
                                  <button
                                    type="button"
                                    className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                                    onClick={() => goToOrderDetail(row.order_id)}
                                  >
                                    View detail
                                  </button>
                                  <button
                                    type="button"
                                    className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                                    onClick={async () => {
                                      setOpenActionsId(null);
                                      try {
                                        const blob = await api.getConsumptionReconciliationExportBlob(
                                          row.order_id,
                                          { tolerance_pct: dashTolerance }
                                        );
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement("a");
                                        a.href = url;
                                        a.download = `consumption_recon_${row.order_code}.xlsx`;
                                        a.click();
                                        URL.revokeObjectURL(url);
                                      } catch (e) {
                                        logApiError("recon.exportRow", e);
                                      }
                                    }}
                                  >
                                    Export Excel
                                  </button>
                                  {row.style_id ? (
                                    <Link
                                      to={`/app/bom?styleId=${row.style_id}`}
                                      className="block rounded-md px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                                      onClick={() => setOpenActionsId(null)}
                                    >
                                      BOM
                                    </Link>
                                  ) : null}
                                  <Link
                                    to={`/app/inventory/consumption-control?orderId=${row.order_id}`}
                                    className="block rounded-md px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                                    onClick={() => setOpenActionsId(null)}
                                  >
                                    Consumption control
                                  </Link>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {dashboardData.total_count > DASH_PAGE_SIZE && (
                  <div className="flex justify-between items-center p-3 border-t border-border text-sm">
                    <button
                      type="button"
                      disabled={dashPage <= 1}
                      className="rounded-lg border px-3 py-1 disabled:opacity-50"
                      onClick={() => setDashPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </button>
                    <span>
                      Page {dashPage} of {Math.ceil(dashboardData.total_count / DASH_PAGE_SIZE) || 1}
                    </span>
                    <button
                      type="button"
                      disabled={dashPage * DASH_PAGE_SIZE >= dashboardData.total_count}
                      className="rounded-lg border px-3 py-1 disabled:opacity-50"
                      onClick={() => setDashPage((p) => p + 1)}
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {activeTab === "detail" && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <label className="text-xs font-medium text-text-muted">Order</label>
              <input
                type="text"
                className="mt-1 w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                placeholder="Search order or style…"
                value={orderSearch}
                onChange={(e) => {
                  setOrderSearch(e.target.value);
                  setOrderComboOpen(true);
                }}
                onFocus={() => setOrderComboOpen(true)}
              />
              {orderComboOpen && orders.length > 0 && (
                <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-surface-raised shadow-lg text-sm">
                  {orders.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left hover:bg-surface-subtle"
                        onClick={() => {
                          setSelectedOrderId(String(o.id));
                          setOrderSearch(`${o.order_code} — ${o.style_name ?? ""}`);
                          setOrderComboOpen(false);
                        }}
                      >
                        {o.order_code} — {o.style_name ?? `Order #${o.id}`}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-text-muted">Tolerance</label>
              <select
                className="rounded-lg border border-border-strong px-3 py-2 text-sm"
                value={tolerancePct}
                onChange={(e) => setTolerancePct(Number(e.target.value))}
              >
                {TOLERANCE_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}%
                  </option>
                ))}
              </select>
            </div>
            {data && (
              <>
                <button
                  type="button"
                  onClick={handleExportDetail}
                  disabled={exporting}
                  className="rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm font-medium disabled:opacity-50"
                >
                  {exporting ? "Exporting…" : "Export Excel"}
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm font-medium"
                >
                  Print / PDF
                </button>
              </>
            )}
          </div>

          {selectedOrderId && data && (
            <div className="flex flex-wrap gap-2 text-sm print:hidden">
              <Link
                to={`/app/orders/${data.order.id}`}
                className="rounded-lg border border-border-strong px-3 py-1.5 hover:bg-surface-subtle"
              >
                View order
              </Link>
              <Link
                to={`/app/bom?orderId=${data.order.id}`}
                className="rounded-lg border border-border-strong px-3 py-1.5 hover:bg-surface-subtle"
              >
                Order BOM
              </Link>
              <Link
                to={`/app/inventory/consumption-control?orderId=${selectedOrderId}`}
                className="rounded-lg border border-border-strong px-3 py-1.5 hover:bg-surface-subtle"
              >
                Consumption control
              </Link>
              <Link
                to="/app/merchandising/wastage-report"
                className="rounded-lg border border-border-strong px-3 py-1.5 hover:bg-surface-subtle"
              >
                Wastage report
              </Link>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground flex justify-between gap-2 print:hidden">
              <span>{error}</span>
              <button type="button" className="underline font-medium" onClick={() => loadDetail()}>
                Retry
              </button>
            </div>
          )}

          {!selectedOrderId && (
            <div className="rounded-xl border border-border bg-surface-raised shadow-sm p-16 text-center print:hidden">
              <p className="text-text-muted font-medium">Select an order (search above)</p>
            </div>
          )}

          {selectedOrderId && (loading || (!data && !error)) && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
              <SkeletonTable />
            </>
          )}

          {selectedOrderId && !loading && data && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 print:grid-cols-3">
                <div className="rounded-xl border border-border bg-surface-raised shadow-sm p-4">
                  <p className="text-xs font-medium text-text-muted uppercase">Order</p>
                  <p className="mt-1 text-lg font-semibold text-brand-primary">{data.order.order_code}</p>
                  <p className="text-sm text-text-secondary">{data.order.style_code}</p>
                  <p className="text-xs text-text-muted mt-1">Qty: {data.order.quantity ?? "—"}</p>
                  <p className="text-xs text-text-muted">Status: {data.order_status ?? "—"}</p>
                </div>
                <div className="rounded-xl border border-border bg-surface-raised shadow-sm p-4">
                  <p className="text-xs font-medium text-text-muted uppercase">BOM</p>
                  <p className="mt-1 text-sm font-semibold text-brand-primary">
                    v{data.bom_version ?? "—"} · {data.bom_status ?? "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-surface-raised shadow-sm p-4">
                  <p className="text-xs font-medium text-text-muted uppercase">Consumption plan</p>
                  <p className="mt-1 text-sm font-semibold text-brand-primary">
                    {data.consumption_plan_status ?? "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-surface-raised shadow-sm p-4">
                  <p className="text-xs font-medium text-text-muted uppercase">Qty planned / actual</p>
                  <p className="mt-1 text-xl font-semibold text-brand-primary">
                    {formatNum(data.summary.total_planned)} / {formatNum(data.summary.total_actual)}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-surface-raised shadow-sm p-4">
                  <p className="text-xs font-medium text-text-muted uppercase">Overall variance %</p>
                  <p
                    className={`mt-1 text-xl font-semibold ${
                      Math.abs(data.summary.overall_variance_pct) <= 2
                        ? "text-status-success"
                        : Math.abs(data.summary.overall_variance_pct) <= tolerancePct
                          ? "text-status-warning"
                          : "text-status-danger"
                    }`}
                  >
                    {data.summary.overall_variance_pct >= 0 ? "+" : ""}
                    {data.summary.overall_variance_pct.toFixed(1)}%
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-surface-raised shadow-sm p-4">
                  <p className="text-xs font-medium text-text-muted uppercase">Cost impact</p>
                  <p className="mt-1 text-sm font-semibold text-brand-primary">
                    {formatMoney(data.summary.total_planned_cost)} → {formatMoney(data.summary.total_actual_cost)}
                  </p>
                  <p
                    className={`text-sm ${
                      (data.summary.cost_variance ?? 0) > 0 ? "text-status-danger" : "text-status-success"
                    }`}
                  >
                    Δ {formatMoney(data.summary.cost_variance)} (
                    {(data.summary.cost_variance_pct ?? 0).toFixed(1)}%)
                  </p>
                </div>
              </div>

              {data.summary.total_quoted_planned_cost != null || data.summary.total_bom_planned_cost != null ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:grid-cols-3">
                  <div className="rounded-xl border border-border bg-surface-raised shadow-sm p-4">
                    <p className="text-xs font-medium text-text-muted uppercase">Quoted total cost</p>
                    <p className="mt-1 text-xl font-semibold text-brand-primary">
                      {formatMoney(data.summary.total_quoted_planned_cost)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface-raised shadow-sm p-4">
                    <p className="text-xs font-medium text-text-muted uppercase">BOM total cost</p>
                    <p className="mt-1 text-xl font-semibold text-brand-primary">
                      {formatMoney(data.summary.total_bom_planned_cost ?? data.summary.total_planned_cost)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface-raised shadow-sm p-4">
                    <p className="text-xs font-medium text-text-muted uppercase">Three-way cost variance</p>
                    <p className="mt-1 text-sm text-text-secondary">
                      Q↔B {formatMoney(data.summary.quoted_vs_bom_cost_variance)} · Q↔A{" "}
                      {formatMoney(data.summary.quoted_vs_actual_cost_variance)}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">Planned (BOM) qty total: {formatNum(data.summary.total_planned)}</p>
                  </div>
                </div>
              ) : null}

              {data.items.length > 0 && (
                <div className="rounded-xl border border-border bg-surface-raised shadow-sm p-4 print:break-before-page">
                  <h2 className="text-sm font-semibold text-brand-primary mb-4">Variance at a glance (quoted · BOM · actual)</h2>
                  <div className="mb-2 flex flex-wrap gap-3 text-[11px] text-text-muted">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-4 rounded bg-slate-400/60" /> Quoted qty
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-4 rounded bg-status-info-subtle" /> BOM planned
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-4 rounded bg-brand-primary/70" /> Actual
                    </span>
                  </div>
                  <div className="space-y-3">
                    {[...data.items]
                      .sort((a, b) => Math.abs(b.variance_pct) - Math.abs(a.variance_pct))
                      .slice(0, 10)
                      .map((item) => {
                        const quoted = item.quoted_planned_qty ?? 0;
                        const maxQ = Math.max(quoted, item.planned_qty, item.actual_qty, 1);
                        return (
                          <div key={item.item_id} className="flex items-center gap-4">
                            <span
                              className="text-sm text-text-secondary w-36 truncate"
                              title={`${item.item_name} (${formatNum(item.planned_qty)} / ${formatNum(item.actual_qty)})`}
                            >
                              {item.item_code}
                            </span>
                            <div className="flex-1 flex gap-1 items-center">
                              {quoted > 0 ? (
                                <div
                                  className="h-6 bg-slate-400/50 rounded min-w-[4px]"
                                  style={{
                                    width: `${Math.min(100, (quoted / maxQ) * 100)}%`,
                                    maxWidth: "33%",
                                  }}
                                  title={`Quoted planned ${formatNum(quoted)}`}
                                />
                              ) : null}
                              <div
                                className="h-6 bg-status-info-subtle rounded min-w-[4px]"
                                style={{
                                  width: `${Math.min(100, (item.planned_qty / maxQ) * 100)}%`,
                                  maxWidth: "33%",
                                }}
                                title={`BOM planned ${formatNum(item.planned_qty)}`}
                              />
                              <div
                                className="h-6 bg-brand-primary/70 rounded min-w-[4px]"
                                style={{
                                  width: `${Math.min(100, (item.actual_qty / maxQ) * 100)}%`,
                                  maxWidth: "33%",
                                }}
                                title={`Actual ${formatNum(item.actual_qty)}`}
                              />
                            </div>
                            <span
                              className={`text-sm font-mono w-16 text-right ${
                                item.variance_pct > 0
                                  ? "text-status-danger"
                                  : item.variance_pct < 0
                                    ? "text-status-success"
                                    : "text-text-secondary"
                              }`}
                            >
                              {item.variance_pct >= 0 ? "+" : ""}
                              {item.variance_pct.toFixed(1)}%
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-border bg-surface-raised shadow-sm overflow-hidden print:break-inside-avoid">
                <div className="p-4 flex flex-wrap gap-3 items-end print:hidden">
                  <div>
                    <label className="text-xs text-text-muted">Material</label>
                    <select
                      className="mt-1 rounded-lg border border-border-strong px-2 py-1.5 text-sm"
                      value={detailMatFilter}
                      onChange={(e) => setDetailMatFilter(e.target.value)}
                    >
                      <option value="">All</option>
                      {MATERIAL_TYPES.filter((m) => m.value).map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-text-muted">Search item</label>
                    <input
                      className="mt-1 rounded-lg border border-border-strong px-2 py-1.5 text-sm w-40"
                      value={detailItemSearch}
                      onChange={(e) => setDetailItemSearch(e.target.value)}
                      placeholder="Code or name"
                    />
                  </div>
                </div>
                <h2 className="text-sm font-semibold text-brand-primary px-4 pt-2 print:pt-4">
                  Material variance detail
                </h2>
                {data.items.length === 0 ? (
                  <div className="p-12 text-center text-text-muted">
                    <p className="font-medium">No BOM data for this order</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-[1400px] w-full text-sm">
                      <thead className="bg-surface-subtle border-b border-border">
                        <tr>
                          <th className="px-4 py-3 text-left sticky left-0 bg-surface-subtle z-[1]">
                            <button
                              type="button"
                              className="text-xs font-medium text-text-muted uppercase hover:underline"
                              onClick={() => toggleDetailSort("item_name")}
                            >
                              Material {detailSort.key === "item_name" ? (detailSort.dir === "asc" ? "↑" : "↓") : ""}
                            </button>
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">
                            Type
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">
                            Unit
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase" title="Per piece from quotation">
                            Q /u
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">BOM net /u</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Wast %</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Loss %</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Gross /u</th>
                          <th className="px-4 py-3 text-right">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-xs font-medium text-text-muted uppercase hover:underline"
                              onClick={() => toggleDetailSort("planned_qty")}
                              title="Planned = order_qty × BOM base_consumption × (1 + wastage%)"
                            >
                              Planned ⓘ
                              {detailSort.key === "planned_qty" ? (detailSort.dir === "asc" ? " ↑" : " ↓") : ""}
                            </button>
                          </th>
                          <th className="px-4 py-3 text-right">
                            <button
                              type="button"
                              className="text-xs font-medium text-text-muted uppercase hover:underline"
                              onClick={() => toggleDetailSort("actual_qty")}
                            >
                              Actual
                            </button>
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">
                            Variance
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Q↔B %</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">B↔A %</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Loss Δ</th>
                          <th className="px-4 py-3 text-right">
                            <button
                              type="button"
                              className="text-xs font-medium text-text-muted uppercase hover:underline"
                              onClick={() => toggleDetailSort("variance_pct")}
                            >
                              Var %
                            </button>
                          </th>
                          <th className="px-4 py-3 text-right">
                            <button
                              type="button"
                              className="text-xs font-medium text-text-muted uppercase hover:underline"
                              onClick={() => toggleDetailSort("cost_variance")}
                            >
                              Cost Δ
                              {detailSort.key === "cost_variance" ? (detailSort.dir === "asc" ? " ↑" : " ↓") : ""}
                            </button>
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Cost Q↔B</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Cost B↔A</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase">
                            Status
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase">
                            Mov.
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase w-28">
                            Usage
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDetailItems.map((r: ConsumptionReconciliationRow) => {
                          const exceedsTolerance = Math.abs(r.variance_pct) > tolerancePct;
                          const triLayerWarn =
                            (r.quoted_vs_bom_variance_pct != null && Math.abs(r.quoted_vs_bom_variance_pct) > tolerancePct) ||
                            (r.bom_vs_actual_variance_pct != null && Math.abs(r.bom_vs_actual_variance_pct) > tolerancePct);
                          const usagePct = r.planned_qty > 0 ? Math.min((r.actual_qty / r.planned_qty) * 100, 150) : 0;
                          return (
                            <tr
                              key={r.item_id}
                              className={`border-b border-border-subtle last:border-0 hover:bg-surface-subtle/50 ${
                                exceedsTolerance || triLayerWarn ? "bg-status-danger-subtle/50" : ""
                              }`}
                            >
                              <td className="px-4 py-3 font-medium text-brand-primary sticky left-0 bg-surface-raised">
                                {r.item_code} · {r.item_name}
                              </td>
                              <td className="px-4 py-3">
                                <span className="inline-flex rounded px-2 py-0.5 text-xs font-medium bg-surface-subtle text-text-secondary border border-border">
                                  {r.material_type}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-text-secondary">{r.uom ?? "—"}</td>
                              <td className="px-4 py-3 text-right font-mono text-xs text-text-secondary">
                                {r.quoted_consumption_per_unit != null ? r.quoted_consumption_per_unit.toFixed(4) : "—"}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-xs text-text-secondary">
                                {r.bom_net_consumption_per_unit != null ? r.bom_net_consumption_per_unit.toFixed(4) : "—"}
                              </td>
                              <td className="px-4 py-3 text-right text-xs">{r.wastage_pct ?? "—"}</td>
                              <td className="px-4 py-3 text-right text-xs">{r.process_loss_pct ?? "—"}</td>
                              <td className="px-4 py-3 text-right font-mono text-xs text-text-secondary">
                                {r.bom_gross_consumption_per_unit != null ? r.bom_gross_consumption_per_unit.toFixed(4) : "—"}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-text-secondary">
                                {formatNum(r.planned_qty)}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-text-secondary">
                                {formatNum(r.actual_qty)}
                              </td>
                              <td
                                className={`px-4 py-3 text-right font-mono ${
                                  r.variance > 0
                                    ? "text-status-danger"
                                    : r.variance < 0
                                      ? "text-status-success"
                                      : "text-text-secondary"
                                }`}
                              >
                                {r.variance > 0 ? "+" : ""}
                                {formatNum(r.variance)}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-xs">
                                {r.quoted_vs_bom_variance_pct != null ? `${r.quoted_vs_bom_variance_pct.toFixed(1)}%` : "—"}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-xs">
                                {r.bom_vs_actual_variance_pct != null ? `${r.bom_vs_actual_variance_pct.toFixed(1)}%` : "—"}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-xs">
                                {r.planned_loss_vs_actual_loss != null ? formatNum(r.planned_loss_vs_actual_loss) : "—"}
                              </td>
                              <td
                                className={`px-4 py-3 text-right font-mono font-semibold ${
                                  exceedsTolerance
                                    ? "text-status-danger"
                                    : Math.abs(r.variance_pct) <= 2
                                      ? "text-status-success"
                                      : "text-status-warning"
                                }`}
                              >
                                {r.variance_pct >= 0 ? "+" : ""}
                                {r.variance_pct.toFixed(1)}%
                              </td>
                              <td
                                className={`px-4 py-3 text-right font-mono text-xs ${
                                  (r.cost_variance ?? 0) > 0 ? "text-status-danger" : "text-status-success"
                                }`}
                              >
                                {r.cost_variance != null ? formatMoney(r.cost_variance) : "—"}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-xs">
                                {r.cost_impact_quoted_vs_bom != null ? formatMoney(r.cost_impact_quoted_vs_bom) : "—"}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-xs">
                                {r.cost_impact_bom_vs_actual != null ? formatMoney(r.cost_impact_bom_vs_actual) : "—"}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <VarianceBadge variancePct={r.variance_pct} tolerancePct={tolerancePct} />
                              </td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  type="button"
                                  className="text-xs font-mono underline text-brand-primary"
                                  onClick={() => openMovementDrawer(r.item_id)}
                                >
                                  {r.movement_count ?? 0}
                                </button>
                              </td>
                              <td className="px-4 py-3 w-28">
                                <div
                                  className="h-2 rounded-full bg-border-subtle overflow-hidden"
                                  role="progressbar"
                                  aria-valuenow={usagePct}
                                  aria-valuemin={0}
                                  aria-valuemax={150}
                                >
                                  <div
                                    className={`h-full rounded-full ${
                                      usagePct > 105
                                        ? "bg-status-danger"
                                        : usagePct >= 95
                                          ? "bg-status-success"
                                          : "bg-status-info"
                                    }`}
                                    style={{ width: `${usagePct}%` }}
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {data.items.length > 0 && (
                <div className="rounded-xl border border-border bg-surface-raised shadow-sm p-4 print:hidden">
                  <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
                    Tolerance bands (current: {tolerancePct}%)
                  </p>
                  <div className="flex flex-wrap gap-6 text-sm">
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-status-success-subtle text-status-success-foreground border border-status-success/30">
                        On target
                      </span>
                      <span className="text-text-secondary">≤2%</span>
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-status-warning-subtle text-status-warning-foreground border border-status-warning/30">
                        Minor variance
                      </span>
                      <span className="text-text-secondary">
                        2%–{tolerancePct}%
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-status-danger-subtle text-status-danger-foreground border border-status-danger/20">
                        Exceeds tolerance
                      </span>
                      <span className="text-text-secondary">&gt;{tolerancePct}%</span>
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {drawerItemId != null && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/30 sm:bg-black/30"
          onClick={closeDrawer}
        >
          <div
            className="h-full w-full max-w-full sm:max-w-md bg-surface-raised shadow-xl border-l border-border overflow-y-auto sm:translate-x-0 translate-x-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-border flex justify-between items-center">
              <h3 className="font-semibold text-brand-primary">Movement history</h3>
              <button
                type="button"
                className="text-sm text-text-muted hover:text-text-secondary"
                onClick={closeDrawer}
              >
                Close
              </button>
            </div>
            <div className="p-4">
              {drawerLoading && <p className="text-sm text-text-muted">Loading…</p>}
              {drawerError && <p className="text-sm text-status-danger-foreground">{drawerError}</p>}
              {movementData && !drawerLoading && (
                <>
                  <p className="text-sm font-medium">
                    {movementData.item_code} — {movementData.item_name}
                  </p>
                  <p className="text-xs text-text-muted mt-1">
                    Planned {formatNum(movementData.planned_qty)} · Issued {formatNum(movementData.total_issued)}
                  </p>
                  <table className="w-full text-sm mt-4">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-text-muted">
                        <th className="py-2">Date</th>
                        <th className="py-2 text-right">Qty</th>
                        <th className="py-2">Warehouse</th>
                        <th className="py-2">By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movementData.movements.map((m) => (
                        <tr key={m.movement_id} className="border-b border-border-subtle">
                          <td className="py-2 font-mono text-xs">{m.movement_date ?? "—"}</td>
                          <td className="py-2 text-right font-mono">{formatNum(m.quantity)}</td>
                          <td className="py-2">{m.warehouse_name ?? "—"}</td>
                          <td className="py-2">{m.issued_by ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {movementData.movements.length === 0 && (
                    <p className="text-sm text-text-muted mt-2">No movements recorded.</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
