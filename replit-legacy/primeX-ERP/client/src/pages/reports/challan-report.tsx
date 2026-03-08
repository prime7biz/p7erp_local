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
import { Download, Printer, FileText, Calendar, Clock, CheckCircle } from "lucide-react";

function formatCurrency(val: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(val || 0);
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function ChallanReport() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: challans, isLoading } = useQuery({
    queryKey: ["/api/delivery-challans"],
    select: (data: any) => Array.isArray(data) ? data : (data?.challans ?? []),
  });

  const filtered = useMemo(() => {
    if (!challans) return [];
    return challans.filter((c: any) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      const dt = c.date || c.challanDate || c.createdAt;
      if (startDate && dt && new Date(dt) < new Date(startDate)) return false;
      if (endDate && dt && new Date(dt) > new Date(endDate)) return false;
      return true;
    });
  }, [challans, statusFilter, startDate, endDate]);

  const kpis = useMemo(() => {
    const total = filtered.length;
    const now = new Date();
    const thisMonth = filtered.filter((c: any) => {
      const dt = new Date(c.date || c.challanDate || c.createdAt);
      return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
    }).length;
    const pending = filtered.filter((c: any) => c.status === "pending" || c.status === "draft").length;
    const completed = filtered.filter((c: any) => c.status === "completed" || c.status === "delivered").length;
    return { total, thisMonth, pending, completed };
  }, [filtered]);

  const exportCSV = () => {
    const headers = ["Challan Number", "Party", "Warehouse", "Date", "Items", "Total Value", "Status"];
    const rows = filtered.map((c: any) => [
      c.challanNumber || c.number || `DC-${c.id}`,
      c.partyName || c.party?.name || "—",
      c.warehouseName || c.warehouse?.name || "—",
      formatDate(c.date || c.challanDate || c.createdAt),
      c.itemsCount || (c.items ? c.items.length : 0),
      c.totalValue || c.totalAmount || 0,
      c.status || "—",
    ]);
    const csv = [headers, ...rows].map(row => row.map((v: any) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "challan-report.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => window.print();

  const statusBadge = (status: string) => {
    const map: Record<string, any> = { completed: "default", delivered: "default", pending: "outline", draft: "outline", cancelled: "destructive" };
    return <Badge variant={map[status] || "outline"}>{status || "—"}</Badge>;
  };

  return (
    <DashboardContainer title="Challan Report">
      <div className="space-y-6 print:space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Delivery Challan Report</h1>
            <p className="text-muted-foreground">Overview of delivery challans, values, and completion status</p>
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
          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-44" />
          <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-44" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
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
                <CardTitle className="text-sm font-medium">Total Challans</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{kpis.total}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">This Month</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{kpis.thisMonth}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Pending</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{kpis.pending}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Completed</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{kpis.completed}</div></CardContent>
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
                <h3 className="text-lg font-semibold mb-1">No delivery challans found</h3>
                <p className="text-muted-foreground text-sm">Adjust your filters or create a delivery challan first.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Challan Number</TableHead>
                    <TableHead>Party</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Total Value</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.challanNumber || c.number || `DC-${c.id}`}</TableCell>
                      <TableCell>{c.partyName || c.party?.name || "—"}</TableCell>
                      <TableCell>{c.warehouseName || c.warehouse?.name || "—"}</TableCell>
                      <TableCell>{formatDate(c.date || c.challanDate || c.createdAt)}</TableCell>
                      <TableCell>{c.itemsCount || (c.items ? c.items.length : 0)}</TableCell>
                      <TableCell>{formatCurrency(Number(c.totalValue) || Number(c.totalAmount) || 0)}</TableCell>
                      <TableCell>{statusBadge(c.status)}</TableCell>
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