import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, X } from "lucide-react";
import { useDrillCashFlow, useDrillGroup, useDrillLedger } from "@/hooks/useFinanceStatements";
import { formatCell, formatDrCr } from "./statementFormat";

/** What the user clicked in a statement. Dates are optional: the panel falls back to the statement period. */
export type DrillTarget =
  | { kind: "group"; id: number; name: string }
  | { kind: "ledger"; id: number; name: string; from?: string; to?: string }
  | { kind: "cash-month"; month: string; label: string };

/** Where an existing voucher opens (the voucher detail page). */
export const voucherHref = (voucherId: number) => `/app/accounts/vouchers/${voucherId}`;
export const VOUCHER_PAGE_SIZE = 50;

interface Props {
  target: DrillTarget | null;
  /** Statement period (used for group and ledger levels). */
  from: string;
  to: string;
  /** Needed for the cash-flow month level. */
  fiscalYear?: number;
  onClose: () => void;
}

const th = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-muted";
const thR = `${th} text-right`;
const tdR = "px-3 py-2 text-right tabular-nums";

function monthBounds(month: string): { from: string; to: string } {
  const [y = 0, m = 1] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

function Status({ loading, error, empty }: { loading: boolean; error: string; empty?: boolean }) {
  if (loading) return <p className="p-4 text-sm text-text-muted" aria-busy="true">Loading…</p>;
  if (error) return <p role="alert" className="p-4 text-sm text-status-danger-foreground">{error}</p>;
  if (empty) return <p className="p-4 text-sm text-text-muted">Nothing to show for this period.</p>;
  return null;
}

/**
 * Side drawer for drill-down: group -> ledgers / sub-groups -> vouchers (paged).
 * A voucher row opens the normal voucher page. Cash Flow starts at a month and lists its ledgers.
 */
export function DrillPanel({ target, from, to, fiscalYear, onClose }: Props) {
  const [stack, setStack] = useState<DrillTarget[]>([]);

  useEffect(() => {
    setStack(target ? [target] : []);
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, onClose]);

  if (!target || stack.length === 0) return null;
  const current = stack[stack.length - 1]!;
  const push = (next: DrillTarget) => setStack((s) => [...s, next]);
  const title = current.kind === "cash-month" ? `Cash movement · ${current.label}` : current.name;

  return (
    <div className="statement-drill-panel no-print fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Drill-down: ${title}`}
        className="flex h-full w-full max-w-3xl flex-col bg-surface-raised shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          {stack.length > 1 ? (
            <button
              type="button"
              className="rounded-lg border border-border p-1.5 text-text-secondary hover:bg-surface-subtle"
              aria-label="Back one level"
              onClick={() => setStack((s) => s.slice(0, -1))}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide text-text-muted">
              {current.kind === "group" ? "Group" : current.kind === "ledger" ? "Ledger" : "Cash flow month"}
            </p>
            <h2 className="truncate text-base font-semibold text-text-primary">{title}</h2>
          </div>
          <button
            type="button"
            className="rounded-lg border border-border p-1.5 text-text-secondary hover:bg-surface-subtle"
            aria-label="Close drill-down"
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {current.kind === "group" ? (
            <GroupLevel key={`g${current.id}`} groupId={current.id} from={from} to={to} onOpen={push} />
          ) : current.kind === "ledger" ? (
            <LedgerLevel key={`l${current.id}`} accountId={current.id} from={current.from ?? from} to={current.to ?? to} />
          ) : (
            <CashLevel key={`c${current.month}`} month={current.month} fiscalYear={fiscalYear} onOpen={push} />
          )}
        </div>
      </aside>
    </div>
  );
}

function GroupLevel({ groupId, from, to, onOpen }: { groupId: number; from: string; to: string; onOpen: (t: DrillTarget) => void }) {
  const { data, loading, error } = useDrillGroup(groupId, from, to);
  const status = <Status loading={loading} error={error} empty={!!data && data.rows.length === 0} />;
  if (!data) return status;
  return (
    <>
      {status}
      <table className="min-w-full text-sm">
        <thead className="bg-surface-subtle">
          <tr>
            <th className={th}>Name</th>
            <th className={thR}>Opening</th>
            <th className={thR}>Debit</th>
            <th className={thR}>Credit</th>
            <th className={thR}>Closing</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={`${r.row_type}${r.id}`} className="border-t border-border-subtle">
              <td className="px-3 py-2">
                <button
                  type="button"
                  className="text-left text-brand-primary hover:underline"
                  onClick={() =>
                    onOpen(r.row_type === "group" ? { kind: "group", id: r.id, name: r.name } : { kind: "ledger", id: r.id, name: r.name })
                  }
                >
                  {r.name}
                </button>
                <span className="ml-2 text-xs text-text-muted">{r.row_type === "group" ? "group" : "ledger"}</span>
              </td>
              <td className={tdR}>{formatDrCr(r.opening)}</td>
              <td className={tdR}>{formatCell(r.debit)}</td>
              <td className={tdR}>{formatCell(r.credit)}</td>
              <td className={tdR}>{formatDrCr(r.closing)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border-strong bg-surface-subtle font-semibold">
            <td className="px-3 py-2">Total</td>
            <td className={tdR}>{formatDrCr(data.total.opening)}</td>
            <td className={tdR}>{formatCell(data.total.debit)}</td>
            <td className={tdR}>{formatCell(data.total.credit)}</td>
            <td className={tdR}>{formatDrCr(data.total.closing)}</td>
          </tr>
        </tfoot>
      </table>
    </>
  );
}

function LedgerLevel({ accountId, from, to }: { accountId: number; from: string; to: string }) {
  const [offset, setOffset] = useState(0);
  const { data, loading, error } = useDrillLedger(accountId, from, to, offset, VOUCHER_PAGE_SIZE);
  const status = <Status loading={loading} error={error} empty={!!data && data.rows.length === 0 && offset === 0} />;
  if (!data) return status;
  const first = data.total_vouchers === 0 ? 0 : data.offset + 1;
  const last = data.offset + data.rows.length;
  return (
    <>
      <dl className="grid grid-cols-2 gap-2 border-b border-border-subtle px-4 py-3 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-text-muted">Opening</dt><dd className="tabular-nums">{formatDrCr(data.opening)}</dd></div>
        <div><dt className="text-xs text-text-muted">Debit</dt><dd className="tabular-nums">{formatCell(data.period_debit) || "0.00"}</dd></div>
        <div><dt className="text-xs text-text-muted">Credit</dt><dd className="tabular-nums">{formatCell(data.period_credit) || "0.00"}</dd></div>
        <div><dt className="text-xs text-text-muted">Closing</dt><dd className="tabular-nums">{formatDrCr(data.closing)}</dd></div>
      </dl>
      {status}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-subtle">
            <tr>
              <th className={th}>Date</th>
              <th className={th}>Voucher</th>
              <th className={th}>Narration</th>
              <th className={thR}>Debit</th>
              <th className={thR}>Credit</th>
              <th className={thR}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((v) => (
              <tr key={v.voucher_id} className="border-t border-border-subtle">
                <td className="whitespace-nowrap px-3 py-2">{v.voucher_date}</td>
                <td className="px-3 py-2">
                  <Link className="text-brand-primary hover:underline" to={voucherHref(v.voucher_id)}>
                    {v.voucher_number}
                  </Link>
                  <span className="ml-2 text-xs text-text-muted">{v.voucher_type}</span>
                </td>
                <td className="max-w-[16rem] truncate px-3 py-2 text-text-secondary" title={v.description ?? undefined}>
                  {v.description ?? ""}
                </td>
                <td className={tdR}>{formatCell(v.debit)}</td>
                <td className={tdR}>{formatCell(v.credit)}</td>
                <td className={tdR}>{formatDrCr(v.running_balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border-subtle px-4 py-3 text-sm">
        <span className="text-text-muted">
          {first}–{last} of {data.total_vouchers}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-lg border border-border px-3 py-1.5 text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
            disabled={offset === 0 || loading}
            onClick={() => setOffset(Math.max(0, offset - VOUCHER_PAGE_SIZE))}
          >
            Previous
          </button>
          <button
            type="button"
            className="rounded-lg border border-border px-3 py-1.5 text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
            disabled={last >= data.total_vouchers || loading}
            onClick={() => setOffset(offset + VOUCHER_PAGE_SIZE)}
          >
            Next
          </button>
        </div>
      </div>
    </>
  );
}

function CashLevel({ month, fiscalYear, onOpen }: { month: string; fiscalYear?: number; onOpen: (t: DrillTarget) => void }) {
  const { data, loading, error } = useDrillCashFlow(month, fiscalYear);
  const status = <Status loading={loading} error={error} empty={!!data && data.ledgers.length === 0} />;
  if (!data) return status;
  const bounds = monthBounds(month);
  return (
    <>
      <dl className="grid grid-cols-2 gap-2 border-b border-border-subtle px-4 py-3 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-text-muted">Inflow</dt><dd className="tabular-nums">{formatCell(data.inflow) || "0.00"}</dd></div>
        <div><dt className="text-xs text-text-muted">Outflow</dt><dd className="tabular-nums">{formatCell(data.outflow) || "0.00"}</dd></div>
        <div><dt className="text-xs text-text-muted">Nett</dt><dd className="tabular-nums">{formatDrCr(data.nett_flow)}</dd></div>
        <div><dt className="text-xs text-text-muted">Contra (not counted)</dt><dd className="tabular-nums">{formatCell(data.contra_excluded) || "0.00"}</dd></div>
      </dl>
      {status}
      <table className="min-w-full text-sm">
        <thead className="bg-surface-subtle">
          <tr>
            <th className={th}>Cash / bank ledger</th>
            <th className={thR}>Debit (in)</th>
            <th className={thR}>Credit (out)</th>
          </tr>
        </thead>
        <tbody>
          {data.ledgers.map((l) => (
            <tr key={l.account_id} className="border-t border-border-subtle">
              <td className="px-3 py-2">
                <button
                  type="button"
                  className="text-left text-brand-primary hover:underline"
                  onClick={() => onOpen({ kind: "ledger", id: l.account_id, name: l.name, from: bounds.from, to: bounds.to })}
                >
                  {l.name}
                </button>
              </td>
              <td className={tdR}>{formatCell(l.debit)}</td>
              <td className={tdR}>{formatCell(l.credit)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border-strong bg-surface-subtle font-semibold">
            <td className="px-3 py-2">Total (before contra)</td>
            <td className={tdR}>{formatCell(data.total_debit)}</td>
            <td className={tdR}>{formatCell(data.total_credit)}</td>
          </tr>
        </tfoot>
      </table>
    </>
  );
}
