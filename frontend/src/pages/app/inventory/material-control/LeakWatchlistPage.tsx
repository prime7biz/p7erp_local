import { useEffect, useState } from "react";
import { fetchLeakWatchlist, type LeakWatchlist } from "@/api/materialControl";
import { useEmbeddedPage } from "@/components/app/embeddedPage";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";

export function LeakWatchlistPage() {
  const embedded = useEmbeddedPage();
  const [data, setData] = useState<LeakWatchlist | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLeakWatchlist()
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      })
      .catch((e) => {
        logApiError("LeakWatchlistPage.load", e);
        if (!cancelled) setError("Could not load watchlist (is the budget-plan flag on?).");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      {!embedded ? (
        <AppPageHeader title="Cost-saving watchlist" description="Five leak buckets for material cash" />
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {data ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          <li className="rounded-lg border border-border bg-surface-raised px-3 py-2">
            <div className="text-xs text-text-muted">Aging remnants (&gt;30d)</div>
            <div className="text-lg font-semibold">{data.aging_remnants?.count ?? 0} layers</div>
            <div className="text-xs text-text-secondary">FIFO value {data.aging_remnants?.fifo_value ?? "0"}</div>
          </li>
          <li className="rounded-lg border border-border bg-surface-raised px-3 py-2">
            <div className="text-xs text-text-muted">Unbilled GRNI</div>
            <div className="text-lg font-semibold">{data.unbilled_grni?.count ?? 0} GRNs</div>
          </li>
          <li className="rounded-lg border border-border bg-surface-raised px-3 py-2">
            <div className="text-xs text-text-muted">Over-buy vs BOM</div>
            <div className="text-lg font-semibold">{(data.overbuy_vs_bom as { count?: number })?.count ?? 0} items</div>
          </li>
          <li className="rounded-lg border border-border bg-surface-raised px-3 py-2">
            <div className="text-xs text-text-muted">QC reject / hold</div>
            <div className="text-lg font-semibold">
              {(data.qc_reject_unclaimed as { count?: number })?.count ?? 0} lines
            </div>
          </li>
          <li className="rounded-lg border border-border bg-surface-raised px-3 py-2 sm:col-span-2">
            <div className="text-xs text-text-muted">Process loss over standard</div>
            <div className="text-lg font-semibold">
              {(data.process_loss_over_std as { count?: number })?.count ?? 0} IDT rows
            </div>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
