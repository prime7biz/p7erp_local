import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Lock, Unlock, Trash2, Loader2, Calendar } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { AccountingPeriod } from "@shared/schema";

export default function AccountingPeriods() {
  const { toast } = useToast();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<AccountingPeriod | null>(null);
  const [closeReason, setCloseReason] = useState("");

  const { data: periods = [], isLoading } = useQuery<AccountingPeriod[]>({
    queryKey: ["/api/accounting/periods"],
  });

  const addForm = useForm({
    defaultValues: { name: "", startDate: "", endDate: "" },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; startDate: string; endDate: string }) => {
      const res = await apiRequest("/api/accounting/periods", "POST", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/periods"] });
      toast({ title: "Period created", description: "Accounting period has been created successfully." });
      setAddDialogOpen(false);
      addForm.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const closeMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const res = await apiRequest(`/api/accounting/periods/${id}/close`, "POST", { reason });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/periods"] });
      toast({ title: "Period closed", description: data.message });
      setCloseDialogOpen(false);
      setSelectedPeriod(null);
      setCloseReason("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const openMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(`/api/accounting/periods/${id}/open`, "POST", {});
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/periods"] });
      toast({ title: "Period reopened", description: data.message });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(`/api/accounting/periods/${id}`, "DELETE");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/periods"] });
      toast({ title: "Period deleted", description: "Accounting period has been deleted." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleClose = (period: AccountingPeriod) => {
    setSelectedPeriod(period);
    setCloseReason("");
    setCloseDialogOpen(true);
  };

  const confirmClose = () => {
    if (selectedPeriod) {
      closeMutation.mutate({ id: selectedPeriod.id, reason: closeReason });
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <DashboardContainer title="Accounting Periods" subtitle="Manage accounting periods and control posting restrictions">
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Calendar className="h-4 w-4" />
            <span>{periods.length} period{periods.length !== 1 ? "s" : ""} configured</span>
          </div>
          <Button onClick={() => setAddDialogOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Add Period
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
          </div>
        ) : periods.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Calendar className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium">No accounting periods defined</p>
            <p className="text-sm mt-1">Create periods to control when vouchers can be posted.</p>
          </div>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Closed At</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map((period) => (
                  <TableRow key={period.id}>
                    <TableCell className="font-medium">{period.name}</TableCell>
                    <TableCell>{formatDate(period.startDate)}</TableCell>
                    <TableCell>{formatDate(period.endDate)}</TableCell>
                    <TableCell>
                      {period.isClosed ? (
                        <Badge variant="destructive" className="gap-1">
                          <Lock className="h-3 w-3" />
                          Closed
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 bg-green-50 text-green-700 border-green-200">
                          <Unlock className="h-3 w-3" />
                          Open
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {period.closedAt ? formatDate(period.closedAt as unknown as string) : "-"}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500 max-w-[200px] truncate">
                      {period.closedReason || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {period.isClosed ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openMutation.mutate(period.id)}
                            disabled={openMutation.isPending}
                          >
                            <Unlock className="h-3.5 w-3.5 mr-1" />
                            Reopen
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleClose(period)}
                              disabled={closeMutation.isPending}
                            >
                              <Lock className="h-3.5 w-3.5 mr-1" />
                              Close
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => deleteMutation.mutate(period.id)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Accounting Period</DialogTitle>
            <DialogDescription>
              Define a new accounting period. Closing a period will prevent voucher posting within its date range.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={addForm.handleSubmit((data) => createMutation.mutate(data))}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Period Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., January 2026"
                  {...addForm.register("name", { required: true })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    {...addForm.register("startDate", { required: true })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    {...addForm.register("endDate", { required: true })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Create Period
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close Accounting Period</DialogTitle>
            <DialogDescription>
              Closing "{selectedPeriod?.name}" will prevent any voucher posting within this period's date range.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="closeReason">Reason (optional)</Label>
              <Textarea
                id="closeReason"
                placeholder="Enter reason for closing this period..."
                value={closeReason}
                onChange={(e) => setCloseReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCloseDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmClose}
              disabled={closeMutation.isPending}
            >
              {closeMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Close Period
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardContainer>
  );
}
