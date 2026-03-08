import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Printer, FileText, ShoppingCart, Clock, CheckCircle, Package } from "lucide-react";

export default function PurchaseOrderReport() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<any[]>({
    queryKey: ["/api/purchase-orders"],
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((po: any) => {
      if (statusFilter !== "all" && po.status !== statusFilter) return false;
      if (startDate && new Date(po.date || po.createdAt) < new Date(startDate)) return false;
      if (endDate && new Date(po.date || po.createdAt) > new Date(endDate)) return false;
      if (search) {
        const q = search.toLowerCase();
        const match =
          (po.poNumber || po.number || "").toLowerCase().includes(q) ||
          (po.vendorName || po.vendor || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [data, statusFilter, startDate, endDate, search]);

  const kpis = useMemo(() => {
    const totalPOs = filtered.length;
    const totalValue = filtered.reduce((s: number, po: any) => s + (Number(po.totalAmount || po.amount || po.total || 0)), 0);
    const pending = filtered.filter((po: any) => ["draft", "approved", "sent", "pending"].includes(po.status)).length;
    const received = filtered.filter((po: any) => ["received", "completed"].includes(po.status)).length;
    return { totalPOs, totalValue, pending, received };
  }, [filtered]);

  const exportCSV = () => {
    const headers = ["PO Number", "Vendor", "Date", "Amount", "Status", "Expected Delivery"];
    const rows = filtered.map((po: any) => [
      po.poNumber || po.number || "",
      po.vendorName || po.vendor || "",
      po.date || po.createdAt || "",
      po.totalAmount || po.amount || po.total || 0,
      po.status || "",
      po.expectedDelivery || po.deliveryDate || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c: any) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "purchase-order-report.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => window.print();

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = { draft: "secondary", approved: "default", sent: "outline", received: "default", completed: "default", pending: "secondary" };
    return <Badge variant={(map[status] || "outline") as any}>{status}</Badge>;
  };

  return (
    <div className="p-6 space-y-6 print:p-2">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Purchase Order Report</h1>
          <p className="text-muted-foreground">Analyze purchase orders by date, vendor, and status</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4 mr-2" />Export CSV</Button>
          <Button variant="outline" size="sm" onClick={handlePrint}><Printer className="h-4 w-4 mr-2" />Print</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 print:hidden">
        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" placeholder="Start Date" />
        <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" placeholder="End Date" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="received">Received</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
        <Input placeholder="Search PO# or Vendor..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-60" />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (<Card key={i}><CardContent className="p-6"><Skeleton className="h-8 w-24 mb-2" /><Skeleton className="h-6 w-16" /></CardContent></Card>))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><FileText className="h-4 w-4" />Total POs</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{kpis.totalPOs}</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><ShoppingCart className="h-4 w-4" />Total Value</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">${kpis.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Clock className="h-4 w-4" />Pending</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{kpis.pending}</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><CheckCircle className="h-4 w-4" />Received</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{kpis.received}</p></CardContent></Card>
        </div>
      )}

      {isLoading ? (
        <Card><CardContent className="p-6 space-y-3">{[1, 2, 3, 4, 5].map((i) => (<Skeleton key={i} className="h-10 w-full" />))}</CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center justify-center py-16"><Package className="h-16 w-16 text-gray-300 mb-4" /><h3 className="text-lg font-semibold mb-1">No purchase orders found</h3><p className="text-muted-foreground text-center">Try adjusting your filters or date range.</p></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expected Delivery</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((po: any, idx: number) => (
                  <TableRow key={po.id || idx}>
                    <TableCell className="font-medium">{po.poNumber || po.number || "-"}</TableCell>
                    <TableCell>{po.vendorName || po.vendor || "-"}</TableCell>
                    <TableCell>{po.date || po.createdAt ? new Date(po.date || po.createdAt).toLocaleDateString() : "-"}</TableCell>
                    <TableCell className="text-right">${Number(po.totalAmount || po.amount || po.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell>{getStatusBadge(po.status || "unknown")}</TableCell>
                    <TableCell>{po.expectedDelivery || po.deliveryDate ? new Date(po.expectedDelivery || po.deliveryDate).toLocaleDateString() : "-"}</TableCell>
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