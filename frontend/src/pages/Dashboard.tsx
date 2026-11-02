import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { OnboardingChecklist } from "@/components/dashboard/OnboardingChecklist";
import { AskMetricCards } from "@/components/dashboard/AskMetricCards";
import { logApiError } from "@/utils/logApiError";
import { api } from "@/api/client";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Package,
  PlusCircle,
  RefreshCw,
  Settings,
  ShoppingCart,
  Sparkles,
  Truck,
  Users,
} from "lucide-react";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardKpiRow } from "@/components/dashboard/DashboardKpiRow";
import { NeedsAttentionStrip } from "@/components/dashboard/NeedsAttentionStrip";
import { OwnerCostAlertStrip } from "@/components/dashboard/OwnerCostAlertStrip";
import { MerchHealthBlock } from "@/components/dashboard/MerchHealthBlock";
import { AiBriefRenderer } from "@/components/dashboard/AiBriefRenderer";
import { ControlTowerLinkCard } from "@/components/dashboard/ControlTowerLinkCard";
import {
  PromiseRisksPanel,
  type PromiseRiskTypeFilter,
  type PromiseStatusesFilter,
} from "@/components/dashboard/PromiseRisksPanel";
import {
  MapSkeletonCard,
  MemoizedActivityTimeline,
  MemoizedPipelineViz,
  MemoizedQuickActionButton,
} from "@/components/dashboard/DashboardMemoParts";
import { Card } from "@/components/ui/card";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import {
  filterQuickActionsByRole,
  getDashboardVisibility,
  getPresetDateRange,
  type DashboardDatePreset,
  type DashboardOpsBlock,
  type DashboardQuickAction,
} from "@/components/dashboard/dashboardRoleVisibility";
import { ErpAiPhasesDashboardSection } from "@/components/erp-ai/ErpAiPhasesDashboardSection";
import { FinancialHealthCard } from "@/components/dashboard/FinancialHealthCard";
import { useDashboardHome } from "@/hooks/useDashboardHome";

const GlobalCustomerMapCard = lazy(() =>
  import("@/components/dashboard/GlobalCustomerMapCard").then((m) => ({
    default: m.GlobalCustomerMapCard,
  })),
);

const MemoizedKpiRow = memo(DashboardKpiRow);
const MemoizedNeedsAttentionStrip = memo(NeedsAttentionStrip);

const SECTION_H2 = "text-xl font-semibold tracking-tight text-text-primary mb-3";

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

export function Dashboard() {
  const { me } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [datePreset, setDatePreset] = useState<DashboardDatePreset>("last_90_days");
  const [dateRange, setDateRange] = useState(() => getPresetDateRange("last_90_days"));
  const [erpAiOpen, setErpAiOpen] = useState(false);

  const {
    loading,
    lastUpdated,
    refresh,
    refreshPromiseAndCommercial,
    kpis,
    attention,
    orderStatusCards,
    insights,
    recentOrders,
    tasks,
    customerMap,
    unifiedTnaSummary,
    merchAlertsSummary,
    promiseSummary,
    commercialPendingCount,
    promiseRefreshing,
    promiseLastUpdated,
  } = useDashboardHome({ dateRange });

  const [aiBriefText, setAiBriefText] = useState<string | null>(null);
  const [aiBriefLoading, setAiBriefLoading] = useState(false);
  const [aiBriefUpdated, setAiBriefUpdated] = useState<string | null>(null);
  const [cashFlowBrief, setCashFlowBrief] = useState<string | null>(null);
  const [cashFlowLoading, setCashFlowLoading] = useState(false);
  const [promiseStatusesFilter, setPromiseStatusesFilter] = useState<PromiseStatusesFilter>("NEW,IN_PROGRESS");
  const [promiseRiskTypeFilter, setPromiseRiskTypeFilter] = useState<PromiseRiskTypeFilter>("ALL");
  const skipNextPromiseFetch = useRef(true);

  const vis = useMemo(() => getDashboardVisibility(me?.role_name), [me?.role_name]);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (skipNextPromiseFetch.current) {
      skipNextPromiseFetch.current = false;
      return;
    }
    void refreshPromiseAndCommercial(promiseStatusesFilter);
  }, [promiseStatusesFilter, refreshPromiseAndCommercial]);

  const refreshAiBrief = useCallback(() => {
    setAiBriefLoading(true);
    api
      .getDashboardAiBrief()
      .then((r) => {
        setAiBriefText(r.brief);
        setAiBriefUpdated(r.generated_at);
      })
      .catch((err: unknown) => logApiError("Dashboard.aiBrief", err))
      .finally(() => setAiBriefLoading(false));
  }, []);

  const refreshCashFlowBrief = useCallback(() => {
    setCashFlowLoading(true);
    api
      .aiFinanceForecast({ horizon_days: 90 })
      .then((r) => setCashFlowBrief(r.narrative || null))
      .catch((err: unknown) => logApiError("Dashboard.cashFlowBrief", err))
      .finally(() => setCashFlowLoading(false));
  }, []);

  const orderPieData = useMemo(
    () =>
      orderStatusCards.map((s) => ({
        label: s.label,
        value: s.count,
        color: s.color,
      })),
    [orderStatusCards],
  );
  const totalOrdersInPie = useMemo(
    () => orderPieData.reduce((sum, row) => sum + row.value, 0),
    [orderPieData],
  );

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

  const allQuickActions: DashboardQuickAction[] = useMemo(
    () => [
      { label: "Customers", href: "/app/customers", icon: Users, roles: ["elevated", "merchandiser", "other"] },
      { label: "New Inquiry", href: "/app/inquiries/new", icon: PlusCircle, roles: ["elevated", "merchandiser", "other"] },
      { label: "New Quotation", href: "/app/quotations/new", icon: ShoppingCart, roles: ["elevated", "merchandiser", "other"] },
      { label: "Follow-up & Unified TNA", href: "/app/followup", icon: Truck, roles: ["elevated", "merchandiser", "planning", "other"] },
      { label: "BOM Governance", href: "/app/bom", icon: ClipboardList, roles: ["elevated", "merchandiser", "other"] },
      { label: "Critical Alerts", href: "/app/merchandising/alerts", icon: AlertTriangle, roles: ["elevated", "merchandiser", "planning", "other"] },
      { label: "Inventory FIFO", href: "/app/inventory/stock-inventory-summary", icon: Package, roles: ["elevated", "planning", "other"] },
      { label: "Stock vs GL", href: "/app/inventory/reconciliation", icon: BarChart3, roles: ["elevated", "finance", "other"] },
      { label: "Settings", href: "/app/settings/users", icon: Settings, roles: ["elevated"] },
    ],
    [],
  );
  const quickActions = useMemo(
    () => filterQuickActionsByRole(allQuickActions, me?.role_name),
    [allQuickActions, me?.role_name],
  );

  const handleRangeChange = (range: { from: string; to: string }, preset: DashboardDatePreset) => {
    setDatePreset(preset);
    setDateRange(range);
  };

  const handleRefresh = useCallback(() => {
    void refresh(promiseStatusesFilter, { bypassCache: true });
  }, [refresh, promiseStatusesFilter]);

  const pull = usePullToRefresh({ onRefresh: handleRefresh });

  const activeOrdersCount = kpis.find((k) => k.id === "active-orders")?.value ?? 0;
  const heroStats = useMemo(() => {
    const shipped =
      orderStatusCards.find((s) => /ship|deliver|complete/i.test(`${s.label} ${s.status || ""}`))?.count ?? 0;
    const onTimePct =
      totalOrdersInPie > 0
        ? Math.min(99, Math.round(((totalOrdersInPie - (promiseSummary.blocked_count || 0)) / totalOrdersInPie) * 100))
        : 0;
    return [
      { label: "Active orders", value: String(activeOrdersCount) },
      { label: "Shipped (status)", value: String(shipped) },
      { label: "On-time est.", value: `${onTimePct}%` },
    ];
  }, [activeOrdersCount, orderStatusCards, promiseSummary.blocked_count, totalOrdersInPie]);

  const pipelineStatusCards = useMemo(
    () =>
      orderStatusCards.map((s) => ({
        label: s.label,
        value: s.count,
        status: s.status,
      })),
    [orderStatusCards],
  );

  const renderOpsBlock = (block: DashboardOpsBlock) => {
    if (block === "merch" && vis.showMerchHealth) {
      return (
        <MerchHealthBlock
          key="merch"
          unifiedTnaSummary={unifiedTnaSummary}
          merchAlertsSummary={merchAlertsSummary}
          promiseBlockedCount={promiseSummary.blocked_count}
          commercialPendingCount={commercialPendingCount}
        />
      );
    }
    if (block === "promise" && vis.showPromiseRisks) {
      return (
        <section key="promise">
          <h2 className={SECTION_H2}>Promise risks</h2>
          <PromiseRisksPanel
            promiseSummary={promiseSummary}
            promiseStatusesFilter={promiseStatusesFilter}
            setPromiseStatusesFilter={setPromiseStatusesFilter}
            promiseRiskTypeFilter={promiseRiskTypeFilter}
            setPromiseRiskTypeFilter={setPromiseRiskTypeFilter}
            promiseRefreshing={promiseRefreshing}
            promiseMinutesAgo={promiseMinutesAgo}
            riskyPromiseOrders={riskyPromiseOrders}
          />
        </section>
      );
    }
    if (block === "control_tower" && vis.showControlTowerLink) {
      return (
        <section key="control_tower">
          <h2 className={SECTION_H2}>Operations</h2>
          <ControlTowerLinkCard />
        </section>
      );
    }
    return null;
  };

  const aiBriefCard = useMemo(
    () => (
      <Card variant="default" className="h-full p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="sparkle-pulse h-4 w-4 text-brand-primary" aria-hidden />
            <span className="text-sm font-semibold text-text-primary">AI daily brief</span>
          </div>
          <button
            type="button"
            onClick={() => void refreshAiBrief()}
            disabled={aiBriefLoading}
            aria-label={aiBriefText ? "Refresh AI daily brief" : "Generate AI daily brief"}
            className={`btn-press inline-flex h-9 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 disabled:opacity-50 ${
              !aiBriefText
                ? "animate-pulse border-brand-primary/40 bg-brand-subtle text-brand-primary"
                : "text-text-secondary hover:bg-state-hover"
            }`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${aiBriefLoading ? "animate-spin" : ""}`} aria-hidden />
            {aiBriefText ? "Refresh" : "Generate Brief"}
          </button>
        </div>
        {aiBriefText ? (
          <AiBriefRenderer text={aiBriefText} />
        ) : (
          <p className="text-xs text-text-muted">
            Click Generate Brief for a KPI-based executive summary powered by AI.
          </p>
        )}
        {aiBriefUpdated && (
          <p className="mt-2 text-[10px] text-text-muted">
            Generated: {new Date(aiBriefUpdated).toLocaleString()}
          </p>
        )}
      </Card>
    ),
    [aiBriefText, aiBriefLoading, aiBriefUpdated, refreshAiBrief],
  );

  const cashFlowBriefCard = useMemo(
    () => (
      <Card variant="default" className="h-full p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-accent-secondary" aria-hidden />
            <span className="text-sm font-semibold text-text-primary">Cash Flow AI Brief</span>
          </div>
          <button
            type="button"
            onClick={() => void refreshCashFlowBrief()}
            disabled={cashFlowLoading}
            aria-label={cashFlowBrief ? "Refresh cash flow brief" : "Generate cash flow brief"}
            className="btn-press inline-flex h-9 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-semibold text-text-secondary hover:bg-state-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${cashFlowLoading ? "animate-spin" : ""}`} aria-hidden />
            {cashFlowBrief ? "Refresh" : "Generate"}
          </button>
        </div>
        {cashFlowBrief ? (
          <AiBriefRenderer text={cashFlowBrief} />
        ) : (
          <p className="text-xs text-text-muted">
            30/60/90-day cash-flow narrative over the finance heuristic (optional LLM layer).
          </p>
        )}
        <Link
          to="/app/ai/predictions"
          className="mt-2 inline-block text-[11px] font-semibold text-accent-secondary hover:underline"
        >
          Open Finance Forecast
        </Link>
      </Card>
    ),
    [cashFlowBrief, cashFlowLoading, refreshCashFlowBrief],
  );

  const orderPipelineCard = useMemo(
    () => (
      <MemoizedPipelineViz
        totalOrders={totalOrdersInPie}
        pipelineStatusCards={pipelineStatusCards}
        orderPieData={orderPieData}
      />
    ),
    [totalOrdersInPie, pipelineStatusCards, orderPieData],
  );

  const kpiCards = useMemo(
    () => <MemoizedKpiRow kpis={kpis} maxCards={5} />,
    [kpis],
  );

  const needsAttentionStrip = useMemo(
    () => <MemoizedNeedsAttentionStrip summary={attention} />,
    [attention],
  );

  if (!me) return null;

  const firstName = me.first_name || me.username || "User";
  const greeting = getTimeBasedGreeting(currentTime.getHours());

  if (loading) {
    return (
      <div className="page-enter flex flex-col" data-page="dashboard-v3">
        <main className="rounded-2xl border border-border bg-surface-raised shadow-sm">
          <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
            <div className="skeleton-shimmer h-28 w-full rounded-2xl" />
            <section>
              <div className="skeleton-shimmer mb-3 h-5 w-28" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="skeleton-shimmer h-36 rounded-2xl" />
                ))}
              </div>
            </section>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="page-enter flex flex-col" data-page="dashboard-v3">
      <div
        className="flex items-center justify-center overflow-hidden text-xs font-medium text-brand-primary transition-all lg:hidden"
        style={pull.indicatorStyle}
        aria-hidden
      >
        {pull.refreshing ? "Refreshing…" : pull.pullDistance > 40 ? "Release to refresh" : "Pull to refresh"}
      </div>
      <main className="rounded-2xl border border-border bg-surface-raised/90 shadow-sm backdrop-blur-sm">
        <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <DashboardHeader
            greeting={greeting}
            firstName={firstName}
            dateTimeLabel={formatDateTime(currentTime)}
            lastUpdatedLabel={minutesAgo(lastUpdated, currentTime)}
            activePreset={datePreset}
            refreshing={loading || pull.refreshing}
            heroStats={heroStats}
            onRefresh={handleRefresh}
            onRangeChange={handleRangeChange}
          />

          <OnboardingChecklist tenantId={me?.tenant_id} roleName={me?.role_name} />
          {needsAttentionStrip}
          <OwnerCostAlertStrip />
          {kpiCards}
          <AskMetricCards />

          {vis.opsOrder.map((block) => renderOpsBlock(block))}

          <section>
            <h2 className={SECTION_H2}>Pipeline &amp; brief</h2>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {vis.showOrderPipeline && orderPipelineCard}
              {aiBriefCard}
              {cashFlowBriefCard}
              {(vis.showRevenueTrend || vis.showEmployeeSummary) && <FinancialHealthCard />}
            </div>
          </section>

          <section>
            <h2 className={SECTION_H2}>Recent activity</h2>
            <MemoizedActivityTimeline recentOrders={recentOrders} tasks={tasks} />
          </section>

          {vis.showCustomerMap && (
            <section>
              <Suspense fallback={<MapSkeletonCard height={400} />}>
                <GlobalCustomerMapCard points={customerMap} />
              </Suspense>
            </section>
          )}

          <section>
            <h2 className={SECTION_H2}>Quick Actions</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {quickActions.map((qa) => (
                <MemoizedQuickActionButton key={qa.label} action={qa} />
              ))}
            </div>
          </section>

          {insights.length > 0 && (
            <section>
              <h2 className={SECTION_H2}>AI Insights</h2>
              <div
                className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-surface-raised p-4 shadow-sm md:grid-cols-3"
                aria-live="polite"
              >
                {insights.map((insight) => (
                  <div key={insight.id} className="rounded-md border border-border p-3">
                    <div className="flex items-center gap-2">
                      {insight.type === "warning" && (
                        <AlertTriangle className="h-4 w-4 text-status-warning-foreground" aria-hidden />
                      )}
                      {insight.type === "success" && (
                        <CheckCircle2 className="h-4 w-4 text-status-success-foreground" aria-hidden />
                      )}
                      {insight.type === "info" && (
                        <Sparkles className="h-4 w-4 text-status-info-foreground" aria-hidden />
                      )}
                      <p className="text-sm font-semibold text-text-primary">{insight.title}</p>
                    </div>
                    <p className="mt-1 text-xs text-text-secondary">{insight.message}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="rounded-2xl border border-border bg-surface-raised shadow-sm">
            <button
              type="button"
              onClick={() => setErpAiOpen((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary/40"
              aria-expanded={erpAiOpen}
              aria-label="Toggle ERP AI phases section"
            >
              <span className="text-xs font-semibold text-text-muted">ERP AI phases (advanced)</span>
              <ChevronDown
                className={`h-4 w-4 text-text-muted transition-transform ${erpAiOpen ? "rotate-180" : ""}`}
                aria-hidden
              />
            </button>
            {erpAiOpen && (
              <div className="border-t border-border px-4 pb-4 pt-3">
                <ErpAiPhasesDashboardSection />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
