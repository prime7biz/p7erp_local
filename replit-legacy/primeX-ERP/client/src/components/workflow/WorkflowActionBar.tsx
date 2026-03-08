import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Send, CheckCircle, XCircle, ArrowLeft, FileCheck, AlertTriangle, Lock,
  BookOpen, ArrowRight, Loader2, Shield,
} from "lucide-react";

interface WorkflowActionBarProps {
  docType: string;
  docId: number;
  currentStatus: string;
  amount?: number;
  onStatusChange?: (newStatus: string) => void;
}

interface AvailableAction {
  action: string;
  label: string;
  targetStatus: string;
  enabled: boolean;
  reason?: string;
}

const ACTION_BUTTON_STYLES: Record<string, {
  className: string;
  variant: "default" | "destructive" | "outline" | "secondary";
  icon: typeof Send;
}> = {
  submit: { className: "bg-blue-600 hover:bg-blue-700 text-white", variant: "default", icon: Send },
  check: { className: "bg-indigo-600 hover:bg-indigo-700 text-white", variant: "default", icon: CheckCircle },
  recommend: { className: "bg-purple-600 hover:bg-purple-700 text-white", variant: "default", icon: FileCheck },
  approve: { className: "bg-green-600 hover:bg-green-700 text-white", variant: "default", icon: CheckCircle },
  post: { className: "bg-emerald-600 hover:bg-emerald-700 text-white", variant: "default", icon: BookOpen },
  send_back: { className: "border-amber-400 text-amber-700 hover:bg-amber-50", variant: "outline", icon: ArrowLeft },
  reject: { className: "", variant: "destructive", icon: XCircle },
  cancel: { className: "border-red-300 text-red-600 hover:bg-red-50", variant: "outline", icon: XCircle },
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800 border-gray-300",
  SUBMITTED: "bg-blue-100 text-blue-800 border-blue-300",
  CHECKED: "bg-indigo-100 text-indigo-800 border-indigo-300",
  RECOMMENDED: "bg-purple-100 text-purple-800 border-purple-300",
  APPROVED: "bg-green-100 text-green-800 border-green-300",
  POSTED: "bg-emerald-100 text-emerald-800 border-emerald-300",
  REJECTED: "bg-red-100 text-red-800 border-red-300",
  SENT_BACK: "bg-yellow-100 text-yellow-800 border-yellow-300",
  CANCELLED: "bg-red-100 text-red-800 border-red-300",
};

export default function WorkflowActionBar({ docType, docId, currentStatus, amount, onStatusChange }: WorkflowActionBarProps) {
  const { toast } = useToast();
  const [selectedAction, setSelectedAction] = useState<AvailableAction | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [comments, setComments] = useState("");
  const [reason, setReason] = useState("");
  const [isOverride, setIsOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [periodClosedInfo, setPeriodClosedInfo] = useState<{
    periodName?: string;
    periodStart?: string;
    periodEnd?: string;
    postingDate?: string;
  } | null>(null);
  const [periodClosedDialogOpen, setPeriodClosedDialogOpen] = useState(false);
  const [overrideReasonForPeriod, setOverrideReasonForPeriod] = useState("");

  const { data: actionsData, isLoading } = useQuery<{
    actions: AvailableAction[];
    currentStatus: string;
    isAdmin?: boolean;
    isSuperuser?: boolean;
  }>({
    queryKey: ["/api/workflow/documents", docType, docId, "actions"],
    queryFn: () =>
      fetch(
        `/api/workflow/documents/${docType}/${docId}/actions?currentStatus=${currentStatus}&amount=${amount || 0}`,
        { credentials: "include", headers: { "Content-Type": "application/json" } }
      ).then((r) => {
        if (!r.ok) throw new Error("Failed to fetch actions");
        return r.json();
      }),
    enabled: !!docId && !!currentStatus,
  });

  const actionMutation = useMutation({
    mutationFn: async (payload: {
      action: string;
      currentStatus: string;
      comments?: string;
      reason?: string;
      isOverride?: boolean;
      overrideReason?: string;
      amount?: number;
      requestId?: string;
    }) => {
      const res = await fetch(
        `/api/workflow/documents/${docType}/${docId}/action`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!data.success) {
        const err = new Error(data.message || "Action failed") as any;
        err.code = data.code;
        err.details = data.details;
        throw err;
      }
      return data;
    },
    onSuccess: (data) => {
      toast({ title: "Action completed", description: data.message || "Workflow action performed successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/workflow/documents", docType, docId] });
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      onStatusChange?.(data.newStatus);
      handleCloseDialog();
    },
    onError: (error: any) => {
      if (error.code === "PERIOD_CLOSED") {
        setPeriodClosedInfo(error.details || {});
        setPeriodClosedDialogOpen(true);
        handleCloseDialog();
        return;
      }
      if (error.code === "OVERRIDE_REASON_REQUIRED") {
        setPeriodClosedInfo(error.details || {});
        setPeriodClosedDialogOpen(true);
        handleCloseDialog();
        return;
      }
      if (error.code === "STALE_STATUS") {
        toast({
          title: "Document has changed",
          description: `Status changed to "${error.details?.actualStatus || 'unknown'}". Refreshing actions...`,
          variant: "destructive",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/workflow/documents", docType, docId] });
        handleCloseDialog();
        return;
      }
      if (error.code === "SOD_CONFLICT") {
        toast({
          title: "Segregation of Duties Conflict",
          description: `You already performed "${error.details?.conflictingAction || 'another action'}" on this document. A different user must perform this action.`,
          variant: "destructive",
        });
        handleCloseDialog();
        return;
      }
      if (error.code === "PERMISSION_DENIED") {
        toast({
          title: "Permission Denied",
          description: error.message || "You do not have permission to perform this action.",
          variant: "destructive",
        });
        handleCloseDialog();
        return;
      }
      if (error.code === "INVALID_TRANSITION") {
        toast({
          title: "Action Not Available",
          description: error.message || "This action is not available for the current document status.",
          variant: "destructive",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/workflow/documents", docType, docId] });
        handleCloseDialog();
        return;
      }
      if (error.code === "APPROVAL_AUTHORITY_EXCEEDED") {
        toast({
          title: "Approval Limit Exceeded",
          description: "The document amount exceeds your approval authority. A higher-level approver is required.",
          variant: "destructive",
        });
        handleCloseDialog();
        return;
      }
      if (error.code === "ALREADY_APPROVED") {
        toast({
          title: "Already Approved",
          description: "You have already approved this document.",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/workflow/documents", docType, docId] });
        handleCloseDialog();
        return;
      }
      if (error.code === "UNKNOWN_DOC_TYPE") {
        toast({
          title: "Invalid Document",
          description: error.message || "The document type is not recognized.",
          variant: "destructive",
        });
        handleCloseDialog();
        return;
      }
      if (error.code === "INTERNAL_ERROR") {
        toast({
          title: "Server Error",
          description: "An unexpected error occurred. Please try again or contact support.",
          variant: "destructive",
        });
        handleCloseDialog();
        return;
      }
      toast({ title: "Action failed", description: error.message, variant: "destructive" });
      handleCloseDialog();
    },
  });

  const handleOpenDialog = (action: AvailableAction) => {
    setSelectedAction(action);
    setComments("");
    setReason("");
    setIsOverride(false);
    setOverrideReason("");
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setSelectedAction(null);
    setComments("");
    setReason("");
    setIsOverride(false);
    setOverrideReason("");
  };

  const handleConfirm = () => {
    if (!selectedAction) return;

    const requiresComments = ["reject", "send_back"].includes(selectedAction.action);
    if (requiresComments && !comments.trim()) {
      toast({
        title: "Comments required",
        description: `Please provide comments for ${selectedAction.label || selectedAction.action.replace("_", " ")} action.`,
        variant: "destructive",
      });
      return;
    }

    if (isOverride && !isSuperuser && !overrideReason.trim()) {
      toast({
        title: "Override reason required",
        description: "Please provide a reason for the override.",
        variant: "destructive",
      });
      return;
    }

    const reqId = crypto.randomUUID();

    actionMutation.mutate({
      action: selectedAction.action,
      currentStatus,
      comments: comments.trim() || undefined,
      reason: reason.trim() || undefined,
      isOverride: isSuperuser ? true : (isOverride || undefined),
      overrideReason: isSuperuser ? "Super user auto-override" : (isOverride ? overrideReason.trim() : undefined),
      amount: amount || undefined,
      requestId: reqId,
    });
  };

  const actions = actionsData?.actions || [];
  const isSuperuser = actionsData?.isSuperuser === true;
  const canOverride = actionsData?.isAdmin || isSuperuser;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-7 w-24 rounded-full" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-24" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (actions.length === 0) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-500">Status:</span>
            <Badge
              className={`text-sm px-3 py-1 font-semibold border ${STATUS_COLORS[currentStatus] || "bg-gray-100 text-gray-800 border-gray-300"}`}
            >
              {currentStatus.replace("_", " ")}
            </Badge>
            <span className="text-xs text-gray-400 ml-2">No actions available</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-500">Status:</span>
              <Badge
                className={`text-sm px-3 py-1 font-semibold border ${STATUS_COLORS[currentStatus] || "bg-gray-100 text-gray-800 border-gray-300"}`}
              >
                {currentStatus.replace("_", " ")}
              </Badge>
              {isSuperuser && (
                <Badge className="bg-amber-100 text-amber-800 border border-amber-300 text-xs px-2 py-0.5 gap-1">
                  <Shield className="h-3 w-3" />
                  Super User
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {actions.map((action) => {
                const style = ACTION_BUTTON_STYLES[action.action] || {
                  className: "",
                  variant: "outline" as const,
                  icon: ArrowRight,
                };
                const ActionIcon = style.icon;

                if (!action.enabled) {
                  return (
                    <TooltipProvider key={action.action}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex">
                            <Button
                              variant={style.variant}
                              size="sm"
                              disabled
                              className="gap-1.5 opacity-50"
                            >
                              <ActionIcon className="h-4 w-4" />
                              {action.label || action.action.replace("_", " ")}
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">{action.reason || "Action not available"}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                }

                return (
                  <Button
                    key={action.action}
                    variant={style.variant}
                    size="sm"
                    className={`gap-1.5 capitalize ${style.className}`}
                    onClick={() => handleOpenDialog(action)}
                  >
                    <ActionIcon className="h-4 w-4" />
                    {action.label || action.action.replace("_", " ")}
                  </Button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) handleCloseDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="capitalize">
              {selectedAction?.label || selectedAction?.action?.replace("_", " ")} Document
            </DialogTitle>
            <DialogDescription>
              Perform this workflow action on the document.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 text-sm">
              <Badge
                variant="outline"
                className={`${STATUS_COLORS[currentStatus] || "bg-gray-100 text-gray-800"} border`}
              >
                {currentStatus.replace("_", " ")}
              </Badge>
              <ArrowRight className="h-4 w-4 text-gray-400" />
              <Badge
                variant="outline"
                className={`${STATUS_COLORS[selectedAction?.targetStatus || ""] || "bg-gray-100 text-gray-800"} border`}
              >
                {selectedAction?.targetStatus?.replace("_", " ") || "Next"}
              </Badge>
            </div>

            <div className="space-y-2">
              <Label htmlFor="action-comments">
                Comments{" "}
                {["reject", "send_back"].includes(selectedAction?.action || "")
                  ? <span className="text-red-500">(required)</span>
                  : <span className="text-gray-400">(optional)</span>}
              </Label>
              <Textarea
                id="action-comments"
                placeholder="Add your comments..."
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows={3}
              />
            </div>

            {selectedAction?.action === "reject" && (
              <div className="space-y-2">
                <Label htmlFor="action-reason">Reason for Rejection</Label>
                <Textarea
                  id="action-reason"
                  placeholder="Provide the reason for rejection..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                />
              </div>
            )}

            {isSuperuser && (
              <div className="border-t pt-3">
                <p className="text-xs text-amber-600 flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" />
                  Override auto-applied — all restrictions bypassed
                </p>
              </div>
            )}

            {canOverride && !isSuperuser && (
              <div className="space-y-3 border-t pt-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="override"
                    checked={isOverride}
                    onCheckedChange={(checked) => setIsOverride(checked === true)}
                  />
                  <Label htmlFor="override" className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <Lock className="h-3.5 w-3.5 text-amber-600" />
                    Override (admin action)
                  </Label>
                </div>
                {isOverride && (
                  <div className="space-y-2 ml-6">
                    <Label htmlFor="override-reason">Override Reason <span className="text-red-500">(required)</span></Label>
                    <Textarea
                      id="override-reason"
                      placeholder="Explain why you are overriding the normal workflow..."
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      rows={2}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleCloseDialog} disabled={actionMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={actionMutation.isPending}
              className={
                selectedAction?.action === "reject" || selectedAction?.action === "cancel"
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : selectedAction?.action === "approve"
                    ? "bg-green-600 hover:bg-green-700 text-white"
                    : ""
              }
            >
              {actionMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {actionMutation.isPending ? "Processing..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={periodClosedDialogOpen} onOpenChange={(open) => { if (!open) { setPeriodClosedDialogOpen(false); setPeriodClosedInfo(null); setOverrideReasonForPeriod(""); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Accounting Period Closed
            </DialogTitle>
            <DialogDescription>
              This voucher cannot be posted because its date falls within a closed accounting period.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Period:</span>
                <span className="font-medium text-gray-900">{periodClosedInfo?.periodName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Period Dates:</span>
                <span className="font-medium text-gray-900">{periodClosedInfo?.periodStart} to {periodClosedInfo?.periodEnd}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Voucher Date:</span>
                <span className="font-medium text-gray-900">{periodClosedInfo?.postingDate}</span>
              </div>
            </div>

            {canOverride && (
              <div className="space-y-3 border-t pt-3">
                <p className="text-sm text-amber-700 font-medium flex items-center gap-1.5">
                  <Lock className="h-4 w-4" />
                  You have override permission. Provide a reason to proceed.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="period-override-reason">Override Reason <span className="text-red-500">(required)</span></Label>
                  <Textarea
                    id="period-override-reason"
                    placeholder="Explain why posting into this closed period is necessary..."
                    value={overrideReasonForPeriod}
                    onChange={(e) => setOverrideReasonForPeriod(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setPeriodClosedDialogOpen(false); setPeriodClosedInfo(null); setOverrideReasonForPeriod(""); }}>
              Cancel
            </Button>
            {canOverride && (
              <Button
                className="bg-amber-600 hover:bg-amber-700 text-white"
                disabled={!overrideReasonForPeriod.trim() || actionMutation.isPending}
                onClick={() => {
                  const reqId = crypto.randomUUID();
                  actionMutation.mutate({
                    action: "post",
                    currentStatus,
                    isOverride: true,
                    overrideReason: overrideReasonForPeriod.trim(),
                    amount: amount || undefined,
                    requestId: reqId,
                  });
                  setPeriodClosedDialogOpen(false);
                  setPeriodClosedInfo(null);
                  setOverrideReasonForPeriod("");
                }}
              >
                {actionMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Override & Post
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}