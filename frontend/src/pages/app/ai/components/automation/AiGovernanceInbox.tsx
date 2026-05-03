import { useState } from "react";
import { CheckCircle2, RefreshCw, RotateCcw, XCircle } from "lucide-react";
import type { AiGovernanceProposal } from "@/api/client";
import type { GovernanceStatusFilter } from "@/pages/app/ai/hooks/useAiAutomation";

const FILTERS: GovernanceStatusFilter[] = ["proposed", "approved", "rejected", "rolled_back", "all"];

interface Props {
  rows: AiGovernanceProposal[];
  loading: boolean;
  statusFilter: GovernanceStatusFilter;
  canAct: boolean;
  onFilterChange: (next: GovernanceStatusFilter) => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
  onApprove: (id: number) => void | Promise<void>;
  onReject: (id: number, reason: string) => void | Promise<void>;
  onRollback: (id: number) => void | Promise<void>;
}

export function AiGovernanceInbox({
  rows,
  loading,
  statusFilter,
  canAct,
  onFilterChange,
  onRefresh,
  onApprove,
  onReject,
  onRollback,
}: Props) {
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  return (
    <div className="rounded-xl border border-border bg-surface-raised">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-semibold text-text-primary">Governance proposals</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            value={statusFilter}
            onChange={(e) => void onFilterChange(e.target.value as GovernanceStatusFilter)}
            className="rounded-md border border-border-strong bg-surface-raised px-2 py-1 text-xs"
          >
            {FILTERS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void onRefresh()}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {!canAct ? (
        <p className="px-4 py-3 text-xs text-text-muted">
          Only tenant admins can approve, reject, or mark rollback. You can still review the queue below.
        </p>
      ) : null}

      {loading && rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-text-muted">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-text-muted">No proposals for this filter.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((p) => (
            <li key={p.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] text-text-muted">#{p.id}</span>
                <span className="text-sm font-semibold text-text-primary">{p.rule_code}</span>
                <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-[10px] text-text-secondary">
                  {p.status}
                </span>
                <span className="text-[11px] text-text-muted">{new Date(p.created_at).toLocaleString()}</span>
              </div>
              {p.rejected_reason ? (
                <p className="mt-1 text-xs text-status-danger-foreground">Reason: {p.rejected_reason}</p>
              ) : null}
              {p.payload_json ? (
                <pre className="mt-1 max-h-32 overflow-auto rounded bg-surface-subtle p-2 text-[11px]">
                  {JSON.stringify(p.payload_json, null, 2)}
                </pre>
              ) : null}
              {canAct && p.status === "proposed" ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void onApprove(p.id)}
                    className="inline-flex items-center gap-1 rounded-md bg-status-success px-2.5 py-1 text-[11px] font-semibold text-white"
                  >
                    <CheckCircle2 className="h-3 w-3" /> Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => setRejectingId(p.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-status-danger/40 px-2.5 py-1 text-[11px] font-semibold text-status-danger-foreground"
                  >
                    <XCircle className="h-3 w-3" /> Reject
                  </button>
                </div>
              ) : null}
              {canAct && p.status === "approved" ? (
                <button
                  type="button"
                  onClick={() => void onRollback(p.id)}
                  className="mt-2 inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] text-text-secondary hover:bg-surface-subtle"
                >
                  <RotateCcw className="h-3 w-3" /> Mark rollback
                </button>
              ) : null}
              {rejectingId === p.id ? (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="text"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Reason (optional)"
                    className="flex-1 rounded-md border border-border-strong px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      void (async () => {
                        await onReject(p.id, rejectReason);
                        setRejectingId(null);
                        setRejectReason("");
                      })();
                    }}
                    className="rounded-md bg-status-danger px-2.5 py-1 text-[11px] font-semibold text-white"
                  >
                    Confirm reject
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRejectingId(null);
                      setRejectReason("");
                    }}
                    className="rounded-md border border-border px-2 py-1 text-[11px] text-text-secondary"
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
