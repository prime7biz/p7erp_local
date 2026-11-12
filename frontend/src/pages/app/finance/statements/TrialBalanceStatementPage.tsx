import { useState } from "react";
import type { TrialBalanceRow } from "@/api/financeStatements";
import { DrillPanel, type DrillTarget } from "@/components/finance/statements/DrillPanel";
import { formatCell } from "@/components/finance/statements/statementFormat";
import { initialPeriod, rangeQuery } from "@/components/finance/statements/statementPeriod";
import { StatementPageFrame } from "@/components/finance/statements/StatementPageFrame";
import { StatementPeriodPicker, useFiscalStartMonth } from "@/components/finance/statements/StatementPeriodPicker";
import { todayLocalISO } from "@/lib/dates";
import { useStatementsEnabled, useTrialBalanceStatement } from "@/hooks/useFinanceStatements";

const th = "px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-muted";

function drillTargetOf(row: TrialBalanceRow): DrillTarget | null {
  if (row.id == null) return null;
  if (row.row_type === "group") return { kind: "group", id: row.id, name: row.name };
  if (row.row_type === "ledger") return { kind: "ledger", id: row.id, name: row.name };
  return null;
}

/** Grouped Trial Balance: Opening | Debit | Credit | Closing, primary groups → groups → ledgers. */
export function TrialBalanceStatementPage() {
  const enabled = useStatementsEnabled();
  const startMonth = useFiscalStartMonth();
  const [period, setPeriod] = useState(() => initialPeriod(startMonth, todayLocalISO()));
  const [includeZero, setIncludeZero] = useState(false);
  const [drill, setDrill] = useState<DrillTarget | null>(null);

  const query = { ...rangeQuery(period), include_zero: includeZero || undefined };
  const resource = useTrialBalanceStatement(query, enabled);

  return (
    <>
      <StatementPageFrame
        title="Trial Balance"
        description="Opening, period and closing balances by group and ledger. Click a group or ledger to see what is inside."
        resource={resource}
        exportInfo={{ report: "trial-balance", query, fileBase: `trial-balance-${resource.data?.period.fiscal_year ?? "report"}` }}
        controls={
          <div className="flex flex-wrap items-end gap-3">
            <StatementPeriodPicker mode="range" value={period} onChange={setPeriod} />
            <label className="no-print flex items-center gap-2 pb-2 text-sm text-text-secondary">
              <input type="checkbox" checked={includeZero} onChange={(e) => setIncludeZero(e.target.checked)} />
              Show zero balances
            </label>
          </div>
        }
      >
        {(data) => (
          <div className="statement-sheet print-card overflow-x-auto rounded-xl border border-border bg-surface-raised">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle">
                <tr>
                  <th rowSpan={2} className={`${th} text-left`}>Particulars</th>
                  <th colSpan={2} className={`${th} text-center`}>Opening</th>
                  <th colSpan={2} className={`${th} text-center`}>Period</th>
                  <th colSpan={2} className={`${th} text-center`}>Closing</th>
                </tr>
                <tr>
                  {["Dr", "Cr", "Debit", "Credit", "Dr", "Cr"].map((h, i) => (
                    <th key={i} className={`${th} text-right`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-text-muted">
                      No balances in this period.
                    </td>
                  </tr>
                ) : (
                  data.rows.map((r, i) => {
                    const target = drillTargetOf(r);
                    const strong = r.row_type === "primary";
                    return (
                      <tr key={`${r.row_type}-${r.id ?? i}-${i}`} className={`border-t border-border-subtle ${strong ? "bg-surface-subtle/60 font-semibold" : ""}`}>
                        <td className="px-3 py-1.5" style={{ paddingLeft: 12 + r.depth * 16 }}>
                          {target ? (
                            <button type="button" className="text-left text-brand-primary hover:underline print:text-inherit" onClick={() => setDrill(target)}>
                              {r.name}
                            </button>
                          ) : (
                            <span className={r.row_type === "profit_and_loss" ? "italic" : ""}>{r.name}</span>
                          )}
                        </td>
                        {[r.opening_debit, r.opening_credit, r.period_debit, r.period_credit, r.closing_debit, r.closing_credit].map((v, c) => (
                          <td key={c} className="px-3 py-1.5 text-right tabular-nums">{formatCell(v)}</td>
                        ))}
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border-strong bg-surface-subtle font-semibold" data-testid="tb-grand-total">
                  <td className="px-3 py-2">Grand Total</td>
                  {[
                    data.totals.opening_debit,
                    data.totals.opening_credit,
                    data.totals.period_debit,
                    data.totals.period_credit,
                    data.totals.closing_debit,
                    data.totals.closing_credit,
                  ].map((v, c) => (
                    <td key={c} className="px-3 py-2 text-right tabular-nums">{formatCell(v) || "0.00"}</td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </StatementPageFrame>
      <DrillPanel
        target={drill}
        from={resource.data?.period.from_date ?? period.from}
        to={resource.data?.period.to_date ?? period.to}
        onClose={() => setDrill(null)}
      />
    </>
  );
}
