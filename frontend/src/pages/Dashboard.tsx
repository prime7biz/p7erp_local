import { useEffect, useMemo, useState } from "react";
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
  type OrderStatusSummary,
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
  Globe,
  Package,
  PlusCircle,
  ShoppingCart,
  Sparkles,
  Truck,
  UserPlus,
  Users,
  Settings,
} from "lucide-react";

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
      <div className="w-[120px] h-[120px] rounded-full border border-gray-200 flex items-center justify-center text-xs text-gray-400">
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
      <div className="absolute inset-[18px] rounded-full bg-white border border-gray-100 flex flex-col items-center justify-center">
        <p className="text-lg font-bold text-gray-900">{total}</p>
        <p className="text-[10px] text-gray-400">{centerLabel}</p>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { me } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
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

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
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
    });
  }, []);

  if (!me) return null;

  const firstName = me.first_name || me.username || "User";

  const kpiById = (id: string) => kpis.find((k) => k.id === id)?.value ?? 0;
  const customerCount = kpiById("total-customers");
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

  const kpiCards = [
    {
      label: "Active Orders",
      value: kpiById("active-orders"),
      icon: ShoppingCart,
      borderColor: "border-l-blue-500",
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
      href: "/app/orders",
      format: (v: number) => bdt.format(v),
    },
    {
      label: "Monthly Revenue",
      value: kpiById("monthly-revenue"),
      icon: DollarSign,
      borderColor: "border-l-emerald-500",
      iconBg: "bg-emerald-100",
      iconColor: "text-emerald-600",
      href: "/app/reports/tenant-overview",
      format: (v: number) => (v > 0 ? `৳${bdt.format(v)}` : "—"),
    },
    {
      label: "Pending Approvals",
      value: kpiById("pending-approvals"),
      icon: CheckSquare,
      borderColor: "border-l-amber-500",
      iconBg: "bg-amber-100",
      iconColor: "text-amber-600",
      href: "/app/approvals",
      format: (v: number) => bdt.format(v),
    },
    {
      label: "Inventory Items",
      value: 0,
      icon: Package,
      borderColor: "border-l-purple-500",
      iconBg: "bg-purple-100",
      iconColor: "text-purple-600",
      href: "/app/items",
      format: (v: number) => bdt.format(v),
    },
  ];

  const secondaryStats = [
    { label: "Total Customers", value: customerCount ?? 0, dotColor: "bg-blue-500" },
    { label: "Total Styles", value: stylesCount, dotColor: "bg-orange-500" },
    { label: "Open Follow-ups", value: tasks.length, dotColor: "bg-emerald-500" },
    {
      label: "Critical Alerts",
      value: tasks.filter((task) => (task.severity || "").toUpperCase() === "CRITICAL").length,
      dotColor: "bg-red-500",
    },
  ];

  const quickActions = [
    { label: "Customers", href: "/app/customers", icon: Users },
    { label: "New Inquiry", href: "/app/inquiries/new", icon: PlusCircle },
    { label: "New Quotation", href: "/app/quotations/new", icon: ShoppingCart },
    { label: "Order Follow-ups", href: "/app/merchandising/followups", icon: Truck },
    { label: "Settings", href: "/app/settings/users", icon: Settings },
    { label: "Users", href: "/app/settings/users", icon: UserPlus },
  ];

  return (
    <div className="flex flex-col" data-page="dashboard-v2">
      <main className="bg-white rounded-xl border border-gray-200/80 shadow-sm shadow-gray-300/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Welcome header – same as reference (PrimeX format) */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">
                Welcome back, {firstName}
              </h1>
              <p className="text-sm text-gray-600 mt-0.5">{formatDateTime(currentTime)}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
                {me.tenant_name}
              </span>
            </div>
          </div>

          {/* Key Metrics – 4 KPI cards with left border and icon */}
          <section>
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-[0.12em] mb-2.5">
              Key Metrics
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {kpiCards.map((card) => {
                const Icon = card.icon;
                return (
                  <div
                    key={card.label}
                    className={`rounded-xl border border-gray-200/90 bg-white shadow-sm shadow-gray-300/35 border-l-[3px] ${card.borderColor} hover:shadow-md hover:shadow-gray-300/45 transition-shadow overflow-hidden`}
                  >
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className={`p-2.5 rounded-xl ${card.iconBg}`}>
                          <Icon className={`h-5 w-5 ${card.iconColor}`} />
                        </div>
                        <Link
                          to={card.href}
                          className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 hover:underline underline-offset-2 flex items-center gap-0.5"
                        >
                          View <ArrowRight className="h-3 w-3" />
                        </Link>
                      </div>
                      <p className="text-3xl font-bold text-gray-900">
                        {card.format(card.value)}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">{card.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Secondary stats – 4 compact cards with dot */}
          <section>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {secondaryStats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl border border-gray-200/90 bg-white shadow-sm shadow-gray-300/30 p-4 flex items-center gap-3"
                >
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${stat.dotColor} shrink-0`}
                  />
                  <div className="min-w-0">
                    <p className="text-xl font-bold text-gray-900">
                      {stat.value !== null && stat.value !== undefined
                        ? bdt.format(stat.value)
                        : "—"}
                    </p>
                    <p className="text-xs text-gray-600 truncate">{stat.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Summary Cards */}
          <section>
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-[0.12em] mb-2.5">
              Summary Cards
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-gray-200/90 bg-white shadow-sm shadow-gray-300/35 overflow-hidden">
                <div className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900">Order Pipeline</h3>
                    <span className="inline-flex items-center rounded-md border border-gray-200 px-2 py-0.5 text-[11px] font-semibold text-gray-700">
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
                              <span className="text-gray-600 truncate">{entry.label}</span>
                            </div>
                            <span className="font-semibold text-gray-900">{entry.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="h-[120px] flex items-center justify-center text-xs text-gray-400">
                      No orders yet
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200/90 bg-white shadow-sm shadow-gray-300/35 overflow-hidden">
                <div className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900">Employee Summary</h3>
                    <span className="inline-flex items-center rounded-md border border-gray-200 px-2 py-0.5 text-[11px] font-semibold text-gray-700">
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
                              <span className="text-gray-600 truncate">{entry.label}</span>
                            </div>
                            <span className="font-semibold text-gray-900">{entry.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="h-[120px] flex items-center justify-center text-xs text-gray-400">
                      <div className="text-center">
                        <Users className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                        <p>No employee data yet</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200/90 bg-white shadow-sm shadow-gray-300/35 overflow-hidden">
                <div className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900">Revenue Trend</h3>
                    <span className="text-xs font-semibold text-emerald-600">
                      {revenueTrend.totalRevenue > 0 ? `৳${bdt.format(Math.round(revenueTrend.totalRevenue))}` : "—"}
                    </span>
                  </div>
                  {revenueTrend.months.length > 0 ? (
                    <div className="space-y-2">
                      {revenueTrend.months.slice(-4).map((m) => (
                        <div key={m.month} className="text-xs">
                          <div className="flex justify-between text-gray-600 mb-1">
                            <span>{m.month}</span>
                            <span>৳{bdt.format(Math.round(m.revenue))}</span>
                          </div>
                          <div className="h-2 rounded bg-gray-100 overflow-hidden">
                            <div
                              className="h-full rounded bg-orange-500"
                              style={{ width: `${Math.max((m.revenue / maxRevenue) * 100, 8)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="h-[120px] flex items-center justify-center text-xs text-gray-400">
                      <div className="text-center">
                        <DollarSign className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                        <p>No revenue data yet</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Charts + analytics like PrimeX */}
          <section>
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-[0.12em] mb-2.5">
              Charts &amp; Analytics
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 rounded-xl border border-gray-200/90 bg-white shadow-sm shadow-gray-300/35 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 className="h-4 w-4 text-blue-600" />
                  <h3 className="text-sm font-semibold text-gray-900">Revenue &amp; Production Trend</h3>
                </div>
                {productionTrends.length > 0 ? (
                  <div className="space-y-3">
                    {productionTrends.map((trend) => (
                      <div key={trend.date}>
                        <div className="flex items-center justify-between text-xs text-gray-600 mb-1.5">
                          <span>{trend.date}</span>
                          <span>Efficiency {trend.efficiency}%</span>
                        </div>
                        <div className="space-y-1">
                          <div className="h-1.5 rounded bg-gray-100 overflow-hidden">
                            <div
                              className="h-full rounded bg-blue-500"
                              style={{ width: `${Math.max((trend.output / maxTrendOutput) * 100, 8)}%` }}
                            />
                          </div>
                          <div className="h-1.5 rounded bg-gray-100 overflow-hidden">
                            <div
                              className="h-full rounded bg-teal-500"
                              style={{ width: `${Math.max((trend.target / Math.max(maxTrendOutput, 1)) * 100, 8)}%` }}
                            />
                          </div>
                        </div>
                        <div className="mt-1 text-[11px] text-gray-600">
                          Output {trend.output} · Target {trend.target}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">No trend data yet.</p>
                )}
              </div>
              <div className="rounded-xl border border-gray-200/90 bg-white shadow-sm shadow-gray-300/35 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <ClipboardList className="h-4 w-4 text-violet-600" />
                  <h3 className="text-sm font-semibold text-gray-900">Order Status</h3>
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
                            <span className="text-gray-600 truncate">{status.label}</span>
                          </div>
                          <span className="text-gray-900 font-semibold">{status.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">No order status data yet.</p>
                )}
              </div>
            </div>
          </section>

          <section>
            <div className="rounded-xl border border-gray-200/90 bg-white shadow-sm shadow-gray-300/35 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-teal-600" />
                  <h3 className="text-sm font-semibold text-gray-900">Global Customer Destinations</h3>
                </div>
                <span className="text-xs text-gray-600">{customerMap.length} countries</span>
              </div>
              {customerMap.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {customerMap
                    .slice()
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 8)
                    .map((point) => (
                      <div key={point.country} className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                        <p className="text-sm text-gray-800 font-medium">{point.country}</p>
                        <p className="text-xs text-gray-600">{point.count} customer(s)</p>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">No customer location data yet.</p>
              )}
            </div>
          </section>

          {/* Quick Actions – horizontal scroll */}
          <section>
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-[0.12em] mb-2.5">
              Quick Actions
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {quickActions.map((qa) => {
                const Icon = qa.icon;
                return (
                  <Link key={qa.label} to={qa.href}>
                    <button
                      type="button"
                      className="flex items-center gap-2 whitespace-nowrap shrink-0 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:border-orange-300 hover:bg-orange-50/50 hover:text-orange-700 transition-all"
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
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-[0.12em] mb-2.5">
              Intelligence
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 rounded-xl border border-gray-200/90 bg-white shadow-sm shadow-gray-300/35 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Briefcase className="h-4 w-4 text-gray-700" />
                  <h3 className="text-sm font-semibold text-gray-900">Recent Orders</h3>
                </div>
                {recentOrders.length > 0 ? (
                  <div className="space-y-2">
                    {recentOrders.slice(0, 6).map((order) => (
                      <div
                        key={order.id}
                        className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{order.customer_name}</p>
                          <p className="text-xs text-gray-600 truncate">
                            {order.order_code} · {order.style_ref || "N/A"} · Qty {order.quantity ?? 0}
                          </p>
                        </div>
                        <span className="text-[11px] font-semibold rounded-full bg-gray-100 text-gray-700 px-2 py-0.5">
                          {order.status}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">No recent orders yet.</p>
                )}
              </div>

              <div className="rounded-xl border border-gray-200/90 bg-white shadow-sm shadow-gray-300/35 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Clock3 className="h-4 w-4 text-amber-600" />
                  <h3 className="text-sm font-semibold text-gray-900">Follow-up Tasks</h3>
                </div>
                {tasks.length > 0 ? (
                  <div className="space-y-2">
                    {tasks.slice(0, 6).map((task) => (
                      <div key={task.id} className="rounded-md border border-gray-200 px-3 py-2">
                        <p className="text-sm text-gray-900 truncate">{task.title}</p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[11px] text-gray-600">Order #{task.order_id}</span>
                          <span className="text-[11px] text-gray-600">
                            {task.due_date ? new Date(task.due_date).toLocaleDateString() : "No due date"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">No open follow-up tasks.</p>
                )}
              </div>
            </div>
          </section>

          {insights.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-[0.12em] mb-2.5">
                AI Insights
              </h2>
              <div className="rounded-xl border border-gray-200/90 bg-white shadow-sm shadow-gray-300/35 p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                {insights.map((insight) => (
                  <div key={insight.id} className="rounded-md border border-gray-200 p-3">
                    <div className="flex items-center gap-2">
                      {insight.type === "warning" && <AlertTriangle className="h-4 w-4 text-amber-600" />}
                      {insight.type === "success" && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                      {insight.type === "info" && <Sparkles className="h-4 w-4 text-blue-600" />}
                      <p className="text-sm font-semibold text-gray-900">{insight.title}</p>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">{insight.message}</p>
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
