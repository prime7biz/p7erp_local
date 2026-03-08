import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, Eye, CheckCircle2 } from "lucide-react";

const statusColors: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-blue-100 text-blue-800",
  RECEIVED: "bg-indigo-100 text-indigo-800",
  INSPECTED: "bg-purple-100 text-purple-800",
  COMPLETED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
};

export default function ReturnsPage() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  const { data, isLoading } = useQuery<{ success: boolean; data: any[] }>({
    queryKey: ["/api/quality/returns"],
  });

  const detailQuery = useQuery<{ success: boolean; data: any }>({
    queryKey: ["/api/quality/returns", detailId],
    enabled: !!detailId,
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => apiRequest("/api/quality/returns", "POST", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quality/returns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quality/dashboard"] });
      setCreateOpen(false);
      toast({ title: "Return request created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/quality/returns/${id}/approve`, "POST", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quality/returns"] });
      toast({ title: "Return approved" });
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      returnNumber: "",
      returnType: fd.get("returnType"),
      referenceType: fd.get("referenceType") || null,
      reason: fd.get("reason"),
      totalAmount: fd.get("totalAmount") || "0",
      notes: fd.get("notes") || null,
      lines: [],
    });
  };

  const returns = data?.data || [];

  return (
    <DashboardContainer
      title="Return Requests"
      subtitle="Manage customer and supplier returns"
      actions={
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> New Return</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Return Request</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label>Return Type *</Label>
                <Select name="returnType" required>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CUSTOMER_RETURN">Customer Return</SelectItem>
                    <SelectItem value="SUPPLIER_RETURN">Supplier Return</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Reference Type</Label>
                <Select name="referenceType">
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SALES_INVOICE">Sales Invoice</SelectItem>
                    <SelectItem value="DELIVERY_CHALLAN">Delivery Challan</SelectItem>
                    <SelectItem value="GRN">GRN</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Reason *</Label><Textarea name="reason" required placeholder="Reason for return" /></div>
              <div><Label>Total Amount (BDT)</Label><Input name="totalAmount" type="number" step="0.01" placeholder="0.00" /></div>
              <div><Label>Notes</Label><Textarea name="notes" placeholder="Additional notes" /></div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Create Return
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Return #</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Amount (BDT)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
              ) : returns.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No return requests found</TableCell></TableRow>
              ) : (
                returns.map((ret: any) => (
                  <TableRow key={ret.id}>
                    <TableCell className="font-medium">{ret.returnNumber}</TableCell>
                    <TableCell><Badge variant="outline">{ret.returnType?.replace("_", " ")}</Badge></TableCell>
                    <TableCell>{ret.referenceType || "—"}</TableCell>
                    <TableCell>{ret.totalItems || 0}</TableCell>
                    <TableCell>BDT {Number(ret.totalAmount || 0).toLocaleString()}</TableCell>
                    <TableCell><Badge className={statusColors[ret.status] || "bg-gray-100"}>{ret.status}</Badge></TableCell>
                    <TableCell>{ret.createdAt ? new Date(ret.createdAt).toLocaleDateString() : "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setDetailId(ret.id)}><Eye className="h-4 w-4" /></Button>
                        {ret.status === "PENDING" && (
                          <Button variant="ghost" size="sm" onClick={() => approveMutation.mutate(ret.id)} title="Approve">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!detailId} onOpenChange={(open) => !open && setDetailId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Return Request Details</DialogTitle></DialogHeader>
          {detailQuery.isLoading ? (
            <div className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
          ) : detailQuery.data?.data ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label className="text-muted-foreground">Number</Label><p className="font-medium">{detailQuery.data.data.returnNumber}</p></div>
                <div><Label className="text-muted-foreground">Type</Label><p>{detailQuery.data.data.returnType?.replace("_", " ")}</p></div>
                <div><Label className="text-muted-foreground">Status</Label><Badge className={statusColors[detailQuery.data.data.status]}>{detailQuery.data.data.status}</Badge></div>
                <div><Label className="text-muted-foreground">Amount</Label><p className="font-medium">BDT {Number(detailQuery.data.data.totalAmount || 0).toLocaleString()}</p></div>
              </div>
              <div><Label className="text-muted-foreground">Reason</Label><p className="text-sm">{detailQuery.data.data.reason}</p></div>
              {detailQuery.data.data.notes && (
                <div><Label className="text-muted-foreground">Notes</Label><p className="text-sm">{detailQuery.data.data.notes}</p></div>
              )}
              {detailQuery.data.data.lines?.length > 0 && (
                <div>
                  <Label className="text-muted-foreground mb-2 block">Line Items</Label>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Unit Price</TableHead>
                        <TableHead>Condition</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailQuery.data.data.lines.map((line: any) => (
                        <TableRow key={line.id}>
                          <TableCell>{line.itemId}</TableCell>
                          <TableCell>{line.quantity}</TableCell>
                          <TableCell>BDT {Number(line.unitPrice || 0).toLocaleString()}</TableCell>
                          <TableCell>{line.condition || "—"}</TableCell>
                          <TableCell>{line.reason || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </DashboardContainer>
  );
}
