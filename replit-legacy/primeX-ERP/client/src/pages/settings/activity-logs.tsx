import { useState, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Shield,
  Activity,
  Users,
  AlertTriangle,
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
} from "lucide-react";
import { logClientAction } from "@/lib/auditClient";

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-green-100 text-green-800",
  VIEW: "bg-blue-100 text-blue-800",
  UPDATE: "bg-amber-100 text-amber-800",
  DELETE: "bg-red-100 text-red-800",
  APPROVE: "bg-purple-100 text-purple-800",
  EXPORT: "bg-orange-100 text-orange-800",
  LOGIN: "bg-gray-100 text-gray-800",
  LOGOUT: "bg-gray-100 text-gray-600",
  FAILED_LOGIN: "bg-red-100 text-red-800",
  PRINT: "bg-pink-100 text-pink-800",
  POST: "bg-purple-100 text-purple-800",
  CHECK: "bg-indigo-100 text-indigo-800",
  RECOMMEND: "bg-cyan-100 text-cyan-800",
  SUBMIT: "bg-teal-100 text-teal-800",
};

function getActionColor(action: string): string {
  return ACTION_COLORS[action?.toUpperCase()] || "bg-gray-100 text-gray-700";
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function ActivityLogsPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [entityTypeFilter, setEntityTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const pageSize = 50;

  const { data: stats, isLoading: statsLoading } = useQuery<{
    totalEventsToday: number;
    loginCount24h: number;
    failedLogins24h: number;
    mostActiveUsers: { username: string; count: number }[];
  }>({
    queryKey: ["/api/audit/security-stats"],
    refetchInterval: 30000,
  });

  const queryParams = new URLSearchParams();
  queryParams.set("page", String(page));
  queryParams.set("pageSize", String(pageSize));
  if (search) queryParams.set("search", search);
  if (actionFilter !== "all") queryParams.set("action", actionFilter);
  if (entityTypeFilter !== "all") queryParams.set("entityType", entityTypeFilter);
  if (dateFrom) queryParams.set("dateFrom", dateFrom);
  if (dateTo) queryParams.set("dateTo", dateTo);

  const { data: logsData, isLoading: logsLoading } = useQuery<{
    items: any[];
    total: number;
  }>({
    queryKey: ["/api/audit/logs", page, search, actionFilter, entityTypeFilter, dateFrom, dateTo],
    queryFn: async () => {
      const res = await fetch(`/api/audit/logs?${queryParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch logs");
      return res.json();
    },
  });

  const totalPages = Math.ceil((logsData?.total || 0) / pageSize);

  const toggleRow = (id: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExportCsv = () => {
    if (!logsData?.items?.length) return;
    logClientAction("EXPORT", "audit_logs", 0, { format: "csv", recordCount: logsData.items.length });
    
    const headers = ["Date/Time", "User", "Action", "Entity Type", "Entity ID", "IP Address"];
    const rows = logsData.items.map((log: any) => [
      new Date(log.performedAt).toISOString(),
      log.performerUsername || "System",
      log.action,
      log.entityType,
      log.entityId,
      log.ipAddress || "",
    ]);
    const csvContent = [headers, ...rows].map(r => r.map((c: any) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity-logs-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!user?.isSuperUser) {
    return (
      <div className="p-6 text-center">
        <Shield className="h-12 w-12 mx-auto text-gray-400 mb-4" />
        <h2 className="text-lg font-semibold text-gray-700">Access Denied</h2>
        <p className="text-gray-500">Activity logs are only accessible to super users.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Activity Logs</h1>
          <p className="text-sm text-gray-500 mt-1">Complete footprint tracking for all system activities</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={!logsData?.items?.length}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-50">
              <Activity className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Events Today</p>
              {statsLoading ? (
                <Skeleton className="h-6 w-12" />
              ) : (
                <p className="text-xl font-bold">{stats?.totalEventsToday || 0}</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-50">
              <Users className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Logins (24h)</p>
              {statsLoading ? (
                <Skeleton className="h-6 w-12" />
              ) : (
                <p className="text-xl font-bold">{stats?.loginCount24h || 0}</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-50">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Failed Logins (24h)</p>
              {statsLoading ? (
                <Skeleton className="h-6 w-12" />
              ) : (
                <p className="text-xl font-bold text-red-600">{stats?.failedLogins24h || 0}</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-50">
              <Clock className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Most Active</p>
              {statsLoading ? (
                <Skeleton className="h-6 w-20" />
              ) : (
                <p className="text-sm font-medium truncate">
                  {stats?.mostActiveUsers?.[0]?.username || "—"}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-8 h-9"
              />
            </div>
            <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(1); }}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="CREATE">Create</SelectItem>
                <SelectItem value="UPDATE">Update</SelectItem>
                <SelectItem value="DELETE">Delete</SelectItem>
                <SelectItem value="LOGIN">Login</SelectItem>
                <SelectItem value="LOGOUT">Logout</SelectItem>
                <SelectItem value="FAILED_LOGIN">Failed Login</SelectItem>
                <SelectItem value="APPROVE">Approve</SelectItem>
                <SelectItem value="POST">Post</SelectItem>
                <SelectItem value="EXPORT">Export</SelectItem>
                <SelectItem value="PRINT">Print</SelectItem>
                <SelectItem value="VIEW">View</SelectItem>
              </SelectContent>
            </Select>
            <Select value={entityTypeFilter} onValueChange={(v) => { setEntityTypeFilter(v); setPage(1); }}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Entity Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="session">Session</SelectItem>
                <SelectItem value="security">Security</SelectItem>
                <SelectItem value="voucher">Voucher</SelectItem>
                <SelectItem value="order">Order</SelectItem>
                <SelectItem value="quotation">Quotation</SelectItem>
                <SelectItem value="inquiry">Inquiry</SelectItem>
                <SelectItem value="customer">Customer</SelectItem>
                <SelectItem value="item">Item</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="report">Report</SelectItem>
                <SelectItem value="export">Export</SelectItem>
                <SelectItem value="backup">Backup</SelectItem>
                <SelectItem value="audit_logs">Audit Logs</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="h-9"
              placeholder="From Date"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="h-9"
              placeholder="To Date"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {logsLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !logsData?.items?.length ? (
            <div className="p-12 text-center">
              <Eye className="h-10 w-10 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">No activity logs found</p>
              <p className="text-sm text-gray-400 mt-1">Adjust your filters to see more results</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead className="whitespace-nowrap">Date/Time</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity Type</TableHead>
                    <TableHead>Entity ID</TableHead>
                    <TableHead>IP Address</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logsData.items.map((log: any) => {
                    const isExpanded = expandedRows.has(log.id);
                    return (
                      <Fragment key={log.id}>
                        <TableRow
                          className="cursor-pointer hover:bg-gray-50"
                          onClick={() => toggleRow(log.id)}
                        >
                          <TableCell className="px-2">
                            {(log.diffJson || log.oldValues || log.newValues || log.metadata) ? (
                              isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />
                            ) : null}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            <div>{formatDate(log.performedAt)}</div>
                            <div className="text-gray-400">{formatTime(log.performedAt)}</div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {log.performerFirstName
                              ? `${log.performerFirstName} ${log.performerLastName || ""}`
                              : log.performerUsername || "System"}
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-xs font-medium ${getActionColor(log.action)}`} variant="outline">
                              {log.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm capitalize">{log.entityType}</TableCell>
                          <TableCell className="text-sm font-mono text-gray-500">{log.entityId || "—"}</TableCell>
                          <TableCell className="text-xs text-gray-500 font-mono">{log.ipAddress || "—"}</TableCell>
                          <TableCell className="text-xs text-gray-500 max-w-[200px] truncate">
                            {log.metadata ? (
                              typeof log.metadata === 'object' ? (
                                Object.entries(log.metadata)
                                  .filter(([k]) => k !== 'visibility')
                                  .map(([k, v]) => `${k}: ${v}`)
                                  .join(', ')
                              ) : String(log.metadata)
                            ) : "—"}
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow>
                            <TableCell colSpan={8} className="bg-gray-50 p-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                                {log.userAgent && (
                                  <div>
                                    <p className="font-medium text-gray-600 mb-1">User Agent</p>
                                    <p className="text-gray-500 break-all">{log.userAgent}</p>
                                  </div>
                                )}
                                {log.diffJson && (
                                  <div className="md:col-span-2">
                                    <p className="font-medium text-gray-600 mb-1">Changes (Diff)</p>
                                    <div className="bg-white border rounded p-3 overflow-x-auto">
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="text-left text-gray-500">
                                            <th className="pr-4 pb-1">Field</th>
                                            <th className="pr-4 pb-1">From</th>
                                            <th className="pb-1">To</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {Object.entries(log.diffJson as Record<string, any>).map(([field, diff]: [string, any]) => (
                                            <tr key={field} className="border-t">
                                              <td className="pr-4 py-1 font-medium">{field}</td>
                                              <td className="pr-4 py-1 text-red-600">
                                                {diff?.from !== undefined ? JSON.stringify(diff.from) : "—"}
                                              </td>
                                              <td className="py-1 text-green-600">
                                                {diff?.to !== undefined ? JSON.stringify(diff.to) : "—"}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                                {log.oldValues && !log.diffJson && (
                                  <div>
                                    <p className="font-medium text-gray-600 mb-1">Old Values</p>
                                    <pre className="bg-white border rounded p-2 text-xs overflow-x-auto max-h-40">
                                      {JSON.stringify(log.oldValues, null, 2)}
                                    </pre>
                                  </div>
                                )}
                                {log.newValues && !log.diffJson && (
                                  <div>
                                    <p className="font-medium text-gray-600 mb-1">New Values</p>
                                    <pre className="bg-white border rounded p-2 text-xs overflow-x-auto max-h-40">
                                      {JSON.stringify(log.newValues, null, 2)}
                                    </pre>
                                  </div>
                                )}
                                {log.metadata && Object.keys(log.metadata).filter(k => k !== 'visibility').length > 0 && (
                                  <div>
                                    <p className="font-medium text-gray-600 mb-1">Metadata</p>
                                    <pre className="bg-white border rounded p-2 text-xs overflow-x-auto max-h-40">
                                      {JSON.stringify(
                                        Object.fromEntries(Object.entries(log.metadata).filter(([k]) => k !== 'visibility')),
                                        null, 2
                                      )}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {page} of {totalPages} ({logsData?.total || 0} total records)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
