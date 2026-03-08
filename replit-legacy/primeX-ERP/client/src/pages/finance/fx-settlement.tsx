import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, Plus, Check } from "lucide-react";

export default function FxSettlementPage() {
  const params = useParams<{ receiptId: string }>();
  const receiptId = parseInt(params.receiptId || "0");
  const { toast } = useToast();
  const [settlementType, setSettlementType] = useState("BTB_PAYMENT");
  const [amount, setAmount] = useState("");
  const [btbLcId, setBtbLcId] = useState<string>("");
  const [settlementDate, setSettlementDate] = useState(new Date().toISOString().split("T")[0]);

  const { data: receipt, isLoading } = useQuery({ queryKey: ["/api/fx/receipts", receiptId], enabled: receiptId > 0 });
  const { data: btbs } = useQuery({ queryKey: ["/api/btb-lcs"] });

  const settleMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/fx/receipts/${receiptId}/settle`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fx/receipts", receiptId] });
      queryClient.invalidateQueries({ queryKey: ["/api/fx/unsettled"] });
      toast({ title: "Settlement recorded" });
      setAmount("");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleSettle = () => {
    if (!amount || parseFloat(amount) <= 0) { toast({ title: "Enter a valid amount", variant: "destructive" }); return; }
    settleMutation.mutate({
      settlements: [{
        settlementType,
        amount,
        btbLcId: btbLcId ? parseInt(btbLcId) : undefined,
        settlementDate,
      }],
    });
  };

  if (isLoading) return <div className="p-6 animate-pulse"><div className="h-40 bg-gray-100 rounded" /></div>;
  if (!receipt) return <div className="p-6">Receipt not found</div>;

  const r = receipt as any;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/finance/fx-receipts"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button></Link>
        <div>
          <h1 className="text-2xl font-bold">FX Settlement</h1>
          <p className="text-sm text-muted-foreground">Allocate FX receipt against BTB maturities and charges</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="p-3"><p className="text-xs text-muted-foreground">Receipt Amount</p><p className="font-bold text-green-600">{r.currency} {Number(r.amount).toLocaleString()}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">Exchange Rate</p><p className="font-bold">{r.exchangeRate}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">BDT Amount</p><p className="font-bold">{Number(r.bdtAmount).toLocaleString()}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">Total Settled</p><p className="font-bold text-blue-600">{Number(r.totalSettled || 0).toLocaleString()}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">Unsettled</p><p className="font-bold text-orange-600">{Number(r.unsettledBalance || 0).toLocaleString()}</p></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Add Settlement</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label>Type</Label>
              <Select value={settlementType} onValueChange={setSettlementType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BTB_PAYMENT">BTB Payment</SelectItem>
                  <SelectItem value="CD_ACCOUNT">CD Account</SelectItem>
                  <SelectItem value="LOCAL_PAYMENT">Local Payment</SelectItem>
                  <SelectItem value="BANK_CHARGES">Bank Charges</SelectItem>
                  <SelectItem value="COMMISSION">Commission</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Amount (BDT)</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div><Label>Date</Label><Input type="date" value={settlementDate} onChange={(e) => setSettlementDate(e.target.value)} /></div>
            {settlementType === "BTB_PAYMENT" && (
              <div><Label>BTB LC</Label>
                <Select value={btbLcId} onValueChange={setBtbLcId}>
                  <SelectTrigger><SelectValue placeholder="Select BTB..." /></SelectTrigger>
                  <SelectContent>{Array.isArray(btbs) && btbs.map((b: any) => (<SelectItem key={b.id} value={b.id.toString()}>{b.btbLcNumber} — {b.currency} {Number(b.amount).toLocaleString()}</SelectItem>))}</SelectContent>
                </Select>
              </div>
            )}
          </div>
          <Button onClick={handleSettle} disabled={settleMutation.isPending}><Check className="h-4 w-4 mr-1" /> {settleMutation.isPending ? "Recording..." : "Record Settlement"}</Button>
        </CardContent>
      </Card>

      {r.settlements?.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Settlement History</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full">
              <thead><tr className="border-b bg-gray-50">
                <th className="p-3 text-left text-sm">Type</th>
                <th className="p-3 text-left text-sm">Amount</th>
                <th className="p-3 text-left text-sm">Date</th>
                <th className="p-3 text-left text-sm">Remarks</th>
              </tr></thead>
              <tbody>
                {r.settlements.map((s: any) => (
                  <tr key={s.id} className="border-b">
                    <td className="p-3 text-sm"><Badge variant="outline">{s.settlementType}</Badge></td>
                    <td className="p-3 text-sm font-medium">{Number(s.amount).toLocaleString()}</td>
                    <td className="p-3 text-sm">{s.settlementDate}</td>
                    <td className="p-3 text-sm text-muted-foreground">{s.remarks || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
