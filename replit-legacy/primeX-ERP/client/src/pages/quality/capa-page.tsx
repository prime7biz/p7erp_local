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
import { Plus, Loader2, Edit, CheckCircle2, ShieldCheck } from "lucide-react";

const statusColors: Record<string, string> = {
  OPEN: "bg-red-100 text-red-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-green-100 text-green-800",
  VERIFIED: "bg-emerald-100 text-emerald-800",
  CLOSED: "bg-gray-100 text-gray-800",
};

const priorityColors: Record<string, string> = {
  LOW: "bg-gray-100 text-gray-800",
  MEDIUM: "bg-amber-100 text-amber-800",
  HIGH: "bg-orange-100 text-orange-800",
  CRITICAL: "bg-red-100 text-red-800",
};

export default function CapaPage() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);

  const { data, isLoading } = useQuery<{ success: boolean; data: any[] }>({
    queryKey: ["/api/quality/capa"],
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => apiRequest("/api/quality/capa", "POST", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quality/capa"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quality/dashboard"] });
      setCreateOpen(false);
      toast({ title: "CAPA created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: any) => apiRequest(`/api/quality/capa/${id}`, "PUT", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quality/capa"] });
      setEditItem(null);
      toast({ title: "CAPA updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const completeMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/quality/capa/${id}/complete`, "POST", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quality/capa"] });
      toast({ title: "CAPA marked completed" });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/quality/capa/${id}/verify`, "POST", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quality/capa"] });
      toast({ title: "CAPA verified" });
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      capaNumber: "",
      capaType: fd.get("capaType"),
      title: fd.get("title"),
      sourceType: fd.get("sourceType") || null,
      description: fd.get("description") || null,
      rootCause: fd.get("rootCause") || null,
      proposedAction: fd.get("proposedAction") || null,
      priority: fd.get("priority") || "MEDIUM",
      dueDate: fd.get("dueDate") || null,
    });
  };

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    updateMutation.mutate({
      id: editItem.id,
      status: fd.get("status"),
      rootCause: fd.get("rootCause"),
      proposedAction: fd.get("proposedAction"),
      notes: fd.get("notes"),
    });
  };

  const items = data?.data || [];

  return (
    <DashboardContainer
      title="CAPA Actions"
      subtitle="Corrective and Preventive Actions"
      actions={
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> New CAPA</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Create CAPA</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label>Type *</Label>
                <Select name="capaType" required>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CORRECTIVE">Corrective</SelectItem>
                    <SelectItem value="PREVENTIVE">Preventive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Title *</Label><Input name="title" required placeholder="Brief description of the issue" /></div>
              <div>
                <Label>Source</Label>
                <Select name="sourceType">
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="QC_INSPECTION">QC Inspection</SelectItem>
                    <SelectItem value="LAB_TEST">Lab Test</SelectItem>
                    <SelectItem value="CUSTOMER_COMPLAINT">Customer Complaint</SelectItem>
                    <SelectItem value="INTERNAL_AUDIT">Internal Audit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Description</Label><Textarea name="description" placeholder="Detailed description" /></div>
              <div><Label>Root Cause</Label><Textarea name="rootCause" placeholder="Root cause analysis" /></div>
              <div><Label>Proposed Action</Label><Textarea name="proposedAction" placeholder="Proposed corrective/preventive action" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Priority</Label>
                  <Select name="priority" defaultValue="MEDIUM">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="CRITICAL">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Due Date</Label><Input name="dueDate" type="date" /></div>
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Create CAPA
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
                <TableHead>CAPA #</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
              ) : items.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No CAPA actions found</TableCell></TableRow>
              ) : (
                items.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.capaNumber}</TableCell>
                    <TableCell><Badge variant="outline">{item.capaType}</Badge></TableCell>
                    <TableCell className="max-w-[200px] truncate">{item.title}</TableCell>
                    <TableCell><Badge className={priorityColors[item.priority] || "bg-gray-100"}>{item.priority}</Badge></TableCell>
                    <TableCell><Badge className={statusColors[item.status] || "bg-gray-100"}>{item.status}</Badge></TableCell>
                    <TableCell>{item.dueDate || "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEditItem(item)}><Edit className="h-4 w-4" /></Button>
                        {(item.status === "OPEN" || item.status === "IN_PROGRESS") && (
                          <Button variant="ghost" size="sm" onClick={() => completeMutation.mutate(item.id)} title="Mark Complete">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          </Button>
                        )}
                        {item.status === "COMPLETED" && (
                          <Button variant="ghost" size="sm" onClick={() => verifyMutation.mutate(item.id)} title="Verify">
                            <ShieldCheck className="h-4 w-4 text-blue-600" />
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

      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit CAPA</DialogTitle></DialogHeader>
          {editItem && (
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <Label>Status</Label>
                <Select name="status" defaultValue={editItem.status}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OPEN">Open</SelectItem>
                    <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                    <SelectItem value="COMPLETED">Completed</SelectItem>
                    <SelectItem value="VERIFIED">Verified</SelectItem>
                    <SelectItem value="CLOSED">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Root Cause</Label><Textarea name="rootCause" defaultValue={editItem.rootCause || ""} /></div>
              <div><Label>Proposed Action</Label><Textarea name="proposedAction" defaultValue={editItem.proposedAction || ""} /></div>
              <div><Label>Notes</Label><Textarea name="notes" defaultValue={editItem.notes || ""} /></div>
              <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Update CAPA
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </DashboardContainer>
  );
}
