import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Plus, ClipboardCheck, Loader2, Eye, CheckCircle2 } from "lucide-react";

const statusColors: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};

const resultColors: Record<string, string> = {
  PASS: "bg-green-100 text-green-800",
  FAIL: "bg-red-100 text-red-800",
  CONDITIONAL: "bg-amber-100 text-amber-800",
  PENDING: "bg-gray-100 text-gray-800",
};

export default function QCInspectionsPage() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const { data, isLoading } = useQuery<{ success: boolean; data: any[] }>({
    queryKey: ["/api/quality/inspections"],
  });

  const detailQuery = useQuery<{ success: boolean; data: any }>({
    queryKey: ["/api/quality/inspections", detailId],
    enabled: !!detailId,
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => apiRequest("/api/quality/inspections", "POST", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quality/inspections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quality/dashboard"] });
      setCreateOpen(false);
      toast({ title: "Inspection created successfully" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/quality/inspections/${id}/approve`, "POST", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quality/inspections"] });
      toast({ title: "Inspection approved" });
    },
  });

  const inspections = (data?.data || []).filter((i: any) => {
    if (filterType !== "all" && i.inspectionType !== filterType) return false;
    if (filterStatus !== "all" && i.status !== filterStatus) return false;
    return true;
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      inspectionNumber: "",
      inspectionType: fd.get("inspectionType"),
      referenceType: fd.get("referenceType") || null,
      sampleSize: fd.get("sampleSize") ? +fd.get("sampleSize")! : null,
      notes: fd.get("notes") || null,
    });
  };

  return (
    <DashboardContainer
      title="QC Inspections"
      subtitle="Manage quality control inspections"
      actions={
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> New Inspection</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Inspection</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label>Inspection Type</Label>
                <Select name="inspectionType" required>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INCOMING">Incoming</SelectItem>
                    <SelectItem value="IN_PROCESS">In Process</SelectItem>
                    <SelectItem value="PRE_SHIPMENT">Pre-Shipment</SelectItem>
                    <SelectItem value="FINAL">Final</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Reference Type</Label>
                <Select name="referenceType">
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GRN">GRN</SelectItem>
                    <SelectItem value="PRODUCTION_ORDER">Production Order</SelectItem>
                    <SelectItem value="DELIVERY_CHALLAN">Delivery Challan</SelectItem>
                    <SelectItem value="LOT">Lot</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Sample Size</Label>
                <Input name="sampleSize" type="number" placeholder="Sample size" />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea name="notes" placeholder="Optional notes" />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create Inspection
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="flex gap-3 mb-4">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="INCOMING">Incoming</SelectItem>
            <SelectItem value="IN_PROCESS">In Process</SelectItem>
            <SelectItem value="PRE_SHIPMENT">Pre-Shipment</SelectItem>
            <SelectItem value="FINAL">Final</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Inspection #</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Sample Size</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
              ) : inspections.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No inspections found</TableCell></TableRow>
              ) : (
                inspections.map((insp: any) => (
                  <TableRow key={insp.id}>
                    <TableCell className="font-medium">{insp.inspectionNumber}</TableCell>
                    <TableCell>{insp.inspectionType}</TableCell>
                    <TableCell>{insp.referenceType || "—"}</TableCell>
                    <TableCell>{insp.sampleSize || "—"}</TableCell>
                    <TableCell><Badge className={statusColors[insp.status] || "bg-gray-100"}>{insp.status}</Badge></TableCell>
                    <TableCell><Badge className={resultColors[insp.overallResult] || "bg-gray-100"}>{insp.overallResult || "PENDING"}</Badge></TableCell>
                    <TableCell>{insp.createdAt ? new Date(insp.createdAt).toLocaleDateString() : "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setDetailId(insp.id)}><Eye className="h-4 w-4" /></Button>
                        {insp.status === "COMPLETED" && !insp.approvedBy && (
                          <Button variant="ghost" size="sm" onClick={() => approveMutation.mutate(insp.id)}>
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
          <DialogHeader><DialogTitle>Inspection Details</DialogTitle></DialogHeader>
          {detailQuery.isLoading ? (
            <div className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
          ) : detailQuery.data?.data ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label className="text-muted-foreground">Number</Label><p className="font-medium">{detailQuery.data.data.inspectionNumber}</p></div>
                <div><Label className="text-muted-foreground">Type</Label><p className="font-medium">{detailQuery.data.data.inspectionType}</p></div>
                <div><Label className="text-muted-foreground">Status</Label><Badge className={statusColors[detailQuery.data.data.status]}>{detailQuery.data.data.status}</Badge></div>
                <div><Label className="text-muted-foreground">Result</Label><Badge className={resultColors[detailQuery.data.data.overallResult] || "bg-gray-100"}>{detailQuery.data.data.overallResult || "PENDING"}</Badge></div>
                <div><Label className="text-muted-foreground">Sample Size</Label><p>{detailQuery.data.data.sampleSize || "—"}</p></div>
                <div><Label className="text-muted-foreground">Reference</Label><p>{detailQuery.data.data.referenceType || "—"}</p></div>
              </div>
              {detailQuery.data.data.notes && (
                <div><Label className="text-muted-foreground">Notes</Label><p className="text-sm">{detailQuery.data.data.notes}</p></div>
              )}
              {detailQuery.data.data.results?.length > 0 && (
                <div>
                  <Label className="text-muted-foreground mb-2 block">Results</Label>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Parameter</TableHead>
                        <TableHead>Measured</TableHead>
                        <TableHead>Result</TableHead>
                        <TableHead>Severity</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailQuery.data.data.results.map((r: any) => (
                        <TableRow key={r.id}>
                          <TableCell>{r.parameterId}</TableCell>
                          <TableCell>{r.measuredValue || r.textResult || "—"}</TableCell>
                          <TableCell><Badge className={resultColors[r.result] || "bg-gray-100"}>{r.result || "—"}</Badge></TableCell>
                          <TableCell>{r.defectSeverity || "—"}</TableCell>
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
