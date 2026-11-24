import { useEffect, useState } from "react";
import { request } from "@/api/core";
import { useEmbeddedPage } from "@/components/app/embeddedPage";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";

type ScoreRow = {
  vendor_id: number;
  vendor_name?: string | null;
  inspections: number;
  received_qty: string;
  accepted_qty: string;
  rejected_qty: string;
  pass_rate_pct?: string | null;
};

export function SupplierScorecardPage() {
  const embedded = useEmbeddedPage();
  const [items, setItems] = useState<ScoreRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    request<{ items: ScoreRow[] }>("/api/v1/material-control/supplier-scorecard")
      .then((res) => {
        if (!cancelled) {
          setItems(res.items ?? []);
          setError(null);
        }
      })
      .catch((e) => {
        logApiError("SupplierScorecardPage.load", e);
        if (!cancelled) setError("Could not load scorecard (is Material Control hub or inbound flag on?).");
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
      {!embedded ? (
        <AppPageHeader title="Supplier scorecard" description="QC pass / reject by vendor" />
      ) : null}
      {loading ? <p className="text-sm text-text-muted">Loading…</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {!loading && !error && items.length === 0 ? (
        <p className="text-sm text-text-muted">No completed QC inspections yet.</p>
      ) : null}
      {items.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border text-xs text-text-muted">
              <tr>
                <th className="px-2 py-1.5 font-medium">Vendor</th>
                <th className="px-2 py-1.5 font-medium">Inspections</th>
                <th className="px-2 py-1.5 font-medium">Pass %</th>
                <th className="px-2 py-1.5 font-medium">Rejected qty</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.vendor_id} className="border-b border-border/60">
                  <td className="px-2 py-1.5">{row.vendor_name || `#${row.vendor_id}`}</td>
                  <td className="px-2 py-1.5">{row.inspections}</td>
                  <td className="px-2 py-1.5">{row.pass_rate_pct ?? "—"}</td>
                  <td className="px-2 py-1.5">{row.rejected_qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
