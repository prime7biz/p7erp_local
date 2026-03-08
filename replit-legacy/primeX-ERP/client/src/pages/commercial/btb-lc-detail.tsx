import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, Plus, FileText, Clock, AlertTriangle } from "lucide-react";

export default function BtbLcDetailPage() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id || "0");
  const { toast } = useToast();
  const [addDocOpen, setAddDocOpen] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["/api/btb-lcs", id], enabled: id > 0 });

  const statusMutation = useMutation({
    mutationFn: (status: string) => apiRequest("PATCH", `/api/btb-lcs/${id}/status`, { status }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/btb-lcs", id] }); toast({ title: "Status updated" }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const addDocMutation = useMutation({
    mutationFn: (docData: any) => apiRequest("POST", `/api/btb-lcs/${id}/documents`, docData),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/btb-lcs", id] }); setAddDocOpen(false); toast({ title: "Document added" }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleAddDoc = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    addDocMutation.mutate({
      documentType: fd.get("documentType") as string,
      documentNumber: fd.get("documentNumber") as string,
      remarks: fd.get("remarks") || undefined,
    });
  };

  if (isLoading) return <div className="p-6 animate-pulse space-y-4">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 rounded" />)}</div>;
  if (!data) return <div className="p-6">BTB LC not found</div>;

  const btb = data as any;
  const nextStatuses: Record<string, string[]> = { DRAFT: ["OPENED"], OPENED: ["DOCS_RECEIVED"], DOCS_RECEIVED: ["ACCEPTED"], ACCEPTED: ["MATURED"], MATURED: ["PAID"], PAID: ["SETTLED"] };
  const available = nextStatuses[btb.status] || [];

  const daysToMaturity = btb.maturityDate ? Math.ceil((new Date(btb.maturityDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
  const maturityColor = daysToMaturity === null ? "text-gray-400" : daysToMaturity <= 7 ? "text-red-600" : daysToMaturity <= 14 ? "text-orange-600" : daysToMaturity <= 30 ? "text-yellow-600" : "text-green-600";

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/commercial/btb-lcs"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{btb.btbLcNumber}</h1>
          <p className="text-sm text-muted-foreground">Supplier: {btb.supplierName || '—'} | Export Case: {btb.exportCaseNumber || '—'}</p>
        </div>
        <Badge className="text-sm">{btb.status}</Badge>
        {available.map(s => (
          <Button key={s} size="sm" variant="outline" onClick={() => statusMutation.mutate(s)}>{s.replace(/_/g, ' ')}</Button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="p-3"><p className="text-xs text-muted-foreground">Amount</p><p className="font-bold">{btb.currency} {Number(btb.amount).toLocaleString()}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">Open Date</p><p className="font-medium">{btb.openDate || '—'}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">Expiry Date</p><p className="font-medium">{btb.expiryDate || '—'}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">Maturity Date</p><p className="font-medium">{btb.maturityDate || '—'}</p></Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Days to Maturity</p>
          <p className={`font-bold text-lg ${maturityColor}`}>
            {daysToMaturity !== null ? (
              <>
                {daysToMaturity <= 7 && <AlertTriangle className="inline h-4 w-4 mr-1" />}
                {daysToMaturity}d
              </>
            ) : 'N/A'}
          </p>
        </Card>
      </div>

      <Tabs defaultValue="documents">
        <TabsList>
          <TabsTrigger value="documents"><FileText className="h-4 w-4 mr-1" /> Documents</TabsTrigger>
          <TabsTrigger value="details"><Clock className="h-4 w-4 mr-1" /> Details</TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="mt-4">
          <div className="flex justify-between mb-3">
            <h3 className="font-medium">Linked Documents</h3>
            <Dialog open={addDocOpen} onOpenChange={setAddDocOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Document</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Document</DialogTitle></DialogHeader>
                <form onSubmit={handleAddDoc} className="space-y-4">
                  <div><Label>Document Type</Label><Input name="documentType" placeholder="e.g. Invoice, Packing List..." required /></div>
                  <div><Label>Document Number</Label><Input name="documentNumber" required /></div>
                  <div><Label>Remarks</Label><Input name="remarks" /></div>
                  <Button type="submit" className="w-full" disabled={addDocMutation.isPending}>
                    {addDocMutation.isPending ? "Adding..." : "Add Document"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <Card>
            <CardContent className="p-0">
              <table className="w-full">
                <thead><tr className="border-b bg-gray-50">
                  <th className="p-3 text-left text-sm">Type</th>
                  <th className="p-3 text-left text-sm">Number</th>
                  <th className="p-3 text-left text-sm">Remarks</th>
                  <th className="p-3 text-left text-sm">Date</th>
                </tr></thead>
                <tbody>
                  {btb.documents?.map((doc: any) => (
                    <tr key={doc.id} className="border-b">
                      <td className="p-3 text-sm"><Badge variant="outline">{doc.documentType}</Badge></td>
                      <td className="p-3 text-sm font-medium">{doc.documentNumber}</td>
                      <td className="p-3 text-sm text-muted-foreground">{doc.remarks || '—'}</td>
                      <td className="p-3 text-sm text-muted-foreground">{doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : ''}</td>
                    </tr>
                  ))}
                  {(!btb.documents || btb.documents.length === 0) && (
                    <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No documents linked yet</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details" className="mt-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Maturity Amount:</span> <span className="font-medium">{btb.maturityAmount ? `${btb.currency} ${Number(btb.maturityAmount).toLocaleString()}` : '—'}</span></div>
                <div><span className="text-muted-foreground">Created:</span> <span className="font-medium">{btb.createdAt ? new Date(btb.createdAt).toLocaleDateString() : '—'}</span></div>
              </div>
              {btb.remarks && <div className="text-sm"><span className="text-muted-foreground">Remarks:</span> <p className="mt-1">{btb.remarks}</p></div>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
