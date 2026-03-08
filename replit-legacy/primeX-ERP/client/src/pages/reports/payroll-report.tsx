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
import { Download, Printer, DollarSign, Users, FileText, TrendingUp, ChevronDown, ChevronRight } from "lucide-react";

function formatCurrency(val: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(val || 0);
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function PayrollReport() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const { data: runs, isLoading } = useQuery<any[]>({
    queryKey: ["/api/payroll/runs"],
  });

  const runsList = useMemo(() => {
    if (!runs) return [];
    return Array.isArray(runs) ? runs : (runs as any)?.data || [];
  }, [runs]);

  const filtered = useMemo(() => {
    if (!runsList.length) return [];
    return runsList.filter((r: any) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (startDate && new Date(r.payrollMonth || r.createdAt) < new Date(startDate)) return false;
      if (endDate && new Date(r.payrollMonth || r.createdAt) > new Date(endDate)) return false;
      return true;
    });
  }, [runs, statusFilter, startDate, endDate]);

  const kpis = useMemo(() => {
    const totalRuns = filtered.length;
    const totalGross = filtered.reduce((s: number, r: any) => s + (Number(r.totalGross) || 0), 0);
    const totalNet = filtered.reduce((s: number, r: any) => s + (Number(r.totalNet) || 0), 0);
    const avgSalary = totalRuns > 0 ? totalNet / totalRuns : 0;
    return { totalRuns, totalGross, totalNet, avgSalary };
  }, [filtered]);

  const toggleRow = (id: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const getRunPayslips = (_runId: number) => {
    return [];
  };

  const exportCSV = () => {
    const headers = ["Payroll Month", "Employee Count", "Total Gross", "Total Deductions", "Total Net", "Status"];
    const rows = filtered.map((r: any) => [
      r.payrollMonth || r.month || "—",
      r.employeeCount || 0,
      r.totalGross || 0,
      r.totalDeductions || 0,
      r.totalNet || 0,
      r.status || "—",
    ]);
    const csv = [headers, ...rows].map(row => row.map((c: any) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "payroll-report.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => window.print();

  const statusBadge = (status: string) => {
    const variants: Record<string, string> = { completed: "default", processing: "secondary", draft: "outline", approved: "default" };
    return <Badge variant={(variants[status] as any) || "outline"}>{status || "—"}</Badge>;
  };

  return (
    <DashboardContainer title="Payroll Report">
      <div className="space-y-6 print:space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Payroll Report</h1>
            <p className="text-muted-foreground">Analyze payroll runs, gross & net pay across periods</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportCSV} className="print:hidden">
              <Download className="mr-2 h-4 w-4" />CSV Export
            </Button>
            <Button variant="outline" onClick={handlePrint} className="print:hidden">
              <Printer className="mr-2 h-4 w-4" />Print
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 print:hidden">
          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-44" placeholder="Start Date" />
          <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-44" placeholder="End Date" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-lg" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Runs</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{kpis.totalRuns}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Gross Pay</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{formatCurrency(kpis.totalGross)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Net Pay</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{formatCurrency(kpis.totalNet)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Avg Salary</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{formatCurrency(kpis.avgSalary)}</div></CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <FileText className="h-12 w-12 text-gray-300 mb-4" />
                <h3 className="text-lg font-semibold mb-1">No payroll runs found</h3>
                <p className="text-muted-foreground text-sm">Adjust your filters or create a payroll run first.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Payroll Month</TableHead>
                    <TableHead>Employee Count</TableHead>
                    <TableHead>Total Gross</TableHead>
                    <TableHead>Total Deductions</TableHead>
                    <TableHead>Total Net</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r: any) => {
                    const isExpanded = expandedRows.has(r.id);
                    const slips = getRunPayslips(r.id);
                    return (
                      <>
                        <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => toggleRow(r.id)}>
                          <TableCell>{isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                          <TableCell className="font-medium">{r.payrollMonth || r.month || formatDate(r.createdAt)}</TableCell>
                          <TableCell>{r.employeeCount || slips.length || 0}</TableCell>
                          <TableCell>{formatCurrency(Number(r.totalGross) || 0)}</TableCell>
                          <TableCell>{formatCurrency(Number(r.totalDeductions) || 0)}</TableCell>
                          <TableCell>{formatCurrency(Number(r.totalNet) || 0)}</TableCell>
                          <TableCell>{statusBadge(r.status)}</TableCell>
                        </TableRow>
                        {isExpanded && slips.length > 0 && (
                          <TableRow key={`${r.id}-expanded`}>
                            <TableCell colSpan={7} className="bg-muted/30 p-0">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Employee</TableHead>
                                    <TableHead>Basic Salary</TableHead>
                                    <TableHead>Allowances</TableHead>
                                    <TableHead>Deductions</TableHead>
                                    <TableHead>Net Pay</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {slips.map((s: any, idx: number) => (
                                    <TableRow key={s.id || idx}>
                                      <TableCell>{s.employeeName || s.employee?.name || `Employee #${s.employeeId}`}</TableCell>
                                      <TableCell>{formatCurrency(Number(s.basicSalary) || 0)}</TableCell>
                                      <TableCell>{formatCurrency(Number(s.totalAllowances) || 0)}</TableCell>
                                      <TableCell>{formatCurrency(Number(s.totalDeductions) || 0)}</TableCell>
                                      <TableCell>{formatCurrency(Number(s.netPay) || 0)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </TableCell>
                          </TableRow>
                        )}
                        {isExpanded && slips.length === 0 && (
                          <TableRow key={`${r.id}-empty`}>
                            <TableCell colSpan={7} className="text-center text-muted-foreground py-4 bg-muted/30">
                              No payslips found for this run.
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardContainer>
  );
}