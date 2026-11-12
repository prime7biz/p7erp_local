import { useState } from "react";
import type { PrincipalGroup, PrincipalRatio } from "@/api/financeStatements";
import { formatIndian, formatWithSide } from "@/components/finance/statements/statementFormat";
import { initialPeriod, rangeQuery } from "@/components/finance/statements/statementPeriod";
import { StatementPageFrame } from "@/components/finance/statements/StatementPageFrame";
import { StatementPeriodPicker, useFiscalStartMonth } from "@/components/finance/statements/StatementPeriodPicker";
import { useRatioAnalysisStatement, useStatementsEnabled } from "@/hooks/useFinanceStatements";
import { todayLocalISO } from "@/lib/dates";

const NO_VALUE = "—";

function groupText(g: PrincipalGroup): string {
  if (g.amount != null) return formatWithSide(g.amount, g.dr_cr);
  if (g.value != null) return `${formatIndian(g.value)}${g.unit ? ` ${g.unit}` : ""}`;
  return NO_VALUE;
}

/** "Due till today" lines get their amount from the bill source chosen in Settings. */
const DUE_GROUP_CODES = new Set(["SUNDRY_DEBTORS_DUE", "SUNDRY_CREDITORS_DUE"]);
const DUE_SOURCE_HINT = "Choose the bill source in Settings → Configuration → Finance.";

const SOURCE_LABELS: Record<string, string> = {
  outstanding_bills: "Outstanding bills",
  party_ledger: "Party ledgers",
  bill_references: "Bill references",
};

function dueSourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

/** Extra lines under a principal group: total open, bill source and note (or the setting hint). */
function GroupDetails({ g }: { g: PrincipalGroup }) {
  const missing = g.amount == null && g.value == null;
  const isDue = DUE_GROUP_CODES.has(g.code);
  return (
    <>
      {missing && g.reason ? <p className="text-xs text-text-muted">{g.reason}</p> : null}
      {missing && isDue ? <p className="text-xs text-text-muted">{DUE_SOURCE_HINT}</p> : null}
      {g.total_open != null ? (
        <p className="text-xs text-text-secondary" data-testid={`total-open-${g.code}`}>
          Total open: <span className="tabular-nums">{formatIndian(g.total_open)}</span>
        </p>
      ) : null}
      {g.source ? (
        <span
          className="mt-0.5 inline-block rounded bg-surface-subtle px-1.5 py-0.5 text-[11px] text-text-muted"
          data-testid={`source-${g.code}`}
        >
          Source: {dueSourceLabel(g.source)}
        </span>
      ) : null}
      {g.note ? <p className="text-[11px] text-text-muted">{g.note}</p> : null}
    </>
  );
}

function ratioText(r: PrincipalRatio): string {
  // A missing value (zero denominator) is a dash, never a made-up number.
  return r.value == null ? NO_VALUE : r.display;
}

/** Ratio Analysis: Principal Groups on the left, Principal Ratios on the right. */
export function RatioAnalysisStatementPage() {
  const enabled = useStatementsEnabled();
  const startMonth = useFiscalStartMonth();
  const [period, setPeriod] = useState(() => initialPeriod(startMonth, todayLocalISO()));
  const query = rangeQuery(period);
  const resource = useRatioAnalysisStatement(query, enabled);

  return (
    <StatementPageFrame
      title="Ratio Analysis"
      description="Principal groups and principal ratios worked out from the books. A dash means the figure cannot be worked out; the reason is shown."
      resource={resource}
      hideReconciliation
      exportInfo={{ report: "ratio-analysis", query, fileBase: `ratio-analysis-${resource.data?.period.fiscal_year ?? "report"}` }}
      aiReport={{ report: "ratio_analysis", period: query }}
      controls={<StatementPeriodPicker mode="range" value={period} onChange={setPeriod} />}
    >
      {(data) => (
        <div className="statement-two-sides grid gap-4 lg:grid-cols-2">
          <section className="statement-sheet print-card overflow-x-auto rounded-xl border border-border bg-surface-raised" aria-label="Principal groups">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">Principal Groups</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-text-muted">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.principal_groups.map((g) => (
                  <tr key={g.code} className="border-t border-border-subtle align-top" data-testid={`group-${g.code}`}>
                    <td className="px-3 py-1.5">
                      {g.label}
                      <GroupDetails g={g} />
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{groupText(g)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="statement-sheet print-card overflow-x-auto rounded-xl border border-border bg-surface-raised" aria-label="Principal ratios">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">Principal Ratios</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-text-muted">Value</th>
                </tr>
              </thead>
              <tbody>
                {data.principal_ratios.map((r) => (
                  <tr key={r.code} className="border-t border-border-subtle align-top" data-testid={`ratio-${r.code}`}>
                    <td className="px-3 py-1.5">
                      {r.label}
                      {r.value == null && r.reason ? <p className="text-xs text-text-muted">{r.reason}</p> : null}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{ratioText(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </StatementPageFrame>
  );
}
