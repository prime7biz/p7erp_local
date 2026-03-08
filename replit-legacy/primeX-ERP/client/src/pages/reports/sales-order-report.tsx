import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Printer, ShoppingCart, DollarSign, Activity, CheckCircle, Package } from "lucide-react";

export default function SalesOrderReport() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<any[]>({
    queryKey: ["/api/commercial/orders"],
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((order: any) => {
      if (statusFilter !== "all" && order.status !== statusFilter) return false;
      if (startDate && new Date(order.date || order.orderDate || order.createdAt) < new Date(startDate)) return false;
      if (endDate && new Date(order.date || order.orderDate || order.createdAt) > new Date(endDate)) return false;
      if (search) {
        const q = search.toLowerCase();
        const match =
          (order.orderNumber || order.number || "").toLowerCase().includes(q) ||
          (order.customerName || order.buyerName || order.customer || order.buyer || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [data, statusFilter, startDate, endDate, search]);

  const kpis = useMemo(() => {
    const totalOrders = filtered.length;
    const totalValue = filtered.reduce((s: number, o: any) => s + (Number(o.totalValue || o.totalAmount || o.value || o.amount || 0)), 0);
    const active = filtered.filter((o: any) => ["active", "in_progress", "processing", "confirmed"].includes(o.status)).length;
    const completed = filtered.filter((o: any) => ["completed", "delivered", "shipped"].includes(o.status)).length;
    return { totalOrders, totalValue, active, completed };
  }, [filtered]);

  const exportCSV = () => {
    const headers = ["Order Number", "Customer/Buyer", "Quantity", "Value", "Ship Date", "Status"];
    const rows = filtered.map((o: any) => [
      o.orderNumber || o.number || "",
      o.customerName || o.buyerName || o.customer || o.buyer || "",
      o.quantity || o.totalQuantity || 0,
      o.totalValue || o.totalAmount || o.value || o.amount || 0,
      o.shipDate || o.shipmentDate || o.deliveryDate || "",
      o.status || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c: any) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sales-order-report.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => window.print();

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = { active: "default", in_progress: "default", processing: "default", confirmed: "default", completed: "default", delivered: "default", shipped: "default", draft: "secondary", cancelled: "destructive", pending: "secondary" };
    return <Badge variant={(map[status] || "outline") as any}>{status}</Badge>;
  };

  return (
    <div className="p-6 space-y-6 print:p-2">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Sales Order Report</h1>
          <p className="text-muted-foreground">Track and analyze commercial sales orders</p>
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
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="shipped">Shipped</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Input placeholder="Search Order# or Customer..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-60" />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (<Card key={i}><CardContent className="p-6"><Skeleton className="h-8 w-24 mb-2" /><Skeleton className="h-6 w-16" /></CardContent></Card>))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><ShoppingCart className="h-4 w-4" />Total Orders</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{kpis.totalOrders}</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><DollarSign className="h-4 w-4" />Total Value</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">${kpis.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Activity className="h-4 w-4" />Active Orders</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{kpis.active}</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><CheckCircle className="h-4 w-4" />Completed</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{kpis.completed}</p></CardContent></Card>
        </div>
      )}

      {isLoading ? (
        <Card><CardContent className="p-6 space-y-3">{[1, 2, 3, 4, 5].map((i) => (<Skeleton key={i} className="h-10 w-full" />))}</CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center justify-center py-16"><Package className="h-16 w-16 text-gray-300 mb-4" /><h3 className="text-lg font-semibold mb-1">No sales orders found</h3><p className="text-muted-foreground text-center">Try adjusting your filters or date range.</p></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order Number</TableHead>
                  <TableHead>Customer/Buyer</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Ship Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((o: any, idx: number) => (
                  <TableRow key={o.id || idx}>
                    <TableCell className="font-medium">{o.orderNumber || o.number || "-"}</TableCell>
                    <TableCell>{o.customerName || o.buyerName || o.customer || o.buyer || "-"}</TableCell>
                    <TableCell className="text-right">{Number(o.quantity || o.totalQuantity || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right">${Number(o.totalValue || o.totalAmount || o.value || o.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell>{o.shipDate || o.shipmentDate || o.deliveryDate ? new Date(o.shipDate || o.shipmentDate || o.deliveryDate).toLocaleDateString() : "-"}</TableCell>
                    <TableCell>{getStatusBadge(o.status || "unknown")}</TableCell>
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