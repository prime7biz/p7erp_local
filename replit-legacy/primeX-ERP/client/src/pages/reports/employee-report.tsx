import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Download, Printer, Users, Building2, UserCheck, BarChart3 } from "lucide-react";

export default function EmployeeReport() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");

  const { data, isLoading } = useQuery<any[]>({
    queryKey: ["/api/hr/employees"],
  });

  const departments = useMemo(() => {
    if (!Array.isArray(data)) return [];
    const depts = new Set(data.map((e: any) => e.department || e.departmentName).filter(Boolean));
    return Array.from(depts).sort() as string[];
  }, [data]);

  const records = useMemo(() => {
    if (!Array.isArray(data)) return [];
    return data.filter((item: any) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (deptFilter !== "all" && (item.department || item.departmentName) !== deptFilter) return false;
      const d = item.joinDate || item.joiningDate || item.createdAt;
      if (startDate && d && new Date(d) < new Date(startDate)) return false;
      if (endDate && d && new Date(d) > new Date(endDate)) return false;
      return true;
    });
  }, [data, statusFilter, deptFilter, startDate, endDate]);

  const kpis = useMemo(() => {
    const all = Array.isArray(data) ? data : [];
    const active = all.filter((e: any) => e.status === "active").length;
    const deptBreakdown: Record<string, number> = {};
    all.forEach((e: any) => {
      const dept = e.department || e.departmentName || "Unassigned";
      deptBreakdown[dept] = (deptBreakdown[dept] || 0) + 1;
    });
    const topDepts = Object.entries(deptBreakdown).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return { total: all.length, active, deptCount: Object.keys(deptBreakdown).length, topDepts };
  }, [data]);

  const exportCSV = () => {
    const headers = ["Employee ID", "Name", "Department", "Designation", "Join Date", "Status"];
    const rows = records.map((r: any) => [
      r.employeeId || r.empId || r.id || "",
      r.name || `${r.firstName || ""} ${r.lastName || ""}`.trim() || "",
      r.department || r.departmentName || "",
      r.designation || r.position || r.jobTitle || "",
      r.joinDate || r.joiningDate || "",
      r.status || "",
    ]);
    const csv = [headers, ...rows].map(r => r.map((c: any) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "employee-report.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => window.print();

  return (
    <DashboardContainer title="Employee Report">
      <div className="flex flex-col gap-6 print:gap-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Employee Report</h1>
            <p className="text-muted-foreground">Employee directory with department breakdown and status</p>
          </div>
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}><CardContent className="pt-6"><Skeleton className="h-8 w-20 mb-2" /><Skeleton className="h-4 w-32" /></CardContent></Card>
            ))
          ) : (
            <>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold">{kpis.total}</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Active Employees</CardTitle>
                  <UserCheck className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold text-green-600">{kpis.active}</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Departments</CardTitle>
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold">{kpis.deptCount}</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Top Departments</CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {kpis.topDepts.map(([dept, count]) => (
                      <div key={dept} className="flex justify-between text-sm">
                        <span className="truncate text-muted-foreground">{dept}</span>
                        <span className="font-medium">{count}</span>
                      </div>
                    ))}
                    {kpis.topDepts.length === 0 && <span className="text-sm text-muted-foreground">No data</span>}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <div className="flex flex-col md:flex-row gap-4 print:hidden">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium whitespace-nowrap">From:</label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-auto" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium whitespace-nowrap">To:</label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-auto" />
          </div>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="on_leave">On Leave</SelectItem>
              <SelectItem value="terminated">Terminated</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : records.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Users className="h-12 w-12 text-gray-300 mb-4" />
                <h3 className="text-lg font-semibold mb-1">No employees found</h3>
                <p className="text-muted-foreground text-sm">Adjust your filters or check back later.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead>Join Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((r: any, i: number) => (
                    <TableRow key={r.id || i}>
                      <TableCell className="font-medium">{r.employeeId || r.empId || r.id || "-"}</TableCell>
                      <TableCell>{r.name || `${r.firstName || ""} ${r.lastName || ""}`.trim() || "-"}</TableCell>
                      <TableCell>{r.department || r.departmentName || "-"}</TableCell>
                      <TableCell>{r.designation || r.position || r.jobTitle || "-"}</TableCell>
                      <TableCell>{(r.joinDate || r.joiningDate) ? new Date(r.joinDate || r.joiningDate).toLocaleDateString() : "-"}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "active" ? "default" : r.status === "inactive" ? "secondary" : "outline"}>
                          {r.status || "N/A"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardContainer>
  );
}
