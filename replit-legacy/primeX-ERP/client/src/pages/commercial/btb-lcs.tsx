import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Search, Eye, AlertTriangle, Clock } from "lucide-react";

function MaturityBadge({ days }: { days: number | null }) {
  if (days === null) return <span className="text-xs text-gray-400">N/A</span>;
  const color = days <= 7 ? "bg-red-100 text-red-700 border-red-200" : days <= 14 ? "bg-orange-100 text-orange-700 border-orange-200" : days <= 30 ? "bg-yellow-100 text-yellow-700 border-yellow-200" : "bg-green-100 text-green-700 border-green-200";
  return <Badge variant="outline" className={color}>{days}d</Badge>;
}

export default function BtbLcsPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: btbs, isLoading } = useQuery({ queryKey: ["/api/btb-lcs"] });
  const { data: exportCases } = useQuery({ queryKey: ["/api/export-cases"] });
  const { data: alerts } = useQuery({ queryKey: ["/api/btb-lcs/alerts"] });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/btb-lcs", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/btb-lcs"] }); setDialogOpen(false); toast({ title: "BTB LC created" }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      amount: fd.get("amount") as string,
      currency: fd.get("currency") || "USD",
      openDate: fd.get("openDate") || undefined,
      expiryDate: fd.get("expiryDate") || undefined,
      maturityDate: fd.get("maturityDate") || undefined,
      maturityAmount: fd.get("maturityAmount") || undefined,
      exportCaseId: fd.get("exportCaseId") ? parseInt(fd.get("exportCaseId") as string) : undefined,
      remarks: fd.get("remarks") || undefined,
    });
  };

  const filtered = Array.isArray(btbs) ? btbs.filter((b: any) =>
    b.btbLcNumber?.toLowerCase().includes(search.toLowerCase()) ||
    b.supplierName?.toLowerCase().includes(search.toLowerCase())
  ) : [];

  const alertCount = Array.isArray(alerts) ? alerts.length : 0;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Back-to-Back LCs</h1>
          <p className="text-sm text-muted-foreground">Manage BTB LCs opened against master export LCs</p>
        </div>
        <div className="flex gap-2">
          {alertCount > 0 && (
            <Badge variant="destructive" className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> {alertCount} alerts
            </Badge>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-60" />
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New BTB LC</Button></DialogTrigger>
            <DialogContent aria-describedby={undefined}>
              <DialogHeader><DialogTitle>Create BTB LC</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Amount</Label><Input name="amount" type="number" step="0.01" required /></div>
                  <div><Label>Currency</Label><Input name="currency" defaultValue="USD" /></div>
                </div>
                <div><Label>Export Case</Label>
                  <Select name="exportCaseId">
                    <SelectTrigger><SelectValue placeholder="Select export case..." /></SelectTrigger>
                    <SelectContent>{Array.isArray(exportCases) && exportCases.map((ec: any) => (<SelectItem key={ec.id} value={ec.id.toString()}>{ec.exportCaseNumber}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Open Date</Label><Input name="openDate" type="date" /></div>
                  <div><Label>Expiry Date</Label><Input name="expiryDate" type="date" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Maturity Date</Label><Input name="maturityDate" type="date" /></div>
                  <div><Label>Maturity Amount</Label><Input name="maturityAmount" type="number" step="0.01" /></div>
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending}>{createMutation.isPending ? "Creating..." : "Create BTB LC"}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />)}</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b bg-gray-50">
                  <th className="text-left p-3 text-sm font-medium">BTB Number</th>
                  <th className="text-left p-3 text-sm font-medium">Supplier</th>
                  <th className="text-left p-3 text-sm font-medium">Amount</th>
                  <th className="text-left p-3 text-sm font-medium">Maturity</th>
                  <th className="text-left p-3 text-sm font-medium">Days Left</th>
                  <th className="text-left p-3 text-sm font-medium">Status</th>
                  <th className="text-left p-3 text-sm font-medium">Actions</th>
                </tr></thead>
                <tbody>
                  {filtered.map((btb: any) => (
                    <tr key={btb.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 text-sm font-medium">{btb.btbLcNumber}</td>
                      <td className="p-3 text-sm">{btb.supplierName || '—'}</td>
                      <td className="p-3 text-sm">{btb.currency} {Number(btb.amount).toLocaleString()}</td>
                      <td className="p-3 text-sm">{btb.maturityDate || '—'}</td>
                      <td className="p-3"><MaturityBadge days={btb.daysToMaturity} /></td>
                      <td className="p-3"><Badge variant="outline">{btb.status}</Badge></td>
                      <td className="p-3">
                        <Link href={`/commercial/btb-lcs/${btb.id}`}>
                          <Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (<tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No BTB LCs found</td></tr>)}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
