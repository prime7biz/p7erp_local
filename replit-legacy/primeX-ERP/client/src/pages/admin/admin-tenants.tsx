import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import AdminLayout from "@/components/layout/admin-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Search, Building2, Eye, CheckCircle, XCircle, Ban } from "lucide-react";

interface Tenant {
  id: number;
  name: string;
  domain: string;
  companyCode: string;
  isActive: boolean;
  status: string;
  subscriptionPlan: string;
  subscriptionStatus: string;
  approvedAt: string | null;
  approvedBy: string | null;
  rejectedReason: string | null;
  createdAt: string;
}

type ActionType = "reject" | "suspend" | null;

function getStatusBadge(status: string) {
  switch (status?.toUpperCase()) {
    case "PENDING":
      return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Pending</Badge>;
    case "APPROVED":
      return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Approved</Badge>;
    case "REJECTED":
      return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Rejected</Badge>;
    case "SUSPENDED":
      return <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100">Suspended</Badge>;
    default:
      return <Badge variant="outline">{status || "Unknown"}</Badge>;
  }
}

export default function AdminTenants() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogAction, setDialogAction] = useState<ActionType>(null);
  const [dialogTenantId, setDialogTenantId] = useState<number | null>(null);
  const [dialogReason, setDialogReason] = useState("");
  const { toast } = useToast();

  const { data: tenants, isLoading } = useQuery<Tenant[]>({
    queryKey: ["/api/admin/tenants"],
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/tenants/${id}/approve`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to approve" }));
        throw new Error(err.message || "Failed to approve tenant");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      toast({ title: "Tenant Approved", description: "Tenant has been approved successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const res = await fetch(`/api/admin/tenants/${id}/reject`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to reject" }));
        throw new Error(err.message || "Failed to reject tenant");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      toast({ title: "Tenant Rejected", description: "Tenant has been rejected." });
      closeDialog();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const suspendMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const res = await fetch(`/api/admin/tenants/${id}/suspend`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to suspend" }));
        throw new Error(err.message || "Failed to suspend tenant");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      toast({ title: "Tenant Suspended", description: "Tenant has been suspended." });
      closeDialog();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const openDialog = (action: ActionType, tenantId: number) => {
    setDialogAction(action);
    setDialogTenantId(tenantId);
    setDialogReason("");
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setDialogAction(null);
    setDialogTenantId(null);
    setDialogReason("");
  };

  const handleDialogSubmit = () => {
    if (!dialogTenantId || !dialogAction) return;
    if (!dialogReason.trim()) {
      toast({ title: "Reason Required", description: "Please provide a reason.", variant: "destructive" });
      return;
    }
    if (dialogAction === "reject") {
      rejectMutation.mutate({ id: dialogTenantId, reason: dialogReason.trim() });
    } else if (dialogAction === "suspend") {
      suspendMutation.mutate({ id: dialogTenantId, reason: dialogReason.trim() });
    }
  };

  const filtered = tenants?.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.domain.toLowerCase().includes(search.toLowerCase()) ||
      (t.companyCode && t.companyCode.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === "ALL" || t.status?.toUpperCase() === statusFilter;
    return matchesSearch && matchesStatus;
  }) ?? [];

  const isActionPending = approveMutation.isPending || rejectMutation.isPending || suspendMutation.isPending;

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tenants</h1>
            <p className="text-gray-600">Manage all registered tenants ({tenants?.length ?? 0} total)</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="SUSPENDED">Suspended</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search tenants..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 w-64"
              />
            </div>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company Name</TableHead>
                    <TableHead>Company Code</TableHead>
                    <TableHead>Domain</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Subscription</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                        <Building2 className="mx-auto h-8 w-8 mb-2 text-gray-300" />
                        No tenants found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((tenant) => (
                      <TableRow key={tenant.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setLocation(`/admin/tenants/${tenant.id}`)}>
                        <TableCell className="font-medium">{tenant.name}</TableCell>
                        <TableCell className="text-gray-600 text-sm font-mono">{tenant.companyCode || "—"}</TableCell>
                        <TableCell className="text-gray-600 text-sm">{tenant.domain}</TableCell>
                        <TableCell>{getStatusBadge(tenant.status)}</TableCell>
                        <TableCell className="capitalize">{tenant.subscriptionPlan || "—"}</TableCell>
                        <TableCell className="text-gray-600 text-sm">
                          {new Date(tenant.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-7 px-2 gap-1"
                              onClick={() => setLocation(`/admin/tenants/${tenant.id}`)}
                            >
                              <Eye className="h-3 w-3" /> View
                            </Button>
                            {tenant.status?.toUpperCase() === "PENDING" && (
                              <>
                                <Button
                                  size="sm"
                                  className="text-xs h-7 px-2 gap-1 bg-green-600 hover:bg-green-700 text-white"
                                  disabled={isActionPending}
                                  onClick={() => approveMutation.mutate(tenant.id)}
                                >
                                  <CheckCircle className="h-3 w-3" /> Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="text-xs h-7 px-2 gap-1"
                                  disabled={isActionPending}
                                  onClick={() => openDialog("reject", tenant.id)}
                                >
                                  <XCircle className="h-3 w-3" /> Reject
                                </Button>
                              </>
                            )}
                            {tenant.status?.toUpperCase() === "APPROVED" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7 px-2 gap-1 border-gray-400 text-gray-700 hover:bg-gray-100"
                                disabled={isActionPending}
                                onClick={() => openDialog("suspend", tenant.id)}
                              >
                                <Ban className="h-3 w-3" /> Suspend
                              </Button>
                            )}
                            {tenant.status?.toUpperCase() === "REJECTED" && (
                              <Button
                                size="sm"
                                className="text-xs h-7 px-2 gap-1 bg-green-600 hover:bg-green-700 text-white"
                                disabled={isActionPending}
                                onClick={() => approveMutation.mutate(tenant.id)}
                              >
                                <CheckCircle className="h-3 w-3" /> Approve
                              </Button>
                            )}
                            {tenant.status?.toUpperCase() === "SUSPENDED" && (
                              <Button
                                size="sm"
                                className="text-xs h-7 px-2 gap-1 bg-green-600 hover:bg-green-700 text-white"
                                disabled={isActionPending}
                                onClick={() => approveMutation.mutate(tenant.id)}
                              >
                                <CheckCircle className="h-3 w-3" /> Reactivate
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogAction === "reject" ? "Reject Tenant" : "Suspend Tenant"}
            </DialogTitle>
            <DialogDescription>
              {dialogAction === "reject"
                ? "Please provide a reason for rejecting this tenant."
                : "Please provide a reason for suspending this tenant."}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder={dialogAction === "reject" ? "Reason for rejection..." : "Reason for suspension..."}
              value={dialogReason}
              onChange={(e) => setDialogReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleDialogSubmit}
              disabled={rejectMutation.isPending || suspendMutation.isPending}
            >
              {(rejectMutation.isPending || suspendMutation.isPending) ? "Processing..." : dialogAction === "reject" ? "Reject" : "Suspend"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
