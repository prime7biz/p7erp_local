import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, X } from "lucide-react";
import { api, type DashboardPendingPriceAlert } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

type Props = {
  className?: string;
};

const STORAGE_KEY = "p7_owner_cost_alerts_dismissed";
const REFRESH_MS = 5 * 60 * 1000;

function readDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

function writeDismissed(ids: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

/**
 * Pending price verification / margin-drop alerts for owners.
 * Dismissals persist in localStorage; strip auto-refreshes every 5 minutes.
 */
export function OwnerCostAlertStrip({ className = "" }: Props) {
  const [alerts, setAlerts] = useState<DashboardPendingPriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissed());
  const [collapsed, setCollapsed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.getDashboardPendingPriceVerifications({ limit: 12 });
      setAlerts(res.alerts ?? []);
    } catch (e) {
      logApiError("OwnerCostAlertStrip", e);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => {
      void load();
    }, REFRESH_MS);
    return () => window.clearInterval(t);
  }, [load]);

  const visible = useMemo(
    () => alerts.filter((a) => !dismissed.has(a.id || `order:${a.order_id}`)),
    [alerts, dismissed],
  );

  const dismissOne = (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      writeDismissed(next);
      return next;
    });
  };

  const dismissAll = () => {
    setDismissed((prev) => {
      const next = new Set(prev);
      for (const a of alerts) next.add(a.id || `order:${a.order_id}`);
      writeDismissed(next);
      return next;
    });
    setCollapsed(true);
  };

  if (loading) return null;

  if (visible.length === 0) {
    if (!collapsed || alerts.length === 0) return null;
    return (
      <button
        type="button"
        className={`inline-flex items-center gap-1.5 rounded-full border border-status-warning/40 bg-status-warning-subtle px-3 py-1 text-xs font-medium text-status-warning-foreground ${className}`}
        onClick={() => {
          setDismissed(new Set());
          writeDismissed(new Set());
          setCollapsed(false);
        }}
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        {alerts.length} cost alert{alerts.length === 1 ? "" : "s"}
      </button>
    );
  }

  const hasCritical = visible.some((a) => a.severity === "critical");
  const shell = hasCritical
    ? "border-status-danger/30 bg-status-danger-subtle/40"
    : "border-status-warning/30 bg-status-warning-subtle/40";
  const titleColor = hasCritical ? "text-status-danger-foreground" : "text-status-warning-foreground";

  return (
    <section className={`rounded-xl border p-4 ${shell} ${className}`} aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${titleColor}`} aria-hidden />
          <div>
            <h2 className={`text-sm font-semibold ${titleColor}`}>
              Pending price verification ({visible.length}
              {alerts.length > visible.length ? ` of ${alerts.length}` : ""})
            </h2>
            <p className="mt-0.5 text-xs text-text-secondary">
              Click an alert to open the order. Dismissed alerts stay hidden on this browser.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/app/merch/profitability?status=red"
            className={`inline-flex items-center gap-1 text-xs font-medium hover:underline ${titleColor}`}
          >
            Open profitability <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <button
            type="button"
            className="rounded border border-border bg-surface-raised px-2 py-1 text-xs text-text-secondary hover:bg-state-hover"
            onClick={dismissAll}
          >
            Dismiss all
          </button>
        </div>
      </div>
      <ul className="mt-3 space-y-2">
        {visible.map((item) => {
          const id = item.id || `order:${item.order_id}`;
          const chip =
            item.severity === "critical"
              ? "border-status-danger/25 text-status-danger-foreground"
              : "border-status-warning/25 text-status-warning-foreground";
          return (
            <li
              key={id}
              className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-surface-raised px-2.5 py-1.5 text-xs ${chip}`}
            >
              <Link to={item.link || item.href || `/app/orders/${item.order_id}`} className="min-w-0 flex-1 hover:underline">
                <span className="font-medium text-text-primary">{item.order_code || `Order #${item.order_id}`}</span>
                <span className="ml-2 text-text-secondary">{item.message}</span>
              </Link>
              <button
                type="button"
                aria-label="Dismiss alert"
                className="rounded p-1 text-text-muted hover:bg-state-hover hover:text-text-primary"
                onClick={() => dismissOne(id)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
