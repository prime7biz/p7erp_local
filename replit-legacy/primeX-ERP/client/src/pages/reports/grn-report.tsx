import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Printer, FileText, DollarSign, CalendarDays, ClipboardCheck } from "lucide-react";

export default function GRNReport() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<any[]>({
    queryKey: ["/api/grn"],
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((grn: any) => {
      if (statusFilter !== "all" && grn.status !== statusFilter) return false;
      if (startDate && new Date(grn.date || grn.receivedDate || grn.createdAt) < new Date(startDate)) return false;
      if (endDate && new Date(grn.date || grn.receivedDate || grn.createdAt) > new Date(endDate)) return false;
      if (search) {
        const q = search.toLowerCase();
        const match =
          (grn.grnNumber || grn.number || "").toLowerCase().includes(q) ||
          (grn.vendorName || grn.vendor || "").toLowerCase().includes(q) ||
          (grn.poNumber || grn.poReference || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [data, statusFilter, startDate, endDate, search]);

  const kpis = useMemo(() => {
    const totalGRNs = filtered.length;
    const totalValue = filtered.reduce((s: number, g: any) => s + (Number(g.totalValue || g.totalAmount || g.amount || 0)), 0);
    const now = new Date();
    const thisMonth = filtered.filter((g: any) => {
      const d = new Date(g.date || g.receivedDate || g.createdAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    return { totalGRNs, totalValue, thisMonth };
  }, [filtered]);

  const exportCSV = () => {
    const headers = ["GRN Number", "PO Reference", "Vendor", "Date", "Total Value", "Status"];
    const rows = filtered.map((g: any) => [
      g.grnNumber || g.number || "",
      g.poNumber || g.poReference || "",
      g.vendorName || g.vendor || "",
      g.date || g.receivedDate || g.createdAt || "",
      g.totalValue || g.totalAmount || g.amount || 0,
      g.status || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c: any) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "grn-report.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => window.print();

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = { completed: "default", pending: "secondary", partial: "outline", draft: "secondary" };
    return <Badge variant={(map[status] || "outline") as any}>{status}</Badge>;
  };

  return (
    <div className="p-6 space-y-6 print:p-2">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">GRN Report</h1>
          <p className="text-muted-foreground">Goods Received Notes analysis and tracking</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4 mr-2" />Export CSV</Button>
          <Button variant="outline" size="sm" onClick={handlePrint}><Printer className="h-4 w-4 mr-2" />Print</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 print:hidden">
        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
        <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
        <Input placeholder="Search GRN#, PO#, or Vendor..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (<Card key={i}><CardContent className="p-6"><Skeleton className="h-8 w-24 mb-2" /><Skeleton className="h-6 w-16" /></CardContent></Card>))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><ClipboardCheck className="h-4 w-4" />Total GRNs</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{kpis.totalGRNs}</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><DollarSign className="h-4 w-4" />Total Value</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">${kpis.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><CalendarDays className="h-4 w-4" />This Month</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{kpis.thisMonth}</p></CardContent></Card>
        </div>
      )}

      {isLoading ? (
        <Card><CardContent className="p-6 space-y-3">{[1, 2, 3, 4, 5].map((i) => (<Skeleton key={i} className="h-10 w-full" />))}</CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center justify-center py-16"><FileText className="h-16 w-16 text-gray-300 mb-4" /><h3 className="text-lg font-semibold mb-1">No GRNs found</h3><p className="text-muted-foreground text-center">Try adjusting your filters or date range.</p></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>GRN Number</TableHead>
                  <TableHead>PO Reference</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Total Value</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((g: any, idx: number) => (
                  <TableRow key={g.id || idx}>
                    <TableCell className="font-medium">{g.grnNumber || g.number || "-"}</TableCell>
                    <TableCell>{g.poNumber || g.poReference || "-"}</TableCell>
                    <TableCell>{g.vendorName || g.vendor || "-"}</TableCell>
                    <TableCell>{g.date || g.receivedDate || g.createdAt ? new Date(g.date || g.receivedDate || g.createdAt).toLocaleDateString() : "-"}</TableCell>
                    <TableCell className="text-right">${Number(g.totalValue || g.totalAmount || g.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell>{getStatusBadge(g.status || "unknown")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}