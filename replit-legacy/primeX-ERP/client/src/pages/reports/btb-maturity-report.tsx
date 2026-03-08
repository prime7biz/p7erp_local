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
import { Download, Printer, FileText, DollarSign, CalendarClock, AlertTriangle } from "lucide-react";

export default function BTBMaturityReport() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data, isLoading } = useQuery<any[]>({
    queryKey: ["/api/btb-lcs"],
  });

  const records = useMemo(() => {
    if (!Array.isArray(data)) return [];
    return data.filter((item: any) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (startDate && item.maturityDate && new Date(item.maturityDate) < new Date(startDate)) return false;
      if (endDate && item.maturityDate && new Date(item.maturityDate) > new Date(endDate)) return false;
      return true;
    });
  }, [data, statusFilter, startDate, endDate]);

  const now = new Date();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const kpis = useMemo(() => {
    const all = Array.isArray(data) ? data : [];
    const totalValue = all.reduce((s: number, r: any) => s + (parseFloat(r.amount || r.value || 0)), 0);
    const maturingThisMonth = all.filter((r: any) => {
      const d = r.maturityDate ? new Date(r.maturityDate) : null;
      return d && d >= monthStart && d <= monthEnd;
    }).length;
    const overdue = all.filter((r: any) => {
      const d = r.maturityDate ? new Date(r.maturityDate) : null;
      return d && d < now && r.status !== "closed" && r.status !== "completed";
    }).length;
    return { total: all.length, totalValue, maturingThisMonth, overdue };
  }, [data]);

  const exportCSV = () => {
    const headers = ["BTB LC Number", "Master LC Ref", "Supplier", "Amount", "Maturity Date", "Margin %", "Status"];
    const rows = records.map((r: any) => [
      r.btbLcNumber || r.lcNumber || "",
      r.masterLcRef || r.masterLcNumber || "",
      r.supplierName || r.supplier || "",
      r.amount || r.value || "",
      r.maturityDate || "",
      r.marginPercent || r.margin || "",
      r.status || "",
    ]);
    const csv = [headers, ...rows].map(r => r.map((c: any) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "btb-maturity-report.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => window.print();

  return (
    <DashboardContainer title="BTB LC Maturity Report">
      <div className="flex flex-col gap-6 print:gap-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">BTB LC Maturity Report</h1>
            <p className="text-muted-foreground">Track back-to-back LC maturity dates and values</p>
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
                  <CardTitle className="text-sm font-medium">Total BTB LCs</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold">{kpis.total}</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Total Value</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold">${kpis.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Maturing This Month</CardTitle>
                  <CalendarClock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold">{kpis.maturingThisMonth}</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Overdue</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold text-destructive">{kpis.overdue}</div></CardContent>
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
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
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
                <FileText className="h-12 w-12 text-gray-300 mb-4" />
                <h3 className="text-lg font-semibold mb-1">No BTB LCs found</h3>
                <p className="text-muted-foreground text-sm">Adjust your filters or check back later.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>BTB LC Number</TableHead>
                    <TableHead>Master LC Ref</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Maturity Date</TableHead>
                    <TableHead className="text-right">Margin %</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((r: any, i: number) => (
                    <TableRow key={r.id || i}>
                      <TableCell className="font-medium">{r.btbLcNumber || r.lcNumber || "-"}</TableCell>
                      <TableCell>{r.masterLcRef || r.masterLcNumber || "-"}</TableCell>
                      <TableCell>{r.supplierName || r.supplier || "-"}</TableCell>
                      <TableCell className="text-right">${parseFloat(r.amount || r.value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell>{r.maturityDate ? new Date(r.maturityDate).toLocaleDateString() : "-"}</TableCell>
                      <TableCell className="text-right">{r.marginPercent || r.margin || "-"}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "active" ? "default" : r.status === "closed" ? "secondary" : "outline"}>
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
