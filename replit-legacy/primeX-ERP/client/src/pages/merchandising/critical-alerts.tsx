import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  ExternalLink,
  Clock,
  Package,
  FileText,
  Truck,
  Calendar,
  Filter,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { useState, useMemo } from "react";

interface CriticalAlert {
  id: string;
  severity: "critical" | "warning" | "info";
  category: string;
  title: string;
  description: string;
  link: string;
  assignedTo: string | null;
  daysOverdue: number;
  createdAt: string;
}

interface AlertsResponse {
  alerts: CriticalAlert[];
  summary: {
    critical: number;
    warning: number;
    info: number;
    total: number;
  };
}

const severityConfig = {
  critical: {
    icon: AlertCircle,
    color: "text-red-600",
    bg: "bg-red-50 border-red-200",
    badge: "bg-red-100 text-red-800 border-red-300",
    label: "Critical",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-amber-600",
    bg: "bg-amber-50 border-amber-200",
    badge: "bg-amber-100 text-amber-800 border-amber-300",
    label: "Warning",
  },
  info: {
    icon: Info,
    color: "text-blue-600",
    bg: "bg-blue-50 border-blue-200",
    badge: "bg-blue-100 text-blue-800 border-blue-300",
    label: "Info",
  },
};

const categoryIcons: Record<string, any> = {
  "TNA Milestone": Calendar,
  "Time & Action": Clock,
  "Sample Approval": FileText,
  "LC Expiry": ShieldAlert,
  "Order at Risk": Package,
  "Material Delay": Truck,
};

export default function CriticalAlertsPage() {
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading, refetch, isFetching } = useQuery<{ success: boolean; data: AlertsResponse }>({
    queryKey: ["/api/merch/critical-alerts"],
    refetchInterval: 60000,
  });

  const alerts = data?.data?.alerts || [];
  const summary = data?.data?.summary || { critical: 0, warning: 0, info: 0, total: 0 };

  const categories = useMemo(() => {
    const cats = new Set(alerts.map((a) => a.category));
    return Array.from(cats).sort();
  }, [alerts]);

  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      if (severityFilter !== "all" && alert.severity !== severityFilter) return false;
      if (categoryFilter !== "all" && alert.category !== categoryFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          alert.title.toLowerCase().includes(q) ||
          alert.description.toLowerCase().includes(q) ||
          alert.category.toLowerCase().includes(q) ||
          (alert.assignedTo && alert.assignedTo.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [alerts, severityFilter, categoryFilter, searchQuery]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
            Critical Alerts
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Aggregated alerts across TNA, samples, orders, LCs, and materials
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-700">{summary.critical}</p>
              <p className="text-xs text-red-600">Critical</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-700">{summary.warning}</p>
              <p className="text-xs text-amber-600">Warnings</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
              <Info className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-700">{summary.info}</p>
              <p className="text-xs text-blue-600">Info</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <Input
            placeholder="Search alerts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full"
          />
        </div>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {filteredAlerts.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <ShieldAlert className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">No Alerts</h3>
              <p className="text-sm text-gray-500 mt-1">
                {summary.total === 0
                  ? "Everything looks good! No critical alerts at this time."
                  : "No alerts match the current filters."}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredAlerts.map((alert) => {
            const config = severityConfig[alert.severity];
            const SeverityIcon = config.icon;
            const CategoryIcon = categoryIcons[alert.category] || AlertTriangle;

            return (
              <Card key={alert.id} className={`border ${config.bg}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <SeverityIcon className={`h-5 w-5 ${config.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Badge variant="outline" className={`text-[10px] ${config.badge}`}>
                          {config.label}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] flex items-center gap-1">
                          <CategoryIcon className="h-3 w-3" />
                          {alert.category}
                        </Badge>
                        {alert.assignedTo && (
                          <span className="text-xs text-gray-500">
                            → {alert.assignedTo}
                          </span>
                        )}
                      </div>
                      <h4 className="font-medium text-sm text-gray-900 truncate">
                        {alert.title}
                      </h4>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {alert.description}
                      </p>
                    </div>
                    <div className="flex-shrink-0">
                      <Link href={alert.link}>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {filteredAlerts.length > 0 && (
        <p className="text-xs text-gray-400 text-center">
          Showing {filteredAlerts.length} of {summary.total} total alerts
        </p>
      )}
    </div>
  );
}
