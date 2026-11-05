/**
 * Voucher edit log (Tally "Edit Log"): who created, edited, approved, posted or reversed the voucher, and why.
 */
import { useEffect, useState } from "react";
import { api, type VoucherHistoryEvent } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

const EVENT_LABEL: Record<string, string> = {
  created: "Created",
  updated: "Edited",
  status: "Status changed",
  cancel_posting: "Posting cancelled",
  reversed: "Reversed",
  deleted: "Deleted",
};

const FIELD_LABEL: Record<string, string> = {
  voucher_type: "Type",
  voucher_date: "Date",
  description: "Narration",
  reference: "Reference",
  currency: "Currency",
  exchange_rate: "Exchange rate",
};

function show(v: unknown): string {
  if (v == null || v === "") return "—";
  return String(v);
}

function ChangeList({ changes }: { changes: NonNullable<VoucherHistoryEvent["changes"]> }) {
  const items = Object.entries(changes).filter(([k]) => k in FIELD_LABEL || k === "lines");
  if (items.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-text-secondary">
      {items.map(([k, c]) =>
        k === "lines" ? (
          <li key={k}>
            Lines: {show((c.from as { count?: number })?.count)} lines, debit {show((c.from as { debit_total?: number })?.debit_total)} →{" "}
            {show((c.to as { count?: number })?.count)} lines, debit {show((c.to as { debit_total?: number })?.debit_total)}
          </li>
        ) : (
          <li key={k}>
            {FIELD_LABEL[k]}: <span className="line-through opacity-70">{show(c.from)}</span> → <span className="font-medium">{show(c.to)}</span>
          </li>
        ),
      )}
    </ul>
  );
}

export function VoucherHistoryPanel({ voucherId, refreshKey }: { voucherId: number; refreshKey?: string }) {
  const [events, setEvents] = useState<VoucherHistoryEvent[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    api
      .getVoucherHistory(voucherId)
      .then((r) => {
        if (!cancelled) setEvents(r.events);
      })
      .catch((e) => {
        logApiError("VoucherHistoryPanel.load", e);
        if (!cancelled) setError("Could not load history.");
      });
    return () => {
      cancelled = true;
    };
  }, [voucherId, refreshKey]);

  return (
    <section className="rounded-xl border border-border bg-surface-raised p-4 print:hidden">
      <h2 className="text-sm font-semibold text-text-primary">History</h2>
      <p className="text-xs text-text-muted">Every create, edit and approval step on this voucher, newest first.</p>
      {error ? <p className="mt-2 text-xs text-status-danger-foreground">{error}</p> : null}
      {events == null && !error ? <p className="mt-2 text-xs text-text-muted">Loading…</p> : null}
      {events && events.length === 0 ? (
        <p className="mt-2 text-xs text-text-muted">No history recorded yet (vouchers created before this feature have no earlier entries).</p>
      ) : null}
      {events && events.length > 0 ? (
        <ol className="mt-3 space-y-3 border-l border-border pl-4">
          {events.map((ev) => (
            <li key={ev.id} className="relative">
              <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-brand-primary" aria-hidden />
              <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-medium text-text-primary">{EVENT_LABEL[ev.event] ?? ev.event}</span>
                {ev.summary ? <span className="text-text-secondary">{ev.summary}</span> : null}
              </div>
              <div className="text-xs text-text-muted">
                {ev.username ?? (ev.user_id ? `User #${ev.user_id}` : "System")} · {ev.at ? new Date(`${ev.at}Z`).toLocaleString() : "—"}
              </div>
              {ev.reason ? <div className="mt-0.5 text-xs text-text-secondary">Reason: {ev.reason}</div> : null}
              {ev.event === "updated" && ev.changes ? <ChangeList changes={ev.changes} /> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
