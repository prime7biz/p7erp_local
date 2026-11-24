import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchMaterialActions, type ActionQueueItem } from "@/api/materialControl";
import { useEmbeddedPage } from "@/components/app/embeddedPage";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";

const severityClass: Record<ActionQueueItem["severity"], string> = {
  info: "border-border bg-surface-raised text-text-secondary",
  warn: "border-amber-300 bg-amber-50 text-amber-900",
  urgent: "border-red-300 bg-red-50 text-red-900",
};

export function ActionQueuePage() {
  const embedded = useEmbeddedPage();
  const [items, setItems] = useState<ActionQueueItem[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMaterialActions()
      .then((res) => {
        if (cancelled) return;
        setItems(res.items ?? []);
        setTruncated(Boolean(res.truncated));
        setError(null);
      })
      .catch((e) => {
        logApiError("ActionQueuePage.load", e);
        if (!cancelled) setError("Could not load today's actions.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      {!embedded ? <AppPageHeader title="Today's actions" description="Open drafts and unbilled receipts" /> : null}
      {loading ? <p className="text-sm text-text-muted">Loading…</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {!loading && !error && items.length === 0 ? (
        <p className="text-sm text-text-muted">Nothing waiting right now.</p>
      ) : null}
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={`${item.kind}-${item.record_id}`}>
            <Link
              to={item.href}
              className={`block rounded-lg border px-3 py-2.5 text-sm transition-colors hover:border-brand-primary/40 ${severityClass[item.severity]}`}
            >
              <div className="font-medium text-text-primary">{item.title}</div>
              {item.detail ? <div className="mt-0.5 text-xs opacity-80">{item.detail}</div> : null}
            </Link>
          </li>
        ))}
      </ul>
      {truncated ? <p className="text-xs text-text-muted">Showing the first 50 items.</p> : null}
    </div>
  );
}
