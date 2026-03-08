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
import { Plus, DollarSign, ArrowRight } from "lucide-react";

export default function FxReceiptsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: receipts, isLoading } = useQuery({ queryKey: ["/api/fx/receipts"] });
  const { data: exportCases } = useQuery({ queryKey: ["/api/export-cases"] });
  const { data: unsettled } = useQuery({ queryKey: ["/api/fx/unsettled"] });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/fx/receipts", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/fx/receipts"] }); queryClient.invalidateQueries({ queryKey: ["/api/fx/unsettled"] }); setDialogOpen(false); toast({ title: "FX receipt recorded" }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      receiptDate: fd.get("receiptDate") as string,
      amount: fd.get("amount") as string,
      currency: fd.get("currency") || "USD",
      exchangeRate: fd.get("exchangeRate") || undefined,
      bankCharges: fd.get("bankCharges") || "0",
      bankReference: fd.get("bankReference") || undefined,
      exportCaseId: fd.get("exportCaseId") ? parseInt(fd.get("exportCaseId") as string) : undefined,
    });
  };

  const totalReceived = Array.isArray(receipts) ? receipts.reduce((s: number, r: any) => s + parseFloat(r.amount || '0'), 0) : 0;
  const totalBdt = Array.isArray(receipts) ? receipts.reduce((s: number, r: any) => s + parseFloat(r.bdtAmount || '0'), 0) : 0;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">FX Receipts</h1>
          <p className="text-sm text-muted-foreground">Foreign currency receipts from export realization</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Record FX Receipt</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Record FX Receipt</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Receipt Date</Label><Input name="receiptDate" type="date" required /></div>
                <div><Label>Currency</Label><Input name="currency" defaultValue="USD" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Amount (FC)</Label><Input name="amount" type="number" step="0.01" required /></div>
                <div><Label>Exchange Rate</Label><Input name="exchangeRate" type="number" step="0.0001" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Bank Charges</Label><Input name="bankCharges" type="number" step="0.01" defaultValue="0" /></div>
                <div><Label>Bank Reference</Label><Input name="bankReference" /></div>
              </div>
              <div><Label>Export Case</Label>
                <Select name="exportCaseId">
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>{Array.isArray(exportCases) && exportCases.map((ec: any) => (<SelectItem key={ec.id} value={ec.id.toString()}>{ec.exportCaseNumber}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>{createMutation.isPending ? "Recording..." : "Record Receipt"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Total FX Received</p><p className="text-xl font-bold text-green-600">USD {totalReceived.toLocaleString()}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Total BDT Value</p><p className="text-xl font-bold">BDT {totalBdt.toLocaleString()}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Unsettled Balance</p><p className="text-xl font-bold text-orange-600">BDT {Number((unsettled as any)?.totalUnsettled || 0).toLocaleString()}</p></Card>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />)}</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b bg-gray-50">
                  <th className="p-3 text-left text-sm font-medium">Date</th>
                  <th className="p-3 text-left text-sm font-medium">Amount (FC)</th>
                  <th className="p-3 text-left text-sm font-medium">Rate</th>
                  <th className="p-3 text-left text-sm font-medium">BDT Amount</th>
                  <th className="p-3 text-left text-sm font-medium">Charges</th>
                  <th className="p-3 text-left text-sm font-medium">Net</th>
                  <th className="p-3 text-left text-sm font-medium">Status</th>
                  <th className="p-3 text-left text-sm font-medium">Actions</th>
                </tr></thead>
                <tbody>
                  {Array.isArray(receipts) && receipts.map((r: any) => (
                    <tr key={r.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 text-sm">{r.receiptDate}</td>
                      <td className="p-3 text-sm font-medium">{r.currency} {Number(r.amount).toLocaleString()}</td>
                      <td className="p-3 text-sm">{r.exchangeRate}</td>
                      <td className="p-3 text-sm">{Number(r.bdtAmount).toLocaleString()}</td>
                      <td className="p-3 text-sm text-red-600">{Number(r.bankCharges).toLocaleString()}</td>
                      <td className="p-3 text-sm font-medium">{Number(r.netAmount).toLocaleString()}</td>
                      <td className="p-3"><Badge variant="outline">{r.status}</Badge></td>
                      <td className="p-3">
                        <Link href={`/finance/fx-settlement/${r.id}`}>
                          <Button variant="ghost" size="sm"><ArrowRight className="h-4 w-4" /></Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {(!receipts || (Array.isArray(receipts) && receipts.length === 0)) && (<tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No FX receipts recorded</td></tr>)}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
