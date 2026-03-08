import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenantCurrencySettings, getCurrencySymbol } from "@/lib/currency";
import { useLocation } from "wouter";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  Eye,
  Calendar,
  CheckCircle,
  XCircle,
  Loader2,
  ClipboardCheck,
  Inbox,
  ArrowLeft,
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PendingVoucher {
  id: number;
  voucherNumber: string;
  voucherDate: string;
  voucherTypeId: number;
  voucherTypeName: string;
  statusId: number;
  statusName: string;
  statusColor: string;
  amount: string;
  description: string | null;
  reference: string | null;
  preparedById: number;
  preparedByName: string;
  createdAt: string;
}

function getStatusBadgeClass(statusId: number): string {
  switch (statusId) {
    case 8: return "bg-blue-100 text-blue-800 hover:bg-blue-200";
    case 9: return "bg-purple-100 text-purple-800 hover:bg-purple-200";
    case 10: return "bg-orange-100 text-orange-800 hover:bg-orange-200";
    default: return "bg-gray-100 text-gray-800 hover:bg-gray-200";
  }
}

export default function ApprovalQueuePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: tenantCurrency } = useTenantCurrencySettings();
  const currencySymbol = getCurrencySymbol(tenantCurrency?.baseCurrency || "BDT");
  const [searchTerm, setSearchTerm] = useState("");
  const [voucherTypeFilter, setVoucherTypeFilter] = useState<string | undefined>(undefined);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [approveComments, setApproveComments] = useState("");
  const [selectedVoucherId, setSelectedVoucherId] = useState<number | null>(null);

  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const { data: pendingVouchers, isLoading, isError } = useQuery<PendingVoucher[]>({
    queryKey: ["/api/accounting/vouchers/approval-queue"],
    retry: false,
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, comments }: { id: number; comments: string }) => {
      await apiRequest(`/api/accounting/vouchers/${id}/approve`, "POST", { comments });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/vouchers/approval-queue"] });
      toast({ title: "Voucher approved successfully" });
      setApproveDialogOpen(false);
      setApproveComments("");
      setSelectedVoucherId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to approve voucher", description: error.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason, comments }: { id: number; reason: string; comments: string }) => {
      await apiRequest(`/api/accounting/vouchers/${id}/reject`, "POST", { reason, comments });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/vouchers/approval-queue"] });
      toast({ title: "Voucher rejected" });
      setRejectDialogOpen(false);
      setRejectReason("");
      setSelectedVoucherId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to reject voucher", description: error.message, variant: "destructive" });
    },
  });

  const handleApproveClick = (id: number) => {
    setSelectedVoucherId(id);
    setApproveComments("");
    setApproveDialogOpen(true);
  };

  const handleRejectClick = (id: number) => {
    setSelectedVoucherId(id);
    setRejectReason("");
    setRejectDialogOpen(true);
  };

  const handleApproveConfirm = () => {
    if (selectedVoucherId === null) return;
    approveMutation.mutate({ id: selectedVoucherId, comments: approveComments.trim() || "Approved" });
  };

  const handleRejectConfirm = () => {
    if (selectedVoucherId === null || !rejectReason.trim()) return;
    rejectMutation.mutate({ id: selectedVoucherId, reason: rejectReason.trim(), comments: rejectReason.trim() });
  };

  const getDaysPending = (createdAt: string): number => {
    try {
      return differenceInDays(new Date(), new Date(createdAt));
    } catch {
      return 0;
    }
  };

  const filteredVouchers = (pendingVouchers || []).filter((v) => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      if (
        !v.voucherNumber.toLowerCase().includes(term) &&
        !v.preparedByName.toLowerCase().includes(term) &&
        !(v.description || "").toLowerCase().includes(term)
      ) {
        return false;
      }
    }
    if (voucherTypeFilter && voucherTypeFilter !== "all") {
      if (v.voucherTypeId.toString() !== voucherTypeFilter) return false;
    }
    if (fromDate) {
      if (new Date(v.voucherDate) < new Date(fromDate)) return false;
    }
    if (toDate) {
      if (new Date(v.voucherDate) > new Date(toDate)) return false;
    }
    return true;
  });

  const voucherTypes = Array.from(
    new Map((pendingVouchers || []).map((v) => [v.voucherTypeId, v.voucherTypeName])).entries()
  ).map(([id, name]) => ({ id, name }));

  const totalPendingAmount = filteredVouchers.reduce(
    (sum, v) => sum + (parseFloat(v.amount) || 0),
    0
  );

  const pageActions = (
    <div className="flex space-x-2">
      <Button variant="outline" onClick={() => setLocation("/accounts/vouchers")}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Vouchers
      </Button>
    </div>
  );

  return (
    <DashboardContainer
      title="Approval Queue"
      subtitle="Review and approve pending vouchers"
      actions={pageActions}
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending Approvals</CardDescription>
            <CardTitle className="text-2xl">{filteredVouchers.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Pending Amount</CardDescription>
            <CardTitle className="text-2xl">
              {`${currencySymbol}${totalPendingAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Oldest Pending</CardDescription>
            <CardTitle className="text-2xl">
              {filteredVouchers.length > 0
                ? `${Math.max(...filteredVouchers.map((v) => getDaysPending(v.createdAt)))} days`
                : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-2 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by voucher number, submitter, or description..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Select value={voucherTypeFilter} onValueChange={setVoucherTypeFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Voucher Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {voucherTypes.map((type) => (
                <SelectItem key={type.id} value={type.id.toString()}>
                  {type.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-[140px] h-10"
            />
            <span className="text-muted-foreground text-sm">to</span>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-[140px] h-10"
            />
          </div>

          {(searchTerm || voucherTypeFilter || fromDate || toDate) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchTerm("");
                setVoucherTypeFilter(undefined);
                setFromDate("");
                setToDate("");
              }}
              className="h-10"
            >
              Clear Filters
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Voucher #</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Submitted By</TableHead>
              <TableHead className="text-center">Days Pending</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={8}>
                    <div className="flex items-center space-x-4">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-12" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-red-600">
                  Error loading approval queue. Please try again.
                </TableCell>
              </TableRow>
            ) : filteredVouchers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12">
                  <div className="flex flex-col items-center gap-3">
                    <Inbox className="h-12 w-12 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-muted-foreground">No pending approvals</p>
                      <p className="text-sm text-muted-foreground">
                        {searchTerm || voucherTypeFilter || fromDate || toDate
                          ? "Try adjusting your filters."
                          : "All vouchers have been reviewed."}
                      </p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredVouchers.map((voucher) => {
                const daysPending = getDaysPending(voucher.createdAt);
                return (
                  <TableRow key={voucher.id}>
                    <TableCell className="font-medium">{voucher.voucherNumber}</TableCell>
                    <TableCell>{voucher.voucherTypeName}</TableCell>
                    <TableCell>{format(new Date(voucher.voucherDate), "dd MMM yyyy")}</TableCell>
                    <TableCell>
                      <Badge className={getStatusBadgeClass(voucher.statusId)}>
                        {voucher.statusName}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {`${currencySymbol}${parseFloat(voucher.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </TableCell>
                    <TableCell>{voucher.preparedByName}</TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant="outline"
                        className={
                          daysPending > 7
                            ? "border-red-300 text-red-700 bg-red-50"
                            : daysPending > 3
                            ? "border-yellow-300 text-yellow-700 bg-yellow-50"
                            : "border-gray-300 text-gray-700"
                        }
                      >
                        {daysPending} {daysPending === 1 ? "day" : "days"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => setLocation(`/accounts/vouchers/view/${voucher.id}`)}
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          View
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => handleApproveClick(voucher.id)}
                          disabled={approveMutation.isPending || rejectMutation.isPending}
                        >
                          {approveMutation.isPending && selectedVoucherId === voucher.id ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <CheckCircle className="h-3 w-3 mr-1" />
                          )}
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 px-2 text-xs"
                          onClick={() => handleRejectClick(voucher.id)}
                          disabled={approveMutation.isPending || rejectMutation.isPending}
                        >
                          {rejectMutation.isPending && selectedVoucherId === voucher.id ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <XCircle className="h-3 w-3 mr-1" />
                          )}
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Approve Voucher
            </DialogTitle>
            <DialogDescription>
              Add optional comments for this approval.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Enter approval comments (optional)..."
            value={approveComments}
            onChange={(e) => setApproveComments(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={handleApproveConfirm}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-600" />
              Reject Voucher
            </DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this voucher. This is required.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Enter rejection reason..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectConfirm}
              disabled={!rejectReason.trim() || rejectMutation.isPending}
            >
              {rejectMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardContainer>
  );
}
