import { useState } from "react";
import { DrillPanel, type DrillTarget } from "@/components/finance/statements/DrillPanel";
import { formatCell, formatDrCr, formatIndian } from "@/components/finance/statements/statementFormat";
import { initialPeriod } from "@/components/finance/statements/statementPeriod";
import { StatementPageFrame } from "@/components/finance/statements/StatementPageFrame";
import { StatementPeriodPicker, useFiscalStartMonth } from "@/components/finance/statements/StatementPeriodPicker";
import { useCashFlowStatement, useStatementsEnabled } from "@/hooks/useFinanceStatements";
import { todayLocalISO } from "@/lib/dates";

const th = "px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-text-muted";
const td = "px-3 py-1.5 text-right tabular-nums";

/** Monthly Cash Flow: 12 months of Inflow | Outflow | Nett, click a month to see the cash / bank ledgers. */
export function CashFlowMonthlyPage() {
  const enabled = useStatementsEnabled();
  const startMonth = useFiscalStartMonth();
  const [period, setPeriod] = useState(() => initialPeriod(startMonth, todayLocalISO()));
  const [drill, setDrill] = useState<DrillTarget | null>(null);
  const fiscalYear = period.fiscalYear ?? undefined;

  const resource = useCashFlowStatement(fiscalYear, enabled);

  return (
    <>
      <StatementPageFrame
        title="Cash Flow (monthly)"
        description="Cash and bank money in and out, month by month, for a financial year. Click a month to see the cash and bank ledgers behind it."
        resource={resource}
        exportInfo={{
          report: "cash-flow-monthly",
          query: { fiscal_year: fiscalYear },
          fileBase: `cash-flow-${resource.data?.period.fiscal_year ?? "report"}`,
        }}
        aiReport={{ report: "cash_flow_monthly", period: { fiscal_year: fiscalYear } }}
        controls={<StatementPeriodPicker mode="year" value={period} onChange={setPeriod} />}
      >
        {(data) => (
          <>
            <div className="statement-sheet print-card overflow-x-auto rounded-xl border border-border bg-surface-raised">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-subtle">
                  <tr>
                    <th className={`${th} text-left`}>Month</th>
                    <th className={th}>Opening cash</th>
                    <th className={th}>Inflow</th>
                    <th className={th}>Outflow</th>
                    <th className={th}>Nett flow</th>
                    <th className={th}>Closing cash</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border-subtle italic text-text-secondary">
                    <td className="px-3 py-1.5">Opening balance of the year</td>
                    <td className={td}>{formatDrCr(data.opening_cash)}</td>
                    <td colSpan={4} />
                  </tr>
                  {data.months.map((m) => (
                    <tr key={m.month} className="border-t border-border-subtle">
                      <td className="px-3 py-1.5">
                        <button
                          type="button"
                          className="text-left text-brand-primary hover:underline print:text-inherit"
                          onClick={() => setDrill({ kind: "cash-month", month: m.month, label: m.label })}
                        >
                          {m.label}
                        </button>
                      </td>
                      <td className={td}>{formatDrCr(m.opening_cash)}</td>
                      <td className={td}>{formatCell(m.inflow)}</td>
                      <td className={td}>{formatCell(m.outflow)}</td>
                      <td className={td}>{formatIndian(m.nett_flow)}</td>
                      <td className={td}>{formatDrCr(m.closing_cash)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border-strong bg-surface-subtle font-semibold" data-testid="cash-grand-total">
                    <td className="px-3 py-2">Total for the year</td>
                    <td />
                    <td className={td}>{formatIndian(data.grand_total.inflow)}</td>
                    <td className={td}>{formatIndian(data.grand_total.outflow)}</td>
                    <td className={td}>{formatIndian(data.grand_total.nett_flow)}</td>
                    <td className={td}>{formatDrCr(data.grand_total.closing_cash)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <section className="print-avoid-break grid gap-3 rounded-xl border border-border bg-surface-raised p-4 text-sm sm:grid-cols-2 lg:grid-cols-4" aria-label="Cash pool at year end">
              <div>
                <p className="text-xs text-text-muted">Cash in hand</p>
                <p className="tabular-nums">{formatDrCr(data.closing_pool.cash_in_hand)}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Bank accounts</p>
                <p className="tabular-nums">{formatDrCr(data.closing_pool.bank_accounts)}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Bank overdraft</p>
                <p className="tabular-nums">{formatDrCr(data.closing_pool.bank_od)}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Cash without overdraft</p>
                <p className="tabular-nums" data-testid="cash-without-od">{formatDrCr(data.closing_pool.cash_without_od)}</p>
              </div>
              <p className="text-xs text-text-muted sm:col-span-2 lg:col-span-4" data-testid="contra-note">
                Transfers between two cash or bank ledgers in one voucher (contra) are <b>not counted</b> as inflow or outflow:{" "}
                <span className="tabular-nums">{formatIndian(data.contra_excluded)}</span> left out. Cash pool = cash in hand + bank
                accounts + bank overdraft.
              </p>
            </section>
          </>
        )}
      </StatementPageFrame>
      <DrillPanel target={drill} from="" to="" fiscalYear={fiscalYear} onClose={() => setDrill(null)} />
    </>
  );
}
