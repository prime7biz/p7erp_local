/** Finished goods received this period, valued per order (estimate - not posted). */
import { useState } from "react";
import { Link } from "react-router-dom";
import { mgmtPerformanceApi, type FgContributionResponse } from "@/api/mgmtPerformance";
import { LoadingBlock, NotesList, ReportError } from "@/components/finance/budget/BudgetPageParts";
import { useStatementResource } from "@/hooks/useFinanceStatements";
import { Chip, ClassChip, Empty, KpiCard, ReasonList, buttonClass, tableWrap, td, tdR, th, thR } from "./MpParts";
import { money, pct, qty, reasonText } from "./mgmtPerformanceLogic";

const PAGE = 100;

export function FinishedGoodsView({ period }: { period: string }) {
  const [offset, setOffset] = useState(0);
  const res = useStatementResource<FgContributionResponse>("mp.fg", `${period}|${offset}`, () =>
    mgmtPerformanceApi.getFgContribution(period, PAGE, offset),
  );
  const d = res.data;
  return (
    <div className="space-y-4">
      <ReportError error={res.error} status={res.errorStatus} onRetry={res.reload} />
      {res.loading && !d ? <LoadingBlock label="Loading finished goods" /> : null}
      {d ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard title="Value of finished goods" value={money(d.totals.value)} chip={<ClassChip kind="ESTIMATED" />} sub={`${qty(d.totals.counted_qty)} pcs`} />
            <KpiCard title="Direct cost" value={money(d.totals.direct_cost)} sub="Material + processing + commission" />
            <KpiCard title="Contribution" value={money(d.totals.contribution)} sub={`Margin ${pct(d.totals.contribution_pct)} · per piece ${money(d.totals.contribution_per_piece)}`} />
            <KpiCard
              title="Confirmed orders still to finish"
              value={money(d.pipeline.contribution)}
              sub={`${d.pipeline.orders} order(s) due this period · value ${money(d.pipeline.value)}`}
            />
          </div>
          <ReasonList codes={d.reason_codes} text={reasonText} />
          {d.items.length === 0 ? (
            <Empty>No finished goods were received into a finished-goods store in this period.</Empty>
          ) : (
            <div className={tableWrap}>
              <table className="min-w-full text-sm" aria-label="Finished goods contribution">
                <thead className="bg-surface-subtle">
                  <tr>
                    <th className={th}>Order</th>
                    <th className={thR}>Counted pcs</th>
                    <th className={thR}>Unit price</th>
                    <th className={thR}>Cost / pc</th>
                    <th className={thR}>Value</th>
                    <th className={thR}>Contribution</th>
                    <th className={thR}>Margin</th>
                    <th className={th}>Cost data</th>
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((o) => (
                    <tr key={o.order_id} className="border-t border-border-subtle" data-testid="fg-row">
                      <td className={td}>
                        <Link className="text-brand-primary hover:underline" to={`/app/orders/${o.order_id}`}>
                          {o.order_code ?? `#${o.order_id}`}
                        </Link>
                        {o.received_in_period !== o.counted_qty ? (
                          <span className="block text-[11px] text-text-muted">received {qty(o.received_in_period)}</span>
                        ) : null}
                      </td>
                      <td className={tdR}>{qty(o.counted_qty)}</td>
                      <td className={tdR}>{money(o.unit_price)}</td>
                      <td className={tdR}>{money(o.cost_per_piece)}</td>
                      <td className={tdR}>{money(o.value)}</td>
                      <td className={tdR}>{money(o.contribution)}</td>
                      <td className={tdR}>{pct(o.contribution_pct)}</td>
                      <td className={td}>
                        <Chip status={o.cost_status} label={`${o.cost_status.toLowerCase()} · ${o.confidence.toLowerCase()}`} />
                        {o.reason_codes.length ? (
                          <span className="mt-0.5 block text-[11px] text-text-muted">{o.reason_codes.map(reasonText).join(" ")}</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {d.orders_total > PAGE ? (
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <button type="button" className={buttonClass} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
                Previous
              </button>
              <span>
                {offset + 1}-{Math.min(offset + PAGE, d.orders_total)} of {d.orders_total}
              </span>
              <button type="button" className={buttonClass} disabled={offset + PAGE >= d.orders_total} onClick={() => setOffset(offset + PAGE)}>
                Next
              </button>
            </div>
          ) : null}
          <NotesList notes={d.notes} />
        </>
      ) : null}
    </div>
  );
}
