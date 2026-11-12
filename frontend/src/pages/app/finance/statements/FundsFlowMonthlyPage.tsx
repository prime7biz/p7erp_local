import { useState } from "react";
import { formatIndian } from "@/components/finance/statements/statementFormat";
import { initialPeriod } from "@/components/finance/statements/statementPeriod";
import { StatementPageFrame } from "@/components/finance/statements/StatementPageFrame";
import { StatementPeriodPicker, useFiscalStartMonth } from "@/components/finance/statements/StatementPeriodPicker";
import { useFundsFlowStatement, useStatementsEnabled } from "@/hooks/useFinanceStatements";
import { todayLocalISO } from "@/lib/dates";

const th = "px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-text-muted";
const td = "px-3 py-1.5 text-right tabular-nums";

/** Monthly Funds Flow: working capital Opening | Closing | Flow for each month. */
export function FundsFlowMonthlyPage() {
  const enabled = useStatementsEnabled();
  const startMonth = useFiscalStartMonth();
  const [period, setPeriod] = useState(() => initialPeriod(startMonth, todayLocalISO()));
  const fiscalYear = period.fiscalYear ?? undefined;
  const resource = useFundsFlowStatement(fiscalYear, enabled);

  return (
    <StatementPageFrame
      title="Funds Flow (monthly)"
      description="Change in working capital (current assets minus current liabilities) month by month."
      resource={resource}
      exportInfo={{
        report: "funds-flow-monthly",
        query: { fiscal_year: fiscalYear },
        fileBase: `funds-flow-${resource.data?.period.fiscal_year ?? "report"}`,
      }}
      controls={<StatementPeriodPicker mode="year" value={period} onChange={setPeriod} />}
    >
      {(data) => (
        <>
          <div className="statement-sheet print-card overflow-x-auto rounded-xl border border-border bg-surface-raised">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle">
                <tr>
                  <th className={`${th} text-left`}>Month</th>
                  <th className={th}>Opening working capital</th>
                  <th className={th}>Closing working capital</th>
                  <th className={th}>Funds flow</th>
                </tr>
              </thead>
              <tbody>
                {data.months.map((m) => (
                  <tr key={m.month} className="border-t border-border-subtle">
                    <td className="px-3 py-1.5">{m.label}</td>
                    <td className={td}>{formatIndian(m.working_capital_opening)}</td>
                    <td className={td}>{formatIndian(m.working_capital_closing)}</td>
                    <td className={td}>{formatIndian(m.funds_flow)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border-strong bg-surface-subtle font-semibold" data-testid="funds-grand-total">
                  <td className="px-3 py-2">Year</td>
                  <td className={td}>{formatIndian(data.grand_total.working_capital_opening)}</td>
                  <td className={td}>{formatIndian(data.grand_total.working_capital_closing)}</td>
                  <td className={td}>{formatIndian(data.grand_total.funds_flow)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-text-muted">
            A positive flow means working capital grew in that month. Last month: current assets{" "}
            {formatIndian(data.months[data.months.length - 1]?.current_assets_closing ?? "0")}, current liabilities{" "}
            {formatIndian(data.months[data.months.length - 1]?.current_liabilities_closing ?? "0")}.
          </p>
        </>
      )}
    </StatementPageFrame>
  );
}
