import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type PlatformSupportTicketItem } from "@/api/client";
import { logApiError } from "@/utils/logApiError";
import { ClipboardList, PlusCircle } from "lucide-react";

const PREFIX = "/app/support";

function statusClass(status: string) {
  const s = status.toLowerCase();
  if (s === "open") return "bg-status-info-subtle text-status-info-foreground";
  if (s === "in_progress") return "bg-status-warning-subtle text-status-warning-foreground";
  if (s === "closed" || s === "resolved") return "bg-surface-subtle text-text-secondary";
  return "bg-surface-subtle text-text-secondary";
}

export function SupportTicketsPage() {
  const [items, setItems] = useState<PlatformSupportTicketItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await api.listPlatformSupportTickets({
        page: 1,
        page_size: 50,
        status: statusFilter || undefined,
      });
      setItems(r.items);
      setTotal(r.total);
    } catch (e) {
      logApiError("listPlatformSupportTickets", e);
      setError(e instanceof Error ? e.message : "Failed to load tickets");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6" data-page="platform-support-tickets">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-brand-primary" />
            Platform support
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Open a ticket for billing, access, or technical help from the P7 operations team.
          </p>
        </div>
        <Link
          to={`${PREFIX}/tickets/new`}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
        >
          <PlusCircle className="h-4 w-4" />
          New ticket
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-raised p-3 shadow-sm">
        <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Filter</label>
        <select
          className="rounded-lg border border-border bg-surface-base px-2 py-1.5 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="closed">Closed</option>
        </select>
        <span className="text-xs text-text-muted">{total} total</span>
      </div>

      {error && <div className="rounded-lg border border-status-danger/30 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">{error}</div>}

      <div className="rounded-xl border border-border bg-surface-raised shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-text-muted">Loading tickets…</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-sm text-text-muted">
            No tickets yet.{" "}
            <Link to={`${PREFIX}/tickets/new`} className="font-semibold text-brand-primary hover:underline">
              Create your first ticket
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">
                <tr>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3 w-28"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((t) => (
                  <tr key={t.id} className="hover:bg-surface-subtle/60">
                    <td className="px-4 py-3 font-mono text-xs text-text-muted">#{t.id}</td>
                    <td className="px-4 py-3 font-medium text-text-primary max-w-xs truncate">{t.title}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass(t.status)}`}>
                        {t.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-secondary capitalize">{t.priority}</td>
                    <td className="px-4 py-3 text-xs text-text-muted">{t.updated_at ? new Date(t.updated_at).toLocaleString() : "—"}</td>
                    <td className="px-4 py-3">
                      <Link
                        to={`${PREFIX}/tickets/${t.id}`}
                        className="text-xs font-semibold text-brand-primary hover:underline"
                      >
                        View thread
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
