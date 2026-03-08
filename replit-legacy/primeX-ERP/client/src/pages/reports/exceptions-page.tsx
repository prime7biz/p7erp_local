import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, AlertCircle, Info, CheckCircle, Shield, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const severityConfig: Record<string, { color: string; bg: string; border: string; icon: any; iconBg: string; iconColor: string }> = {
  CRITICAL: { color: "text-red-700", bg: "bg-red-50", border: "border-red-200", icon: AlertCircle, iconBg: "bg-red-100", iconColor: "text-red-600" },
  HIGH: { color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", icon: AlertTriangle, iconBg: "bg-orange-100", iconColor: "text-orange-600" },
  MEDIUM: { color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", icon: Info, iconBg: "bg-amber-100", iconColor: "text-amber-600" },
  LOW: { color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", icon: Shield, iconBg: "bg-blue-100", iconColor: "text-blue-600" },
};

export default function ExceptionsPage() {
  const [severityFilter, setSeverityFilter] = useState("all");
  const { toast } = useToast();

  const { data: exceptions, isLoading: exceptionsLoading } = useQuery<any[]>({
    queryKey: ["/api/exceptions/scan"],
    select: (data: any) => Array.isArray(data) ? data : (data?.exceptions ?? []),
  });

  const { data: summary, isLoading: summaryLoading } = useQuery<any>({
    queryKey: ["/api/exceptions/summary"],
    select: (data: any) => {
      const arr = Array.isArray(data) ? data : (data?.summary ?? data);
      if (Array.isArray(arr)) {
        return arr.reduce((acc: any, item: any) => {
          const sev = (item.severity || "").toUpperCase();
          acc[sev] = (acc[sev] || 0) + (item.count || 0);
          return acc;
        }, {});
      }
      return arr;
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (id: number | string) => {
      await apiRequest(`/api/exceptions/${id}/acknowledge`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exceptions/scan"] });
      queryClient.invalidateQueries({ queryKey: ["/api/exceptions/summary"] });
      toast({ title: "Exception acknowledged", description: "The exception has been marked as acknowledged." });
    },
    onError: () => {
      toast({ title: "Failed to acknowledge", description: "Could not acknowledge the exception.", variant: "destructive" });
    },
  });

  const summaryCards = [
    { label: "Critical", key: "CRITICAL", count: summary?.critical ?? summary?.CRITICAL ?? 0 },
    { label: "High", key: "HIGH", count: summary?.high ?? summary?.HIGH ?? 0 },
    { label: "Medium", key: "MEDIUM", count: summary?.medium ?? summary?.MEDIUM ?? 0 },
    { label: "Low", key: "LOW", count: summary?.low ?? summary?.LOW ?? 0 },
  ];

  const filteredExceptions = (exceptions || []).filter((e: any) =>
    severityFilter === "all" ? true : (e.severity || "").toUpperCase() === severityFilter
  );

  return (
    <DashboardContainer title="Exceptions & Alerts" subtitle="Monitor detected ERP exceptions and anomalies">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {summaryCards.map((card) => {
            const cfg = severityConfig[card.key];
            const Icon = cfg.icon;
            return (
              <Card key={card.key} className="shadow-sm border-0 shadow-gray-200/60">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className={`p-2.5 rounded-xl ${cfg.iconBg}`}>
                      <Icon className={`h-5 w-5 ${cfg.iconColor}`} />
                    </div>
                  </div>
                  {summaryLoading ? (
                    <Skeleton className="h-9 w-16 mb-1" />
                  ) : (
                    <p className="text-3xl font-bold text-gray-900">{card.count}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">{card.label} Exceptions</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Exception Details</h3>
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue placeholder="Filter by severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severities</SelectItem>
              <SelectItem value="CRITICAL">Critical</SelectItem>
              <SelectItem value="HIGH">High</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="LOW">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {exceptionsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </div>
        ) : filteredExceptions.length > 0 ? (
          <Card className="shadow-sm border-0 shadow-gray-200/60">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead className="hidden md:table-cell">Description</TableHead>
                    <TableHead className="hidden lg:table-cell">Entity</TableHead>
                    <TableHead>Detected At</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExceptions.map((exc: any, idx: number) => {
                    const sev = (exc.severity || "MEDIUM").toUpperCase();
                    const cfg = severityConfig[sev] || severityConfig.MEDIUM;
                    return (
                      <TableRow key={exc.id || idx}>
                        <TableCell className="font-medium text-sm">{exc.type || exc.exceptionType || "-"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`${cfg.bg} ${cfg.color} ${cfg.border}`}>{sev}</Badge>
                        </TableCell>
                        <TableCell className="font-medium">{exc.title || "-"}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-gray-500 max-w-xs truncate">{exc.description || exc.message || "-"}</TableCell>
                        <TableCell className="hidden lg:table-cell text-sm">{exc.entity || exc.entityType || "-"}</TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {exc.detectedAt || exc.createdAt ? new Date(exc.detectedAt || exc.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-"}
                        </TableCell>
                        <TableCell className="text-center">
                          {exc.acknowledged ? (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                              <CheckCircle className="h-3 w-3 mr-1" />Done
                            </Badge>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => acknowledgeMutation.mutate(exc.id)}
                              disabled={acknowledgeMutation.isPending}
                              className="h-7 text-xs"
                            >
                              {acknowledgeMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                              Acknowledge
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <CheckCircle className="h-10 w-10 mb-3 text-emerald-400" />
            <p className="text-sm font-medium text-gray-600">No exceptions found</p>
            <p className="text-xs text-gray-400 mt-1">All systems are operating normally</p>
          </div>
        )}
      </div>
    </DashboardContainer>
  );
}
