import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api, type MerchAlertItem } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function AlertActionCenter() {
  const [items, setItems] = useState<MerchAlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await api.getMerchAlerts({ page: 1, page_size: 15, status: "open" });
        if (!cancelled) setItems(res.items ?? []);
      } catch (e) {
        logApiError(e, "AlertActionCenter.load");
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load alerts");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-raised p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text-primary">Alerts &amp; actions</h3>
        <Link to="/app/merchandising/alerts" className="text-xs text-status-info hover:underline">
          Open critical alerts
        </Link>
      </div>
      {loading ? <p className="text-xs text-text-muted">Loading…</p> : null}
      {error ? <div className="text-xs text-status-danger-foreground">{error}</div> : null}
      {!loading && !error && items.length === 0 ? (
        <p className="text-xs text-text-muted">No open merchandising alerts.</p>
      ) : null}
      <ul className="space-y-2">
        {items.map((a) => (
          <li key={a.id} className="rounded border border-border-subtle bg-surface-subtle p-2 text-xs">
            <div className="font-medium text-text-primary">{a.title}</div>
            <div className="text-text-secondary">
              <span className="uppercase text-[10px] text-text-muted">{a.severity}</span>
              {a.order_code ? (
                <>
                  {" "}
                  ·{" "}
                  <Link className="text-status-info hover:underline" to={`/app/orders?q=${encodeURIComponent(a.order_code)}`}>
                    {a.order_code}
                  </Link>
                </>
              ) : null}
            </div>
            {a.recommended_action ? (
              <div className="mt-1 text-text-muted">{a.recommended_action}</div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
