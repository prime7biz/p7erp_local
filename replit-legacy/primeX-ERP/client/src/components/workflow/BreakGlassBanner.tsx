import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Shield, Clock, User } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

interface BreakGlassBannerProps {
  docType: string;
  docId: number;
}

interface HistoryEntry {
  id: number;
  action: string;
  performedBy: number;
  performedAt: string;
  comments: string | null;
  reason: string | null;
  isOverride: boolean;
  overrideReason: string | null;
  performerName: string;
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Unknown time';
  }
}

export function BreakGlassBanner({ docType, docId }: BreakGlassBannerProps) {
  const { data } = useQuery<{ history: HistoryEntry[] }>({
    queryKey: [`/api/workflow/documents/${docType}/${docId}/history`],
    enabled: !!docId,
  });

  const history = data?.history || [];

  // Filter for override events
  const overrideEvents = history.filter(
    (h) => h.isOverride === true || h.action === 'force_unlock'
  );

  if (overrideEvents.length === 0) return null;

  return (
    <Alert variant="destructive" className="mb-4 border-amber-500 bg-amber-50 dark:bg-amber-950/20">
      <AlertTriangle className="h-4 w-4 text-amber-600" />
      <AlertTitle className="text-amber-800 dark:text-amber-400 flex items-center gap-2">
        <Shield className="h-4 w-4" />
        Override Actions Detected
      </AlertTitle>
      <AlertDescription>
        <div className="mt-2 space-y-2">
          {overrideEvents.map((event) => (
            <div
              key={event.id}
              className="flex flex-wrap items-center gap-2 text-sm text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 rounded p-2"
            >
              <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-300">
                {event.action === 'force_unlock' ? 'Force Unlock' : 'Override'}
              </Badge>
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {event.performerName || 'Unknown'}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDate(event.performedAt)}
              </span>
              {(event.overrideReason || event.reason || event.comments) && (
                <span className="text-amber-600 dark:text-amber-400 italic">
                  Reason: {event.overrideReason || event.reason || event.comments}
                </span>
              )}
            </div>
          ))}
        </div>
      </AlertDescription>
    </Alert>
  );
}
