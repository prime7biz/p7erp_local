import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, X } from "lucide-react";
import type { ControlCard } from "@/api/financeControl";
import { EXCEPTION_PAGE_SIZE, useExceptionList } from "@/hooks/useFinanceControl";
import { amountText, currencyNote, detailPairs, exceptionRowHref, isLastPage, SEVERITY_CHIP, SEVERITY_LABEL } from "./controlLogic";

interface Props {
  /** The card that was clicked; null keeps the panel closed. */
  card: ControlCard | null;
  asOf: string;
  currency: string;
  onClose: () => void;
}

const th = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-muted";
const btn = "rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-subtle disabled:opacity-50";

/**
 * Side panel with the rows behind one Control Tower card (25 per page).
 * The total and amount in the header come from the list itself, so they always equal the rows.
 */
export function ExceptionPanel({ card, asOf, currency, onClose }: Props) {
  const [offset, setOffset] = useState(0);
  const code = card?.code ?? null;
  const { data, loading, error, reload } = useExceptionList(code, asOf, offset);

  useEffect(() => setOffset(0), [code, asOf]);

  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, onClose]);

  if (!card) return null;
  const severity = data?.severity ?? card.severity;
  const note = data?.note ?? card.note;
  const countChanged = !!data && data.total !== card.count;

  return (
    <div className="no-print fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Exceptions: ${card.label}`}
        className="flex h-full w-full max-w-3xl flex-col bg-surface-raised shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide text-text-muted">Exception list · as of {asOf}</p>
            <h2 className="text-base font-semibold text-text-primary">{card.label}</h2>
            {data ? (
              <p className="mt-1 text-sm text-text-secondary" data-testid="exception-summary">
                <span data-testid="exception-total">{data.total}</span> item(s) · {currency}{" "}
                <span className="font-semibold tabular-nums" data-testid="exception-amount">{amountText(data.amount)}</span>
                {data.oldest_date ? <> · oldest {data.oldest_date}</> : null}
              </p>
            ) : null}
          </div>
          <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${SEVERITY_CHIP[severity]}`}>
            {SEVERITY_LABEL[severity]}
          </span>
          <button type="button" className={btn} onClick={reload} disabled={loading} aria-label="Refresh list">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button type="button" className={btn} onClick={onClose} aria-label="Close exception list">
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {note ? (
            <p className="border-b border-border-subtle px-4 py-2 text-xs text-status-warning-foreground" data-testid="exception-note">
              {note}
            </p>
          ) : null}
          {countChanged ? (
            <p role="status" className="border-b border-status-warning/30 bg-status-warning-subtle px-4 py-2 text-xs text-status-warning-foreground">
              The list now has {data!.total} item(s) but the card showed {card.count}. Records changed since the card was loaded; refresh the
              Control Tower.
            </p>
          ) : null}
          {loading && !data ? <p className="p-4 text-sm text-text-muted" aria-busy="true">Loading…</p> : null}
          {error ? (
            <div role="alert" className="m-4 flex items-center gap-3 rounded-lg border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">
              <span>{error}</span>
              <button type="button" className="rounded border border-current px-2 py-0.5 text-xs" onClick={reload}>
                Retry
              </button>
            </div>
          ) : null}
          {data && data.rows.length === 0 && !loading ? (
            <p className="p-4 text-sm text-text-muted">Nothing to show. All clear for this check.</p>
          ) : null}
          {data && data.rows.length > 0 ? (
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle">
                <tr>
                  <th className={th}>Reference</th>
                  <th className={th}>Date</th>
                  <th className={th}>Party / name</th>
                  <th className={`${th} text-right`}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, index) => {
                  const href = exceptionRowHref(data.code, row);
                  const pairs = detailPairs(row.details);
                  const warning = currencyNote(row.details);
                  return (
                    <tr key={`${row.id ?? "x"}-${offset + index}`} className="border-t border-border-subtle align-top">
                      <td className="px-3 py-2">
                        {href ? (
                          <Link to={href} className="font-medium text-brand-primary hover:underline">
                            {row.reference ?? `#${row.id}`}
                          </Link>
                        ) : (
                          <span className="font-medium text-text-primary">{row.reference ?? (row.id != null ? `#${row.id}` : "—")}</span>
                        )}
                        {pairs.length ? (
                          <p className="mt-0.5 text-xs text-text-muted">{pairs.map((p) => `${p.label}: ${p.value}`).join(" · ")}</p>
                        ) : null}
                        {warning ? (
                          <p className="mt-0.5 text-xs text-status-warning-foreground" data-testid="row-currency-note">
                            {warning}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{row.date ?? "—"}</td>
                      <td className="px-3 py-2">{row.party ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{amountText(row.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
        </div>

        {data && data.total > EXCEPTION_PAGE_SIZE ? (
          <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-text-muted">
            <span>
              {offset + 1}–{Math.min(offset + EXCEPTION_PAGE_SIZE, data.total)} of {data.total}
            </span>
            <span className="flex gap-2">
              <button type="button" className={btn} disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - EXCEPTION_PAGE_SIZE))}>
                Previous
              </button>
              <button
                type="button"
                className={btn}
                disabled={isLastPage(data.total, offset, EXCEPTION_PAGE_SIZE) || loading}
                onClick={() => setOffset(offset + EXCEPTION_PAGE_SIZE)}
              >
                Next
              </button>
            </span>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
