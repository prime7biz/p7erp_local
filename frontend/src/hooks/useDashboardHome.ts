import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  api,
  type CustomerMapPoint,
  type DashboardAttentionSummary,
  type DashboardEmployeeSummary,
  type DashboardInsight,
  type DashboardKpi,
  type DashboardProductionPoint,
  type DashboardRecentOrder,
  type DashboardRevenueTrend,
  type DashboardTask,
  type MerchAlertsSummaryResponse,
  type OrderPromiseSummaryResponse,
  type OrderStatusSummary,
  type UnifiedTnaSummaryResponse,
} from "@/api/client";
import { chartColorAt } from "@/lib/chartColors";
import {
  STALE_DASHBOARD_ATTENTION,
  STALE_DASHBOARD_CUSTOMER_MAP,
  STALE_DASHBOARD_KPIS,
} from "@/lib/queryStaleTimes";
import { logApiError } from "@/utils/logApiError";

export type DashboardDateRange = {
  from: string;
  to: string;
};

export type DashboardOrderStatusCard = {
  status: string;
  label: string;
  count: number;
  color: string;
};

export type DashboardAttentionCard = {
  key: keyof DashboardAttentionSummary["links"];
  label: string;
  value: number;
  href: string;
};

type UseDashboardHomeOptions = {
  dateRange: DashboardDateRange;
};

const EMPTY_ATTENTION: DashboardAttentionSummary = {
  pending_approvals: 0,
  tna_open: 0,
  tna_overdue: 0,
  critical_alerts: 0,
  total_alerts: 0,
  promise_blocked: 0,
  commercial_pending: 0,
  links: {
    pending_approvals: "/app/approvals",
    tna_overdue: "/app/followup",
    critical_alerts: "/app/merchandising/alerts",
    promise_blocked: "/app/orders",
    commercial_pending: "/app/orders",
  },
};

const EMPTY_EMPLOYEE_SUMMARY: DashboardEmployeeSummary = {
  total: 0,
  breakdown: [],
  departments: [],
};

const EMPTY_UNIFIED_TNA: UnifiedTnaSummaryResponse = {
  total_count: 0,
  open_count: 0,
  overdue_count: 0,
  completed_count: 0,
  merch_count: 0,
  manufacturing_count: 0,
};

const EMPTY_MERCH_ALERTS: MerchAlertsSummaryResponse = {
  by_severity: {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    informational: 0,
  },
  total: 0,
  last_completed_scan_at: null,
};

const EMPTY_PROMISE: OrderPromiseSummaryResponse = {
  scanned_count: 0,
  blocked_count: 0,
  atp_fail_count: 0,
  ctp_fail_count: 0,
  items: [],
};

const EMPTY_REVENUE: DashboardRevenueTrend = { months: [], totalRevenue: 0 };

function toStatusLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Home dashboard data orchestration.
 * Uses Promise.allSettled so one failed endpoint does not blank the page.
 * Frequent endpoints go through TanStack Query cache (staleTime per resource).
 */
export function useDashboardHome({ dateRange }: UseDashboardHomeOptions) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [kpis, setKpis] = useState<DashboardKpi[]>([]);
  const [attention, setAttention] = useState<DashboardAttentionSummary | null>(null);
  const [orderStatus, setOrderStatus] = useState<OrderStatusSummary[]>([]);
  const [insights, setInsights] = useState<DashboardInsight[]>([]);
  const [productionTrends, setProductionTrends] = useState<DashboardProductionPoint[]>([]);
  const [recentOrders, setRecentOrders] = useState<DashboardRecentOrder[]>([]);
  const [tasks, setTasks] = useState<DashboardTask[]>([]);
  const [revenueTrend, setRevenueTrend] = useState<DashboardRevenueTrend>(EMPTY_REVENUE);
  const [customerMap, setCustomerMap] = useState<CustomerMapPoint[]>([]);
  const [employeeSummary, setEmployeeSummary] =
    useState<DashboardEmployeeSummary>(EMPTY_EMPLOYEE_SUMMARY);
  const [unifiedTnaSummary, setUnifiedTnaSummary] =
    useState<UnifiedTnaSummaryResponse>(EMPTY_UNIFIED_TNA);
  const [merchAlertsSummary, setMerchAlertsSummary] =
    useState<MerchAlertsSummaryResponse>(EMPTY_MERCH_ALERTS);
  const [promiseSummary, setPromiseSummary] = useState<OrderPromiseSummaryResponse>(EMPTY_PROMISE);
  const [commercialPendingCount, setCommercialPendingCount] = useState<number | null>(null);
  const [promiseRefreshing, setPromiseRefreshing] = useState(false);
  const [promiseLastUpdated, setPromiseLastUpdated] = useState<Date | null>(null);

  const refreshPromiseAndCommercial = useCallback((statuses = "NEW,IN_PROGRESS") => {
    setPromiseRefreshing(true);
    return Promise.allSettled([
      api.getOrderPromiseSummary({ statuses, limit: 25 }),
      api.getCommercialChangePendingSummary(),
    ])
      .then((results) => {
        if (results[0].status === "fulfilled") {
          setPromiseSummary(results[0].value);
          setPromiseLastUpdated(new Date());
        } else {
          logApiError("useDashboardHome.promiseSummary", results[0].reason);
        }
        if (results[1].status === "fulfilled") {
          setCommercialPendingCount(results[1].value.pending_approval_count);
        } else {
          setCommercialPendingCount(null);
          logApiError("useDashboardHome.commercialPending", results[1].reason);
        }
      })
      .finally(() => setPromiseRefreshing(false));
  }, []);

  const refresh = useCallback(
    (promiseStatuses = "NEW,IN_PROGRESS", options?: { bypassCache?: boolean }) => {
      setLoading(true);
      const rangeParams = { from_date: dateRange.from, to_date: dateRange.to };
      const insightsPromise = api.getDashboardInsights();
      const bypass = options?.bypassCache === true;

      return Promise.allSettled([
        queryClient.fetchQuery({
          queryKey: ["dashboard", "kpis"],
          queryFn: () => api.getDashboardKpis(),
          staleTime: bypass ? 0 : STALE_DASHBOARD_KPIS,
        }),
        queryClient.fetchQuery({
          queryKey: ["dashboard", "attention"],
          queryFn: () => api.getDashboardAttentionSummary(),
          staleTime: bypass ? 0 : STALE_DASHBOARD_ATTENTION,
        }),
        api.getDashboardOrderStatus(),
        api.getDashboardProductionTrends(rangeParams),
        api.getDashboardRecentOrders(),
        api.getDashboardTasks(),
        api.getDashboardRevenueTrend(rangeParams),
        queryClient.fetchQuery({
          queryKey: ["dashboard", "customerMap"],
          queryFn: () => api.getDashboardCustomerMap(),
          staleTime: bypass ? 0 : STALE_DASHBOARD_CUSTOMER_MAP,
        }),
        api.getDashboardEmployeeSummary(),
        api.getUnifiedTnaSummary(),
        api.getMerchAlertsSummary(),
        api.getOrderPromiseSummary({ statuses: promiseStatuses, limit: 25 }),
        api.getCommercialChangePendingSummary(),
      ])
        .then((results) => {
          const labels = [
            "kpis",
            "attention",
            "orderStatus",
            "productionTrends",
            "recentOrders",
            "tasks",
            "revenueTrend",
            "customerMap",
            "employeeSummary",
            "unifiedTna",
            "merchAlerts",
            "promise",
            "commercial",
          ] as const;

          results.forEach((r, i) => {
            if (r.status === "rejected") {
              logApiError(`useDashboardHome.${labels[i] ?? `slot-${i}`}`, r.reason);
            }
          });

          if (results[0].status === "fulfilled") setKpis(results[0].value);
          if (results[1].status === "fulfilled") setAttention(results[1].value);
          else setAttention(EMPTY_ATTENTION);
          if (results[2].status === "fulfilled") setOrderStatus(results[2].value);
          if (results[3].status === "fulfilled") setProductionTrends(results[3].value);
          if (results[4].status === "fulfilled") setRecentOrders(results[4].value);
          if (results[5].status === "fulfilled") setTasks(results[5].value);
          if (results[6].status === "fulfilled") setRevenueTrend(results[6].value);
          if (results[7].status === "fulfilled") setCustomerMap(results[7].value);
          if (results[8].status === "fulfilled") setEmployeeSummary(results[8].value);
          if (results[9].status === "fulfilled") setUnifiedTnaSummary(results[9].value);
          if (results[10].status === "fulfilled") setMerchAlertsSummary(results[10].value);
          if (results[11].status === "fulfilled") {
            setPromiseSummary(results[11].value);
            setPromiseLastUpdated(new Date());
          }
          if (results[12].status === "fulfilled") {
            setCommercialPendingCount(results[12].value.pending_approval_count);
          } else {
            setCommercialPendingCount(null);
          }

          setLastUpdated(new Date());
        })
        .then(() => {
          void insightsPromise
            .then((rows) => setInsights(rows))
            .catch((reason: unknown) => logApiError("useDashboardHome.insights", reason));
        })
        .finally(() => setLoading(false));
    },
    [dateRange.from, dateRange.to, queryClient],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Stable KPI lookup so consumers do not re-scan the array each render. */
  const kpiById = useMemo(() => {
    const map: Record<string, DashboardKpi> = {};
    for (const kpi of kpis) {
      map[kpi.id] = kpi;
    }
    return map;
  }, [kpis]);

  /** Order-status donut/list cards with token colors. */
  const orderStatusCards = useMemo<DashboardOrderStatusCard[]>(
    () =>
      orderStatus.map((row, i) => ({
        status: row.status,
        label: toStatusLabel(row.status),
        count: row.count,
        color: chartColorAt(i),
      })),
    [orderStatus],
  );

  /** Attention strip cards (href + value) memoized for stable identity. */
  const attentionCards = useMemo<DashboardAttentionCard[]>(() => {
    const summary = attention ?? EMPTY_ATTENTION;
    return [
      {
        key: "pending_approvals",
        label: "Pending approvals",
        value: summary.pending_approvals,
        href: summary.links.pending_approvals,
      },
      {
        key: "tna_overdue",
        label: "TNA overdue",
        value: summary.tna_overdue,
        href: summary.links.tna_overdue,
      },
      {
        key: "critical_alerts",
        label: "Critical alerts",
        value: summary.critical_alerts,
        href: summary.links.critical_alerts,
      },
      {
        key: "promise_blocked",
        label: "Promise blocked",
        value: summary.promise_blocked,
        href: summary.links.promise_blocked,
      },
      {
        key: "commercial_pending",
        label: "Commercial pending",
        value: summary.commercial_pending,
        href: summary.links.commercial_pending,
      },
    ];
  }, [attention]);

  return {
    loading,
    lastUpdated,
    refresh,
    refreshPromiseAndCommercial,
    kpis,
    kpiById,
    setKpis,
    attention,
    attentionCards,
    setAttention,
    orderStatus,
    orderStatusCards,
    setOrderStatus,
    insights,
    setInsights,
    productionTrends,
    setProductionTrends,
    recentOrders,
    setRecentOrders,
    tasks,
    setTasks,
    revenueTrend,
    setRevenueTrend,
    customerMap,
    setCustomerMap,
    employeeSummary,
    setEmployeeSummary,
    unifiedTnaSummary,
    setUnifiedTnaSummary,
    merchAlertsSummary,
    setMerchAlertsSummary,
    promiseSummary,
    setPromiseSummary,
    commercialPendingCount,
    setCommercialPendingCount,
    promiseRefreshing,
    promiseLastUpdated,
  };
}
