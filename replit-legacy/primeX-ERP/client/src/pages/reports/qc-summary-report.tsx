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
import { Download, Printer, ClipboardCheck, CheckCircle, XCircle, Clock } from "lucide-react";

export default function QCSummaryReport() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data, isLoading } = useQuery<any[]>({
    queryKey: ["/api/quality/inspections"],
    select: (data: any) => Array.isArray(data) ? data : (data?.data ?? []),
  });

  const records = useMemo(() => {
    if (!Array.isArray(data)) return [];
    return data.filter((item: any) => {
      if (statusFilter !== "all" && item.result !== statusFilter && item.status !== statusFilter) return false;
      const d = item.inspectionDate || item.date || item.createdAt;
      if (startDate && d && new Date(d) < new Date(startDate)) return false;
      if (endDate && d && new Date(d) > new Date(endDate)) return false;
      return true;
    });
  }, [data, statusFilter, startDate, endDate]);

  const kpis = useMemo(() => {
    const all = Array.isArray(data) ? data : [];
    const passed = all.filter((r: any) => r.result === "pass" || r.result === "passed").length;
    const passRate = all.length > 0 ? (passed / all.length) * 100 : 0;
    const defectRates = all.map((r: any) => {
      const failQty = parseFloat(r.failQty || r.defectQty || 0);
      const total = parseFloat(r.lotSize || r.sampleSize || 1);
      return total > 0 ? (failQty / total) * 100 : 0;
    });
    const avgDefectRate = defectRates.length > 0 ? defectRates.reduce((a: number, b: number) => a + b, 0) / defectRates.length : 0;
    const pending = all.filter((r: any) => r.status === "pending" || r.result === "pending").length;
    return { total: all.length, passRate, avgDefectRate, pending };
  }, [data]);

  const exportCSV = () => {
    const headers = ["Inspection Number", "Type", "Date", "Lot Size", "Sample Size", "Pass Qty", "Fail Qty", "Result"];
    const rows = records.map((r: any) => [
      r.inspectionNumber || r.id || "",
      r.type || r.inspectionType || "",
      r.inspectionDate || r.date || r.createdAt || "",
      r.lotSize || "",
      r.sampleSize || "",
      r.passQty || r.acceptedQty || "",
      r.failQty || r.defectQty || "",
      r.result || r.status || "",
    ]);
    const csv = [headers, ...rows].map(r => r.map((c: any) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "qc-summary-report.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => window.print();

  return (
    <DashboardContainer title="QC Summary Report">
      <div className="flex flex-col gap-6 print:gap-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">QC Summary Report</h1>
            <p className="text-muted-foreground">Quality control inspection summary and pass/fail analysis</p>
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
                  <CardTitle className="text-sm font-medium">Total Inspections</CardTitle>
                  <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold">{kpis.total}</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Pass Rate</CardTitle>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold text-green-600">{kpis.passRate.toFixed(1)}%</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Avg Defect Rate</CardTitle>
                  <XCircle className="h-4 w-4 text-destructive" />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold text-destructive">{kpis.avgDefectRate.toFixed(2)}%</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Pending</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold">{kpis.pending}</div></CardContent>
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
              <SelectValue placeholder="All Results" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Results</SelectItem>
              <SelectItem value="pass">Pass</SelectItem>
              <SelectItem value="fail">Fail</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
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
                <ClipboardCheck className="h-12 w-12 text-gray-300 mb-4" />
                <h3 className="text-lg font-semibold mb-1">No inspections found</h3>
                <p className="text-muted-foreground text-sm">Adjust your filters or check back later.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Inspection Number</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Lot Size</TableHead>
                    <TableHead className="text-right">Sample Size</TableHead>
                    <TableHead className="text-right">Pass Qty</TableHead>
                    <TableHead className="text-right">Fail Qty</TableHead>
                    <TableHead>Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((r: any, i: number) => (
                    <TableRow key={r.id || i}>
                      <TableCell className="font-medium">{r.inspectionNumber || r.id || "-"}</TableCell>
                      <TableCell>{r.type || r.inspectionType || "-"}</TableCell>
                      <TableCell>{(r.inspectionDate || r.date || r.createdAt) ? new Date(r.inspectionDate || r.date || r.createdAt).toLocaleDateString() : "-"}</TableCell>
                      <TableCell className="text-right">{r.lotSize || "-"}</TableCell>
                      <TableCell className="text-right">{r.sampleSize || "-"}</TableCell>
                      <TableCell className="text-right">{r.passQty || r.acceptedQty || 0}</TableCell>
                      <TableCell className="text-right">{r.failQty || r.defectQty || 0}</TableCell>
                      <TableCell>
                        <Badge variant={
                          (r.result === "pass" || r.result === "passed") ? "default" :
                          (r.result === "fail" || r.result === "failed") ? "destructive" : "outline"
                        }>
                          {r.result || r.status || "N/A"}
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
