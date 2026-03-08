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
import { Download, Printer, Factory, TrendingUp, Package, AlertTriangle } from "lucide-react";

export default function ProductionEfficiencyReport() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data, isLoading } = useQuery<any[]>({
    queryKey: ["/api/production/orders"],
  });

  const records = useMemo(() => {
    if (!Array.isArray(data)) return [];
    return data.filter((item: any) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      const d = item.createdAt || item.date || item.orderDate;
      if (startDate && d && new Date(d) < new Date(startDate)) return false;
      if (endDate && d && new Date(d) > new Date(endDate)) return false;
      return true;
    });
  }, [data, statusFilter, startDate, endDate]);

  const calcEfficiency = (planned: number, actual: number) => {
    if (!planned || planned === 0) return 0;
    return (actual / planned) * 100;
  };

  const kpis = useMemo(() => {
    const all = Array.isArray(data) ? data : [];
    const totalOutput = all.reduce((s: number, r: any) => s + (parseFloat(r.actualQty || r.completedQty || 0)), 0);
    const efficiencies = all
      .map((r: any) => calcEfficiency(parseFloat(r.plannedQty || r.targetQty || 0), parseFloat(r.actualQty || r.completedQty || 0)))
      .filter((e: number) => e > 0);
    const avgEfficiency = efficiencies.length > 0 ? efficiencies.reduce((a: number, b: number) => a + b, 0) / efficiencies.length : 0;
    const totalDefects = all.reduce((s: number, r: any) => s + (parseFloat(r.defectQty || r.rejectedQty || 0)), 0);
    const defectRate = totalOutput > 0 ? (totalDefects / totalOutput) * 100 : 0;
    return { total: all.length, avgEfficiency, totalOutput, defectRate };
  }, [data]);

  const exportCSV = () => {
    const headers = ["Order Number", "Style", "Planned Qty", "Actual Qty", "Efficiency %", "Status"];
    const rows = records.map((r: any) => {
      const planned = parseFloat(r.plannedQty || r.targetQty || 0);
      const actual = parseFloat(r.actualQty || r.completedQty || 0);
      return [
        r.orderNumber || r.productionOrderNumber || "",
        r.styleName || r.style || "",
        planned,
        actual,
        calcEfficiency(planned, actual).toFixed(1),
        r.status || "",
      ];
    });
    const csv = [headers, ...rows].map(r => r.map((c: any) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "production-efficiency-report.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => window.print();

  return (
    <DashboardContainer title="Production Efficiency Report">
      <div className="flex flex-col gap-6 print:gap-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Production Efficiency Report</h1>
            <p className="text-muted-foreground">Analyze production order efficiency and output metrics</p>
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
                  <CardTitle className="text-sm font-medium">Total Production Orders</CardTitle>
                  <Factory className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold">{kpis.total}</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Avg Efficiency</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold">{kpis.avgEfficiency.toFixed(1)}%</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Total Output</CardTitle>
                  <Package className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold">{kpis.totalOutput.toLocaleString()}</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Defect Rate</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold text-destructive">{kpis.defectRate.toFixed(2)}%</div></CardContent>
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
              <SelectItem value="planned">Planned</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
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
                <Factory className="h-12 w-12 text-gray-300 mb-4" />
                <h3 className="text-lg font-semibold mb-1">No production orders found</h3>
                <p className="text-muted-foreground text-sm">Adjust your filters or check back later.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order Number</TableHead>
                    <TableHead>Style</TableHead>
                    <TableHead className="text-right">Planned Qty</TableHead>
                    <TableHead className="text-right">Actual Qty</TableHead>
                    <TableHead className="text-right">Efficiency %</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((r: any, i: number) => {
                    const planned = parseFloat(r.plannedQty || r.targetQty || 0);
                    const actual = parseFloat(r.actualQty || r.completedQty || 0);
                    const eff = calcEfficiency(planned, actual);
                    return (
                      <TableRow key={r.id || i}>
                        <TableCell className="font-medium">{r.orderNumber || r.productionOrderNumber || "-"}</TableCell>
                        <TableCell>{r.styleName || r.style || "-"}</TableCell>
                        <TableCell className="text-right">{planned.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{actual.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={eff >= 90 ? "default" : eff >= 70 ? "secondary" : "destructive"}>
                            {eff.toFixed(1)}%
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={r.status === "completed" ? "default" : r.status === "in_progress" ? "secondary" : "outline"}>
                            {r.status || "N/A"}
                          </Badge>
                        </TableCell>
                      </TableRow>
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
