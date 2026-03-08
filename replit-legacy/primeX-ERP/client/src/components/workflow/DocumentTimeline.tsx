import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CheckCircle, Send, XCircle, ArrowLeft, Circle, Star,
  FileCheck, Clock, Shield, DollarSign, MessageSquare,
} from "lucide-react";

interface DocumentTimelineProps {
  docType: string;
  docId: number;
  currentStatus?: string;
}

interface HistoryEntry {
  id: number;
  action: string;
  controlStep: number | null;
  fromStatus: string;
  toStatus: string;
  performedBy: number;
  actorRoleId: number | null;
  performedAt: string;
  comments: string | null;
  reason: string | null;
  isOverride: boolean;
  overrideReason: string | null;
  ipAddress: string | null;
  amountAtAction: number | null;
  metadata: Record<string, unknown> | null;
  performerName: string;
  performerRole: string;
}

const ACTION_CONFIG: Record<string, { color: string; bgColor: string; borderColor: string; icon: typeof CheckCircle; label: string }> = {
  approve: { color: "text-green-600", bgColor: "bg-green-100", borderColor: "border-green-400", icon: CheckCircle, label: "Approved" },
  submit: { color: "text-blue-600", bgColor: "bg-blue-100", borderColor: "border-blue-400", icon: Send, label: "Submitted" },
  check: { color: "text-blue-600", bgColor: "bg-blue-100", borderColor: "border-blue-400", icon: FileCheck, label: "Checked" },
  reject: { color: "text-red-600", bgColor: "bg-red-100", borderColor: "border-red-400", icon: XCircle, label: "Rejected" },
  create: { color: "text-gray-500", bgColor: "bg-gray-100", borderColor: "border-gray-400", icon: Circle, label: "Created" },
  send_back: { color: "text-orange-600", bgColor: "bg-orange-100", borderColor: "border-orange-400", icon: ArrowLeft, label: "Sent Back" },
  recommend: { color: "text-purple-600", bgColor: "bg-purple-100", borderColor: "border-purple-400", icon: Star, label: "Recommended" },
  post: { color: "text-emerald-600", bgColor: "bg-emerald-100", borderColor: "border-emerald-400", icon: FileCheck, label: "Posted" },
  cancel: { color: "text-red-600", bgColor: "bg-red-100", borderColor: "border-red-400", icon: XCircle, label: "Cancelled" },
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

function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatAbsoluteDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function getActionConfig(action: string) {
  return ACTION_CONFIG[action] || {
    color: "text-gray-500",
    bgColor: "bg-gray-100",
    borderColor: "border-gray-400",
    icon: Circle,
    label: action.charAt(0).toUpperCase() + action.slice(1).replace("_", " "),
  };
}

export default function DocumentTimeline({ docType, docId, currentStatus }: DocumentTimelineProps) {
  const { data, isLoading } = useQuery<{ history: HistoryEntry[] }>({
    queryKey: ["/api/workflow/documents", docType, docId, "history"],
    enabled: !!docId,
  });

  const history = data?.history || [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        {currentStatus && (
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm font-medium text-gray-500">Current Status:</span>
            <Skeleton className="h-7 w-24 rounded-full" />
          </div>
        )}
        <div className="relative pl-8 space-y-6">
          <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-gray-200" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="relative flex gap-4">
              <Skeleton className="absolute -left-5 h-6 w-6 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2 ml-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {currentStatus && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm font-medium text-gray-500">Current Status:</span>
          <Badge
            className={`text-sm px-3 py-1 font-semibold border ${STATUS_COLORS[currentStatus] || "bg-gray-100 text-gray-800 border-gray-300"}`}
          >
            {currentStatus.replace("_", " ")}
          </Badge>
        </div>
      )}

      {history.length === 0 ? (
        <div className="text-center py-8">
          <Clock className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No workflow history yet</p>
        </div>
      ) : (
        <div className="relative pl-8">
          <div className="absolute left-[11px] top-3 bottom-3 w-0.5 bg-gray-200" />

          <div className="space-y-6">
            {history.map((entry, index) => {
              const config = getActionConfig(entry.action);
              const ActionIcon = config.icon;
              const isFirst = index === 0;

              return (
                <div key={entry.id} className="relative flex gap-4">
                  <div
                    className={`absolute -left-5 flex items-center justify-center h-6 w-6 rounded-full border-2 ${config.bgColor} ${config.borderColor} flex-shrink-0 z-10`}
                  >
                    <ActionIcon className={`h-3 w-3 ${config.color}`} />
                  </div>

                  <div className={`flex-1 ml-4 rounded-lg border p-3 ${isFirst ? "bg-white shadow-sm" : "bg-gray-50"}`}>
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-semibold text-sm ${config.color}`}>
                          {config.label}
                        </span>
                        {entry.isOverride && (
                          <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 bg-amber-50 gap-1">
                            <Shield className="h-2.5 w-2.5" />
                            Override
                          </Badge>
                        )}
                      </div>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-xs text-gray-400 cursor-default whitespace-nowrap">
                              {getRelativeTime(entry.performedAt)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            <p className="text-xs">{formatAbsoluteDate(entry.performedAt)}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>

                    <div className="mt-1 flex items-center gap-2 text-xs text-gray-600 flex-wrap">
                      <span className="font-medium">{entry.performerName || "Unknown User"}</span>
                      {entry.performerRole && (
                        <>
                          <span className="text-gray-300">·</span>
                          <span className="text-gray-500">{entry.performerRole}</span>
                        </>
                      )}
                    </div>

                    <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-400">
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-normal">
                        {entry.fromStatus}
                      </Badge>
                      <span>→</span>
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-normal">
                        {entry.toStatus}
                      </Badge>
                    </div>

                    {entry.comments && (
                      <div className="mt-2 flex items-start gap-1.5 text-xs text-gray-600 bg-gray-100 rounded p-2">
                        <MessageSquare className="h-3 w-3 mt-0.5 flex-shrink-0 text-gray-400" />
                        <span>{entry.comments}</span>
                      </div>
                    )}

                    {entry.reason && (
                      <div className="mt-1 text-xs text-gray-500">
                        <span className="font-medium">Reason:</span> {entry.reason}
                      </div>
                    )}

                    {entry.isOverride && entry.overrideReason && (
                      <div className="mt-1 text-xs text-amber-700">
                        <span className="font-medium">Override reason:</span> {entry.overrideReason}
                      </div>
                    )}

                    {entry.amountAtAction != null && entry.amountAtAction > 0 && (
                      <div className="mt-1.5 flex items-center gap-1 text-xs text-gray-500">
                        <DollarSign className="h-3 w-3" />
                        <span>Amount: {formatAmount(entry.amountAtAction)}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}