/** Weekly cash: collections, payments and the first week the balance goes below zero (separate from profit). */
import { useState } from "react";
import { mgmtPerformanceApi, type CashResponse } from "@/api/mgmtPerformance";
import { LoadingBlock, NotesList, ReportError } from "@/components/finance/budget/BudgetPageParts";
import { useStatementResource } from "@/hooks/useFinanceStatements";
import { ClassChip, KpiCard, fieldClass, tableWrap, td, tdR, th, thR } from "./MpParts";
import { isNegative, money } from "./mgmtPerformanceLogic";

export function CashView() {
  const [horizon, setHorizon] = useState(90);
  const res = useStatementResource<CashResponse>("mp.cash", String(horizon), () => mgmtPerformanceApi.getCash(horizon));
  const c = res.data;
  return (
    <div className="space-y-4">
      <label className="text-xs font-medium text-text-muted">
        Look ahead
        <select className={`${fieldClass} ml-2`} value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
          <option value={180}>180 days</option>
        </select>
      </label>
      <ReportError error={res.error} status={res.errorStatus} onRetry={res.reload} />
      {res.loading && !c ? <LoadingBlock label="Loading cash forecast" /> : null}
      {c ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard title="Cash today (net of overdraft)" value={money(c.opening.including_overdraft)} chip={<ClassChip kind="ACTUAL" />} />
            <KpiCard title="Expected collections" value={money(c.totals.inflow)} chip={<ClassChip kind="FORECAST" />} />
            <KpiCard title="Expected payments" value={money(c.totals.outflow)} chip={<ClassChip kind="FORECAST" />} />
            <KpiCard
              title="Funding gap"
              value={c.financing_gap ? money(c.financing_gap.shortfall) : "None"}
              tone={c.financing_gap ? "danger" : "ok"}
              sub={c.financing_gap ? `From the week of ${c.financing_gap.week_start}` : `Up to ${c.date_to}`}
            />
          </div>
          <div className={tableWrap}>
            <table className="min-w-full text-sm" aria-label="Weekly cash">
              <thead className="bg-surface-subtle">
                <tr>
                  <th className={th}>Week</th>
                  <th className={thR}>Collections</th>
                  <th className={thR}>Payments</th>
                  <th className={thR}>Net</th>
                  <th className={thR}>Closing cash</th>
                </tr>
              </thead>
              <tbody>
                {c.weeks.map((w) => (
                  <tr key={w.week_index} className={`border-t border-border-subtle ${w.below_zero ? "bg-status-danger-subtle" : ""}`}>
                    <td className={td}>
                      {w.week_start} – {w.week_end}
                    </td>
                    <td className={tdR}>{money(w.inflow)}</td>
                    <td className={tdR}>{money(w.outflow)}</td>
                    <td className={`${tdR} ${isNegative(w.net) ? "text-status-danger-foreground" : ""}`}>{money(w.net)}</td>
                    <td className={`${tdR} font-medium`}>{money(w.closing)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <NotesList notes={c.notes} />
        </>
      ) : null}
    </div>
  );
}
