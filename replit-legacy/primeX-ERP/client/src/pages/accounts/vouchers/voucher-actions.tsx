import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Check, X, AlertCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

interface VoucherAction {
  id: number;
  actionName: string;
  description: string;
  requiredRole: string;
}

export function VoucherActions({ voucherId }: { voucherId: number }) {
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const [selectedAction, setSelectedAction] = useState<VoucherAction | null>(null);
  const [comments, setComments] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch available actions for this voucher
  const { data: availableActions, isLoading: isLoadingActions } = useQuery({
    queryKey: [`/api/accounting/approval/vouchers/${voucherId}/actions`],
    enabled: !!voucherId,
  });

  // Process action mutation
  const { mutate: processAction, isPending: isProcessingAction } = useMutation({
    mutationFn: async () => {
      if (!selectedAction) return;
      return apiRequest(`/api/accounting/approval/vouchers/${voucherId}/actions`, "POST", {
        actionId: selectedAction.id,
        comments: comments,
      });
    },
    onSuccess: () => {
      toast({
        title: "Action processed",
        description: `Voucher has been ${selectedAction?.actionName.toLowerCase()} successfully`,
        variant: "default",
      });
      // Close dialog and reset form
      setIsDialogOpen(false);
      setSelectedAction(null);
      setComments("");
      // Invalidate relevant queries to refresh data
      queryClient.invalidateQueries({ queryKey: [`/api/accounting/vouchers/${voucherId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/accounting/vouchers`] });
      queryClient.invalidateQueries({ queryKey: [`/api/accounting/approval/vouchers/${voucherId}/actions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/accounting/approval/vouchers/${voucherId}/history`] });
    },
    onError: (error: any) => {
      toast({
        title: "Action failed",
        description: error.message || "Failed to process action",
        variant: "destructive",
      });
    },
  });

  // Handle action button click
  const handleActionClick = (action: VoucherAction) => {
    setSelectedAction(action);
    setComments("");
    setIsDialogOpen(true);
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    processAction();
  };

  // Get action button color based on action name
  const getActionColor = (actionName: string): string => {
    switch (actionName.toLowerCase()) {
      case 'approve':
        return 'bg-green-500 hover:bg-green-600';
      case 'reject':
        return 'bg-red-500 hover:bg-red-600';
      case 'post':
        return 'bg-blue-500 hover:bg-blue-600';
      case 'cancel':
        return 'bg-gray-500 hover:bg-gray-600';
      case 'submit':
        return 'bg-primary hover:bg-primary/90';
      default:
        return 'bg-secondary hover:bg-secondary/90';
    }
  };

  // Get action icon based on action name
  const getActionIcon = (actionName: string) => {
    switch (actionName.toLowerCase()) {
      case 'approve':
        return <Check className="mr-2 h-4 w-4" />;
      case 'reject':
        return <X className="mr-2 h-4 w-4" />;
      case 'cancel':
        return <X className="mr-2 h-4 w-4" />;
      default:
        return null;
    }
  };

  if (isLoadingActions) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        <span>Loading actions...</span>
      </div>
    );
  }

  if (!availableActions || availableActions.length === 0) {
    return (
      <div className="flex items-center justify-center py-4 text-gray-500">
        <AlertCircle className="mr-2 h-4 w-4" />
        <span>No actions available for this voucher</span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {availableActions.map((action: VoucherAction) => (
          <TooltipProvider key={action.id}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className={`${getActionColor(action.actionName)}`}
                  size="sm"
                  onClick={() => handleActionClick(action)}
                >
                  {getActionIcon(action.actionName)}
                  {action.actionName}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{action.description}</p>
                <p className="text-xs mt-1">Required Role: {action.requiredRole}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </div>

      {/* Action Confirmation Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedAction?.actionName} Voucher
            </DialogTitle>
            <DialogDescription>
              {selectedAction?.description}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="py-4">
              <label htmlFor="comments" className="text-sm font-medium">
                Comments
                {(selectedAction?.actionName === 'Reject' || selectedAction?.actionName === 'Cancel') && (
                  <Badge variant="destructive" className="ml-2">Required</Badge>
                )}
              </label>
              <Textarea
                id="comments"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Enter any comments about this action"
                required={selectedAction?.actionName === 'Reject' || selectedAction?.actionName === 'Cancel'}
                className="mt-2"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isProcessingAction}>
                {isProcessingAction && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm {selectedAction?.actionName}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function VoucherApprovalHistory({ voucherId }: { voucherId: number }) {
  // Fetch approval history for this voucher
  const { data: historyItems, isLoading: isLoadingHistory } = useQuery({
    queryKey: [`/api/accounting/approval/vouchers/${voucherId}/history`],
    enabled: !!voucherId,
  });

  if (isLoadingHistory) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        <span>Loading history...</span>
      </div>
    );
  }

  if (!historyItems || historyItems.length === 0) {
    return (
      <div className="flex items-center justify-center py-4 text-gray-500">
        <AlertCircle className="mr-2 h-4 w-4" />
        <span>No history available for this voucher</span>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <h3 className="text-lg font-semibold mb-2">Approval History</h3>
      <div className="space-y-2">
        {historyItems.map((item: any) => (
          <div key={item.id} className="border p-3 rounded-md">
            <div className="flex justify-between mb-1">
              <span className="font-medium">{item.actionName}</span>
              <span className="text-sm text-gray-500">
                {new Date(item.actionDate).toLocaleString()}
              </span>
            </div>
            <div className="flex text-sm text-gray-600 mb-1">
              <span>By: {item.actionBy || 'System'}</span>
              <span className="mx-2">•</span>
              <span>
                From: {item.fromStatus || 'N/A'} → To: {item.toStatus || 'N/A'}
              </span>
            </div>
            {item.comments && (
              <div className="text-sm mt-1 bg-gray-50 p-2 rounded">
                {item.comments}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}