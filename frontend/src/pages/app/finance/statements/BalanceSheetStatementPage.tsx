import { useState } from "react";
import type { SheetNode } from "@/api/financeStatements";
import { DrillPanel, type DrillTarget } from "@/components/finance/statements/DrillPanel";
import { SheetSide } from "@/components/finance/statements/SheetSide";
import { fiscalYearStartOf } from "@/components/finance/statements/statementPeriod";
import { StatementPageFrame } from "@/components/finance/statements/StatementPageFrame";
import { StatementPeriodPicker, useFiscalStartMonth } from "@/components/finance/statements/StatementPeriodPicker";
import { useBalanceSheetStatement, useStatementsEnabled } from "@/hooks/useFinanceStatements";
import { todayLocalISO } from "@/lib/dates";

/** Two-sided Balance Sheet: Liabilities left, Assets right (stacked on a phone). */
export function BalanceSheetStatementPage() {
  const enabled = useStatementsEnabled();
  const startMonth = useFiscalStartMonth();
  const [asOf, setAsOf] = useState(() => todayLocalISO());
  const [drill, setDrill] = useState<DrillTarget | null>(null);

  const query = { as_of_date: asOf };
  const resource = useBalanceSheetStatement(query, enabled);

  const openDrill = (node: SheetNode) => {
    if (node.id == null) return;
    setDrill(node.row_type === "ledger" ? { kind: "ledger", id: node.id, name: node.name } : { kind: "group", id: node.id, name: node.name });
  };

  return (
    <>
      <StatementPageFrame
        title="Balance Sheet"
        description="Liabilities and assets as at a date. Inner amounts are ledgers, outer amounts are groups. Click a group or ledger to drill down."
        resource={resource}
        exportInfo={{ report: "balance-sheet", query, fileBase: `balance-sheet-${asOf}` }}
        aiReport={{ report: "balance_sheet", period: { to_date: asOf } }}
        controls={<StatementPeriodPicker mode="as-of" value={asOf} onChange={setAsOf} />}
      >
        {(data) => (
          <>
            <div className="statement-two-sides grid gap-4 lg:grid-cols-2">
              <SheetSide
                title="Liabilities"
                nodes={data.liabilities}
                totalLabel="Total Liabilities"
                total={data.totals.liabilities}
                onDrill={openDrill}
              />
              <SheetSide
                title="Assets"
                nodes={data.assets}
                totalLabel="Total Assets"
                total={data.totals.assets}
                onDrill={openDrill}
              />
            </div>
            <p className="text-xs text-text-muted">
              The Profit &amp; Loss A/c line carries the result of earlier years and of this financial year; a profit sits on the
              liabilities side and a loss on the assets side.
            </p>
          </>
        )}
      </StatementPageFrame>
      <DrillPanel target={drill} from={fiscalYearStartOf(asOf, startMonth)} to={asOf} onClose={() => setDrill(null)} />
    </>
  );
}
