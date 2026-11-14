/** Break-even, production, marketing and profit targets with the working shown line by line. */
import { mgmtPerformanceApi, type TargetsResponse } from "@/api/mgmtPerformance";
import { LoadingBlock, ReportError } from "@/components/finance/budget/BudgetPageParts";
import { useStatementResource } from "@/hooks/useFinanceStatements";
import { Chip, KpiCard, ReasonList } from "./MpParts";
import { GAP_TEXT, money, pct, qty, reasonText } from "./mgmtPerformanceLogic";

export function TargetsView({ period }: { period: string }) {
  const res = useStatementResource<TargetsResponse>("mp.targets", period, () => mgmtPerformanceApi.getTargets(period));
  const t = res.data;
  return (
    <div className="space-y-4">
      <ReportError error={res.error} status={res.errorStatus} onRetry={res.reload} />
      {res.loading && !t ? <LoadingBlock label="Loading targets" /> : null}
      {t ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Chip status={t.gap_status} label={GAP_TEXT[t.gap_status]} />
            <span className="text-xs text-text-muted">
              Contribution margin used: {pct(t.expected_contribution_pct)} (
              {t.expected_contribution_pct_source === "FINISHED_GOODS_THIS_PERIOD"
                ? "finished goods this period"
                : t.expected_contribution_pct_source === "CONFIRMED_ORDER_BOOK"
                  ? "confirmed order book"
                  : "unknown"}
              )
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard title="Break-even sales value" value={money(t.break_even_value)} sub="Covers operating cost and landed / export cost" />
            <KpiCard title="Sales value for profit target" value={money(t.profit_target_value)} sub="Adds contingency and the profit target" />
            <KpiCard title="Production value still needed" value={money(t.remaining_production_value)} />
            <KpiCard title="Pieces still needed" value={qty(t.remaining_production_pieces)} sub={`At ${money(t.contribution_per_piece)} contribution per piece`} />
            <KpiCard title="New confirmed orders needed" value={money(t.marketing_gap_value)} sub="Marketing target after orders already due" />
          </div>
          <div className="rounded-xl border border-border bg-surface-raised p-4">
            <p className="text-sm font-semibold text-text-primary">How the target is worked out</p>
            <table className="mt-2 w-full max-w-xl text-sm" aria-label="Target working">
              <tbody>
                {[
                  ["Operating expenses (forecast)", t.opex_forecast],
                  ["+ Contingency reserve", t.contingency],
                  ["+ Profit target", t.target_profit],
                  ["+ Landed / export cost posted (not in orders)", t.unallocated_landed_selling],
                  ["− Contribution from finished goods so far", t.fg_contribution],
                ].map(([label, value]) => (
                  <tr key={label} className="border-t border-border-subtle">
                    <td className="py-1.5 pr-4 text-text-secondary">{label}</td>
                    <td className="py-1.5 text-right tabular-nums">{money(value)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border-strong font-semibold">
                  <td className="py-1.5 pr-4">= Contribution still needed</td>
                  <td className="py-1.5 text-right tabular-nums">{money(t.required_contribution)}</td>
                </tr>
                <tr className="border-t border-border-subtle text-text-muted">
                  <td className="py-1.5 pr-4">Confirmed orders due this period would add</td>
                  <td className="py-1.5 text-right tabular-nums">{money(t.pipeline_contribution)}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-xs text-text-muted">
              Value needed = contribution needed ÷ contribution margin. Months with a target set: {t.targets_set_months.join(", ") || "none"}.
            </p>
          </div>
          <ReasonList codes={t.reason_codes} text={reasonText} />
        </>
      ) : null}
    </div>
  );
}
