import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  api,
  type DashboardEmployeeSummary,
  type DashboardInsight,
  type DashboardKpi,
  type DashboardProductionPoint,
  type DashboardRecentOrder,
  type DashboardRevenueTrend,
  type DashboardTask,
  type OrderPromiseSummaryResponse,
  type OrderStatusSummary,
  type UnifiedTnaSummaryResponse,
  type MerchAlertsSummaryResponse,
} from "@/api/client";
import {
  AlertTriangle,
  BarChart3,
  Briefcase,
  CheckCircle2,
  DollarSign,
  ArrowRight,
  ClipboardList,
  Clock3,
  CheckSquare,
  Package,
  PlusCircle,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  Truck,
  Users,
  Settings,
} from "lucide-react";
import { GlobalCustomerMapCard } from "@/components/dashboard/GlobalCustomerMapCard";

const bdt = new Intl.NumberFormat("en-BD");
const PIE_COLORS = ["#3B82F6", "#F97316", "#10B981", "#8B5CF6", "#F59E0B", "#EF4444", "#06B6D4"];

function formatDateTime(date: Date) {
  const d = date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const t = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  return `${d} · ${t}`;
}

function toStatusLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getTimeBasedGreeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function minutesAgo(from: Date | null, now: Date): string {
  if (!from) return "—";
  const diffMs = now.getTime() - from.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins === 1) return "1 min ago";
  return `${diffMins} min ago`;
}

function SimpleDonut({
  segments,
  total,
  centerLabel,
}: {
  segments: { label: string; value: number; color: string }[];
  total: number;
  centerLabel: string;
}) {
  if (total <= 0) {
    return (
      <div className="w-[120px] h-[120px] rounded-full border border-border flex items-center justify-center text-xs text-text-muted">
        No data
      </div>
    );
  }
  let acc = 0;
  const gradient = segments
    .map((s) => {
      const from = (acc / total) * 100;
      acc += s.value;
      const to = (acc / total) * 100;
      return `${s.color} ${from}% ${to}%`;
    })
    .join(", ");

  return (
    <div
      className="relative w-[120px] h-[120px] rounded-full"
      style={{ background: `conic-gradient(${gradient})` }}
    >
      <div className="absolute inset-[18px] rounded-full bg-surface-raised border border-border-subtle flex flex-col items-center justify-center">
        <p className="text-lg font-bold text-text-primary">{total}</p>
        <p className="text-[10px] text-text-muted">{centerLabel}</p>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { me } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [kpis, setKpis] = useState<DashboardKpi[]>([]);
  const [orderStatus, setOrderStatus] = useState<OrderStatusSummary[]>([]);
  const [insights, setInsights] = useState<DashboardInsight[]>([]);
  const [productionTrends, setProductionTrends] = useState<DashboardProductionPoint[]>([]);
  const [recentOrders, setRecentOrders] = useState<DashboardRecentOrder[]>([]);
  const [tasks, setTasks] = useState<DashboardTask[]>([]);
  const [revenueTrend, setRevenueTrend] = useState<DashboardRevenueTrend>({ months: [], totalRevenue: 0 });
  const [customerMap, setCustomerMap] = useState<{ country: string; count: number }[]>([]);
  const [stylesCount, setStylesCount] = useState(0);
  const [employeeSummary, setEmployeeSummary] = useState<DashboardEmployeeSummary>({
    total: 0,
    breakdown: [],
    departments: [],
  });
  const [unifiedTnaSummary, setUnifiedTnaSummary] = useState<UnifiedTnaSummaryResponse>({
    total_count: 0,
    open_count: 0,
    overdue_count: 0,
    completed_count: 0,
    merch_count: 0,
    manufacturing_count: 0,
  });
  const [merchAlertsSummary, setMerchAlertsSummary] = useState<MerchAlertsSummaryResponse>({
    by_severity: {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      informational: 0,
    },
    total: 0,
  });
  const [promiseSummary, setPromiseSummary] = useState<OrderPromiseSummaryResponse>({
    scanned_count: 0,
    blocked_count: 0,
    atp_fail_count: 0,
    ctp_fail_count: 0,
    items: [],
  });
  const [promiseStatusesFilter, setPromiseStatusesFilter] = useState<"NEW,IN_PROGRESS" | "NEW" | "IN_PROGRESS">("NEW,IN_PROGRESS");
  const [promiseRiskTypeFilter, setPromiseRiskTypeFilter] = useState<"ALL" | "ATP" | "CTP">("ALL");
  const [promiseRefreshing, setPromiseRefreshing] = useState(false);
  const [promiseLastUpdated, setPromiseLastUpdated] = useState<Date | null>(null);
  const [promiseCopyStatus, setPromiseCopyStatus] = useState<"" | "copied" | "failed">("");

  const fetchPromiseSummary = useCallback(() => {
    setPromiseRefreshing(true);
    api
      .getOrderPromiseSummary({ statuses: promiseStatusesFilter, limit: 25 })
      .then((value) => {
        setPromiseSummary(value);
        setPromiseLastUpdated(new Date());
      })
      .finally(() => setPromiseRefreshing(false));
  }, [promiseStatusesFilter]);

  const fetchDashboardData = () => {
    Promise.allSettled([
      api.getDashboardKpis(),
      api.getDashboardOrderStatus(),
      api.getDashboardInsights(),
      api.getDashboardProductionTrends(),
      api.getDashboardRecentOrders(),
      api.getDashboardTasks(),
      api.getDashboardRevenueTrend(),
      api.getDashboardCustomerMap(),
      api.listStyles(),
      api.getDashboardEmployeeSummary(),
      api.getUnifiedTnaSummary(),
      api.getMerchAlertsSummary(),
    ]).then((results) => {
      if (results[0].status === "fulfilled") setKpis(results[0].value);
      if (results[1].status === "fulfilled") setOrderStatus(results[1].value);
      if (results[2].status === "fulfilled") setInsights(results[2].value);
      if (results[3].status === "fulfilled") setProductionTrends(results[3].value);
      if (results[4].status === "fulfilled") setRecentOrders(results[4].value);
      if (results[5].status === "fulfilled") setTasks(results[5].value);
      if (results[6].status === "fulfilled") setRevenueTrend(results[6].value);
      if (results[7].status === "fulfilled") setCustomerMap(results[7].value);
      if (results[8].status === "fulfilled") setStylesCount(results[8].value.length);
      if (results[9].status === "fulfilled") setEmployeeSummary(results[9].value);
      if (results[10].status === "fulfilled") setUnifiedTnaSummary(results[10].value);
      if (results[11].status === "fulfilled") setMerchAlertsSummary(results[11].value);
      setLoading(false);
      setLastUpdated(new Date());
    });
  };

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    fetchPromiseSummary();
  }, [fetchPromiseSummary]);

  const maxTrendOutput = useMemo(
    () => Math.max(...productionTrends.map((row) => row.output), 1),
    [productionTrends],
  );
  const maxRevenue = useMemo(
    () => Math.max(...revenueTrend.months.map((row) => row.revenue), 1),
    [revenueTrend],
  );
  const orderPieData = useMemo(
    () =>
      orderStatus.map((s, i) => ({
        label: toStatusLabel(s.status),
        value: s.count,
        color: PIE_COLORS[i % PIE_COLORS.length] ?? "#3B82F6",
      })),
    [orderStatus],
  );
  const totalOrdersInPie = useMemo(
    () => orderPieData.reduce((sum, row) => sum + row.value, 0),
    [orderPieData],
  );
  const employeePieData = useMemo(() => {
    const source = employeeSummary.departments.length > 0 ? employeeSummary.departments : employeeSummary.breakdown;
    return source.map((row, i) => ({
      label: row.status,
      value: row.count,
      color: PIE_COLORS[i % PIE_COLORS.length] ?? "#3B82F6",
    }));
  }, [employeeSummary]);

  const riskyPromiseOrders = useMemo(() => {
    const blocked = promiseSummary.items.filter((item) => !(item.atp_ok && item.ctp_ok));
    const byType =
      promiseRiskTypeFilter === "ATP"
        ? blocked.filter((item) => !item.atp_ok)
        : promiseRiskTypeFilter === "CTP"
          ? blocked.filter((item) => !item.ctp_ok)
          : blocked;
    return byType.slice(0, 5);
  }, [promiseSummary, promiseRiskTypeFilter]);

  const promiseMinutesAgo = useMemo(() => {
    if (!promiseLastUpdated) return "not loaded";
    const diffMs = currentTime.getTime() - promiseLastUpdated.getTime();
    const diffMins = Math.max(0, Math.floor(diffMs / 60_000));
    if (diffMins < 1) return "just now";
    if (diffMins === 1) return "1 min ago";
    return `${diffMins} mins ago`;
  }, [currentTime, promiseLastUpdated]);

  if (!me) return null;

  const firstName = me.first_name || me.username || "User";
  const greeting = getTimeBasedGreeting(currentTime.getHours());

  const kpiById = (id: string) => kpis.find((k) => k.id === id)?.value ?? 0;
  const customerCount = kpiById("total-customers");

  const kpiCards = [
    {
      label: "Active Orders",
      value: kpiById("active-orders"),
      icon: ShoppingCart,
      borderColor: "border-l-status-info",
      iconBg: "bg-status-info-subtle",
      iconColor: "text-status-info-foreground",
      href: "/app/orders",
      format: (v: number) => bdt.format(v),
    },
    {
      label: "Monthly Revenue",
      value: kpiById("monthly-revenue"),
      icon: DollarSign,
      borderColor: "border-l-status-success",
      iconBg: "bg-status-success-subtle",
      iconColor: "text-status-success-foreground",
      href: "/app/reports/tenant-overview",
      format: (v: number) => (v > 0 ? `৳${bdt.format(v)}` : "—"),
    },
    {
      label: "Pending Approvals",
      value: kpiById("pending-approvals"),
      icon: CheckSquare,
      borderColor: "border-l-status-warning",
      iconBg: "bg-status-warning-subtle",
      iconColor: "text-status-warning-foreground",
      href: "/app/approvals",
      format: (v: number) => bdt.format(v),
    },
    {
      label: "Inventory Items",
      value: 0,
      icon: Package,
      borderColor: "border-l-status-info",
      iconBg: "bg-status-neutral-subtle",
      iconColor: "text-status-neutral-foreground",
      href: "/app/items",
      format: (v: number) => (v === 0 ? "—" : bdt.format(v)),
      comingSoon: true,
    },
  ];

  const secondaryStats = [
    { label: "Total Customers", value: customerCount ?? 0, dotColor: "bg-status-info" },
    { label: "Total Styles", value: stylesCount, dotColor: "bg-brand-primary" },
    { label: "Open Follow-ups", value: tasks.length, dotColor: "bg-status-success" },
    {
      label: "Critical Alerts",
      value: tasks.filter((task) => (task.severity || "").toUpperCase() === "CRITICAL").length,
      dotColor: "bg-status-danger",
    },
  ];
  const merchWorkflowStats = [
    {
      label: "Unified TNA Open",
      value: unifiedTnaSummary.open_count,
      href: "/app/followup",
      tone: "text-status-info-foreground",
      bg: "bg-status-info-subtle border-status-info/20",
    },
    {
      label: "Unified TNA Overdue",
      value: unifiedTnaSummary.overdue_count,
      href: "/app/followup",
      tone: unifiedTnaSummary.overdue_count > 0 ? "text-status-warning-foreground" : "text-text-primary",
      bg: unifiedTnaSummary.overdue_count > 0 ? "bg-status-warning-subtle border-status-warning/20" : "bg-surface-subtle border-border",
    },
    {
      label: "Critical Alerts",
      value: merchAlertsSummary.by_severity.critical,
      href: "/app/merchandising/alerts",
      tone: merchAlertsSummary.by_severity.critical > 0 ? "text-status-danger-foreground" : "text-text-primary",
      bg: merchAlertsSummary.by_severity.critical > 0 ? "bg-status-danger-subtle border-status-danger/20" : "bg-surface-subtle border-border",
    },
    {
      label: "Total Alerts",
      value: merchAlertsSummary.total,
      href: "/app/merchandising/alerts",
      tone: "text-text-primary",
      bg: "bg-surface-subtle border-border",
    },
    {
      label: "Promise Risks",
      value: promiseSummary.blocked_count,
      href: "/app/orders",
      tone: promiseSummary.blocked_count > 0 ? "text-status-danger-foreground" : "text-text-primary",
      bg: promiseSummary.blocked_count > 0 ? "bg-status-danger-subtle border-status-danger/20" : "bg-surface-subtle border-border",
    },
  ];

  const copyPromiseSummary = async () => {
    const lines = [
      `Promise Risk Summary`,
      `Status scope: ${promiseStatusesFilter}`,
      `Risk type: ${promiseRiskTypeFilter}`,
      `Scanned: ${promiseSummary.scanned_count}`,
      `Blocked: ${promiseSummary.blocked_count}`,
      `ATP fail: ${promiseSummary.atp_fail_count}`,
      `CTP fail: ${promiseSummary.ctp_fail_count}`,
      `Top risks:`,
      ...(riskyPromiseOrders.length > 0
        ? riskyPromiseOrders.map(
            (item, idx) =>
              `${idx + 1}. ${item.order_code} [${item.status}] - ${
                item.reasons.length > 0 ? item.reasons.join(" | ") : "ATP/CTP risk detected"
              }`,
          )
        : ["No matching risks in current filter scope."]),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setPromiseCopyStatus("copied");
      window.setTimeout(() => setPromiseCopyStatus(""), 2000);
    } catch {
      setPromiseCopyStatus("failed");
      window.setTimeout(() => setPromiseCopyStatus(""), 2500);
    }
  };

  const quickActions = [
    { label: "Customers", href: "/app/customers", icon: Users },
    { label: "New Inquiry", href: "/app/inquiries/new", icon: PlusCircle },
    { label: "New Quotation", href: "/app/quotations/new", icon: ShoppingCart },
    { label: "Follow-up & Unified TNA", href: "/app/followup", icon: Truck },
    { label: "BOM Governance", href: "/app/bom", icon: ClipboardList },
    { label: "Critical Alerts", href: "/app/merchandising/alerts", icon: AlertTriangle },
    { label: "Settings", href: "/app/settings/users", icon: Settings },
  ];

  if (loading) {
    return (
      <div className="flex flex-col" data-page="dashboard-v2">
        <main className="bg-surface-raised rounded-xl border border-border shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-2">
                <div className="h-8 w-48 bg-surface-subtle rounded animate-pulse" />
                <div className="h-4 w-64 bg-surface-subtle rounded animate-pulse" />
              </div>
              <div className="h-16 w-40 bg-surface-subtle rounded-lg animate-pulse shrink-0" />
            </div>
            <section>
              <div className="h-4 w-24 bg-surface-subtle rounded mb-2.5 animate-pulse" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="rounded-xl border border-border bg-surface-raised p-5 animate-pulse">
                    <div className="flex items-start justify-between mb-3">
                      <div className="h-9 w-9 rounded-xl bg-surface-subtle" />
                      <div className="h-3 w-8 bg-surface-subtle rounded" />
                    </div>
                    <div className="h-9 w-20 bg-surface-subtle rounded mb-2" />
                    <div className="h-4 w-24 bg-surface-subtle rounded" />
                  </div>
                ))}
              </div>
            </section>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col" data-page="dashboard-v2">
      <main className="bg-surface-raised rounded-xl border border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Welcome header with prominent tenant block */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-text-primary">
                {greeting}, {firstName}
              </h1>
              <p className="text-sm text-text-secondary mt-0.5">{formatDateTime(currentTime)}</p>
              <p className="text-xs text-text-muted mt-1">
                Last updated: {minutesAgo(lastUpdated, currentTime)}
                <button
                  type="button"
                  onClick={() => {
                    setLoading(true);
                    fetchDashboardData();
                    fetchPromiseSummary();
                  }}
                  className="ml-2 inline-flex items-center gap-1 text-text-muted hover:text-brand-primary transition-colors"
                  title="Refresh dashboard"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh
                </button>
              </p>
            </div>
            <div className="w-full sm:w-auto rounded-lg bg-brand-primary/5 border border-brand-primary/15 px-4 py-3 text-center sm:text-right shrink-0">
              <p className="text-lg font-semibold text-text-primary">{me.tenant_name}</p>
              <p className="text-sm text-text-secondary mt-0.5">Company code: {me.company_code ?? "—"}</p>
            </div>
          </div>

          {/* Key Metrics – 4 KPI cards with left border and icon */}
          <section>
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-[0.12em] mb-2.5">
              Key Metrics
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {kpiCards.map((card) => {
                const Icon = card.icon;
                return (
                  <div
                    key={card.label}
                    className={`rounded-xl border border-border bg-surface-raised shadow-sm border-l-[3px] ${card.borderColor} hover:shadow-md transition-shadow overflow-hidden`}
                  >
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className={`p-2.5 rounded-xl ${card.iconBg}`}>
                          <Icon className={`h-5 w-5 ${card.iconColor}`} />
                        </div>
                        <Link
                          to={card.href}
                          className="text-[11px] font-semibold text-brand-primary hover:text-brand-primary/90 hover:underline underline-offset-2 flex items-center gap-0.5"
                        >
                          View <ArrowRight className="h-3 w-3" />
                        </Link>
                      </div>
                      <p className="text-3xl font-bold text-text-primary">
                        {card.format(card.value)}
                      </p>
                      <p className="text-xs text-text-secondary mt-1">
                        {card.label}
                        {"comingSoon" in card && card.comingSoon && (
                          <span className="block text-[10px] text-text-muted mt-0.5">Coming soon</span>
                        )}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Secondary stats – 4 compact cards with dot */}
          <section>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {secondaryStats.map((stat) => {
                const isCriticalAlerts = stat.label === "Critical Alerts" && (stat.value ?? 0) > 0;
                return (
                  <div
                    key={stat.label}
                    className={`rounded-xl border border-border bg-surface-raised shadow-sm p-4 flex items-center gap-3 ${isCriticalAlerts ? "border-l-4 border-l-status-danger bg-status-danger-subtle" : ""}`}
                  >
                    {isCriticalAlerts ? (
                      <AlertTriangle className="h-5 w-5 text-status-danger shrink-0" />
                    ) : (
                      <div
                        className={`w-2.5 h-2.5 rounded-full ${stat.dotColor} shrink-0`}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xl font-bold text-text-primary">
                        {stat.value !== null && stat.value !== undefined
                          ? bdt.format(stat.value)
                          : "—"}
                      </p>
                      <p className="text-xs text-text-secondary truncate">{stat.label}</p>
                      {isCriticalAlerts && (
                        <Link
                          to="/app/followup"
                          className="text-[11px] font-semibold text-status-danger hover:text-status-danger/90 hover:underline underline-offset-2 flex items-center gap-0.5 mt-1"
                        >
                          View <ArrowRight className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-[0.12em] mb-2.5">
              Merch Workflow Health
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {merchWorkflowStats.map((stat) => (
                <Link
                  key={stat.label}
                  to={stat.href}
                  className={`rounded-xl border p-4 shadow-sm transition-colors hover:bg-surface-raised ${stat.bg}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium text-text-secondary">{stat.label}</p>
                    <ArrowRight className="h-3.5 w-3.5 text-text-muted" />
                  </div>
                  <p className={`mt-2 text-2xl font-bold ${stat.tone}`}>{bdt.format(stat.value)}</p>
                </Link>
              ))}
            </div>
            <div className="mt-3 rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-text-primary">Top Promise Risks</h3>
                <div className="flex items-center gap-2">
                  <div className="inline-flex rounded-lg border border-border bg-surface-subtle p-0.5">
                    {[
                      { label: "Both", value: "NEW,IN_PROGRESS" as const },
                      { label: "NEW", value: "NEW" as const },
                      { label: "IN_PROGRESS", value: "IN_PROGRESS" as const },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setPromiseStatusesFilter(opt.value)}
                        disabled={promiseRefreshing}
                        className={`rounded-md px-2 py-1 text-[10px] font-semibold transition-colors ${
                          promiseStatusesFilter === opt.value
                            ? opt.value === "NEW"
                              ? "bg-status-info-subtle text-status-info-foreground shadow-sm"
                              : opt.value === "IN_PROGRESS"
                                ? "bg-status-info-subtle text-status-info-foreground shadow-sm"
                                : "bg-status-success-subtle text-status-success-foreground shadow-sm"
                            : "text-text-secondary hover:text-text-primary"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <Link
                    to="/app/orders"
                    className="text-[11px] font-semibold text-brand-primary hover:text-brand-primary/90 hover:underline underline-offset-2 flex items-center gap-0.5"
                  >
                    View orders <ArrowRight className="h-3 w-3" />
                  </Link>
                  <button
                    type="button"
                    onClick={copyPromiseSummary}
                    className="rounded-md border border-border bg-surface-raised px-2 py-1 text-[10px] font-semibold text-text-secondary hover:bg-surface-subtle"
                  >
                    Copy risk summary
                  </button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                <span className="rounded-full border border-border bg-surface-subtle px-2 py-0.5 text-text-secondary">
                  Scanned: {bdt.format(promiseSummary.scanned_count)}
                </span>
                <span className="rounded-full border border-status-danger/20 bg-status-danger-subtle px-2 py-0.5 text-status-danger-foreground">
                  Blocked: {bdt.format(promiseSummary.blocked_count)}
                </span>
                <span className="rounded-full border border-status-warning/20 bg-status-warning-subtle px-2 py-0.5 text-status-warning-foreground">
                  ATP fail: {bdt.format(promiseSummary.atp_fail_count)}
                </span>
                <span className="rounded-full border border-brand-primary/20 bg-brand-primary/5 px-2 py-0.5 text-brand-primary">
                  CTP fail: {bdt.format(promiseSummary.ctp_fail_count)}
                </span>
                {promiseRefreshing && <span className="text-text-muted">Updating...</span>}
                {!promiseRefreshing && <span className="text-text-muted">Updated {promiseMinutesAgo}</span>}
                {promiseCopyStatus === "copied" && <span className="text-status-success-foreground">Copied</span>}
                {promiseCopyStatus === "failed" && <span className="text-status-danger-foreground">Copy failed</span>}
              </div>
              <div className="mt-2 inline-flex rounded-lg border border-border bg-surface-subtle p-0.5">
                {[
                  { label: "All Risks", value: "ALL" as const, activeClass: "bg-status-danger-subtle text-status-danger-foreground" },
                  { label: "ATP Fail", value: "ATP" as const, activeClass: "bg-status-warning-subtle text-status-warning-foreground" },
                  { label: "CTP Fail", value: "CTP" as const, activeClass: "bg-brand-primary/10 text-brand-primary" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPromiseRiskTypeFilter(opt.value)}
                    className={`rounded-md px-2 py-1 text-[10px] font-semibold transition-colors ${
                      promiseRiskTypeFilter === opt.value
                        ? `${opt.activeClass} shadow-sm`
                        : "text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {riskyPromiseOrders.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {riskyPromiseOrders.map((item) => (
                    <Link
                      key={item.order_id}
                      to={`/app/orders/${item.order_id}`}
                      className="block rounded-lg border border-status-danger/20 bg-status-danger-subtle px-3 py-2 hover:bg-status-danger-subtle/80"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-status-danger-foreground">{item.order_code}</p>
                        <span className="rounded-full border border-border bg-surface-raised px-2 py-0.5 text-[10px] font-medium text-text-secondary">
                          {toStatusLabel(item.status)}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-status-danger-foreground line-clamp-2">
                        {item.reasons.length > 0 ? item.reasons.join(" | ") : "ATP/CTP risk detected."}
                      </p>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-text-muted">
                  {promiseRiskTypeFilter === "ALL"
                    ? "No blocked promise risks in scanned open orders."
                    : promiseRiskTypeFilter === "ATP"
                      ? "No ATP failures found in scanned open orders."
                      : "No CTP failures found in scanned open orders."}
                </p>
              )}
            </div>
          </section>

          {/* Summary Cards */}
          <section>
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-[0.12em] mb-2.5">
              Summary Cards
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-border bg-surface-raised shadow-sm overflow-hidden">
                <div className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-text-primary">Order Pipeline</h3>
                    <span className="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-[11px] font-semibold text-text-secondary">
                      {totalOrdersInPie} Total
                    </span>
                  </div>
                  {orderPieData.length > 0 ? (
                    <div className="flex items-center gap-4">
                      <SimpleDonut segments={orderPieData} total={totalOrdersInPie} centerLabel="Orders" />
                      <div className="flex-1 space-y-1.5">
                        {orderPieData.slice(0, 4).map((entry) => (
                          <div key={entry.label} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                              <span className="text-text-secondary truncate">{entry.label}</span>
                            </div>
                            <span className="font-semibold text-text-primary">{entry.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="h-[120px] flex flex-col items-center justify-center gap-2 text-xs text-text-muted">
                      <p>No orders yet</p>
                      <Link
                        to="/app/orders"
                        className="text-brand-primary hover:bg-brand-primary/5 font-medium hover:underline underline-offset-2"
                      >
                        Create first order
                      </Link>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-surface-raised shadow-sm overflow-hidden">
                <div className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-text-primary">Employee Summary</h3>
                    <span className="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-[11px] font-semibold text-text-secondary">
                      {employeeSummary.total} Staff
                    </span>
                  </div>
                  {employeePieData.length > 0 ? (
                    <div className="flex items-center gap-4">
                      <SimpleDonut segments={employeePieData} total={employeeSummary.total} centerLabel="Total" />
                      <div className="flex-1 space-y-1.5">
                        {employeePieData.slice(0, 5).map((entry) => (
                          <div key={entry.label} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                              <span className="text-text-secondary truncate">{entry.label}</span>
                            </div>
                            <span className="font-semibold text-text-primary">{entry.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="h-[120px] flex flex-col items-center justify-center gap-2 text-xs text-text-muted">
                      <Users className="h-10 w-10 text-text-muted" />
                      <p>No employee data yet</p>
                      <Link
                        to="/app/settings/users"
                        className="text-brand-primary hover:bg-brand-primary/5 font-medium hover:underline underline-offset-2"
                      >
                        Manage users
                      </Link>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-surface-raised shadow-sm overflow-hidden">
                <div className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-text-primary">Revenue Trend</h3>
                    <span className="text-xs font-semibold text-status-success-foreground">
                      {revenueTrend.totalRevenue > 0 ? `৳${bdt.format(Math.round(revenueTrend.totalRevenue))}` : "—"}
                    </span>
                  </div>
                  {revenueTrend.months.length > 0 ? (
                    <div className="space-y-2">
                      {revenueTrend.months.slice(-4).map((m) => (
                        <div key={m.month} className="text-xs">
                          <div className="flex justify-between text-text-secondary mb-1">
                            <span>{m.month}</span>
                            <span>৳{bdt.format(Math.round(m.revenue))}</span>
                          </div>
                          <div className="h-2 rounded bg-surface-subtle overflow-hidden">
                            <div
                              className="h-full rounded bg-brand-primary"
                              style={{ width: `${Math.max((m.revenue / maxRevenue) * 100, 8)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="h-[120px] flex flex-col items-center justify-center gap-2 text-xs text-text-muted">
                      <DollarSign className="h-10 w-10 text-text-muted" />
                      <p>No revenue data yet</p>
                      <Link
                        to="/app/reports/tenant-overview"
                        className="text-brand-primary hover:bg-brand-primary/5 font-medium hover:underline underline-offset-2"
                      >
                        View reports
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Charts + analytics like PrimeX */}
          <section>
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-[0.12em] mb-2.5">
              Charts &amp; Analytics
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 rounded-xl border border-border bg-surface-raised shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 className="h-4 w-4 text-status-info-foreground" />
                  <h3 className="text-sm font-semibold text-text-primary">Revenue &amp; Production Trend</h3>
                </div>
                {productionTrends.length > 0 ? (
                  <div className="space-y-3">
                    {productionTrends.map((trend) => (
                      <div key={trend.date}>
                        <div className="flex items-center justify-between text-xs text-text-secondary mb-1.5">
                          <span>{trend.date}</span>
                          <span>Efficiency {trend.efficiency}%</span>
                        </div>
                        <div className="space-y-1">
                          <div className="h-1.5 rounded bg-surface-subtle overflow-hidden">
                            <div
                              className="h-full rounded bg-status-info"
                              style={{ width: `${Math.max((trend.output / maxTrendOutput) * 100, 8)}%` }}
                            />
                          </div>
                          <div className="h-1.5 rounded bg-surface-subtle overflow-hidden">
                            <div
                              className="h-full rounded bg-status-success"
                              style={{ width: `${Math.max((trend.target / Math.max(maxTrendOutput, 1)) * 100, 8)}%` }}
                            />
                          </div>
                        </div>
                        <div className="mt-1 text-[11px] text-text-secondary">
                          Output {trend.output} · Target {trend.target}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-text-muted">No trend data yet.</p>
                )}
              </div>
              <div className="rounded-xl border border-border bg-surface-raised shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <ClipboardList className="h-4 w-4 text-status-info-foreground" />
                  <h3 className="text-sm font-semibold text-text-primary">Order Status</h3>
                </div>
                {orderPieData.length > 0 ? (
                  <div>
                    <div className="flex justify-center mb-3">
                      <SimpleDonut segments={orderPieData} total={totalOrdersInPie} centerLabel="Orders" />
                    </div>
                    <div className="space-y-1.5">
                      {orderPieData.map((status) => (
                        <div key={status.label} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: status.color }} />
                            <span className="text-text-secondary truncate">{status.label}</span>
                          </div>
                          <span className="text-text-primary font-semibold">{status.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-text-muted">No order status data yet.</p>
                )}
              </div>
            </div>
          </section>

          <section>
            <GlobalCustomerMapCard points={customerMap} />
          </section>

          {/* Quick Actions – horizontal scroll */}
          <section>
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-[0.12em] mb-2.5">
              Quick Actions
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {quickActions.map((qa) => {
                const Icon = qa.icon;
                return (
                  <Link key={qa.label} to={qa.href}>
                    <button
                      type="button"
                      className="flex items-center gap-2 whitespace-nowrap shrink-0 px-4 py-2 rounded-lg border border-border bg-surface-raised text-sm font-semibold text-text-secondary hover:border-brand-primary/30 hover:bg-brand-primary/5 hover:text-brand-primary transition-all"
                    >
                      <Icon className="h-4 w-4" />
                      {qa.label}
                    </button>
                  </Link>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-[0.12em] mb-2.5">
              Intelligence
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 rounded-xl border border-border bg-surface-raised shadow-sm p-5">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-text-secondary" />
                    <h3 className="text-sm font-semibold text-text-primary">Recent Orders</h3>
                  </div>
                  <Link
                    to="/app/orders"
                    className="text-[11px] font-semibold text-brand-primary hover:text-brand-primary/90 hover:underline underline-offset-2 flex items-center gap-0.5"
                  >
                    View all <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
                {recentOrders.length > 0 ? (
                  <div className="space-y-2">
                    {recentOrders.slice(0, 6).map((order) => (
                      <div
                        key={order.id}
                        className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-text-primary truncate">{order.customer_name}</p>
                          <p className="text-xs text-text-secondary truncate">
                            {order.order_code} · {order.style_ref || "N/A"} · Qty {order.quantity ?? 0}
                          </p>
                        </div>
                        <span className="text-[11px] font-semibold rounded-full bg-surface-subtle text-text-secondary px-2 py-0.5">
                          {order.status}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-text-muted">No recent orders yet.</p>
                )}
              </div>

              <div className="rounded-xl border border-border bg-surface-raised shadow-sm p-5">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Clock3 className="h-4 w-4 text-status-warning-foreground" />
                    <h3 className="text-sm font-semibold text-text-primary">Follow-up Tasks</h3>
                  </div>
                  <Link
                    to="/app/followup"
                    className="text-[11px] font-semibold text-brand-primary hover:text-brand-primary/90 hover:underline underline-offset-2 flex items-center gap-0.5"
                  >
                    View all <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
                {tasks.length > 0 ? (
                  <div className="space-y-2">
                    {tasks.slice(0, 6).map((task) => (
                      <div key={task.id} className="rounded-md border border-border px-3 py-2">
                        <p className="text-sm text-text-primary truncate">{task.title}</p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[11px] text-text-secondary">Order #{task.order_id}</span>
                          <span className="text-[11px] text-text-secondary">
                            {task.due_date ? new Date(task.due_date).toLocaleDateString() : "No due date"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-text-muted">No open follow-up tasks.</p>
                )}
              </div>
            </div>
          </section>

          {insights.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-[0.12em] mb-2.5">
                AI Insights
              </h2>
              <div className="rounded-xl border border-border bg-surface-raised shadow-sm p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                {insights.map((insight) => (
                  <div key={insight.id} className="rounded-md border border-border p-3">
                    <div className="flex items-center gap-2">
                      {insight.type === "warning" && <AlertTriangle className="h-4 w-4 text-status-warning-foreground" />}
                      {insight.type === "success" && <CheckCircle2 className="h-4 w-4 text-status-success-foreground" />}
                      {insight.type === "info" && <Sparkles className="h-4 w-4 text-status-info-foreground" />}
                      <p className="text-sm font-semibold text-text-primary">{insight.title}</p>
                    </div>
                    <p className="text-xs text-text-secondary mt-1">{insight.message}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
