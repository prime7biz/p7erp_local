import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";
import { api, type AppNotification, type DashboardAttentionSummary } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

const POLL_MS = 60_000;

type AttentionRow = { key: string; label: string; count: number; href: string };

function attentionRows(s: DashboardAttentionSummary | null): AttentionRow[] {
  if (!s) return [];
  const rows: AttentionRow[] = [
    { key: "approvals", label: "Pending approvals", count: s.pending_approvals ?? 0, href: s.links?.pending_approvals ?? "/app/approvals" },
    { key: "alerts", label: "Critical alerts", count: s.critical_alerts ?? 0, href: s.links?.critical_alerts ?? "/app/merchandising/alerts" },
    { key: "tna", label: "Overdue TNA tasks", count: s.tna_overdue ?? 0, href: s.links?.tna_overdue ?? "/app/followup" },
    { key: "late", label: "Orders past delivery date", count: s.promise_blocked ?? 0, href: s.links?.promise_blocked ?? "/app/orders" },
    { key: "cr", label: "Commercial change requests", count: s.commercial_pending ?? 0, href: s.links?.commercial_pending ?? "/app/orders" },
    {
      key: "pdc",
      label: "Post-dated vouchers due",
      count: s.post_dated_due_today ?? 0,
      href: s.links?.post_dated_due_today ?? "/app/finance/registers/post-dated",
    },
  ];
  return rows.filter((r) => r.count > 0);
}

function timeAgo(iso: string): string {
  const then = new Date(iso.endsWith("Z") ? iso : `${iso}Z`).getTime();
  const mins = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** Header bell: work waiting for the team (attention summary) + personal notifications. */
export function BellPanel() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<DashboardAttentionSummary | null>(null);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await api.listNotifications({ limit: 15 });
      setItems(res.items);
      setUnread(res.unread_count);
    } catch (e) {
      logApiError("BellPanel.notifications", e);
    }
  }, []);

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await api.getDashboardAttentionSummary());
    } catch (e) {
      logApiError("BellPanel.attentionSummary", e);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
    void loadSummary();
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadNotifications();
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [loadNotifications, loadSummary]);

  useEffect(() => {
    if (!open) return;
    void loadNotifications();
    void loadSummary();
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, loadNotifications, loadSummary]);

  const rows = attentionRows(summary);
  const attentionTotal = rows.reduce((n, r) => n + (r.key === "approvals" || r.key === "alerts" || r.key === "tna" ? r.count : 0), 0);
  const badge = unread + attentionTotal;

  const openNotification = async (n: AppNotification) => {
    setOpen(false);
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      api.markNotificationRead(n.id).catch((e) => logApiError("BellPanel.markRead", e));
    }
    if (n.href) navigate(n.href);
  };

  const markAll = async () => {
    try {
      await api.markAllNotificationsRead();
      setItems((prev) => prev.map((x) => ({ ...x, read: true })));
      setUnread(0);
    } catch (e) {
      logApiError("BellPanel.markAll", e);
    }
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={badge > 0 ? `Notifications, ${badge} need attention` : "Notifications"}
        className="relative flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition hover:bg-surface-subtle"
        title="Notifications and work waiting"
      >
        <Bell className="h-4 w-4" />
        {badge > 0 ? (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-danger px-1 text-[10px] font-semibold text-white">
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-30 mt-1 w-[22rem] max-w-[calc(100vw-1.5rem)] rounded-lg border border-border bg-surface-raised shadow-xl"
        >
          <div className="border-b border-border-subtle px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Needs attention</div>
            {rows.length === 0 ? (
              <p className="py-1.5 text-xs text-text-muted">Nothing waiting. Nice work.</p>
            ) : (
              <ul className="mt-1 space-y-0.5">
                {rows.map((r) => (
                  <li key={r.key}>
                    <Link
                      to={r.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle"
                    >
                      <span>{r.label}</span>
                      <span className="rounded-full bg-status-warning-subtle px-2 py-0.5 text-xs font-semibold text-status-warning-foreground">
                        {r.count}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="px-3 py-2">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                For you {unread > 0 ? `· ${unread} unread` : ""}
              </div>
              {unread > 0 ? (
                <button type="button" onClick={() => void markAll()} className="inline-flex items-center gap-1 text-[11px] text-brand-primary hover:underline">
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden /> Mark all read
                </button>
              ) : null}
            </div>
            {items.length === 0 ? (
              <p className="py-3 text-center text-xs text-text-muted">No notifications yet. Approvals and rejections of your documents will appear here.</p>
            ) : (
              <ul className="mt-1 max-h-72 space-y-0.5 overflow-y-auto">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => void openNotification(n)}
                      className="flex w-full gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-subtle"
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-brand-primary"}`}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm ${n.read ? "text-text-secondary" : "font-semibold text-text-primary"}`}>
                          {n.title}
                        </span>
                        {n.body ? <span className="block truncate text-[11px] text-text-muted">{n.body}</span> : null}
                        <span className="block text-[10px] text-text-muted">{timeAgo(n.created_at)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-border-subtle px-3 py-1.5 text-right">
            <Link to="/app/approvals" onClick={() => setOpen(false)} className="text-xs font-medium text-brand-primary hover:underline">
              Open all approvals
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
