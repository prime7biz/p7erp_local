import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, Plus, Link2, Package, FileText, Ship, DollarSign, Activity } from "lucide-react";

export default function ExportCaseDetailPage() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id || "0");
  const { toast } = useToast();
  const [linkOrderOpen, setLinkOrderOpen] = useState(false);
  const [linkLcOpen, setLinkLcOpen] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["/api/export-cases", id], enabled: id > 0 });
  const { data: allOrders } = useQuery({ queryKey: ["/api/orders"] });
  const { data: allLcs } = useQuery({ queryKey: ["/api/commercial/lc"] });

  const linkOrdersMutation = useMutation({
    mutationFn: (orderData: any) => apiRequest("POST", `/api/export-cases/${id}/link-orders`, orderData),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/export-cases", id] }); setLinkOrderOpen(false); toast({ title: "Orders linked" }); },
  });

  const linkLcMutation = useMutation({
    mutationFn: (lcData: any) => apiRequest("POST", `/api/export-cases/${id}/link-lc`, lcData),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/export-cases", id] }); setLinkLcOpen(false); toast({ title: "LC linked" }); },
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => apiRequest("PATCH", `/api/export-cases/${id}/status`, { status }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/export-cases", id] }); toast({ title: "Status updated" }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="p-6 animate-pulse space-y-4">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 rounded" />)}</div>;
  if (!data) return <div className="p-6">Export case not found</div>;

  const ec = data as any;
  const nextStatuses: Record<string, string[]> = { DRAFT: ["ACTIVE"], ACTIVE: ["SHIPPED", "CLOSED"], SHIPPED: ["DOCS_SUBMITTED"], DOCS_SUBMITTED: ["NEGOTIATED"], NEGOTIATED: ["SETTLED"], SETTLED: ["CLOSED"] };
  const available = nextStatuses[ec.status] || [];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/commercial/export-cases"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{ec.exportCaseNumber}</h1>
          <p className="text-sm text-muted-foreground">Buyer: {ec.buyer?.customerName || '—'} | {ec.currency} {ec.totalValue ? Number(ec.totalValue).toLocaleString() : '—'}</p>
        </div>
        <Badge className="text-sm">{ec.status}</Badge>
        {available.map(s => (
          <Button key={s} size="sm" variant="outline" onClick={() => statusMutation.mutate(s)}>{s.replace(/_/g, ' ')}</Button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">LC Number</p>
          {ec.lc?.lcNumber ? (
            <p className="font-medium">{ec.lc.lcNumber}</p>
          ) : (
            <Dialog open={linkLcOpen} onOpenChange={setLinkLcOpen}>
              <DialogTrigger asChild><Button variant="link" size="sm" className="p-0 h-auto text-blue-600">Link LC</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Link LC to Export Case</DialogTitle></DialogHeader>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {Array.isArray(allLcs) && allLcs.map((lc: any) => (
                    <button key={lc.id} className="w-full text-left px-3 py-2 border rounded hover:bg-gray-50 text-sm" onClick={() => linkLcMutation.mutate({ lcId: lc.id })}>
                      {lc.lcNumber} — {lc.currency} {Number(lc.lcValue || 0).toLocaleString()}
                    </button>
                  ))}
                  {(!allLcs || (Array.isArray(allLcs) && allLcs.length === 0)) && (
                    <p className="text-sm text-muted-foreground p-2">No LCs available to link</p>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          )}
        </Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">Payment Mode</p><p className="font-medium">{ec.paymentMode || '—'}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">Expected Realization</p><p className="font-medium">{ec.expectedRealizationDays ? `${ec.expectedRealizationDays} days` : '—'}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">Orders</p><p className="font-medium">{ec.linkedOrders?.length || 0}</p></Card>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-3"><p className="text-xs text-muted-foreground">Proforma Invoices</p><p className="font-medium">{ec.proformaInvoices?.length || 0}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">BTB LCs</p><p className="font-medium">{ec.btbLcs?.length || 0}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">FX Receipts</p><p className="font-medium">{ec.fxReceipts?.length || 0}</p></Card>
      </div>

      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders"><Package className="h-4 w-4 mr-1" /> Orders</TabsTrigger>
          <TabsTrigger value="pi"><FileText className="h-4 w-4 mr-1" /> PI</TabsTrigger>
          <TabsTrigger value="btb"><Ship className="h-4 w-4 mr-1" /> BTB LCs</TabsTrigger>
          <TabsTrigger value="fx"><DollarSign className="h-4 w-4 mr-1" /> FX</TabsTrigger>
          <TabsTrigger value="timeline"><Activity className="h-4 w-4 mr-1" /> Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="mt-4">
          <div className="flex justify-between mb-3">
            <h3 className="font-medium">Linked Orders</h3>
            <Dialog open={linkOrderOpen} onOpenChange={setLinkOrderOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Link Orders</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Link Orders</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  {Array.isArray(allOrders) && allOrders.filter((o: any) => !ec.linkedOrders?.some((lo: any) => lo.order.id === o.id)).slice(0, 20).map((o: any) => (
                    <button key={o.id} className="w-full text-left px-3 py-2 border rounded hover:bg-gray-50 text-sm" onClick={() => linkOrdersMutation.mutate({ orders: [{ orderId: o.id }] })}>
                      {o.orderId} — {o.styleName} (Qty: {o.totalQuantity})
                    </button>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <Card>
            <CardContent className="p-0">
              <table className="w-full">
                <thead><tr className="border-b bg-gray-50">
                  <th className="p-3 text-left text-sm">Order ID</th>
                  <th className="p-3 text-left text-sm">Style</th>
                  <th className="p-3 text-left text-sm">Qty</th>
                  <th className="p-3 text-left text-sm">Price</th>
                  <th className="p-3 text-left text-sm">Status</th>
                </tr></thead>
                <tbody>
                  {ec.linkedOrders?.map((lo: any) => (
                    <tr key={lo.order.id} className="border-b">
                      <td className="p-3 text-sm font-medium">{lo.order.orderId}</td>
                      <td className="p-3 text-sm">{lo.order.styleName}</td>
                      <td className="p-3 text-sm">{lo.order.totalQuantity}</td>
                      <td className="p-3 text-sm">{lo.order.currency} {lo.order.priceConfirmed}</td>
                      <td className="p-3"><Badge variant="outline">{lo.order.orderStatus}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pi" className="mt-4">
          <h3 className="font-medium mb-3">Proforma Invoices</h3>
          {ec.proformaInvoices?.length > 0 ? (
            <div className="space-y-2">
              {ec.proformaInvoices.map((pi: any) => (
                <Card key={pi.id} className="p-3">
                  <div className="flex justify-between">
                    <span className="font-medium">{pi.piNumber}</span>
                    <Badge>{pi.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{pi.currency} {Number(pi.totalValue).toLocaleString()}</p>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No proforma invoices linked</p>
          )}
        </TabsContent>

        <TabsContent value="btb" className="mt-4">
          <h3 className="font-medium mb-3">Back-to-Back LCs</h3>
          {ec.btbLcs?.length > 0 ? (
            <div className="space-y-2">
              {ec.btbLcs.map((btb: any) => (
                <Card key={btb.id} className="p-3">
                  <div className="flex justify-between">
                    <span className="font-medium">{btb.btbLcNumber}</span>
                    <Badge>{btb.status}</Badge>
                  </div>
                  <p className="text-sm">{btb.currency} {Number(btb.amount).toLocaleString()} | Maturity: {btb.maturityDate || 'TBD'}</p>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No BTB LCs linked</p>
          )}
        </TabsContent>

        <TabsContent value="fx" className="mt-4">
          <h3 className="font-medium mb-3">FX Receipts</h3>
          {ec.fxReceipts?.length > 0 ? (
            <div className="space-y-2">
              {ec.fxReceipts.map((fx: any) => (
                <Card key={fx.id} className="p-3">
                  <div className="flex justify-between">
                    <span className="font-medium">{fx.currency} {Number(fx.amount).toLocaleString()}</span>
                    <Badge>{fx.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">Date: {fx.receiptDate} | Rate: {fx.exchangeRate} | BDT: {Number(fx.bdtAmount).toLocaleString()}</p>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No FX receipts</p>
          )}
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <p className="text-muted-foreground text-sm">Timeline events will appear here as actions are taken</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
