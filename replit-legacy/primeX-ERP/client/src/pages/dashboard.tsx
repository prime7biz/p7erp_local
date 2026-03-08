import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "wouter";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import {
  AlertTriangle, DollarSign, Package, ClipboardList,
  Activity, ArrowRight, Lightbulb, Info, AlertCircle,
  Sparkles, RefreshCw, ChevronDown, ChevronUp,
  FilePlus, ShoppingCart, PlusCircle, BoxIcon, CheckSquare, BarChart3,
  CreditCard, Truck, TrendingUp, TrendingDown, Users, Shirt, Globe,
  MapPin
} from "lucide-react";
import { PermissionGate } from "@/components/erp/permission-gate";
import { WORLD_MAP_PATH } from "@/data/world-map-path";

const COLORS = {
  blue: "#3B82F6",
  orange: "#F97316",
  teal: "#20C997",
  purple: "#8B5CF6",
  coral: "#E83E8C",
  success: "#10B981",
  amber: "#F59E0B",
  red: "#EF4444",
  indigo: "#6366F1",
  cyan: "#06B6D4",
};

const PIE_COLORS = ["#3B82F6", "#F97316", "#10B981", "#8B5CF6", "#F59E0B", "#EF4444", "#06B6D4"];

const bdt = new Intl.NumberFormat("en-BD");

const COUNTRY_COORDS: Record<string, [number, number]> = {
  "Bangladesh": [90.3563, 23.685],
  "USA": [-95.7129, 37.0902],
  "United States": [-95.7129, 37.0902],
  "UK": [-1.1743, 52.3555],
  "United Kingdom": [-1.1743, 52.3555],
  "Germany": [10.4515, 51.1657],
  "France": [2.2137, 46.2276],
  "Italy": [12.5674, 41.8719],
  "Spain": [-3.7038, 40.4168],
  "Canada": [-106.3468, 56.1304],
  "Australia": [133.7751, -25.2744],
  "Japan": [138.2529, 36.2048],
  "China": [104.1954, 35.8617],
  "India": [78.9629, 20.5937],
  "Netherlands": [5.2913, 52.1326],
  "Sweden": [18.6435, 60.1282],
  "Denmark": [9.5018, 56.2639],
  "Norway": [8.4689, 60.472],
  "Belgium": [4.4699, 50.5039],
  "Turkey": [35.2433, 38.9637],
  "South Korea": [127.7669, 35.9078],
  "Brazil": [-51.9253, -14.235],
  "Mexico": [-102.5528, 23.6345],
  "UAE": [53.8478, 23.4241],
  "Saudi Arabia": [45.0792, 23.8859],
  "Singapore": [103.8198, 1.3521],
  "Hong Kong": [114.1694, 22.3193],
  "Thailand": [100.9925, 15.87],
  "Vietnam": [108.2772, 14.0583],
  "Indonesia": [113.9213, -0.7893],
  "Malaysia": [101.9758, 4.2105],
  "Pakistan": [69.3451, 30.3753],
  "Sri Lanka": [80.7718, 7.8731],
  "Egypt": [30.8025, 26.8206],
  "South Africa": [22.9375, -30.5595],
  "Poland": [19.1451, 51.9194],
  "Russia": [105.3188, 61.524],
};

function WorldMapWithMarkers({ markers, maxCount }: { markers: { country: string; coordinates: [number, number]; count: number }[]; maxCount: number }) {
  return (
    <div className="w-full overflow-hidden rounded-lg bg-gradient-to-b from-orange-50/30 to-gray-50" style={{ height: 320 }}>
      <svg viewBox="-180 -90 360 180" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <radialGradient id="markerGlow">
            <stop offset="0%" stopColor={COLORS.orange} stopOpacity="0.5" />
            <stop offset="100%" stopColor={COLORS.orange} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x="-180" y="-90" width="360" height="180" fill="transparent" />
        <path d={WORLD_MAP_PATH} fill="#E5E7EB" stroke="#D1D5DB" strokeWidth="0.5" />
        {markers.map((marker, i) => {
          const [lng, lat] = marker.coordinates;
          const y = -lat;
          const size = 3 + (marker.count / maxCount) * 8;
          return (
            <g key={i}>
              <circle cx={lng} cy={y} r={size * 2.5} fill="url(#markerGlow)" />
              <circle
                cx={lng}
                cy={y}
                r={size}
                fill={COLORS.orange}
                fillOpacity={0.7 + (marker.count / maxCount) * 0.3}
                stroke="white"
                strokeWidth={1.2}
              />
              <title>{`${marker.country}: ${marker.count} customer${marker.count > 1 ? 's' : ''}`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const Dashboard = () => {
  const { user } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [timeRange, setTimeRange] = useState("monthly");
  const [insightsOpen, setInsightsOpen] = useState(true);

  useEffect(() => {
    document.title = "Dashboard | Prime7 ERP";
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const { data: kpiData, isLoading: kpiLoading } = useQuery<any>({
    queryKey: ["/api/dashboard/kpi"],
    retry: false,
  });

  const { data: productionTrends, isLoading: trendsLoading } = useQuery<any>({
    queryKey: ["/api/dashboard/production-trends", timeRange],
    queryFn: () => fetch(`/api/dashboard/production-trends?timeRange=${timeRange}`, { credentials: 'include' }).then(r => r.json()),
  });

  const { data: recentOrders, isLoading: ordersLoading } = useQuery<any>({
    queryKey: ["/api/dashboard/recent-orders"],
    retry: false,
  });

  const { data: aiInsights, isLoading: insightsLoading, isError: insightsError, refetch: refetchInsights } = useQuery<any>({
    queryKey: ["/api/dashboard/ai-insights"],
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const { data: tasks, isLoading: tasksLoading } = useQuery<any>({
    queryKey: ["/api/dashboard/tasks"],
    retry: false,
  });

  const { data: approvalStats } = useQuery<{ pending?: number }>({
    queryKey: ["/api/approvals/stats"],
    retry: false,
  });

  const { data: overdueBills } = useQuery<{
    data?: any[]; summary?: { totalBills?: number };
  }>({
    queryKey: ["/api/bills/report/overdue"],
    retry: false,
  });

  const { data: itemsData, isLoading: itemsLoading } = useQuery<any[]>({
    queryKey: ["/api/items"],
    retry: false,
  });

  const { data: pendingPOs, isLoading: posLoading } = useQuery<any[]>({
    queryKey: ["/api/purchase-orders", { status: "approved" }],
    queryFn: () => fetch(`/api/purchase-orders?status=approved`, { credentials: 'include' }).then(r => r.json()),
    retry: false,
  });

  const { data: customerMapData } = useQuery<{ country: string; count: number }[]>({
    queryKey: ["/api/dashboard/customer-map"],
    retry: false,
  });

  const { data: orderStatusData } = useQuery<{ status: string; count: number }[]>({
    queryKey: ["/api/dashboard/order-status-breakdown"],
    retry: false,
  });

  const { data: customersData } = useQuery<any[]>({
    queryKey: ["/api/customers"],
    retry: false,
  });

  const { data: stylesData } = useQuery<any>({
    queryKey: ["/api/merch/styles"],
    retry: false,
  });

  const { data: employeeSummary } = useQuery<{ total: number; breakdown: { status: string; count: number }[]; departments: { status: string; count: number }[] }>({
    queryKey: ["/api/dashboard/employee-summary"],
    retry: false,
  });

  const { data: payrollSummary } = useQuery<{ period: string; totalNet: string; totalGross: string; totalDeductions: string; status: string }[]>({
    queryKey: ["/api/dashboard/payroll-summary"],
    retry: false,
  });

  const { data: revenueTrend } = useQuery<{ months: { month: string; revenue: number }[]; totalRevenue: number }>({
    queryKey: ["/api/dashboard/revenue-trend"],
    retry: false,
  });

  const formatDateTime = (date: Date) => {
    const d = date.toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
    const t = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    return `${d} · ${t}`;
  };

  const pendingApprovals = approvalStats?.pending ?? 0;
  const overdueCount = overdueBills?.summary?.totalBills ?? overdueBills?.data?.length ?? 0;

  const negativeStockCount = (() => {
    if (!Array.isArray(itemsData)) return 0;
    return itemsData.filter((item: any) => {
      const stock = Number(item.currentStock ?? item.stock ?? 0);
      const reorder = Number(item.reorderPoint ?? item.reorderLevel ?? 0);
      return reorder > 0 && stock < reorder;
    }).length;
  })();

  const pendingGrnCount = (() => {
    if (Array.isArray(pendingPOs)) return pendingPOs.length;
    if (pendingPOs && typeof pendingPOs === 'object' && Array.isArray((pendingPOs as any).data)) return (pendingPOs as any).data.length;
    return 0;
  })();

  const totalItems = Array.isArray(itemsData) ? itemsData.length : 0;
  const totalCustomers = Array.isArray(customersData) ? customersData.length : 0;
  const totalStyles = (() => {
    if (Array.isArray(stylesData)) return stylesData.length;
    if (stylesData && Array.isArray(stylesData.data)) return stylesData.data.length;
    return 0;
  })();

  const activeOrdersCount = (() => {
    if (!Array.isArray(kpiData)) return 0;
    const item = kpiData.find((k: any) => k.id === 'active-orders');
    return item ? parseInt(item.value) || 0 : 0;
  })();

  const monthlyRevenue = (() => {
    if (!Array.isArray(kpiData)) return 0;
    const item = kpiData.find((k: any) => k.id === 'monthly-revenue');
    if (!item || item.value === 'No data') return 0;
    const val = item.value.replace(/[^0-9.KMkm]/g, '');
    if (val.includes('M')) return parseFloat(val) * 1_000_000;
    if (val.includes('K')) return parseFloat(val) * 1_000;
    return parseFloat(val) || 0;
  })();

  const trendData = Array.isArray(productionTrends) ? productionTrends : (productionTrends?.data || []);

  const pieData = useMemo(() => {
    if (!Array.isArray(orderStatusData) || orderStatusData.length === 0) return [];
    return orderStatusData.map((item) => ({
      name: (item.status || 'unknown').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      value: item.count,
    }));
  }, [orderStatusData]);

  const mapMarkers = useMemo(() => {
    if (!Array.isArray(customerMapData) || customerMapData.length === 0) return [];
    return customerMapData.map(item => {
      const coords = COUNTRY_COORDS[item.country];
      if (!coords) return null;
      return {
        country: item.country,
        count: item.count,
        coordinates: coords,
      };
    }).filter(Boolean) as { country: string; count: number; coordinates: [number, number] }[];
  }, [customerMapData]);

  const maxMapCount = useMemo(() => {
    if (mapMarkers.length === 0) return 1;
    return Math.max(...mapMarkers.map(m => m.count));
  }, [mapMarkers]);

  const insightIconMap: Record<string, { icon: any; color: string; bg: string }> = {
    info: { icon: Info, color: "text-primary", bg: "bg-primary/10" },
    warning: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-100" },
    success: { icon: Lightbulb, color: "text-emerald-600", bg: "bg-emerald-100" },
    alert: { icon: AlertCircle, color: "text-red-600", bg: "bg-red-100" },
  };

  const kpiCards = [
    {
      label: "Active Orders",
      value: activeOrdersCount,
      icon: ShoppingCart,
      borderColor: "border-l-blue-500",
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
      href: "/orders",
      format: (v: number) => bdt.format(v),
    },
    {
      label: "Monthly Revenue",
      value: monthlyRevenue,
      icon: DollarSign,
      borderColor: "border-l-emerald-500",
      iconBg: "bg-emerald-100",
      iconColor: "text-emerald-600",
      href: "/accounts/reports/financial-statements",
      format: (v: number) => v === 0 ? "—" : `৳${bdt.format(v)}`,
    },
    {
      label: "Pending Approvals",
      value: pendingApprovals,
      icon: CheckSquare,
      borderColor: "border-l-amber-500",
      iconBg: "bg-amber-100",
      iconColor: "text-amber-600",
      href: "/approvals",
      format: (v: number) => bdt.format(v),
    },
    {
      label: "Inventory Items",
      value: totalItems,
      icon: Package,
      borderColor: "border-l-purple-500",
      iconBg: "bg-purple-100",
      iconColor: "text-purple-600",
      href: "/inventory",
      format: (v: number) => bdt.format(v),
    },
  ];

  const secondaryStats = [
    { label: "Total Customers", value: totalCustomers, icon: Users, dotColor: "bg-blue-500" },
    { label: "Total Styles", value: totalStyles, icon: Shirt, dotColor: "bg-orange-500" },
    { label: "Open POs", value: pendingGrnCount, icon: Truck, dotColor: "bg-emerald-500" },
    { label: "Overdue Bills", value: overdueCount, icon: AlertTriangle, dotColor: "bg-red-500" },
  ];

  const quickActions = [
    { label: "Create Voucher", href: "/accounts/vouchers/new", icon: CreditCard, module: "finance", action: "create" },
    { label: "New Purchase Order", href: "/inventory/purchase-orders/new", icon: Truck, module: "inventory", action: "create" },
    { label: "New Sales Order", href: "/orders/new", icon: ShoppingCart, module: "sales", action: "create" },
    { label: "Add Item", href: "/inventory/items/new", icon: PlusCircle, module: "inventory", action: "create" },
    { label: "View Approvals", href: "/approvals", icon: CheckSquare, module: "workflow", action: "view" },
    { label: "Stock Summary", href: "/inventory/stock-summary", icon: BarChart3, module: "inventory", action: "view" },
  ];

  const CustomPieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white px-3 py-2 shadow-lg rounded-lg border border-gray-200 text-sm">
          <p className="font-medium text-gray-900">{payload[0].name}</p>
          <p className="text-gray-600">{payload[0].value} orders</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col h-full">
      <main className="flex-1 overflow-y-auto bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">
                Welcome back, {user?.firstName || "User"}
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {formatDateTime(currentTime)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {user?.subscription && (
                <Badge className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/15">
                  {user.subscription.planName} · {user.subscription.status}
                </Badge>
              )}
              <span className="text-sm font-medium text-gray-700">
                {user?.tenant?.name}
              </span>
            </div>
          </div>

          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Key Metrics</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {kpiCards.map((card) => {
                const Icon = card.icon;
                return (
                  <Card key={card.label} className={`shadow-sm border-0 shadow-gray-200/60 border-l-[3px] ${card.borderColor} hover:shadow-md transition-shadow`}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className={`p-2.5 rounded-xl ${card.iconBg}`}>
                          <Icon className={`h-5 w-5 ${card.iconColor}`} />
                        </div>
                        <Link href={card.href}>
                          <span className="text-xs text-primary font-medium hover:underline cursor-pointer flex items-center gap-0.5">
                            View <ArrowRight className="h-3 w-3" />
                          </span>
                        </Link>
                      </div>
                      {kpiLoading ? (
                        <Skeleton className="h-9 w-20 mb-1" />
                      ) : (
                        <p className="text-3xl font-bold text-gray-900">{card.format(card.value)}</p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">{card.label}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          <section>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {secondaryStats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <Card key={stat.label} className="shadow-sm border-0 shadow-gray-200/60">
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full ${stat.dotColor} shrink-0`} />
                      <div className="min-w-0">
                        <p className="text-xl font-bold text-gray-900">{bdt.format(stat.value)}</p>
                        <p className="text-xs text-gray-500 truncate">{stat.label}</p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Summary Cards</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="shadow-sm border-0 shadow-gray-200/60 overflow-hidden">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900">Order Pipeline</h3>
                    <Badge variant="outline" className="text-xs">{pieData.reduce((s, d) => s + d.value, 0)} Total</Badge>
                  </div>
                  {pieData.length > 0 ? (
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <PieChart width={120} height={120}>
                          <Pie data={pieData} cx="50%" cy="50%" innerRadius={35} outerRadius={52} paddingAngle={2} dataKey="value">
                            {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                          </Pie>
                        </PieChart>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-center">
                            <p className="text-lg font-bold text-gray-900">{pieData.reduce((s, d) => s + d.value, 0)}</p>
                            <p className="text-[10px] text-gray-400">Orders</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex-1 space-y-1.5">
                        {pieData.slice(0, 4).map((entry, i) => (
                          <div key={entry.name} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                              <span className="text-gray-600 truncate max-w-[80px]">{entry.name}</span>
                            </div>
                            <span className="font-semibold text-gray-900">{entry.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="h-[120px] flex items-center justify-center text-xs text-gray-400">No orders yet</div>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-sm border-0 shadow-gray-200/60 overflow-hidden">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900">Employee Summary</h3>
                    <Badge variant="outline" className="text-xs">{employeeSummary?.total ?? 0} Staff</Badge>
                  </div>
                  {(() => {
                    const depts = employeeSummary?.departments || [];
                    const deptColors = ["#8B5CF6", "#F97316", "#06B6D4", "#10B981", "#3B82F6", "#EF4444", "#F59E0B"];
                    if (employeeSummary && employeeSummary.total > 0) {
                      const chartData = depts.length > 0 ? depts.map(d => ({ name: d.status, value: d.count })) : employeeSummary.breakdown.map(b => ({ name: b.status, value: b.count }));
                      return (
                        <div className="flex items-center gap-4">
                          <div className="relative">
                            <PieChart width={120} height={120}>
                              <Pie data={chartData} cx="50%" cy="50%" innerRadius={35} outerRadius={52} paddingAngle={2} dataKey="value">
                                {chartData.map((_, i) => <Cell key={i} fill={deptColors[i % deptColors.length]} />)}
                              </Pie>
                            </PieChart>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="text-center">
                                <p className="text-lg font-bold text-gray-900">{employeeSummary.total}</p>
                                <p className="text-[10px] text-gray-400">Total</p>
                              </div>
                            </div>
                          </div>
                          <div className="flex-1 space-y-1.5">
                            {chartData.slice(0, 5).map((d, i) => (
                              <div key={d.name} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: deptColors[i % deptColors.length] }} />
                                  <span className="text-gray-600 truncate max-w-[80px]">{d.name}</span>
                                </div>
                                <span className="font-semibold text-gray-900">{d.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    return <div className="h-[120px] flex items-center justify-center text-xs text-gray-400">No employee data yet</div>;
                  })()}
                </CardContent>
              </Card>

              <Card className="shadow-sm border-0 shadow-gray-200/60 overflow-hidden">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900">Revenue Trend</h3>
                    {revenueTrend && revenueTrend.totalRevenue > 0 && (
                      <span className="text-xs font-bold text-emerald-600">৳{bdt.format(Math.round(revenueTrend.totalRevenue))}</span>
                    )}
                  </div>
                  {revenueTrend && revenueTrend.months.length > 0 ? (
                    <div>
                      <ResponsiveContainer width="100%" height={120}>
                        <AreaChart data={revenueTrend.months} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#F97316" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#F97316" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                          <YAxis hide />
                          <Tooltip
                            contentStyle={{ borderRadius: "8px", border: "1px solid #E5E7EB", fontSize: "11px" }}
                            formatter={(value: number) => [`৳${bdt.format(Math.round(value))}`, "Revenue"]}
                          />
                          <Area type="monotone" dataKey="revenue" stroke="#F97316" strokeWidth={2} fill="url(#revGradient)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-[120px] flex items-center justify-center text-xs text-gray-400">
                      <div className="text-center">
                        <TrendingUp className="h-6 w-6 mx-auto mb-1 text-gray-300" />
                        <p>No revenue data yet</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Charts & Analytics</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2 shadow-sm border-0 shadow-gray-200/60">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold text-gray-900">Revenue & Production Trend</CardTitle>
                    <Select value={timeRange} onValueChange={setTimeRange}>
                      <SelectTrigger className="w-32 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {trendsLoading ? (
                    <Skeleton className="h-[250px] w-full rounded-lg" />
                  ) : trendData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid #E5E7EB", fontSize: "12px" }} />
                        <Bar dataKey="efficiency" name="Efficiency" fill={COLORS.blue} radius={[4, 4, 0, 0]} />
                        <Bar dataKey="output" name="Output" fill={COLORS.teal} radius={[4, 4, 0, 0]} />
                        <Bar dataKey="target" name="Target" fill={COLORS.amber} radius={[4, 4, 0, 0]} />
                        <Legend verticalAlign="bottom" height={30} iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[250px] flex items-center justify-center text-sm text-gray-400">
                      <div className="text-center">
                        <Activity className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                        <p>No trend data yet.</p>
                        <p className="text-xs mt-1">Start processing transactions to see insights here.</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-sm border-0 shadow-gray-200/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold text-gray-900">Order Status</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {pieData.length > 0 ? (
                    <div>
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={75}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {pieData.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomPieTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center mt-2">
                        {pieData.map((entry, index) => (
                          <div key={entry.name} className="flex items-center gap-1.5 text-xs text-gray-600">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                            <span>{entry.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="h-[250px] flex items-center justify-center text-sm text-gray-400">
                      <div className="text-center">
                        <ShoppingCart className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                        <p>No orders yet.</p>
                        <p className="text-xs mt-1">Create your first order to see the breakdown.</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>

          <section>
            <Card className="shadow-sm border-0 shadow-gray-200/60">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base font-semibold text-gray-900">Global Customer & Export Destinations</CardTitle>
                  </div>
                  {Array.isArray(customerMapData) && customerMapData.length > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {customerMapData.length} {customerMapData.length === 1 ? "country" : "countries"}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {mapMarkers.length > 0 ? (
                  <div className="relative">
                    <WorldMapWithMarkers markers={mapMarkers} maxCount={maxMapCount} />
                    <div className="mt-3 flex flex-wrap gap-2 justify-center">
                      {mapMarkers.slice(0, 8).map((marker) => (
                        <div key={marker.country} className="flex items-center gap-1.5 bg-gray-50 rounded-full px-3 py-1 text-xs text-gray-700">
                          <MapPin className="h-3 w-3 text-primary" />
                          <span className="font-medium">{marker.country}</span>
                          <span className="text-gray-400">·</span>
                          <span>{marker.count}</span>
                        </div>
                      ))}
                      {mapMarkers.length > 8 && (
                        <div className="flex items-center bg-gray-50 rounded-full px-3 py-1 text-xs text-gray-500">
                          +{mapMarkers.length - 8} more
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-sm text-gray-400">
                    <div className="text-center">
                      <Globe className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                      <p>No customer locations yet.</p>
                      <p className="text-xs mt-1">Add customers with countries to see the global map.</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Quick Actions</h2>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
              {quickActions.map((qa) => {
                const Icon = qa.icon;
                return (
                  <PermissionGate key={qa.label} module={qa.module} action={qa.action} showDisabled>
                    <Link href={qa.href}>
                      <Button
                        variant="outline"
                        className="flex items-center gap-2 whitespace-nowrap shrink-0 hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-all bg-white"
                      >
                        <Icon className="h-4 w-4" />
                        {qa.label}
                      </Button>
                    </Link>
                  </PermissionGate>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Intelligence</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2 shadow-sm border-0 shadow-gray-200/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold text-gray-900">Recent Orders</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {ordersLoading ? (
                    <div className="space-y-3">
                      {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                    </div>
                  ) : Array.isArray(recentOrders) && recentOrders.length > 0 ? (
                    <div className="space-y-2">
                      {recentOrders.slice(0, 5).map((order: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors border border-gray-100">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <ShoppingCart className="h-4 w-4 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{order.customerName || `Order #${order.orderId}`}</p>
                              <p className="text-xs text-gray-500">{order.styleName || 'N/A'} · Qty: {bdt.format(order.totalQuantity || 0)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={`text-xs ${
                              order.isAtRisk ? "border-red-200 bg-red-50 text-red-700" : "border-gray-200"
                            }`}>
                              {(order.orderStatus || 'new').replace(/_/g, ' ')}
                            </Badge>
                            {order.totalValue > 0 && (
                              <span className="text-xs font-medium text-gray-700">৳{bdt.format(order.totalValue)}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="h-[200px] flex items-center justify-center text-sm text-gray-400">
                      <div className="text-center">
                        <ShoppingCart className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                        <p>No recent orders.</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-sm border-0 shadow-gray-200/60">
                <Collapsible open={insightsOpen} onOpenChange={setInsightsOpen}>
                  <CardHeader className="pb-3">
                    <CollapsibleTrigger asChild>
                      <button className="flex items-center justify-between w-full text-left">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          <CardTitle className="text-base font-semibold text-gray-900">AI Insights</CardTitle>
                        </div>
                        {insightsOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                      </button>
                    </CollapsibleTrigger>
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className="pt-0 space-y-3">
                      {insightsLoading ? (
                        <div className="space-y-3">
                          {[1, 2, 3].map(i => (
                            <div key={i} className="flex gap-3">
                              <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
                              <div className="flex-1 space-y-1.5">
                                <Skeleton className="h-4 w-3/4" />
                                <Skeleton className="h-3 w-full" />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : insightsError ? (
                        <div className="text-center py-6">
                          <AlertCircle className="h-8 w-8 mx-auto mb-2 text-amber-400" />
                          <p className="text-sm text-gray-500">AI service temporarily unavailable</p>
                          <p className="text-xs text-gray-400 mt-1">Click refresh to try again</p>
                        </div>
                      ) : Array.isArray(aiInsights) && aiInsights.length > 0 ? (
                        aiInsights.slice(0, 4).map((insight: any, idx: number) => {
                          const cfg = insightIconMap[insight.type] || insightIconMap.info;
                          const InsightIcon = cfg.icon;
                          return (
                            <div key={idx} className="flex gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                              <div className={`p-1.5 rounded-lg ${cfg.bg} shrink-0 h-fit`}>
                                <InsightIcon className={`h-4 w-4 ${cfg.color}`} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{insight.title}</p>
                                <p className="text-xs text-gray-500 line-clamp-2">{insight.message}</p>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-center py-6">
                          <Lightbulb className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                          <p className="text-sm text-gray-400">No insights available</p>
                        </div>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-primary hover:text-primary/90 hover:bg-primary/5 mt-2"
                        onClick={() => refetchInsights()}
                        disabled={insightsLoading}
                      >
                        <RefreshCw className={`h-3.5 w-3.5 mr-2 ${insightsLoading ? "animate-spin" : ""}`} />
                        Refresh Insights
                      </Button>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            </div>
          </section>

        </div>
      </main>
    </div>
  );
};

export default Dashboard;
