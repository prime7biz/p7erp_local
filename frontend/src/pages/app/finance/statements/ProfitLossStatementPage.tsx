import { useState } from "react";
import type { Result, SheetNode, StockMemo } from "@/api/financeStatements";
import { DrillPanel, type DrillTarget } from "@/components/finance/statements/DrillPanel";
import { SheetSide } from "@/components/finance/statements/SheetSide";
import { formatIndian } from "@/components/finance/statements/statementFormat";
import { initialPeriod, rangeQuery } from "@/components/finance/statements/statementPeriod";
import { StatementPageFrame } from "@/components/finance/statements/StatementPageFrame";
import { StatementPeriodPicker, useFiscalStartMonth } from "@/components/finance/statements/StatementPeriodPicker";
import { useProfitLossStatement, useStatementsEnabled } from "@/hooks/useFinanceStatements";
import { todayLocalISO } from "@/lib/dates";

function StockMemoTable({ opening, closing, status }: { opening: StockMemo; closing: StockMemo; status: string }) {
  const rows: { label: string; key: keyof StockMemo }[] = [
    { label: "Raw material", key: "raw_material" },
    { label: "Work in process", key: "work_in_process" },
    { label: "Finished goods", key: "finished_goods" },
  ];
  const show = (v: string | null | undefined) => (v == null ? "—" : formatIndian(v));
  return (
    <section
      aria-label="Memo: opening and closing stock"
      className="print-avoid-break rounded-xl border border-dashed border-border-strong bg-surface-subtle/50 p-4"
    >
      <h3 className="text-sm font-semibold text-text-primary">
        Memo: opening and closing stock <span className="font-normal text-text-muted">(for information only — not in any total above)</span>
      </h3>
      <p className="mt-1 text-xs text-text-muted">
        Your books post stock as it moves, so the Trading account uses the posted ledger figures. These stock values (FIFO) are
        shown only to compare.{status === "NOT_COMPUTED" ? " They were not computed for this report." : ""}
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-text-muted">
              <th className="py-1 pr-3">Stock</th>
              <th className="py-1 pr-3 text-right">Opening</th>
              <th className="py-1 text-right">Closing</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-border-subtle">
                <td className="py-1 pr-3">{r.label}</td>
                <td className="py-1 pr-3 text-right tabular-nums">{show(opening[r.key])}</td>
                <td className="py-1 text-right tabular-nums">{show(closing[r.key])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ResultLine({ label, result }: { label: string; result: Result }) {
  return (
    <p className="text-sm text-text-secondary">
      {label}: <b className="tabular-nums text-text-primary">{formatIndian(result.amount)}</b> {result.kind === "profit" ? "profit" : "loss"}
    </p>
  );
}

/** Trading account then Profit & Loss account, each two-sided (debit left, credit right). */
export function ProfitLossStatementPage() {
  const enabled = useStatementsEnabled();
  const startMonth = useFiscalStartMonth();
  const [period, setPeriod] = useState(() => initialPeriod(startMonth, todayLocalISO()));
  const [drill, setDrill] = useState<DrillTarget | null>(null);

  const query = rangeQuery(period);
  const resource = useProfitLossStatement(query, enabled);

  const openDrill = (node: SheetNode) => {
    if (node.id == null) return;
    setDrill(node.row_type === "ledger" ? { kind: "ledger", id: node.id, name: node.name } : { kind: "group", id: node.id, name: node.name });
  };

  return (
    <>
      <StatementPageFrame
        title="Trading and Profit & Loss A/c"
        description="Trading account (gross result) and Profit & Loss account (nett result) for a period. Click a group or ledger to drill down."
        resource={resource}
        exportInfo={{ report: "profit-loss", query, fileBase: `profit-loss-${resource.data?.period.fiscal_year ?? "report"}` }}
        aiReport={{ report: "profit_loss", period: query }}
        controls={<StatementPeriodPicker mode="range" value={period} onChange={setPeriod} />}
      >
        {(data) => (
          <>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Trading Account</h3>
            <div className="statement-two-sides grid gap-4 lg:grid-cols-2">
              <SheetSide title="Particulars (Dr)" nodes={data.trading.debit_rows} totalLabel="Trading debit total" total={data.trading.debit_total} onDrill={openDrill} />
              <SheetSide title="Particulars (Cr)" nodes={data.trading.credit_rows} totalLabel="Trading credit total" total={data.trading.credit_total} onDrill={openDrill} />
            </div>
            <ResultLine label="Gross result" result={data.trading.gross_result} />

            <h3 className="mt-2 text-sm font-semibold uppercase tracking-wide text-text-muted">Profit &amp; Loss Account</h3>
            <div className="statement-two-sides grid gap-4 lg:grid-cols-2">
              <SheetSide title="Particulars (Dr)" nodes={data.profit_and_loss.debit_rows} totalLabel="P&L debit total" total={data.profit_and_loss.debit_total} onDrill={openDrill} />
              <SheetSide title="Particulars (Cr)" nodes={data.profit_and_loss.credit_rows} totalLabel="P&L credit total" total={data.profit_and_loss.credit_total} onDrill={openDrill} />
            </div>
            <ResultLine label="Nett result" result={data.profit_and_loss.nett_result} />

            <StockMemoTable opening={data.trading.opening_stock} closing={data.trading.closing_stock} status={data.trading.memo_stock_status} />

            {data.stock_adjustment ? (
              <section className="print-avoid-break rounded-xl border border-border bg-surface-raised p-4 text-sm" aria-label="Periodic comparison">
                <h3 className="font-semibold text-text-primary">Comparison with a periodic-stock view (information only)</h3>
                <dl className="mt-2 grid gap-2 sm:grid-cols-3">
                  <div><dt className="text-xs text-text-muted">Gross result from ledgers</dt><dd className="tabular-nums">{formatIndian(data.stock_adjustment.gl_gross_result)}</dd></div>
                  <div><dt className="text-xs text-text-muted">Gross result with stock</dt><dd className="tabular-nums">{formatIndian(data.stock_adjustment.periodic_gross_result)}</dd></div>
                  <div><dt className="text-xs text-text-muted">Stock adjustment</dt><dd className="tabular-nums">{formatIndian(data.stock_adjustment.stock_adjustment)}</dd></div>
                </dl>
              </section>
            ) : null}
          </>
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
