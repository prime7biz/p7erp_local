import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Search, Eye, FileText } from "lucide-react";

export default function ProformaInvoicesPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: pis, isLoading } = useQuery({ queryKey: ["/api/proforma-invoices"] });
  const { data: customers } = useQuery({ queryKey: ["/api/customers"] });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/proforma-invoices", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/proforma-invoices"] }); setDialogOpen(false); toast({ title: "PI created" }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      customerId: parseInt(fd.get("buyerId") as string),
      issueDate: fd.get("issueDate") as string,
      currency: fd.get("currency") || "USD",
      deliveryTerms: fd.get("shippingTerms") || undefined,
      paymentTerms: fd.get("paymentTerms") || undefined,
    });
  };

  const filtered = Array.isArray(pis) ? pis.filter((p: any) =>
    p.piNumber?.toLowerCase().includes(search.toLowerCase()) ||
    p.buyerName?.toLowerCase().includes(search.toLowerCase())
  ) : [];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Proforma Invoices</h1>
          <p className="text-sm text-muted-foreground">Combine orders into proforma invoices for buyers</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-60" />
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New PI</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Proforma Invoice</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div><Label>Buyer</Label>
                  <Select name="buyerId" required>
                    <SelectTrigger><SelectValue placeholder="Select buyer..." /></SelectTrigger>
                    <SelectContent>{Array.isArray(customers) && customers.map((c: any) => (<SelectItem key={c.id} value={c.id.toString()}>{c.customerName}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Issue Date</Label><Input name="issueDate" type="date" required /></div>
                  <div><Label>Currency</Label><Input name="currency" defaultValue="USD" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Shipping Terms</Label><Input name="shippingTerms" placeholder="FOB / CIF..." /></div>
                  <div><Label>Payment Terms</Label><Input name="paymentTerms" placeholder="L/C at sight..." /></div>
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending}>{createMutation.isPending ? "Creating..." : "Create PI"}</Button>
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
                  <th className="text-left p-3 text-sm font-medium">PI Number</th>
                  <th className="text-left p-3 text-sm font-medium">Buyer</th>
                  <th className="text-left p-3 text-sm font-medium">Value</th>
                  <th className="text-left p-3 text-sm font-medium">Status</th>
                  <th className="text-left p-3 text-sm font-medium">Date</th>
                  <th className="text-left p-3 text-sm font-medium">Actions</th>
                </tr></thead>
                <tbody>
                  {filtered.map((pi: any) => (
                    <tr key={pi.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 text-sm font-medium">{pi.piNumber}</td>
                      <td className="p-3 text-sm">{pi.buyerName || '—'}</td>
                      <td className="p-3 text-sm">{pi.totalAmount ? `${pi.currency} ${Number(pi.totalAmount).toLocaleString()}` : '—'}</td>
                      <td className="p-3"><Badge variant="outline">{pi.status}</Badge></td>
                      <td className="p-3 text-sm text-muted-foreground">{pi.issueDate}</td>
                      <td className="p-3">
                        <Link href={`/commercial/proforma-invoices/${pi.id}`}>
                          <Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (<tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No proforma invoices found</td></tr>)}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
