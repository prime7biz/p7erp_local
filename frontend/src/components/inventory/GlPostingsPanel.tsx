import { Link } from "react-router-dom";
import type { InventoryGlPostingDetail } from "@/api/client";

type Props = {
  postings: InventoryGlPostingDetail[];
  loading?: boolean;
  error?: string;
};

export function GlPostingsPanel({ postings, loading, error }: Props) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-surface-raised p-4 text-sm text-text-muted">Loading postings…</div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-status-danger/20 bg-status-danger-subtle p-4 text-sm text-status-danger-foreground">
        {error}
      </div>
    );
  }
  if (!postings.length) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface-subtle/40 p-4 text-sm text-text-muted">
        No GL postings linked to this document yet.
      </div>
    );
  }
  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface-raised p-4">
      <h3 className="text-sm font-semibold text-text-primary">GL postings</h3>
      <ul className="space-y-3">
        {postings.map((p) => (
          <li key={p.posting_id} className="rounded-lg border border-border bg-surface-subtle/30 p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-text-primary">
                {p.voucher_number}{" "}
                <span className="font-normal text-text-muted">({p.action})</span>
              </span>
              <Link
                to={`/app/accounts/vouchers/${p.voucher_id}`}
                className="text-brand-primary hover:underline"
              >
                Open voucher
              </Link>
            </div>
            <p className="mt-1 text-text-muted">
              Date: {p.voucher_date ?? "—"} · Status: {p.voucher_status}
            </p>
            {p.lines.length ? (
              <ul className="mt-2 space-y-1 border-t border-border pt-2">
                {p.lines.map((ln) => (
                  <li key={ln.line_id} className="flex justify-between gap-2 text-text-secondary">
                    <span>
                      Account #{ln.account_id} · {ln.entry_type}
                    </span>
                    <span className="font-mono">{ln.amount}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
