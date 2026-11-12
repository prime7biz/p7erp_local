import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import type { DrilldownQuery } from "@/api/financeBudgetAnalytics";
import { DRILL_PAGE_SIZE, useBudgetDrilldown } from "@/hooks/useFinanceBudgetAnalytics";
import { formatIndian, toUnits } from "@/components/finance/statements/statementFormat";
import { voucherHref } from "./budgetLogic";

/** What the user clicked: the filter for the API plus the row label and the "Actual" shown in the table. */
export interface BudgetDrillTarget {
  label: string;
  filter: DrilldownQuery;
  /** The table's Actual for this row (the panel total must match it). */
  actual: string;
}

interface Props {
  target: BudgetDrillTarget | null;
  currency: string;
  onClose: () => void;
}

const th = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-muted";
const thR = `${th} text-right`;
const tdR = "px-3 py-2 text-right tabular-nums";
const pageButton =
  "rounded-lg border border-border px-3 py-1.5 text-text-secondary hover:bg-surface-subtle disabled:opacity-50";

/**
 * Side drawer: the posted voucher lines behind one budget-analytics row (paged).
 * The total is the signed actual of ALL matching lines, so it equals the table cell.
 * A voucher number opens the normal voucher page.
 */
export function BudgetDrillPanel({ target, currency, onClose }: Props) {
  const [offset, setOffset] = useState(0);
  const { data, loading, error } = useBudgetDrilldown(target?.filter ?? null, offset);

  useEffect(() => {
    setOffset(0);
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, onClose]);

  if (!target) return null;
  const first = !data || data.line_count === 0 ? 0 : data.offset + 1;
  const last = data ? data.offset + data.lines.length : 0;
  const matches = data ? toUnits(data.total) === toUnits(target.actual) : true;

  return (
    <div className="no-print fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Voucher lines: ${target.label}`}
        className="flex h-full w-full max-w-4xl flex-col bg-surface-raised shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide text-text-muted">Actual spend · voucher lines</p>
            <h2 className="truncate text-base font-semibold text-text-primary">{target.label}</h2>
          </div>
          <button
            type="button"
            className="rounded-lg border border-border p-1.5 text-text-secondary hover:bg-surface-subtle"
            aria-label="Close voucher lines"
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {data ? (
            <dl className="grid grid-cols-2 gap-2 border-b border-border-subtle px-4 py-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-text-muted">Total of all lines</dt>
                <dd className="tabular-nums font-semibold" data-testid="drill-total">
                  {currency} {formatIndian(data.total)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Actual in the table</dt>
                <dd className="tabular-nums">
                  {currency} {formatIndian(target.actual)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Lines</dt>
                <dd className="tabular-nums">{data.line_count}</dd>
              </div>
            </dl>
          ) : null}
          {data && !matches ? (
            <p role="alert" className="mx-4 mt-3 rounded-lg border border-status-warning/30 bg-status-warning-subtle px-3 py-2 text-sm text-status-warning-foreground">
              The lines do not add up to the table figure. The books may have changed since the table was loaded — refresh the page.
            </p>
          ) : null}

          {loading && !data ? (
            <p className="p-4 text-sm text-text-muted" aria-busy="true">
              Loading…
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="p-4 text-sm text-status-danger-foreground">
              {error}
            </p>
          ) : null}
          {data && data.lines.length === 0 && offset === 0 ? (
            <p className="p-4 text-sm text-text-muted">No posted voucher lines for this row.</p>
          ) : null}

          {data && data.lines.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-subtle">
                  <tr>
                    <th className={th}>Date</th>
                    <th className={th}>Voucher</th>
                    <th className={th}>Account</th>
                    <th className={th}>Cost centre</th>
                    <th className={th}>Narration</th>
                    <th className={thR}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((l) => (
                    <tr key={l.voucher_line_id} className="border-t border-border-subtle">
                      <td className="whitespace-nowrap px-3 py-2">{l.voucher_date}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <Link className="text-brand-primary hover:underline" to={voucherHref(l.voucher_id)}>
                          {l.voucher_number}
                        </Link>
                        <span className="ml-2 text-xs text-text-muted">{l.entry_type}</span>
                      </td>
                      <td className="px-3 py-2">
                        {[l.account_number, l.account_name].filter(Boolean).join(" · ") || `#${l.account_id}`}
                      </td>
                      <td className="px-3 py-2 text-text-secondary">{l.cost_center_name ?? "—"}</td>
                      <td className="max-w-[16rem] truncate px-3 py-2 text-text-secondary" title={l.narration ?? undefined}>
                        {l.narration ?? ""}
                      </td>
                      <td className={tdR}>{formatIndian(l.signed_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        {data && data.line_count > 0 ? (
          <div className="flex items-center justify-between gap-2 border-t border-border-subtle px-4 py-3 text-sm">
            <span className="text-text-muted">
              {first}–{last} of {data.line_count}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className={pageButton}
                disabled={offset === 0 || loading}
                onClick={() => setOffset(Math.max(0, offset - DRILL_PAGE_SIZE))}
              >
                Previous
              </button>
              <button
                type="button"
                className={pageButton}
                disabled={last >= data.line_count || loading}
                onClick={() => setOffset(offset + DRILL_PAGE_SIZE)}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
