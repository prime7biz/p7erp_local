/** Overview: official posted profit beside the estimates (never added together), budget status counts, targets, cash gap. */
import { mgmtPerformanceApi, type CashResponse, type SummaryResponse } from "@/api/mgmtPerformance";
import { LoadingBlock, NotesList, ReportError } from "@/components/finance/budget/BudgetPageParts";
import { useStatementResource } from "@/hooks/useFinanceStatements";
import { ClassChip, KpiCard, ReasonList } from "./MpParts";
import { GAP_TEXT, isNegative, money, pct, qty, reasonText, STATUS_TEXT } from "./mgmtPerformanceLogic";

export function OverviewView({ period }: { period: string }) {
  const summary = useStatementResource<SummaryResponse>("mp.summary", period, () => mgmtPerformanceApi.getSummary(period));
  const cash = useStatementResource<CashResponse>("mp.cash.overview", "90", () => mgmtPerformanceApi.getCash(90));
  const s = summary.data;
  return (
    <div className="space-y-4">
      <ReportError error={summary.error} status={summary.errorStatus} onRetry={summary.reload} />
      {summary.loading && !s ? <LoadingBlock label="Loading management performance" /> : null}
      {s ? (
        <>
          <p className="text-xs text-text-muted">
            {s.period.label} ({s.period.start} to {s.period.end}) · amounts in {s.base_currency}
            {summary.loading ? " · refreshing…" : ""}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <KpiCard
              title="Accounting profit"
              value={money(s.accounting_profit.nett_result)}
              tone={isNegative(s.accounting_profit.nett_result) ? "danger" : undefined}
              chip={<ClassChip kind="ACTUAL" />}
              sub="Posted vouchers only - same as Finance → Profit & Loss."
            />
            <KpiCard
              title="Finished-goods contribution"
              value={money(s.fg_contribution.net_contribution)}
              chip={<ClassChip kind="ESTIMATED" />}
              sub={
                <>
                  {qty(s.fg_contribution.counted_qty)} pcs worth {money(s.fg_contribution.value)} · margin{" "}
                  {pct(s.fg_contribution.contribution_pct)} · after {money(s.fg_contribution.unallocated_landed_selling)} landed /
                  export cost
                </>
              }
            />
            <KpiCard
              title="Forecast month-end result"
              value={money(s.forecast_result.so_far)}
              tone={isNegative(s.forecast_result.so_far) ? "danger" : "ok"}
              chip={<ClassChip kind="FORECAST" />}
              sub={<>With confirmed orders due this period: {money(s.forecast_result.with_pipeline)}</>}
            />
            <KpiCard
              title="Operating expenses"
              value={money(s.opex.forecast)}
              chip={<ClassChip kind="FORECAST" />}
              sub={
                <>
                  Budget {money(s.opex.budget)} · posted so far {money(s.opex.actual)} · committed {money(s.opex.committed)}
                </>
              }
            />
            <KpiCard
              title="Budget problems"
              value={String((s.budget_status_counts.FAILED ?? 0) + (s.budget_status_counts.AT_RISK ?? 0))}
              tone={(s.budget_status_counts.FAILED ?? 0) > 0 ? "danger" : undefined}
              sub={(["FAILED", "AT_RISK", "WARNING", "UNBUDGETED", "UNMAPPED"] as const)
                .filter((k) => s.budget_status_counts[k])
                .map((k) => `${STATUS_TEXT[k]}: ${s.budget_status_counts[k]}`)
                .join(" · ") || "No budget problems"}
            />
            <KpiCard
              title="Cash gap"
              value={cash.data?.financing_gap ? money(cash.data.financing_gap.shortfall) : cash.data ? "None in 90 days" : "…"}
              tone={cash.data?.financing_gap ? "danger" : cash.data ? "ok" : undefined}
              chip={<ClassChip kind="FORECAST" />}
              sub={cash.data?.financing_gap ? `First short week starts ${cash.data.financing_gap.week_start}` : cash.error || "Weekly collections vs payments."}
            />
          </div>
          <div className="rounded-xl border border-border bg-surface-raised p-4 text-sm">
            <p className="font-semibold text-text-primary">Targets for this period</p>
            <p className="mt-1 text-text-secondary">{GAP_TEXT[s.targets.gap_status]}</p>
            <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-xs text-text-muted">Break-even sales value</dt>
                <dd className="font-semibold tabular-nums">{money(s.targets.break_even_value)}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Production value still needed</dt>
                <dd className="font-semibold tabular-nums">{money(s.targets.remaining_production_value)}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Pieces still needed</dt>
                <dd className="font-semibold tabular-nums">{qty(s.targets.remaining_production_pieces)}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">New confirmed orders needed</dt>
                <dd className="font-semibold tabular-nums">{money(s.targets.marketing_gap_value)}</dd>
              </div>
            </dl>
          </div>
          <ReasonList codes={s.reason_codes} text={reasonText} />
          <NotesList notes={s.notes} />
        </>
      ) : null}
    </div>
  );
}
