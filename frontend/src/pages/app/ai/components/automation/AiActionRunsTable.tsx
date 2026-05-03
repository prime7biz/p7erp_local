import { RefreshCw } from "lucide-react";
import type { AiActionRunResponse } from "@/api/client";

interface Props {
  rows: AiActionRunResponse[];
  loading: boolean;
  onRefresh: () => void | Promise<void>;
}

function statusClass(status: string): string {
  const s = status.toUpperCase();
  if (s === "EXECUTED") return "bg-status-success-subtle text-status-success-foreground";
  if (s === "FAILED") return "bg-status-danger-subtle text-status-danger-foreground";
  if (s === "PROPOSED") return "bg-status-warning-subtle text-status-warning-foreground";
  return "bg-surface-subtle text-text-secondary";
}

export function AiActionRunsTable({ rows, loading, onRefresh }: Props) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-semibold text-text-primary">Recent action runs</h2>
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

      {loading && rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-text-muted">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-text-muted">
          No action runs yet. Propose one above (for example: &quot;Create follow-up reminder for order 123&quot;).
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-subtle text-text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Risk</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Preview</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="align-top border-t border-border">
                  <td className="whitespace-nowrap px-3 py-2 text-text-secondary">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 font-medium text-text-primary">{r.action_key}</td>
                  <td className="px-3 py-2 text-text-secondary">{r.risk_level}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass(r.status)}`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="line-clamp-2 max-w-[520px] px-3 py-2 text-text-secondary">
                    {r.preview_text || r.prompt_text}
                    {r.error_text ? (
                      <span className="mt-1 block text-status-danger-foreground">{r.error_text}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
