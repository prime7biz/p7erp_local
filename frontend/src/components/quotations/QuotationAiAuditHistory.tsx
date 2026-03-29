import { useCallback, useState } from "react";
import { api, ApiError, type QuotationAiAuditEntry } from "@/api/client";
import { ChevronDown, ChevronRight, History } from "lucide-react";
import { logApiError } from "@/utils/logApiError";
import { cn } from "@/lib/utils";

type Props = {
  quotationId: number;
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function countLine(row: QuotationAiAuditEntry): string | null {
  const parts: string[] = [];
  if (row.issue_count != null) parts.push(`${row.issue_count} issue(s)`);
  if (row.match_count != null) parts.push(`${row.match_count} match(es)`);
  if (row.key_facts_count != null) parts.push(`${row.key_facts_count} fact(s)`);
  if (row.action_count != null) parts.push(`${row.action_count} action(s)`);
  if (row.applied_field_count != null) parts.push(`${row.applied_field_count} field(s)`);
  if (parts.length === 0) return null;
  return parts.join(" · ");
}

export function QuotationAiAuditHistory({ quotationId }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<QuotationAiAuditEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.quotationAiAuditLog({ quotation_id: quotationId, limit: 40 });
      setItems(res.items);
    } catch (e) {
      logApiError("QuotationAiAuditHistory.load", e);
      setItems([]);
      if (e instanceof ApiError && e.status === 403) {
        setLoadError("You do not have permission to view AI activity history for this tenant.");
      } else {
        setLoadError("Could not load AI activity. Try again later.");
      }
    } finally {
      setLoading(false);
    }
  }, [quotationId]);

  return (
    <div className="mt-3 border-t border-border-subtle pt-3">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next && items === null) void load();
        }}
        className="flex w-full items-center justify-between rounded-lg border border-border-strong px-3 py-2 text-left text-sm font-medium text-text-secondary hover:bg-surface-subtle"
      >
        <span className="inline-flex items-center gap-2">
          <History className="h-4 w-4" />
          Recent AI activity (this quotation)
        </span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open ? (
        <div className="mt-2 max-h-64 space-y-2 overflow-y-auto rounded-lg border border-border-subtle bg-surface-subtle/30 px-3 py-2 text-xs text-text-secondary">
          {loading ? <div className="text-text-muted">Loading...</div> : null}
          {!loading && loadError ? <div className="text-status-warning-foreground">{loadError}</div> : null}
          {!loading && !loadError && items && items.length === 0 ? (
            <div className="text-text-muted">No AI actions recorded for this quotation yet.</div>
          ) : null}
          {!loading && !loadError && items && items.length > 0
            ? items.map((row) => {
                const counts = countLine(row);
                return (
                  <div key={row.id} className="border-b border-border-subtle/50 pb-2 last:border-0 last:pb-0">
                    <div className="font-medium text-text-primary">
                      {row.event_label || row.action}
                      {row.actor_username ? (
                        <span className="text-text-muted font-normal"> · {row.actor_username}</span>
                      ) : null}
                    </div>
                    <div className={cn("text-text-muted", counts ? "mt-0.5" : "")}>
                      {formatWhen(row.created_at)}
                      {counts ? ` · ${counts}` : ""}
                    </div>
                    {row.summary ? <div className="mt-0.5 text-text-secondary">{row.summary}</div> : null}
                  </div>
                );
              })
            : null}
        </div>
      ) : null}
    </div>
  );
}
