import { useState } from "react";
import { formatCell, formatIndian, isZeroMoney } from "@/components/finance/statements/statementFormat";
import { StatementPageFrame } from "@/components/finance/statements/StatementPageFrame";
import { StatementPeriodPicker } from "@/components/finance/statements/StatementPeriodPicker";
import { useStatementsEnabled, useStockGlStatement } from "@/hooks/useFinanceStatements";
import { todayLocalISO } from "@/lib/dates";

const NATURE_LABEL: Record<string, string> = {
  RAW_MATERIAL: "Raw material",
  WORK_IN_PROCESS: "Work in process",
  FINISHED_GOODS: "Finished goods",
  OTHER: "Other",
  UNCLASSIFIED: "Unclassified",
};

const th = "px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-muted";

/** Control report: stock value from the stock records (FIFO) against the stock ledgers in the books. */
export function StockGlReconciliationPage() {
  const enabled = useStatementsEnabled();
  const [asOf, setAsOf] = useState(() => todayLocalISO());
  const resource = useStockGlStatement(asOf, enabled);

  return (
    <StatementPageFrame
      title="Stock vs Ledger"
      description="Control report. Compares the stock value (FIFO) with the stock ledgers in the books. A difference is shown as it is, never forced to zero."
      resource={resource}
      hideReconciliation
      controls={<StatementPeriodPicker mode="as-of" value={asOf} onChange={setAsOf} />}
    >
      {(data) => (
        <>
          <section className="grid gap-3 rounded-xl border border-border bg-surface-raised p-4 text-sm sm:grid-cols-3" aria-label="Totals">
            <div>
              <p className="text-xs text-text-muted">Stock value (FIFO)</p>
              <p className="text-base font-semibold tabular-nums" data-testid="fifo-total">{formatIndian(data.fifo_total)}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Stock ledgers (books)</p>
              <p className="text-base font-semibold tabular-nums" data-testid="gl-total">{formatIndian(data.gl_total)}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Difference (books − stock)</p>
              <p
                className={`text-base font-semibold tabular-nums ${isZeroMoney(data.difference) ? "text-status-success-foreground" : "text-status-danger-foreground"}`}
                data-testid="stock-difference"
              >
                {formatIndian(data.difference)}
              </p>
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="statement-sheet overflow-x-auto rounded-xl border border-border bg-surface-raised" aria-label="Stock by nature">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-subtle">
                  <tr>
                    <th className={`${th} text-left`}>Stock nature</th>
                    <th className={`${th} text-right`}>Lines</th>
                    <th className={`${th} text-right`}>FIFO value</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_nature.length === 0 ? (
                    <tr><td colSpan={3} className="px-3 py-6 text-center text-text-muted">No stock on hand.</td></tr>
                  ) : (
                    data.by_nature.map((n) => (
                      <tr key={n.nature} className="border-t border-border-subtle">
                        <td className="px-3 py-1.5">{NATURE_LABEL[n.nature] ?? n.nature}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{n.line_count}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{formatCell(n.fifo_value) || "0.00"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>
            <section className="statement-sheet overflow-x-auto rounded-xl border border-border bg-surface-raised" aria-label="Stock ledgers in the books">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-subtle">
                  <tr>
                    <th className={`${th} text-left`}>Stock ledger</th>
                    <th className={`${th} text-right`}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.gl_ledgers.length === 0 ? (
                    <tr><td colSpan={2} className="px-3 py-6 text-center text-text-muted">No stock ledgers have a balance.</td></tr>
                  ) : (
                    data.gl_ledgers.map((l) => (
                      <tr key={l.account_id} className="border-t border-border-subtle">
                        <td className="px-3 py-1.5">{l.name}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{formatIndian(l.balance)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>
          </div>
        </>
      )}
    </StatementPageFrame>
  );
}
