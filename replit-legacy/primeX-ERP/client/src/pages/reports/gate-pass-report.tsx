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
import { Download, Printer, Shield, ArrowDownToLine, ArrowUpFromLine, RotateCcw, ClipboardList } from "lucide-react";

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function GatePassReport() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const { data: gatePasses, isLoading } = useQuery<any[]>({
    queryKey: ["/api/gate-passes"],
  });

  const filtered = useMemo(() => {
    if (!gatePasses) return [];
    return gatePasses.filter((gp: any) => {
      if (statusFilter !== "all" && gp.status !== statusFilter) return false;
      if (typeFilter !== "all" && gp.type !== typeFilter) return false;
      const dt = gp.date || gp.createdAt;
      if (startDate && dt && new Date(dt) < new Date(startDate)) return false;
      if (endDate && dt && new Date(dt) > new Date(endDate)) return false;
      return true;
    });
  }, [gatePasses, statusFilter, typeFilter, startDate, endDate]);

  const kpis = useMemo(() => {
    const total = filtered.length;
    const inward = filtered.filter((g: any) => g.type === "inward").length;
    const outward = filtered.filter((g: any) => g.type === "outward").length;
    const returnable = filtered.filter((g: any) => g.type === "returnable").length;
    return { total, inward, outward, returnable };
  }, [filtered]);

  const exportCSV = () => {
    const headers = ["Gate Pass Number", "Type", "Party Name", "Vehicle No", "Date", "Items Count", "Status"];
    const rows = filtered.map((g: any) => [
      g.gatePassNumber || g.passNumber || `GP-${g.id}`,
      g.type || "—",
      g.partyName || g.party?.name || "—",
      g.vehicleNo || g.vehicleNumber || "—",
      formatDate(g.date || g.createdAt),
      g.itemsCount || (g.items ? g.items.length : 0),
      g.status || "—",
    ]);
    const csv = [headers, ...rows].map(row => row.map((c: any) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gate-pass-report.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => window.print();

  const statusBadge = (status: string) => {
    const map: Record<string, any> = { approved: "default", completed: "default", pending: "outline", draft: "outline", cancelled: "destructive" };
    return <Badge variant={map[status] || "outline"}>{status || "—"}</Badge>;
  };

  const typeBadge = (type: string) => {
    const map: Record<string, any> = { inward: "default", outward: "secondary", returnable: "outline" };
    return <Badge variant={map[type] || "outline"}>{type || "—"}</Badge>;
  };

  return (
    <DashboardContainer title="Gate Pass Report">
      <div className="space-y-6 print:space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Gate Pass Report</h1>
            <p className="text-muted-foreground">Track inward, outward & returnable gate passes</p>
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
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="inward">Inward</SelectItem>
              <SelectItem value="outward">Outward</SelectItem>
              <SelectItem value="returnable">Returnable</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
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
                <CardTitle className="text-sm font-medium">Total Gate Passes</CardTitle>
                <Shield className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{kpis.total}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Inward</CardTitle>
                <ArrowDownToLine className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{kpis.inward}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Outward</CardTitle>
                <ArrowUpFromLine className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{kpis.outward}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Returnable</CardTitle>
                <RotateCcw className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{kpis.returnable}</div></CardContent>
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
                <ClipboardList className="h-12 w-12 text-gray-300 mb-4" />
                <h3 className="text-lg font-semibold mb-1">No gate passes found</h3>
                <p className="text-muted-foreground text-sm">Adjust your filters or create a gate pass first.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Gate Pass Number</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Party Name</TableHead>
                    <TableHead>Vehicle No</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Items Count</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((g: any) => (
                    <TableRow key={g.id}>
                      <TableCell className="font-medium">{g.gatePassNumber || g.passNumber || `GP-${g.id}`}</TableCell>
                      <TableCell>{typeBadge(g.type)}</TableCell>
                      <TableCell>{g.partyName || g.party?.name || "—"}</TableCell>
                      <TableCell>{g.vehicleNo || g.vehicleNumber || "—"}</TableCell>
                      <TableCell>{formatDate(g.date || g.createdAt)}</TableCell>
                      <TableCell>{g.itemsCount || (g.items ? g.items.length : 0)}</TableCell>
                      <TableCell>{statusBadge(g.status)}</TableCell>
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