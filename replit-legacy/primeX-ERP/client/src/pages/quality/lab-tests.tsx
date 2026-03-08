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
import { Plus, FlaskConical, Loader2, Edit } from "lucide-react";

const statusColors: Record<string, string> = {
  PENDING: "bg-gray-100 text-gray-800",
  SENT: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-green-100 text-green-800",
};

const resultColors: Record<string, string> = {
  PASS: "bg-green-100 text-green-800",
  FAIL: "bg-red-100 text-red-800",
  CONDITIONAL: "bg-amber-100 text-amber-800",
  PENDING: "bg-gray-100 text-gray-800",
};

export default function LabTestsPage() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);

  const { data, isLoading } = useQuery<{ success: boolean; data: any[] }>({
    queryKey: ["/api/quality/lab-tests"],
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => apiRequest("/api/quality/lab-tests", "POST", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quality/lab-tests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quality/dashboard"] });
      setCreateOpen(false);
      toast({ title: "Lab test created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: any) => apiRequest(`/api/quality/lab-tests/${id}`, "PUT", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quality/lab-tests"] });
      setEditItem(null);
      toast({ title: "Lab test updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      testNumber: "",
      testName: fd.get("testName"),
      labName: fd.get("labName") || null,
      testCategory: fd.get("testCategory") || null,
      sampleId: fd.get("sampleId") || null,
      sentDate: fd.get("sentDate") || null,
      expectedDate: fd.get("expectedDate") || null,
      notes: fd.get("notes") || null,
    });
  };

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    updateMutation.mutate({
      id: editItem.id,
      status: fd.get("status") || editItem.status,
      overallResult: fd.get("overallResult") || editItem.overallResult,
      receivedDate: fd.get("receivedDate") || editItem.receivedDate,
      notes: fd.get("notes") || editItem.notes,
    });
  };

  const tests = data?.data || [];

  return (
    <DashboardContainer
      title="Lab Tests"
      subtitle="Track laboratory testing of materials and products"
      actions={
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> New Lab Test</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Lab Test</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div><Label>Test Name *</Label><Input name="testName" required placeholder="e.g. Colorfastness to Washing" /></div>
              <div><Label>Lab Name</Label><Input name="labName" placeholder="Laboratory name" /></div>
              <div>
                <Label>Category</Label>
                <Select name="testCategory">
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PHYSICAL">Physical</SelectItem>
                    <SelectItem value="CHEMICAL">Chemical</SelectItem>
                    <SelectItem value="COLORFASTNESS">Colorfastness</SelectItem>
                    <SelectItem value="DIMENSIONAL">Dimensional</SelectItem>
                    <SelectItem value="SAFETY">Safety</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Sample ID</Label><Input name="sampleId" placeholder="Sample identifier" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Sent Date</Label><Input name="sentDate" type="date" /></div>
                <div><Label>Expected Date</Label><Input name="expectedDate" type="date" /></div>
              </div>
              <div><Label>Notes</Label><Textarea name="notes" placeholder="Optional notes" /></div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Create Lab Test
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
                <TableHead>Test #</TableHead>
                <TableHead>Test Name</TableHead>
                <TableHead>Lab</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
              ) : tests.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No lab tests found</TableCell></TableRow>
              ) : (
                tests.map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.testNumber}</TableCell>
                    <TableCell>{t.testName}</TableCell>
                    <TableCell>{t.labName || "—"}</TableCell>
                    <TableCell>{t.testCategory || "—"}</TableCell>
                    <TableCell><Badge className={statusColors[t.status] || "bg-gray-100"}>{t.status}</Badge></TableCell>
                    <TableCell><Badge className={resultColors[t.overallResult] || "bg-gray-100"}>{t.overallResult || "PENDING"}</Badge></TableCell>
                    <TableCell>{t.sentDate || "—"}</TableCell>
                    <TableCell>{t.expectedDate || "—"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => setEditItem(t)}><Edit className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Update Lab Test</DialogTitle></DialogHeader>
          {editItem && (
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <Label>Status</Label>
                <Select name="status" defaultValue={editItem.status}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="SENT">Sent</SelectItem>
                    <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                    <SelectItem value="COMPLETED">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Result</Label>
                <Select name="overallResult" defaultValue={editItem.overallResult || ""}>
                  <SelectTrigger><SelectValue placeholder="Select result" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PASS">Pass</SelectItem>
                    <SelectItem value="FAIL">Fail</SelectItem>
                    <SelectItem value="CONDITIONAL">Conditional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Received Date</Label><Input name="receivedDate" type="date" defaultValue={editItem.receivedDate || ""} /></div>
              <div><Label>Notes</Label><Textarea name="notes" defaultValue={editItem.notes || ""} /></div>
              <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Update
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </DashboardContainer>
  );
}
