import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/layout/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2,
  CheckCircle,
  Users,
  CreditCard,
  Clock,
  TicketCheck,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { formatMoney } from "@/lib/formatters";

interface AdminMetrics {
  totalTenants: number;
  activeTenants: number;
  totalUsers: number;
  activeSubscriptions: number;
  trialSubscriptions: number;
  openTickets: number;
  monthlyRevenue: number;
  suspendedTenants: number;
}

export default function AdminDashboard() {
  const { data: metrics, isLoading } = useQuery<AdminMetrics>({
    queryKey: ["/api/admin/metrics"],
  });

  const kpiCards = [
    { label: "Total Tenants", value: metrics?.totalTenants ?? 0, icon: Building2, color: "blue", bgColor: "bg-blue-50", textColor: "text-blue-600", borderColor: "border-l-blue-500" },
    { label: "Active Tenants", value: metrics?.activeTenants ?? 0, icon: CheckCircle, color: "green", bgColor: "bg-green-50", textColor: "text-green-600", borderColor: "border-l-green-500" },
    { label: "Total Users", value: metrics?.totalUsers ?? 0, icon: Users, color: "purple", bgColor: "bg-purple-50", textColor: "text-purple-600", borderColor: "border-l-purple-500" },
    { label: "Active Subscriptions", value: metrics?.activeSubscriptions ?? 0, icon: CreditCard, color: "green", bgColor: "bg-green-50", textColor: "text-green-600", borderColor: "border-l-green-500" },
    { label: "Trial Subscriptions", value: metrics?.trialSubscriptions ?? 0, icon: Clock, color: "yellow", bgColor: "bg-yellow-50", textColor: "text-yellow-600", borderColor: "border-l-yellow-500" },
    { label: "Open Tickets", value: metrics?.openTickets ?? 0, icon: TicketCheck, color: "red", bgColor: "bg-red-50", textColor: "text-red-600", borderColor: "border-l-red-500" },
    { label: "Monthly Revenue", value: metrics?.monthlyRevenue ?? 0, icon: TrendingUp, color: "emerald", bgColor: "bg-emerald-50", textColor: "text-emerald-600", borderColor: "border-l-emerald-500", isCurrency: true },
    { label: "Suspended Tenants", value: metrics?.suspendedTenants ?? 0, icon: XCircle, color: "red", bgColor: "bg-red-50", textColor: "text-red-600", borderColor: "border-l-red-500" },
  ];

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-600">Overview of platform metrics and activity</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {kpiCards.map((kpi) => (
            <Card key={kpi.label} className={`border-l-4 ${kpi.borderColor}`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">{kpi.label}</CardTitle>
                <div className={`p-2 rounded-lg ${kpi.bgColor}`}>
                  <kpi.icon className={`h-4 w-4 ${kpi.textColor}`} />
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="text-2xl font-bold text-gray-900">
                    {kpi.isCurrency
                      ? formatMoney(kpi.value / 100)
                      : kpi.value.toLocaleString()}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
