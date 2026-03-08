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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Globe, Search, Eye } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  ACTIVE: "bg-blue-100 text-blue-700",
  SHIPPED: "bg-purple-100 text-purple-700",
  DOCS_SUBMITTED: "bg-orange-100 text-orange-700",
  NEGOTIATED: "bg-yellow-100 text-yellow-700",
  SETTLED: "bg-green-100 text-green-700",
  CLOSED: "bg-gray-200 text-gray-600",
};

export default function ExportCasesPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedBuyerId, setSelectedBuyerId] = useState("");
  const [selectedPaymentMode, setSelectedPaymentMode] = useState("");
  const { toast } = useToast();

  const { data: cases, isLoading } = useQuery({ queryKey: ["/api/export-cases"] });
  const { data: customers } = useQuery({ queryKey: ["/api/customers"] });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/export-cases", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/export-cases"] });
      setDialogOpen(false);
      setSelectedBuyerId("");
      setSelectedPaymentMode("");
      toast({ title: "Export case created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const expectedDays = fd.get("expectedRealizationDays") as string;
    createMutation.mutate({
      buyerId: parseInt(selectedBuyerId),
      currency: fd.get("currency") || "USD",
      issueDate: fd.get("issueDate") || undefined,
      paymentMode: selectedPaymentMode || undefined,
      expectedRealizationDays: expectedDays ? parseInt(expectedDays) : undefined,
      notes: fd.get("notes") || undefined,
    });
  };

  const filtered = Array.isArray(cases) ? cases.filter((c: any) =>
    c.exportCaseNumber?.toLowerCase().includes(search.toLowerCase()) ||
    c.buyerName?.toLowerCase().includes(search.toLowerCase())
  ) : [];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Export Cases</h1>
          <p className="text-sm text-muted-foreground">Group orders under export LCs for finance tracking</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-60" />
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" /> New Export Case</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Export Case</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <Label>Buyer</Label>
                  <Select value={selectedBuyerId} onValueChange={setSelectedBuyerId} required>
                    <SelectTrigger><SelectValue placeholder="Select buyer..." /></SelectTrigger>
                    <SelectContent>
                      {Array.isArray(customers) && customers.map((c: any) => (
                        <SelectItem key={c.id} value={c.id.toString()}>{c.customerName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Currency</Label><Input name="currency" defaultValue="USD" /></div>
                  <div><Label>Issue Date</Label><Input name="issueDate" type="date" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Payment Mode</Label>
                    <Select value={selectedPaymentMode} onValueChange={setSelectedPaymentMode}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LC">LC</SelectItem>
                        <SelectItem value="TT">TT</SelectItem>
                        <SelectItem value="DP">DP</SelectItem>
                        <SelectItem value="DA">DA</SelectItem>
                        <SelectItem value="CAD">CAD</SelectItem>
                        <SelectItem value="MIXED">Mixed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Expected Realization (days)</Label>
                    <Input name="expectedRealizationDays" type="number" min="0" placeholder="e.g. 90" />
                  </div>
                </div>
                <div><Label>Notes</Label><Textarea name="notes" /></div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Create Export Case"}
                </Button>
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
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-3 text-sm font-medium">Case Number</th>
                    <th className="text-left p-3 text-sm font-medium">Buyer</th>
                    <th className="text-left p-3 text-sm font-medium">LC Number</th>
                    <th className="text-left p-3 text-sm font-medium">Value</th>
                    <th className="text-left p-3 text-sm font-medium">Status</th>
                    <th className="text-left p-3 text-sm font-medium">Created</th>
                    <th className="text-left p-3 text-sm font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((ec: any) => (
                    <tr key={ec.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 text-sm font-medium">{ec.exportCaseNumber}</td>
                      <td className="p-3 text-sm">{ec.buyerName || '—'}</td>
                      <td className="p-3 text-sm">{ec.lcNumber || '—'}</td>
                      <td className="p-3 text-sm">{ec.totalValue ? `${ec.currency} ${Number(ec.totalValue).toLocaleString()}` : '—'}</td>
                      <td className="p-3"><Badge className={STATUS_COLORS[ec.status] || ""}>{ec.status}</Badge></td>
                      <td className="p-3 text-sm text-muted-foreground">{ec.createdAt ? new Date(ec.createdAt).toLocaleDateString() : ''}</td>
                      <td className="p-3">
                        <Link href={`/commercial/export-cases/${ec.id}`}>
                          <Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No export cases found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
