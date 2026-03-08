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
import { Download, Printer, Ship, Truck, Package, Clock } from "lucide-react";

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function ShipmentReport() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: shipments, isLoading } = useQuery<any[]>({
    queryKey: ["/api/commercial/shipments"],
  });

  const filtered = useMemo(() => {
    if (!shipments) return [];
    return shipments.filter((s: any) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      const dt = s.etd || s.createdAt;
      if (startDate && dt && new Date(dt) < new Date(startDate)) return false;
      if (endDate && dt && new Date(dt) > new Date(endDate)) return false;
      return true;
    });
  }, [shipments, statusFilter, startDate, endDate]);

  const kpis = useMemo(() => {
    const total = filtered.length;
    const inTransit = filtered.filter((s: any) => s.status === "in_transit" || s.status === "in-transit").length;
    const delivered = filtered.filter((s: any) => s.status === "delivered" || s.status === "completed").length;
    const pending = filtered.filter((s: any) => s.status === "pending" || s.status === "draft" || s.status === "booked").length;
    return { total, inTransit, delivered, pending };
  }, [filtered]);

  const exportCSV = () => {
    const headers = ["Shipment Ref", "Vessel/Flight", "Port of Loading", "Port of Discharge", "ETD", "ETA", "Status"];
    const rows = filtered.map((s: any) => [
      s.shipmentRef || s.referenceNumber || s.id,
      s.vesselName || s.vessel || s.flightNumber || "—",
      s.portOfLoading || s.loadingPort || "—",
      s.portOfDischarge || s.dischargePort || "—",
      formatDate(s.etd),
      formatDate(s.eta),
      s.status || "—",
    ]);
    const csv = [headers, ...rows].map(row => row.map((c: any) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "shipment-report.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => window.print();

  const statusBadge = (status: string) => {
    const map: Record<string, any> = { delivered: "default", completed: "default", in_transit: "secondary", "in-transit": "secondary", pending: "outline", draft: "outline", booked: "outline" };
    return <Badge variant={map[status] || "outline"}>{(status || "—").replace(/_/g, " ")}</Badge>;
  };

  return (
    <DashboardContainer title="Shipment Report">
      <div className="space-y-6 print:space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Shipment Report</h1>
            <p className="text-muted-foreground">Track shipments, vessels, and delivery status</p>
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
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="booked">Booked</SelectItem>
              <SelectItem value="in_transit">In Transit</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
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
                <CardTitle className="text-sm font-medium">Total Shipments</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{kpis.total}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">In Transit</CardTitle>
                <Ship className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{kpis.inTransit}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Delivered</CardTitle>
                <Truck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{kpis.delivered}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Pending</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{kpis.pending}</div></CardContent>
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
                <Ship className="h-12 w-12 text-gray-300 mb-4" />
                <h3 className="text-lg font-semibold mb-1">No shipments found</h3>
                <p className="text-muted-foreground text-sm">Adjust your filters or add shipments first.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Shipment Ref</TableHead>
                    <TableHead>Vessel/Flight</TableHead>
                    <TableHead>Port of Loading</TableHead>
                    <TableHead>Port of Discharge</TableHead>
                    <TableHead>ETD</TableHead>
                    <TableHead>ETA</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.shipmentRef || s.referenceNumber || `SHP-${s.id}`}</TableCell>
                      <TableCell>{s.vesselName || s.vessel || s.flightNumber || "—"}</TableCell>
                      <TableCell>{s.portOfLoading || s.loadingPort || "—"}</TableCell>
                      <TableCell>{s.portOfDischarge || s.dischargePort || "—"}</TableCell>
                      <TableCell>{formatDate(s.etd)}</TableCell>
                      <TableCell>{formatDate(s.eta)}</TableCell>
                      <TableCell>{statusBadge(s.status)}</TableCell>
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