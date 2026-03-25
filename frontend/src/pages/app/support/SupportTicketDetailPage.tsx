import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type PlatformSupportTicketDetail, type PlatformSupportTicketMessage } from "@/api/client";
import { logApiError } from "@/utils/logApiError";
import { ArrowLeft, MessageSquare } from "lucide-react";

const PREFIX = "/app/support";

function bubbleClass(m: PlatformSupportTicketMessage) {
  if (m.author_type === "tenant") return "ml-0 mr-auto bg-brand-primary/10 border border-brand-primary/20";
  return "ml-auto mr-0 bg-surface-subtle border border-border";
}

export function SupportTicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const ticketId = id ? Number(id) : NaN;
  const [ticket, setTicket] = useState<PlatformSupportTicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(ticketId)) {
      setError("Invalid ticket");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const t = await api.getPlatformSupportTicket(ticketId);
      setTicket(t);
    } catch (e) {
      logApiError("getPlatformSupportTicket", e);
      setError(e instanceof Error ? e.message : "Failed to load ticket");
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket || !reply.trim()) return;
    const st = ticket.status.toLowerCase();
    if (st === "closed" || st === "resolved" || st === "cancelled" || st === "done") return;
    setSending(true);
    try {
      await api.replyPlatformSupportTicket(ticket.id, reply.trim());
      setReply("");
      await load();
    } catch (err) {
      logApiError("replyPlatformSupportTicket", err);
      setError(err instanceof Error ? err.message : "Failed to send reply");
    } finally {
      setSending(false);
    }
  };

  if (loading && !ticket) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-sm text-text-muted" data-page="platform-support-detail">
        Loading…
      </div>
    );
  }

  if (error && !ticket) {
    return (
      <div className="space-y-4" data-page="platform-support-detail">
        <Link to={`${PREFIX}/tickets`} className="text-sm font-medium text-brand-primary hover:underline inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" />
          Back to tickets
        </Link>
        <div className="rounded-lg border border-status-danger/30 bg-status-danger-subtle px-3 py-2 text-sm">{error}</div>
      </div>
    );
  }

  if (!ticket) return null;

  const closed = ["closed", "resolved", "cancelled", "done"].includes(ticket.status.toLowerCase());

  return (
    <div className="max-w-3xl space-y-6" data-page="platform-support-detail">
      <div>
        <Link to={`${PREFIX}/tickets`} className="text-sm font-medium text-brand-primary hover:underline inline-flex items-center gap-1 mb-2">
          <ArrowLeft className="h-4 w-4" />
          All tickets
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-text-primary">#{ticket.id} — {ticket.title}</h1>
            <p className="text-xs text-text-muted mt-1 capitalize">
              {ticket.status.replace(/_/g, " ")} · {ticket.priority} · {ticket.category}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-2">Original request</h2>
        <p className="text-sm text-text-primary whitespace-pre-wrap">{ticket.description}</p>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-brand-primary" />
          Thread
        </h2>
        <div className="space-y-3">
          {ticket.messages.length === 0 ? (
            <p className="text-sm text-text-muted">No replies yet — the team will respond here.</p>
          ) : (
            ticket.messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[90%] rounded-xl px-4 py-3 text-sm ${bubbleClass(m)}`}
              >
                <div className="text-[11px] font-semibold text-text-secondary mb-1 capitalize">
                  {m.author_type === "tenant" ? "You" : "Platform team"}
                  {m.created_at && (
                    <span className="font-normal text-text-muted ml-2">
                      {new Date(m.created_at).toLocaleString()}
                    </span>
                  )}
                </div>
                <p className="text-text-primary whitespace-pre-wrap">{m.content}</p>
              </div>
            ))
          )}
        </div>
      </div>

      {closed ? (
        <p className="text-sm text-text-muted">This ticket is closed. Open a new ticket if you need further help.</p>
      ) : (
        <form onSubmit={onReply} className="space-y-2 rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
          <label className="block text-xs font-semibold text-text-secondary">Reply</label>
          <textarea
            className="w-full rounded-lg border border-border bg-surface-base px-3 py-2 text-sm min-h-[100px]"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Add a message…"
          />
          <button
            type="submit"
            disabled={sending || !reply.trim()}
            className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send reply"}
          </button>
        </form>
      )}

      {error && ticket && (
        <div className="rounded-lg border border-status-danger/30 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}
    </div>
  );
}
