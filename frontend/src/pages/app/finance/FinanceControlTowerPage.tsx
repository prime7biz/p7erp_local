import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import type { ControlCard, SeverityFilter } from "@/api/financeControl";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { FinanceAiCommentaryPanel } from "@/components/finance/ai/FinanceAiCommentaryPanel";
import { listPageRootClass } from "@/components/app/listPageLayout";
import { amountText, SEVERITY_CHIP, SEVERITY_LABEL } from "@/components/finance/control/controlLogic";
import { ExceptionPanel } from "@/components/finance/control/ExceptionPanel";
import { StatementPeriodPicker } from "@/components/finance/statements/StatementPeriodPicker";
import { useControlTower, useControlTowerEnabled } from "@/hooks/useFinanceControl";
import { todayLocalISO } from "@/lib/dates";

const SEVERITY_OPTIONS: { value: SeverityFilter; label: string }[] = [
  { value: "all", label: "All severities" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const fieldClass =
  "rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring";

/**
 * Finance Control Tower (tenant flag `finance_control_tower_v2`): one card per exception check
 * (GRN not billed, overdue bills, negative cash ...). A card opens the list behind it.
 * Read-only: nothing here changes a voucher or a stock record.
 */
export function FinanceControlTowerPage() {
  const enabled = useControlTowerEnabled();
  const [params, setParams] = useSearchParams();
  const [asOf, setAsOf] = useState(() => todayLocalISO());
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const { data, loading, error, errorStatus, reload } = useControlTower(asOf, severity, enabled);

  // A link such as ?tab=control-tower&exception=GRN_NOT_BILLED opens that card's list.
  const requestedCode = params.get("exception");
  const openCard: ControlCard | null = useMemo(
    () => (requestedCode ? (data?.cards.find((c) => c.code === requestedCode) ?? null) : null),
    [data, requestedCode],
  );

  const open = (card: ControlCard) => {
    const next = new URLSearchParams(params);
    next.set("exception", card.code);
    setParams(next, { replace: true });
  };
  const close = useCallback(() => {
    const next = new URLSearchParams(params);
    next.delete("exception");
    setParams(next, { replace: true });
  }, [params, setParams]);

  const currency = data?.base_currency ?? "";

  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Finance Control Tower"
        description="Things that need attention in the books. Each card counts records that break a finance check; click a card to see them. Nothing here changes any record."
      />

      {!enabled ? (
        <div role="status" className="rounded-xl border border-border bg-surface-raised p-6 text-sm text-text-secondary">
          <p className="font-semibold text-text-primary">The Finance Control Tower is switched off</p>
          <p className="mt-1">
            An admin can switch on <b>Finance Control Tower and GL profitability</b> in Settings → Configuration → More features → Finance
            navigation.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <StatementPeriodPicker mode="as-of" value={asOf} onChange={setAsOf} />
            <label className="text-xs font-medium text-text-muted">
              Severity
              <select
                aria-label="Severity"
                className={`${fieldClass} mt-1 block`}
                value={severity}
                onChange={(e) => setSeverity(e.target.value as SeverityFilter)}
              >
                {SEVERITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
              onClick={reload}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
              Refresh
            </button>
          </div>

          <FinanceAiCommentaryPanel report="control_tower" period={{ to_date: asOf }} />

          {error ? (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
              <span>
                {errorStatus === 403
                  ? "You do not have permission to view the Control Tower."
                  : errorStatus === 404
                    ? "The Control Tower is not switched on for your company."
                    : error}
              </span>
              {errorStatus !== 403 && errorStatus !== 404 ? (
                <button type="button" className="rounded border border-current px-2 py-0.5 text-xs" onClick={reload}>
                  Retry
                </button>
              ) : null}
            </div>
          ) : null}

          {loading && !data ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading Control Tower">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-xl bg-surface-subtle" />
              ))}
            </div>
          ) : null}

          {data ? (
            <>
              <p className="text-xs text-text-muted">
                As of {data.as_of_date} · amounts in {data.base_currency} · data as of {new Date(data.data_as_of).toLocaleString()}
                {loading ? " · refreshing…" : ""}
              </p>
              {data.cards.length === 0 ? (
                <p className="rounded-xl border border-border bg-surface-raised p-6 text-sm text-text-muted">
                  No checks for this severity.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Control cards">
                  {data.cards.map((card) => (
                    <ControlCardButton key={card.code} card={card} currency={data.base_currency} onOpen={() => open(card)} />
                  ))}
                </div>
              )}
            </>
          ) : null}
        </>
      )}

      <ExceptionPanel card={openCard} asOf={data?.as_of_date ?? asOf} currency={currency} onClose={close} />
    </div>
  );
}

function ControlCardButton({ card, currency, onOpen }: { card: ControlCard; currency: string; onOpen: () => void }) {
  const clear = card.count === 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={`card-${card.code}`}
      data-muted={clear ? "true" : "false"}
      className={`flex min-h-[7rem] flex-col rounded-xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-focus-ring ${
        clear
          ? "border-border-subtle bg-surface-subtle text-text-muted opacity-70 hover:opacity-100"
          : "border-border bg-surface-raised text-text-primary shadow-sm hover:border-brand-primary"
      }`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold">{card.label}</span>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${SEVERITY_CHIP[card.severity]}`}>
          {SEVERITY_LABEL[card.severity]}
        </span>
      </span>
      <span className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums" data-testid={`count-${card.code}`}>{card.count}</span>
        <span className="text-xs">item(s)</span>
      </span>
      <span className="mt-1 text-sm tabular-nums" data-testid={`amount-${card.code}`}>
        {currency} {amountText(card.amount)}
      </span>
      <span className="mt-auto pt-2 text-xs text-text-muted">
        {card.oldest_date ? `Oldest ${card.oldest_date}` : clear ? "All clear" : "No date"}
      </span>
    </button>
  );
}
