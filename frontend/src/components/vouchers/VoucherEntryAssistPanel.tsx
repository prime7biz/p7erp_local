import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarDays, Info, Lightbulb, Sparkles, XCircle } from "lucide-react";
import type { VoucherEntryAssistResponse } from "@/api/client";
import { formatDrCr, formatMoney, formatShortDate } from "@/components/vouchers/voucherAssistFormat";

type Props = {
  data: VoucherEntryAssistResponse | null;
  loading: boolean;
  error: string | null;
  /** Add (or fill an empty line with) a suggested ledger on the given side. */
  onAddAccount: (accountId: number, side: "DEBIT" | "CREDIT") => void;
  onUseNarration: (text: string) => void;
};

const WARNING_STYLE = {
  danger: "border-status-danger/30 bg-status-danger-subtle text-status-danger-foreground",
  warning: "border-status-warning/30 bg-status-warning-subtle text-status-warning-foreground",
  info: "border-status-info/30 bg-status-info-subtle text-status-info-foreground",
} as const;

const WARNING_ICON = { danger: XCircle, warning: AlertTriangle, info: Info } as const;

function SectionTitle({ children }: { children: ReactNode }) {
  return <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">{children}</h4>;
}

/** Read-only hints beside the voucher form, built from the company's own posted vouchers. */
export function VoucherEntryAssistPanel({ data, loading, error, onAddAccount, onUseNarration }: Props) {
  const fy = data?.fiscal_year;
  const isCurrentFy = fy && data ? fy.fiscal_year === data.current_fiscal_year.fiscal_year : true;

  return (
    <aside className="space-y-4 rounded-xl border border-brand-primary/20 bg-surface-raised p-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
            <Sparkles className="h-4 w-4 text-brand-primary" aria-hidden />
            Entry assistant
          </h3>
          <p className="mt-0.5 text-[11px] text-text-muted">Live hints from your posted vouchers (last 12 months).</p>
        </div>
        {loading ? <span className="text-[11px] text-text-muted">Updating…</span> : null}
      </div>

      {error && !data ? (
        <p className="rounded-lg border border-border bg-surface-subtle px-3 py-2 text-xs text-text-muted">
          Assistant is unavailable right now. You can keep entering the voucher as usual.
        </p>
      ) : null}

      {fy ? (
        <div className="rounded-lg border border-border bg-surface-subtle px-3 py-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
            <CalendarDays className="h-3.5 w-3.5 text-text-muted" aria-hidden />
            Financial year {fy.label}
            <span
              className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium ${
                isCurrentFy ? "bg-status-success-subtle text-status-success-foreground" : "bg-status-warning-subtle text-status-warning-foreground"
              }`}
            >
              {isCurrentFy ? "Current" : "Not current"}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-text-muted">
            {formatShortDate(fy.start_date)} – {formatShortDate(fy.end_date)}
          </p>
        </div>
      ) : null}

      {data && data.warnings.length > 0 ? (
        <div className="space-y-1.5">
          <SectionTitle>Check before saving</SectionTitle>
          {data.warnings.map((w, i) => {
            const Icon = WARNING_ICON[w.level] ?? Info;
            return (
              <div key={i} className={`flex gap-2 rounded-lg border px-2.5 py-2 text-xs ${WARNING_STYLE[w.level] ?? WARNING_STYLE.info}`}>
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{w.message}</span>
              </div>
            );
          })}
          {data.similar_posted_vouchers.map((v) => (
            <Link
              key={v.id}
              to={`/app/accounts/vouchers/${v.id}`}
              target="_blank"
              className="block text-xs font-medium text-brand-primary hover:underline"
            >
              Open {v.voucher_number} in a new tab
            </Link>
          ))}
        </div>
      ) : null}

      {data && data.accounts.length > 0 ? (
        <div>
          <SectionTitle>Ledgers in this voucher</SectionTitle>
          <ul className="space-y-2">
            {data.accounts.map((a) => {
              const flipped = Number(a.projected_balance) < 0;
              return (
                <li key={a.account_id} className="rounded-lg border border-border px-3 py-2">
                  <p className="text-xs font-semibold text-text-primary">
                    {a.account_number} · {a.name}
                  </p>
                  <p className="text-[11px] text-text-muted">
                    {a.group_name} · {a.nature}
                    {a.enable_bill_wise ? " · Bill-wise" : ""}
                  </p>
                  <dl className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]">
                    <dt className="text-text-muted">Balance now</dt>
                    <dd className="text-right tabular-nums text-text-secondary">{formatDrCr(a.balance, a.normal_balance)}</dd>
                    <dt className="text-text-muted">After this voucher</dt>
                    <dd
                      className={`text-right font-medium tabular-nums ${
                        flipped && a.is_cash_or_bank ? "text-status-danger-foreground" : "text-text-primary"
                      }`}
                    >
                      {formatDrCr(a.projected_balance, a.normal_balance)}
                    </dd>
                    {a.average_amount ? (
                      <>
                        <dt className="text-text-muted">Usual amount</dt>
                        <dd className={`text-right tabular-nums ${a.unusual_amount ? "font-semibold text-status-warning-foreground" : "text-text-secondary"}`}>
                          {formatMoney(a.average_amount)}
                        </dd>
                      </>
                    ) : null}
                    <dt className="text-text-muted">Used (12 months)</dt>
                    <dd className="text-right text-text-secondary">
                      {a.times_used_last_year}×{a.last_used_date ? `, last ${formatShortDate(a.last_used_date)}` : ""}
                    </dd>
                  </dl>
                </li>
              );
            })}
          </ul>
        </div>
      ) : data ? (
        <p className="text-xs text-text-muted">Pick a ledger to see its balance, usual amount and what usually goes with it.</p>
      ) : null}

      {data && data.suggested_accounts.length > 0 ? (
        <div>
          <SectionTitle>{data.accounts.length > 0 ? "Usually used together" : "Common ledgers for this voucher type"}</SectionTitle>
          <div className="space-y-1">
            {data.suggested_accounts.map((s) => (
              <button
                key={`${s.account_id}-${s.side}`}
                type="button"
                className="flex w-full items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-left text-xs hover:border-brand-primary/40 hover:bg-brand-primary/5"
                onClick={() => onAddAccount(s.account_id, s.side)}
                title="Add this ledger to the voucher"
              >
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                    s.side === "DEBIT" ? "bg-status-info-subtle text-status-info-foreground" : "bg-status-success-subtle text-status-success-foreground"
                  }`}
                >
                  {s.side === "DEBIT" ? "Dr" : "Cr"}
                </span>
                <span className="min-w-0 flex-1 truncate text-text-secondary">
                  {s.account_number} · {s.name}
                </span>
                <span className="shrink-0 text-[10px] text-text-muted">{s.times_used}×</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {data && data.recent_narrations.length > 0 ? (
        <div>
          <SectionTitle>Narrations used before</SectionTitle>
          <div className="space-y-1">
            {data.recent_narrations.map((n) => (
              <button
                key={n}
                type="button"
                className="flex w-full gap-2 rounded-lg border border-border px-2.5 py-1.5 text-left text-xs text-text-secondary hover:border-brand-primary/40 hover:bg-brand-primary/5"
                onClick={() => onUseNarration(n)}
                title="Use this narration"
              >
                <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden />
                <span className="line-clamp-2">{n}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
