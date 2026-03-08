import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft,
  FileEdit,
  Loader2,
  AlertCircle,
  Clock,
  ArrowRight,
  Check,
  CheckCircle,
  XCircle,
  FileText,
  Send,
  Ban,
  BookOpen,
  Printer,
  CreditCard,
} from "lucide-react";
import { format } from "date-fns";
import { DocumentHeader, AuditTimeline } from "@/components/erp/document-header";

interface VoucherDetail {
  id: number;
  voucherNumber: string;
  voucherDate: string;
  postingDate: string | null;
  voucherTypeId: number;
  voucherTypeName: string;
  statusId: number;
  statusName: string;
  statusColor: string;
  fiscalYearId: number;
  accountingPeriodId: number;
  reference: string | null;
  referenceDate: string | null;
  description: string | null;
  preparedById: number;
  preparedByName: string;
  amount: string;
  currencyCode: string;
  exchangeRate: string;
  isPosted: boolean;
  isCancelled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface VoucherItem {
  id: number;
  voucherId: number;
  lineNumber: number;
  accountId: number;
  accountCode: string;
  accountName: string;
  description: string | null;
  debitAmount: string;
  creditAmount: string;
}

interface BillAllocationDetail {
  id: number;
  billReferenceId: number | null;
  voucherId: number;
  voucherItemId: number | null;
  allocationType: string;
  amount: string;
  partyId: number;
  accountId: number;
  allocationDate: string;
  notes: string | null;
  billNumber: string | null;
  billDate: string | null;
  billType: string | null;
  originalAmount: string | null;
  pendingAmount: string | null;
  billStatus: string | null;
  partyName: string | null;
  accountName: string | null;
  accountCode: string | null;
}

interface ApprovalHistoryEntry {
  id: number;
  voucherId: number;
  fromStatusName: string;
  toStatusName: string;
  actionName: string;
  actionByName: string;
  comments: string | null;
  actionDate: string;
}

interface VoucherResponse {
  voucher: VoucherDetail;
  items: VoucherItem[];
  approvalHistory: ApprovalHistoryEntry[];
  billAllocations?: BillAllocationDetail[];
}

interface AvailableAction {
  id: number;
  actionName: string;
  toStatusId: number;
  requiredRole: string;
  description: string;
}

const APPROVAL_STAGES = [
  { statusId: 7, label: "Draft" },
  { statusId: 8, label: "Submitted" },
  { statusId: 9, label: "Checked" },
  { statusId: 10, label: "Recommended" },
  { statusId: 3, label: "Approved" },
  { statusId: 5, label: "Posted" },
];

function getActionButtonStyle(actionName: string): { className: string; variant: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" } {
  const name = actionName.toLowerCase();
  if (name.includes("submit")) return { className: "bg-blue-600 hover:bg-blue-700 text-white", variant: "default" };
  if (name.includes("check")) return { className: "bg-purple-600 hover:bg-purple-700 text-white", variant: "default" };
  if (name.includes("recommend")) return { className: "bg-orange-500 hover:bg-orange-600 text-white", variant: "default" };
  if (name.includes("approve")) return { className: "bg-green-600 hover:bg-green-700 text-white", variant: "default" };
  if (name.includes("post")) return { className: "bg-blue-600 hover:bg-blue-700 text-white", variant: "default" };
  if (name.includes("reject")) return { className: "bg-red-600 hover:bg-red-700 text-white", variant: "destructive" };
  if (name.includes("cancel")) return { className: "bg-gray-500 hover:bg-gray-600 text-white", variant: "default" };
  if (name.includes("revert")) return { className: "bg-yellow-500 hover:bg-yellow-600 text-white", variant: "default" };
  return { className: "", variant: "default" };
}

function formatAmount(val: string | number, currency: string = "BDT") {
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num)) return `${currency === "BDT" ? "BDT " : ""}0.00`;
  const prefix = currency === "BDT" ? "BDT " : "";
  return prefix + num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "-";
  try {
    return format(new Date(dateStr), "dd MMM yyyy");
  } catch {
    return dateStr;
  }
}

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return "-";
  try {
    return format(new Date(dateStr), "dd MMM yyyy, hh:mm a");
  } catch {
    return dateStr;
  }
}

function ApprovalStepper({ currentStatusId }: { currentStatusId: number }) {
  const isRejected = currentStatusId === 4;
  const isCancelled = currentStatusId === 6;

  const currentIndex = APPROVAL_STAGES.findIndex(s => s.statusId === currentStatusId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Approval Progress</CardTitle>
      </CardHeader>
      <CardContent>
        {(isRejected || isCancelled) && (
          <div className="mb-3">
            <Badge className={isRejected ? "bg-red-100 text-red-800" : "bg-gray-200 text-gray-800"}>
              {isRejected ? "Rejected" : "Cancelled"}
            </Badge>
          </div>
        )}
        <div className="flex items-center justify-between">
          {APPROVAL_STAGES.map((stage, index) => {
            const isCompleted = currentIndex > index;
            const isCurrent = currentIndex === index;
            const isPending = currentIndex < index;

            return (
              <div key={stage.statusId} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors ${
                      isCompleted
                        ? "border-green-500 bg-green-500 text-white"
                        : isCurrent
                        ? "border-blue-500 bg-blue-500 text-white"
                        : isPending
                        ? "border-gray-300 bg-white text-gray-400"
                        : "border-gray-300 bg-white text-gray-400"
                    }`}
                  >
                    {isCompleted ? <Check className="h-4 w-4" /> : index + 1}
                  </div>
                  <span
                    className={`mt-1 text-xs text-center whitespace-nowrap ${
                      isCompleted
                        ? "text-green-600 font-medium"
                        : isCurrent
                        ? "text-blue-600 font-semibold"
                        : "text-gray-400"
                    }`}
                  >
                    {stage.label}
                  </span>
                </div>
                {index < APPROVAL_STAGES.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-2 mt-[-16px] ${
                      isCompleted ? "bg-green-500" : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function VoucherView() {
  const params = useParams<{ id: string }>();
  const voucherId = params.id ? parseInt(params.id) : undefined;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [pendingRejectAction, setPendingRejectAction] = useState<AvailableAction | null>(null);

  const { data, isLoading, isError, error } = useQuery<VoucherResponse>({
    queryKey: [`/api/accounting/vouchers/${voucherId}`],
    enabled: !!voucherId,
  });

  const { data: availableActions } = useQuery<AvailableAction[]>({
    queryKey: [`/api/accounting/vouchers/${voucherId}/available-actions`],
    enabled: !!voucherId,
  });

  const actionMutation = useMutation({
    mutationFn: async ({ actionName, toStatusId, comments }: { actionName: string; toStatusId: number; comments: string }) => {
      await apiRequest(
        `/api/accounting/vouchers/${voucherId}/change-status`,
        "POST",
        { statusId: toStatusId, actionName, comments }
      );
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/vouchers"] });
      queryClient.invalidateQueries({ queryKey: [`/api/accounting/vouchers/${voucherId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/accounting/vouchers/${voucherId}/available-actions`] });
      toast({ title: `${variables.actionName} completed successfully` });
    },
    onError: (err: Error, variables) => {
      toast({
        title: `Failed to ${variables.actionName.toLowerCase()}`,
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleAction = (action: AvailableAction) => {
    if (action.actionName.toLowerCase().includes("reject")) {
      setPendingRejectAction(action);
      setRejectReason("");
      setRejectDialogOpen(true);
      return;
    }
    actionMutation.mutate({
      actionName: action.actionName,
      toStatusId: action.toStatusId,
      comments: "Action performed",
    });
  };

  const handleRejectConfirm = () => {
    if (!pendingRejectAction || !rejectReason.trim()) return;
    actionMutation.mutate({
      actionName: pendingRejectAction.actionName,
      toStatusId: pendingRejectAction.toStatusId,
      comments: rejectReason.trim(),
    });
    setRejectDialogOpen(false);
    setPendingRejectAction(null);
    setRejectReason("");
  };

  if (isLoading) {
    return (
      <DashboardContainer title="Loading Voucher..." subtitle="Please wait">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardContainer>
    );
  }

  if (isError || !data) {
    return (
      <DashboardContainer title="Voucher Not Found" subtitle="Error loading voucher">
        <Card className="border-destructive">
          <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <p className="text-lg font-medium text-destructive">
              {(error as Error)?.message || "Could not load voucher details."}
            </p>
            <Button variant="outline" onClick={() => setLocation("/accounts/vouchers")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Vouchers
            </Button>
          </CardContent>
        </Card>
      </DashboardContainer>
    );
  }

  const { voucher, items, approvalHistory, billAllocations: billAllocationsData } = data;
  const canEdit = voucher.statusId === 7 || voucher.statusId === 4;

  const isForeignCurrency = voucher.currencyCode && voucher.currencyCode !== "BDT";
  const exchangeRate = parseFloat(voucher.exchangeRate || "1") || 1;

  const totalDebit = (items || []).reduce(
    (sum, item) => sum + (parseFloat(item.debitAmount) || 0),
    0
  );
  const totalCredit = (items || []).reduce(
    (sum, item) => sum + (parseFloat(item.creditAmount) || 0),
    0
  );

  const baseCurrencyTotal = isForeignCurrency
    ? (parseFloat(voucher.amount) || 0) * exchangeRate
    : parseFloat(voucher.amount) || 0;

  const pageActions = (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => setLocation("/accounts/vouchers")}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to List
      </Button>
      <Button variant="outline" onClick={() => setLocation(`/accounts/vouchers/print/${voucherId}`)}>
        <Printer className="mr-2 h-4 w-4" />
        Print
      </Button>
      {(voucher.voucherTypeName?.toLowerCase().includes("payment") ||
        voucher.voucherTypeName?.toLowerCase().includes("contra")) && (
        <Button variant="outline" onClick={() => setLocation(`/accounts/vouchers/cheque-print/${voucherId}`)}>
          <CreditCard className="mr-2 h-4 w-4" />
          Print Cheque
        </Button>
      )}
      {canEdit && (
        <Button
          variant="outline"
          onClick={() => setLocation(`/accounts/vouchers/edit/${voucherId}`)}
        >
          <FileEdit className="mr-2 h-4 w-4" />
          Edit
        </Button>
      )}
      {(availableActions || []).map((action) => {
        const style = getActionButtonStyle(action.actionName);
        return (
          <Button
            key={action.id}
            className={style.className}
            onClick={() => handleAction(action)}
            disabled={actionMutation.isPending}
          >
            {actionMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {action.actionName}
          </Button>
        );
      })}
    </div>
  );

  return (
    <DashboardContainer
      title={`Voucher ${voucher.voucherNumber}`}
      subtitle={`${voucher.voucherTypeName} voucher details`}
      actions={pageActions}
    >
      <DocumentHeader
        title={voucher.voucherTypeName}
        docNo={voucher.voucherNumber}
        date={voucher.voucherDate}
        status={voucher.statusName}
        amounts={[
          { label: "Total Debit", value: totalDebit },
          { label: "Total Credit", value: totalCredit },
        ]}
      />

      <ApprovalStepper currentStatusId={voucher.statusId} />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Voucher Information</CardTitle>
            <Badge
              style={{
                backgroundColor: voucher.statusColor || undefined,
                color: "#fff",
              }}
            >
              {voucher.statusName}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Voucher Number</p>
              <p className="font-medium">{voucher.voucherNumber}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Voucher Type</p>
              <p className="font-medium">{voucher.voucherTypeName}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Voucher Date</p>
              <p className="font-medium">{formatDate(voucher.voucherDate)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Posting Date</p>
              <p className="font-medium">{formatDate(voucher.postingDate)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Reference</p>
              <p className="font-medium">{voucher.reference || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Reference Date</p>
              <p className="font-medium">{formatDate(voucher.referenceDate)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Amount</p>
              {isForeignCurrency ? (
                <div>
                  <p className="font-medium text-lg">{voucher.currencyCode} {formatAmount(voucher.amount, voucher.currencyCode)}</p>
                  <p className="text-sm text-muted-foreground">= {formatAmount(baseCurrencyTotal)} (Base)</p>
                </div>
              ) : (
                <p className="font-medium text-lg">{formatAmount(voucher.amount)}</p>
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Currency</p>
              <p className="font-medium">{voucher.currencyCode || "BDT"}</p>
            </div>
            {isForeignCurrency && (
              <div>
                <p className="text-sm text-muted-foreground">Exchange Rate</p>
                <p className="font-medium">1 {voucher.currencyCode} = {parseFloat(voucher.exchangeRate || "1").toFixed(6)} BDT</p>
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground">Prepared By</p>
              <p className="font-medium">{voucher.preparedByName || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Created At</p>
              <p className="font-medium">{formatDateTime(voucher.createdAt)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Last Updated</p>
              <p className="font-medium">{formatDateTime(voucher.updatedAt)}</p>
            </div>
            {voucher.description && (
              <div className="md:col-span-2 lg:col-span-3">
                <p className="text-sm text-muted-foreground">Description</p>
                <p className="font-medium">{voucher.description}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Line Items</CardTitle>
        </CardHeader>
        <CardContent>
          {isForeignCurrency && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-4 text-sm">
                <span className="font-medium text-blue-800">Transaction Currency: {voucher.currencyCode}</span>
                <Separator orientation="vertical" className="h-4" />
                <span className="text-blue-700">Rate: 1 {voucher.currencyCode} = {exchangeRate.toFixed(6)} BDT</span>
                <Separator orientation="vertical" className="h-4" />
                <span className="text-blue-700">Base Currency Total: {formatAmount(baseCurrencyTotal)}</span>
              </div>
            </div>
          )}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">#</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Debit{isForeignCurrency ? ` (${voucher.currencyCode})` : ""}</TableHead>
                  <TableHead className="text-right">Credit{isForeignCurrency ? ` (${voucher.currencyCode})` : ""}</TableHead>
                  {isForeignCurrency && (
                    <>
                      <TableHead className="text-right">Debit (BDT)</TableHead>
                      <TableHead className="text-right">Credit (BDT)</TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(items || []).map((item) => {
                  const debit = parseFloat(item.debitAmount) || 0;
                  const credit = parseFloat(item.creditAmount) || 0;
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.lineNumber}</TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">{item.accountCode}</span>
                        {" - "}
                        {item.accountName}
                      </TableCell>
                      <TableCell>{item.description || "-"}</TableCell>
                      <TableCell className="text-right">
                        {debit > 0 ? formatAmount(debit, voucher.currencyCode) : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {credit > 0 ? formatAmount(credit, voucher.currencyCode) : "-"}
                      </TableCell>
                      {isForeignCurrency && (
                        <>
                          <TableCell className="text-right text-muted-foreground">
                            {debit > 0 ? formatAmount(debit * exchangeRate) : "-"}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {credit > 0 ? formatAmount(credit * exchangeRate) : "-"}
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  );
                })}
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell colSpan={3} className="text-right">
                    Totals
                  </TableCell>
                  <TableCell className="text-right">
                    {isForeignCurrency ? formatAmount(totalDebit, voucher.currencyCode) : formatAmount(totalDebit)}
                  </TableCell>
                  <TableCell className="text-right">
                    {isForeignCurrency ? formatAmount(totalCredit, voucher.currencyCode) : formatAmount(totalCredit)}
                  </TableCell>
                  {isForeignCurrency && (
                    <>
                      <TableCell className="text-right text-muted-foreground">{formatAmount(totalDebit * exchangeRate)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatAmount(totalCredit * exchangeRate)}</TableCell>
                    </>
                  )}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {billAllocationsData && billAllocationsData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Bill-wise Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const grouped = billAllocationsData.reduce((acc, alloc) => {
                const key = `${alloc.accountCode || 'N/A'} - ${alloc.accountName || 'Unknown Account'}`;
                if (!acc[key]) acc[key] = [];
                acc[key].push(alloc);
                return acc;
              }, {} as Record<string, BillAllocationDetail[]>);

              return Object.entries(grouped).map(([accountLabel, allocations]) => (
                <div key={accountLabel} className="mb-6 last:mb-0">
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="outline" className="font-mono text-xs">
                      {accountLabel}
                    </Badge>
                    {allocations[0]?.partyName && (
                      <span className="text-sm text-muted-foreground">
                        ({allocations[0].partyName})
                      </span>
                    )}
                  </div>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead>Bill Number</TableHead>
                          <TableHead>Bill Date</TableHead>
                          <TableHead className="text-right">Bill Amount</TableHead>
                          <TableHead className="text-right">Allocated Amount</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allocations.map((alloc) => (
                          <TableRow key={alloc.id}>
                            <TableCell>
                              <Badge variant={
                                alloc.allocationType === "AGAINST_REF" ? "default" :
                                alloc.allocationType === "NEW_REF" ? "secondary" :
                                alloc.allocationType === "ADVANCE" ? "outline" : "secondary"
                              }>
                                {alloc.allocationType === "AGAINST_REF" ? "Agst Ref" :
                                 alloc.allocationType === "NEW_REF" ? "New Ref" :
                                 alloc.allocationType === "ADVANCE" ? "Advance" :
                                 alloc.allocationType === "ON_ACCOUNT" ? "On Account" :
                                 alloc.allocationType}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium">
                              {alloc.billNumber || "-"}
                            </TableCell>
                            <TableCell>{formatDate(alloc.billDate)}</TableCell>
                            <TableCell className="text-right">
                              {alloc.originalAmount
                                ? formatAmount(alloc.originalAmount, voucher.currencyCode)
                                : "-"}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatAmount(alloc.amount, voucher.currencyCode)}
                            </TableCell>
                            <TableCell>
                              {alloc.billStatus && (
                                <Badge variant={
                                  alloc.billStatus === "SETTLED" ? "default" :
                                  alloc.billStatus === "PARTIALLY_SETTLED" ? "secondary" : "outline"
                                } className={
                                  alloc.billStatus === "SETTLED" ? "bg-green-100 text-green-800" :
                                  alloc.billStatus === "PARTIALLY_SETTLED" ? "bg-yellow-100 text-yellow-800" :
                                  "bg-blue-100 text-blue-800"
                                }>
                                  {alloc.billStatus === "PARTIALLY_SETTLED" ? "Partial" : alloc.billStatus}
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/50 font-semibold">
                          <TableCell colSpan={4} className="text-right">Total Allocated</TableCell>
                          <TableCell className="text-right">
                            {formatAmount(
                              allocations.reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0),
                              voucher.currencyCode
                            )}
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ));
            })()}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Voucher Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <AuditTimeline
            entries={(approvalHistory || []).map((entry) => ({
              id: entry.id,
              action: entry.actionName,
              user: entry.actionByName,
              timestamp: entry.actionDate,
              reason: entry.comments || undefined,
              details: `${entry.fromStatusName} → ${entry.toStatusName}`,
            }))}
          />
        </CardContent>
      </Card>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Voucher</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this voucher.
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
              disabled={!rejectReason.trim() || actionMutation.isPending}
            >
              {actionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardContainer>
  );
}
