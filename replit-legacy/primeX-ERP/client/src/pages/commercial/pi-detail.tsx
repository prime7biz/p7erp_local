import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Package, FileText } from "lucide-react";

export default function PiDetailPage() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id || "0");
  const { toast } = useToast();
  const [addLineOpen, setAddLineOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [selectedOrderLineId, setSelectedOrderLineId] = useState<string>("");

  const { data, isLoading } = useQuery({ queryKey: ["/api/proforma-invoices", id], enabled: id > 0 });
  const { data: allOrders } = useQuery({ queryKey: ["/api/orders"] });
  const { data: orderLineItems } = useQuery({
    queryKey: [`/api/commercial/orders/${selectedOrderId}/styles`],
    enabled: !!selectedOrderId,
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => apiRequest("PATCH", `/api/proforma-invoices/${id}/status`, { status }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/proforma-invoices", id] }); toast({ title: "Status updated" }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const addLineMutation = useMutation({
    mutationFn: (lineData: any) => apiRequest("POST", `/api/proforma-invoices/${id}/lines`, lineData),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/proforma-invoices", id] }); setAddLineOpen(false); toast({ title: "Line added" }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleAddLine = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    addLineMutation.mutate({
      description: fd.get("description") as string,
      quantity: parseInt(fd.get("quantity") as string),
      unitPrice: fd.get("unitPrice") as string,
      unit: fd.get("unit") || "PCS",
      orderId: selectedOrderId ? parseInt(selectedOrderId) : undefined,
      orderLineId: selectedOrderLineId ? parseInt(selectedOrderLineId) : undefined,
    });
  };

  if (isLoading) return <div className="p-6 animate-pulse space-y-4">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 rounded" />)}</div>;
  if (!data) return <div className="p-6">Proforma invoice not found</div>;

  const pi = data as any;
  const nextStatuses: Record<string, string[]> = { DRAFT: ["SENT"], SENT: ["ACCEPTED", "REVISED", "EXPIRED"] };
  const available = nextStatuses[pi.status] || [];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/commercial/proforma-invoices"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{pi.piNumber}</h1>
          <p className="text-sm text-muted-foreground">Buyer: {pi.buyerName || '—'} | {pi.currency} | {pi.shippingTerms || '—'}</p>
        </div>
        <Badge className="text-sm">{pi.status}</Badge>
        {available.map(s => (
          <Button key={s} size="sm" variant="outline" onClick={() => statusMutation.mutate(s)}>{s}</Button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-3"><p className="text-xs text-muted-foreground">Issue Date</p><p className="font-medium">{pi.issueDate || '—'}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">Total Value</p><p className="font-medium">{pi.currency} {Number(pi.totalValue || 0).toLocaleString()}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">Payment Terms</p><p className="font-medium">{pi.paymentTerms || '—'}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">Lines</p><p className="font-medium">{pi.lines?.length || 0}</p></Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Line Items</CardTitle>
            <Dialog open={addLineOpen} onOpenChange={setAddLineOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Line</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Line Item</DialogTitle></DialogHeader>
                <form onSubmit={handleAddLine} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Link to Order (optional)</Label>
                      <Select value={selectedOrderId} onValueChange={(v) => { setSelectedOrderId(v); setSelectedOrderLineId(""); }}>
                        <SelectTrigger><SelectValue placeholder="Select order..." /></SelectTrigger>
                        <SelectContent>
                          {Array.isArray(allOrders) && allOrders.slice(0, 30).map((o: any) => (
                            <SelectItem key={o.id} value={o.id.toString()}>{o.orderId} — {o.styleName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Order Line Item (optional)</Label>
                      <Select value={selectedOrderLineId} onValueChange={setSelectedOrderLineId} disabled={!selectedOrderId}>
                        <SelectTrigger><SelectValue placeholder={selectedOrderId ? "Select line..." : "Select order first"} /></SelectTrigger>
                        <SelectContent>
                          {Array.isArray(orderLineItems) && orderLineItems.map((li: any) => (
                            <SelectItem key={li.id} value={li.id.toString()}>{li.itemName} (Qty: {li.qty})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div><Label>Description</Label><Input name="description" required /></div>
                  <div className="grid grid-cols-3 gap-4">
                    <div><Label>Quantity</Label><Input name="quantity" type="number" required /></div>
                    <div><Label>Unit Price</Label><Input name="unitPrice" type="number" step="0.01" required /></div>
                    <div><Label>Unit</Label><Input name="unit" defaultValue="PCS" /></div>
                  </div>
                  <Button type="submit" className="w-full" disabled={addLineMutation.isPending}>
                    {addLineMutation.isPending ? "Adding..." : "Add Line"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full">
            <thead><tr className="border-b bg-gray-50">
              <th className="p-3 text-left text-sm">#</th>
              <th className="p-3 text-left text-sm">Description</th>
              <th className="p-3 text-right text-sm">Qty</th>
              <th className="p-3 text-right text-sm">Unit Price</th>
              <th className="p-3 text-right text-sm">Amount</th>
            </tr></thead>
            <tbody>
              {pi.lines?.map((line: any, i: number) => (
                <tr key={line.id || i} className="border-b">
                  <td className="p-3 text-sm">{i + 1}</td>
                  <td className="p-3 text-sm">{line.description}</td>
                  <td className="p-3 text-sm text-right">{line.quantity} {line.unit}</td>
                  <td className="p-3 text-sm text-right">{Number(line.unitPrice).toFixed(2)}</td>
                  <td className="p-3 text-sm text-right font-medium">{Number(line.amount || line.quantity * line.unitPrice).toLocaleString()}</td>
                </tr>
              ))}
              {(!pi.lines || pi.lines.length === 0) && (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No line items yet</td></tr>
              )}
            </tbody>
            {pi.lines?.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 font-medium">
                  <td colSpan={4} className="p-3 text-right text-sm">Total</td>
                  <td className="p-3 text-right text-sm">{pi.currency} {Number(pi.totalValue || 0).toLocaleString()}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
