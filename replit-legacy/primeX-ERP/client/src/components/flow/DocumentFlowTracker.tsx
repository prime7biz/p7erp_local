import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { CheckCircle2, Circle, Clock, ArrowRight } from "lucide-react";

interface FlowDocument {
  docType: string;
  docNumber: string;
  docId: number;
  status: string;
  url: string;
}

interface DocumentFlowTrackerProps {
  flowType: 'purchase' | 'sales';
  documents: FlowDocument[];
}

function getStatusInfo(status: string) {
  const s = status?.toLowerCase() || '';
  if (s === 'posted' || s === 'completed' || s === 'approved' || s === 'delivered' || s === 'closed') {
    return { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50 border-green-200', badge: 'default' as const, label: status };
  }
  if (s === 'draft' || s === 'pending' || s === 'new') {
    return { icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50 border-amber-200', badge: 'secondary' as const, label: status };
  }
  if (s === 'submitted' || s === 'checked' || s === 'recommended' || s === 'in_progress') {
    return { icon: Circle, color: 'text-blue-500', bg: 'bg-blue-50 border-blue-200', badge: 'outline' as const, label: status };
  }
  return { icon: Circle, color: 'text-gray-400', bg: 'bg-gray-50 border-gray-200', badge: 'secondary' as const, label: status || 'Pending' };
}

export function DocumentFlowTracker({ flowType, documents }: DocumentFlowTrackerProps) {
  const [, navigate] = useLocation();

  if (!documents || documents.length === 0) return null;

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-center gap-1 min-w-max py-2">
        {documents.map((doc, index) => {
          const statusInfo = getStatusInfo(doc.status);
          const StatusIcon = statusInfo.icon;

          return (
            <div key={`${doc.docType}-${doc.docId}-${index}`} className="flex items-center">
              <button
                onClick={() => doc.url && navigate(doc.url)}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg border cursor-pointer transition-all hover:shadow-md ${statusInfo.bg}`}
                title={`${doc.docType}: ${doc.docNumber}`}
              >
                <div className="flex items-center gap-1.5">
                  <StatusIcon className={`h-4 w-4 ${statusInfo.color}`} />
                  <span className="text-xs font-medium text-gray-700">{doc.docType}</span>
                </div>
                <span className="text-xs font-semibold truncate max-w-[100px]">{doc.docNumber}</span>
                <Badge variant={statusInfo.badge} className="text-[10px] px-1.5 py-0">
                  {statusInfo.label}
                </Badge>
              </button>
              {index < documents.length - 1 && (
                <ArrowRight className="h-4 w-4 text-gray-400 mx-1 shrink-0" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
