import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/layout/admin-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield } from "lucide-react";

interface AuditLog {
  id: number;
  adminName: string;
  action: string;
  entity: string;
  entityId: number | null;
  tenantName: string | null;
  ipAddress: string;
  details: string | null;
  createdAt: string;
}

export default function AdminAuditLogs() {
  const [actionFilter, setActionFilter] = useState("all");

  const { data: logs, isLoading } = useQuery<AuditLog[]>({
    queryKey: ["/api/admin/audit-logs", { limit: 200 }],
  });

  const actions = Array.from(new Set(logs?.map((l) => l.action) ?? []));

  const filtered = logs?.filter((l) =>
    actionFilter === "all" ? true : l.action === actionFilter
  ) ?? [];

  const actionColors: Record<string, string> = {
    create: "bg-green-100 text-green-700",
    update: "bg-blue-100 text-blue-700",
    delete: "bg-red-100 text-red-700",
    login: "bg-purple-100 text-purple-700",
    logout: "bg-gray-100 text-gray-600",
    suspend: "bg-orange-100 text-orange-700",
    activate: "bg-emerald-100 text-emerald-700",
  };

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
            <p className="text-gray-600">System activity and admin action history</p>
          </div>
          <div className="w-48">
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {actions.map((action) => (
                  <SelectItem key={action} value={action}>{action}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-4">
                {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date/Time</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>IP Address</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                        <Shield className="mx-auto h-8 w-8 mb-2 text-gray-300" />
                        No audit logs found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-sm text-gray-600 whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="font-medium">{log.adminName}</TableCell>
                        <TableCell>
                          <Badge className={`${actionColors[log.action] || "bg-gray-100 text-gray-600"} hover:opacity-80`}>
                            {log.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-gray-600">
                          {log.entity}{log.entityId ? ` #${log.entityId}` : ""}
                        </TableCell>
                        <TableCell className="text-gray-600">{log.tenantName || "—"}</TableCell>
                        <TableCell className="text-gray-500 font-mono text-sm">{log.ipAddress}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
