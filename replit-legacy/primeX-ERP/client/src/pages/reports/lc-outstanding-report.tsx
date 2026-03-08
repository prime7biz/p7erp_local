import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Printer, FileText, DollarSign, Activity, AlertTriangle, Landmark } from "lucide-react";

export default function LCOutstandingReport() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<any[]>({
    queryKey: ["/api/commercial/lcs"],
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((lc: any) => {
      if (statusFilter !== "all" && lc.status !== statusFilter) return false;
      if (startDate && new Date(lc.issueDate || lc.createdAt) < new Date(startDate)) return false;
      if (endDate && new Date(lc.issueDate || lc.createdAt) > new Date(endDate)) return false;
      if (search) {
        const q = search.toLowerCase();
        const match =
          (lc.lcNumber || lc.number || "").toLowerCase().includes(q) ||
          (lc.bankName || lc.bank || lc.issuingBank || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [data, statusFilter, startDate, endDate, search]);

  const kpis = useMemo(() => {
    const totalLCs = filtered.length;
    const totalValue = filtered.reduce((s: number, lc: any) => s + (Number(lc.amount || lc.lcAmount || lc.value || 0)), 0);
    const active = filtered.filter((lc: any) => ["active", "open", "confirmed", "in_progress"].includes(lc.status)).length;
    const expired = filtered.filter((lc: any) => {
      if (lc.status === "expired") return true;
      if (lc.expiryDate && new Date(lc.expiryDate) < new Date()) return true;
      return false;
    }).length;
    return { totalLCs, totalValue, active, expired };
  }, [filtered]);

  const exportCSV = () => {
    const headers = ["LC Number", "Bank", "Amount", "Issue Date", "Expiry Date", "Utilization %", "Status"];
    const rows = filtered.map((lc: any) => [
      lc.lcNumber || lc.number || "",
      lc.bankName || lc.bank || lc.issuingBank || "",
      lc.amount || lc.lcAmount || lc.value || 0,
      lc.issueDate || lc.createdAt || "",
      lc.expiryDate || "",
      lc.utilization != null ? lc.utilization : (lc.utilizationPercent != null ? lc.utilizationPercent : ""),
      lc.status || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c: any) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lc-outstanding-report.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => window.print();

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = { active: "default", open: "default", confirmed: "default", in_progress: "default", expired: "destructive", closed: "secondary", draft: "secondary", cancelled: "destructive" };
    return <Badge variant={(map[status] || "outline") as any}>{status}</Badge>;
  };

  const getUtilization = (lc: any) => {
    const val = lc.utilization ?? lc.utilizationPercent ?? null;
    if (val == null) return "-";
    const num = Number(val);
    return `${num.toFixed(1)}%`;
  };

  return (
    <div className="p-6 space-y-6 print:p-2">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">LC Outstanding Report</h1>
          <p className="text-muted-foreground">Letter of Credit tracking, utilization, and outstanding analysis</p>
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
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Input placeholder="Search LC# or Bank..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-60" />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (<Card key={i}><CardContent className="p-6"><Skeleton className="h-8 w-24 mb-2" /><Skeleton className="h-6 w-16" /></CardContent></Card>))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><FileText className="h-4 w-4" />Total LCs</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{kpis.totalLCs}</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><DollarSign className="h-4 w-4" />Total Value</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">${kpis.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Activity className="h-4 w-4" />Active LCs</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{kpis.active}</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Expired</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-red-600">{kpis.expired}</p></CardContent></Card>
        </div>
      )}

      {isLoading ? (
        <Card><CardContent className="p-6 space-y-3">{[1, 2, 3, 4, 5].map((i) => (<Skeleton key={i} className="h-10 w-full" />))}</CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center justify-center py-16"><Landmark className="h-16 w-16 text-gray-300 mb-4" /><h3 className="text-lg font-semibold mb-1">No LCs found</h3><p className="text-muted-foreground text-center">Try adjusting your filters or date range.</p></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>LC Number</TableHead>
                  <TableHead>Bank</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Issue Date</TableHead>
                  <TableHead>Expiry Date</TableHead>
                  <TableHead className="text-right">Utilization %</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((lc: any, idx: number) => (
                  <TableRow key={lc.id || idx}>
                    <TableCell className="font-medium">{lc.lcNumber || lc.number || "-"}</TableCell>
                    <TableCell>{lc.bankName || lc.bank || lc.issuingBank || "-"}</TableCell>
                    <TableCell className="text-right">${Number(lc.amount || lc.lcAmount || lc.value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell>{lc.issueDate || lc.createdAt ? new Date(lc.issueDate || lc.createdAt).toLocaleDateString() : "-"}</TableCell>
                    <TableCell>{lc.expiryDate ? new Date(lc.expiryDate).toLocaleDateString() : "-"}</TableCell>
                    <TableCell className="text-right">{getUtilization(lc)}</TableCell>
                    <TableCell>{getStatusBadge(lc.status || "unknown")}</TableCell>
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