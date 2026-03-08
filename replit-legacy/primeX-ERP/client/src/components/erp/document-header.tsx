import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, ConfirmDialog } from "@/components/erp/erp-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Save,
  Send,
  CheckCircle,
  XCircle,
  BookOpen,
  Trash2,
  Printer,
  Copy,
  MoreHorizontal,
  Loader2,
  Clock,
  AlertTriangle,
  FileText,
  ShieldAlert,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

export interface DocumentHeaderProps {
  title: string;
  docNo?: string;
  date?: string;
  status?: string;
  periodStatus?: "OPEN" | "CLOSED";
  hasOverride?: boolean;
  amounts?: { label: string; value: number | string }[];
  children?: React.ReactNode;
}

export interface ActionPanelProps {
  status?: string;
  onSaveDraft?: () => void;
  onSubmit?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onPost?: () => void;
  onDelete?: () => void;
  onPrint?: () => void;
  onDuplicate?: () => void;
  isSubmitting?: boolean;
  customActions?: {
    label: string;
    onClick: () => void;
    variant?: "default" | "destructive" | "outline";
    icon?: React.ReactNode;
  }[];
  permissions?: Record<string, boolean>;
}

export interface AuditEntry {
  id: number | string;
  action: string;
  user?: string;
  timestamp: string;
  reason?: string;
  details?: string;
}

export interface AuditTimelineProps {
  entries: AuditEntry[];
  isLoading?: boolean;
}

function formatDateNice(dateStr: string | undefined) {
  if (!dateStr) return "";
  try {
    return format(new Date(dateStr), "dd MMM yyyy");
  } catch {
    return dateStr;
  }
}

function formatAmountValue(value: number | string): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "0.00";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const ACTION_DOT_COLORS: Record<string, string> = {
  created: "bg-gray-500",
  draft: "bg-gray-500",
  submitted: "bg-blue-500",
  submit: "bg-blue-500",
  checked: "bg-purple-500",
  check: "bg-purple-500",
  recommended: "bg-orange-500",
  recommend: "bg-orange-500",
  approved: "bg-green-500",
  approve: "bg-green-500",
  posted: "bg-emerald-600",
  post: "bg-emerald-600",
  rejected: "bg-red-500",
  reject: "bg-red-500",
  cancelled: "bg-gray-600",
  cancel: "bg-gray-600",
  reverted: "bg-yellow-500",
  revert: "bg-yellow-500",
};

function getActionDotColor(action: string): string {
  const lower = action.toLowerCase();
  for (const [key, color] of Object.entries(ACTION_DOT_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return "bg-gray-400";
}

export function DocumentHeader({
  title,
  docNo,
  date,
  status,
  periodStatus,
  hasOverride,
  amounts,
  children,
}: DocumentHeaderProps) {
  return (
    <Card className="bg-gradient-to-r from-white to-gray-50/50 border-b shadow-sm overflow-hidden">
      <div className="px-6 py-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-foreground tracking-tight">
              {title}
            </h1>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {docNo && (
                <span className="text-sm font-mono text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">
                  {docNo}
                </span>
              )}
              {date && (
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDateNice(date)}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {status && <StatusBadge status={status} />}

            {periodStatus && (
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    periodStatus === "OPEN" ? "bg-green-500" : "bg-red-500"
                  )}
                />
                <span
                  className={
                    periodStatus === "OPEN"
                      ? "text-green-700"
                      : "text-red-700"
                  }
                >
                  Period {periodStatus}
                </span>
              </div>
            )}

            {hasOverride && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700 border-amber-200"
              >
                <ShieldAlert className="h-3 w-3 mr-0.5" />
                Override
              </Badge>
            )}
          </div>

          {amounts && amounts.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              {amounts.map((amt) => (
                <div
                  key={amt.label}
                  className="bg-white border rounded-lg px-3 py-1.5 min-w-[100px]"
                >
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                    {amt.label}
                  </p>
                  <p className="text-sm font-semibold tabular-nums">
                    {formatAmountValue(amt.value)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
        {children && <div className="mt-3">{children}</div>}
      </div>
    </Card>
  );
}

export function ActionPanel({
  status,
  onSaveDraft,
  onSubmit,
  onApprove,
  onReject,
  onPost,
  onDelete,
  onPrint,
  onDuplicate,
  isSubmitting = false,
  customActions = [],
  permissions = {},
}: ActionPanelProps) {
  const [confirmAction, setConfirmAction] = useState<{
    type: string;
    title: string;
    description: string;
    onConfirm: () => void;
    variant: "default" | "destructive";
  } | null>(null);

  const normalizedStatus = status?.toUpperCase().replace(/[\s-]+/g, "_") || "";
  const isPosted = normalizedStatus === "POSTED";

  const canPerform = (action: string) => {
    if (permissions[action] === false) return false;
    return true;
  };

  const primaryAction = (() => {
    if (normalizedStatus === "DRAFT" && onSubmit && canPerform("canSubmit")) {
      return {
        label: "Submit",
        onClick: onSubmit,
        icon: <Send className="h-4 w-4" />,
      };
    }
    if (
      normalizedStatus === "SUBMITTED" &&
      onApprove &&
      canPerform("canApprove")
    ) {
      return {
        label: "Approve",
        onClick: onApprove,
        icon: <CheckCircle className="h-4 w-4" />,
      };
    }
    if (
      normalizedStatus === "APPROVED" &&
      onPost &&
      canPerform("canPost")
    ) {
      return {
        label: "Post",
        onClick: () =>
          setConfirmAction({
            type: "post",
            title: "Post Document",
            description:
              "This will post the document to the ledger. This action cannot be easily reversed.",
            onConfirm: onPost,
            variant: "default",
          }),
        icon: <BookOpen className="h-4 w-4" />,
      };
    }
    return null;
  })();

  const showReject =
    onReject &&
    canPerform("canReject") &&
    ["SUBMITTED", "CHECKED", "RECOMMENDED"].includes(normalizedStatus);

  const hasSecondaryActions =
    onPrint || onDuplicate || (onDelete && canPerform("canDelete"));

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {!isPosted && onSaveDraft && canPerform("canSaveDraft") && (
          <Button
            variant="outline"
            size="sm"
            onClick={onSaveDraft}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Draft
          </Button>
        )}

        {showReject && (
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 border-red-200 hover:bg-red-50"
            onClick={() =>
              setConfirmAction({
                type: "reject",
                title: "Reject Document",
                description:
                  "Are you sure you want to reject this document? This will send it back for revision.",
                onConfirm: onReject!,
                variant: "destructive",
              })
            }
            disabled={isSubmitting}
          >
            <XCircle className="h-4 w-4" />
            Reject
          </Button>
        )}

        {customActions.map((action, i) => (
          <Button
            key={i}
            variant={action.variant || "outline"}
            size="sm"
            onClick={action.onClick}
            disabled={isSubmitting}
          >
            {action.icon}
            {action.label}
          </Button>
        ))}

        {primaryAction && (
          <Button
            size="sm"
            onClick={primaryAction.onClick}
            disabled={isSubmitting}
            className="min-w-[100px]"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              primaryAction.icon
            )}
            {primaryAction.label}
          </Button>
        )}

        {hasSecondaryActions && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="px-2">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onPrint && (
                <DropdownMenuItem onClick={onPrint}>
                  <Printer className="h-4 w-4 mr-2" />
                  Print
                </DropdownMenuItem>
              )}
              {onDuplicate && (
                <DropdownMenuItem onClick={onDuplicate}>
                  <Copy className="h-4 w-4 mr-2" />
                  Duplicate
                </DropdownMenuItem>
              )}
              {onDelete && canPerform("canDelete") && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-red-600"
                    onClick={() =>
                      setConfirmAction({
                        type: "delete",
                        title: "Delete Document",
                        description:
                          "Are you sure you want to delete this document? This action cannot be undone.",
                        onConfirm: onDelete,
                        variant: "destructive",
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {confirmAction && (
        <ConfirmDialog
          open={!!confirmAction}
          onOpenChange={(open) => {
            if (!open) setConfirmAction(null);
          }}
          title={confirmAction.title}
          description={confirmAction.description}
          confirmLabel={confirmAction.type === "delete" ? "Delete" : "Confirm"}
          onConfirm={() => {
            confirmAction.onConfirm();
            setConfirmAction(null);
          }}
          variant={confirmAction.variant}
          isLoading={isSubmitting}
        />
      )}
    </>
  );
}

export function AuditTimeline({ entries, isLoading = false }: AuditTimelineProps) {
  if (isLoading) {
    return (
      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <FileText className="h-8 w-8 text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground">No audit history available</p>
      </div>
    );
  }

  const sortedEntries = [...entries].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return (
    <div className="relative">
      {sortedEntries.map((entry, index) => {
        const dotColor = getActionDotColor(entry.action);
        let relativeTime = "";
        try {
          relativeTime = formatDistanceToNow(new Date(entry.timestamp), {
            addSuffix: true,
          });
        } catch {
          relativeTime = entry.timestamp;
        }

        return (
          <div
            key={entry.id}
            className="relative flex gap-4 pb-6 last:pb-0"
          >
            {index < sortedEntries.length - 1 && (
              <div className="absolute left-[15px] top-8 bottom-0 w-0.5 bg-gray-200" />
            )}
            <div
              className={cn(
                "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white",
                dotColor
              )}
            >
              <Clock className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">{entry.action}</span>
                {entry.user && (
                  <>
                    <span className="text-muted-foreground text-xs">by</span>
                    <span className="text-sm font-medium">{entry.user}</span>
                  </>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {relativeTime}
              </p>
              {entry.reason && (
                <p className="text-sm text-muted-foreground mt-1.5 bg-muted/50 rounded-md px-3 py-1.5 italic">
                  &ldquo;{entry.reason}&rdquo;
                </p>
              )}
              {entry.details && (
                <p className="text-xs text-muted-foreground mt-1">
                  {entry.details}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
