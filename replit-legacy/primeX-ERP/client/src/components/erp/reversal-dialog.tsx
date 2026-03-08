import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface ReversalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  docType: string;
  docId: number;
  docNumber: string;
  onSuccess?: () => void;
}

export function ReversalDialog({
  open,
  onOpenChange,
  docType,
  docId,
  docNumber,
  onSuccess,
}: ReversalDialogProps) {
  const [reason, setReason] = useState("");
  const [createCorrection, setCreateCorrection] = useState(false);
  const { toast } = useToast();

  const reversalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        `/api/reversals/${docType}/${docId}`,
        "POST",
        { reason, createCorrection }
      );
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Document Reversed",
        description: `${docNumber} has been reversed successfully.${data?.reversalNumber ? ` Reversal: ${data.reversalNumber}` : ""}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/reversals"] });
      queryClient.invalidateQueries({ queryKey: [`/api/${docType}s`] });
      setReason("");
      setCreateCorrection(false);
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Reversal Failed",
        description: error.message || "Failed to reverse document. Please try again.",
        variant: "destructive",
      });
    },
  });

  const isReasonValid = reason.trim().length >= 10;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isReasonValid) return;
    reversalMutation.mutate();
  };

  const handleOpenChange = (value: boolean) => {
    if (!value) {
      setReason("");
      setCreateCorrection(false);
    }
    onOpenChange(value);
  };

  const docTypeLabel = docType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-amber-600" />
            Reverse {docTypeLabel}
          </DialogTitle>
          <DialogDescription>
            Reversing document <span className="font-semibold text-foreground">{docNumber}</span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
            <div className="flex gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800 dark:text-amber-200">
                <p className="font-medium">This action cannot be undone.</p>
                <p className="mt-1 text-amber-700 dark:text-amber-300">
                  A reversal entry will be created to offset the original posting.
                  All related ledger entries and stock movements will be reversed.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reversal-reason">
              Reason for Reversal <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reversal-reason"
              placeholder="Provide a detailed reason for reversing this document (minimum 10 characters)..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="resize-none"
            />
            {reason.length > 0 && !isReasonValid && (
              <p className="text-xs text-destructive">
                Reason must be at least 10 characters ({reason.trim().length}/10)
              </p>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="create-correction"
              checked={createCorrection}
              onCheckedChange={(checked) => setCreateCorrection(checked === true)}
            />
            <Label htmlFor="create-correction" className="text-sm font-normal cursor-pointer">
              Create correction draft after reversal
            </Label>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={reversalMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!isReasonValid || reversalMutation.isPending}
            >
              {reversalMutation.isPending ? (
                <>
                  <RotateCcw className="h-4 w-4 animate-spin" />
                  Reversing...
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4" />
                  Reverse Document
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
