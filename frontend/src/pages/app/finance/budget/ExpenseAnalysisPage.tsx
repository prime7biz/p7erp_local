import { useState } from "react";
import type { ExpenseGroupBy } from "@/api/financeBudgetAnalytics";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { listPageRootClass } from "@/components/app/listPageLayout";
import { FinanceAiCommentaryPanel } from "@/components/finance/ai/FinanceAiCommentaryPanel";
import { GROUP_BY_OPTIONS, moneyText, percentText } from "@/components/finance/budget/budgetLogic";
import { fieldClass, LoadingBlock, NotesList, ReportError, SwitchedOffNotice } from "@/components/finance/budget/BudgetPageParts";
import { initialPeriod } from "@/components/finance/statements/statementPeriod";
import { StatementPeriodPicker, useFiscalStartMonth } from "@/components/finance/statements/StatementPeriodPicker";
import { useBudgetAnalyticsEnabled, useExpenseAnalysis } from "@/hooks/useFinanceBudgetAnalytics";
import { todayLocalISO } from "@/lib/dates";

const th = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-muted";
const thR = `${th} text-right`;
const tdR = "px-3 py-2 text-right tabular-nums";

/** "INDIRECT_EXPENSES" -> "Indirect expenses". */
function classLabel(code: string): string {
  const text = code.replaceAll("_", " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Expense analysis, tenant flag `finance_budget_analytics_v2`: posted expense for a period compared
 * with the period just before it, grouped by month, account, cost centre or vendor. Read-only.
 */
export function ExpenseAnalysisPage() {
  const enabled = useBudgetAnalyticsEnabled();
  const startMonth = useFiscalStartMonth();
  const [period, setPeriod] = useState(() => initialPeriod(startMonth, todayLocalISO()));
  const [groupBy, setGroupBy] = useState<ExpenseGroupBy>("month");
  const { data, loading, error, errorStatus, reload } = useExpenseAnalysis(period.from, period.to, groupBy, enabled);

  const groupLabel = GROUP_BY_OPTIONS.find((o) => o.value === groupBy)?.label ?? "Row";
  const currency = data?.base_currency ?? "";

  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Expense analysis"
        description="Posted expense for a period next to the period just before it, with the change. Nothing here changes a voucher."
      />

      {!enabled ? (
        <SwitchedOffNotice />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <StatementPeriodPicker mode="range" value={period} onChange={setPeriod} />
            <label className="text-xs font-medium text-text-muted">
              Group by
              <select
                className={`${fieldClass} mt-1 block`}
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as ExpenseGroupBy)}
              >
                {GROUP_BY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <ReportError error={error} status={errorStatus} onRetry={reload} />
          {loading && !data ? <LoadingBlock label="Loading expense analysis" /> : null}

          {data ? (
            <>
              <p className="text-xs text-text-muted">
                Current {data.from_date} to {data.to_date} · previous {data.previous_from_date} to {data.previous_to_date} ·
                amounts in {currency} · data as of {new Date(data.data_as_of).toLocaleString()}
                {loading ? " · refreshing…" : ""}
              </p>

              <FinanceAiCommentaryPanel report="expense_analysis" period={{ from_date: period.from, to_date: period.to }} />

              {data.warnings.length > 0 ? (
                <ul className="space-y-1" aria-label="Warnings">
                  {data.warnings.map((w) => (
                    <li
                      key={w.code}
                      className="rounded-lg border border-status-warning/30 bg-status-warning-subtle px-3 py-2 text-sm text-status-warning-foreground"
                    >
                      {w.message}
                      <span className="ml-1 text-xs">
                        (current {moneyText(w.current)}, previous {moneyText(w.previous)}, {w.account_count} account(s))
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-3">
                <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised lg:col-span-2">
                  {data.rows.length === 0 ? (
                    <p className="p-6 text-sm text-text-muted">No posted expense in either period.</p>
                  ) : (
                    <table className="min-w-full text-sm" aria-label="Expense by group">
                      <thead className="bg-surface-subtle">
                        <tr>
                          <th className={th}>{groupLabel}</th>
                          <th className={thR}>Current</th>
                          <th className={thR}>Previous</th>
                          <th className={thR}>Change</th>
                          <th className={thR}>Change %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.rows.map((r, i) => (
                          <tr key={`${String(r.id ?? "none")}-${i}`} className="border-t border-border-subtle" data-testid="expense-row">
                            <td className="px-3 py-2">{r.label}</td>
                            <td className={tdR}>{moneyText(r.current)}</td>
                            <td className={tdR}>{moneyText(r.previous)}</td>
                            <td className={tdR}>{moneyText(r.change)}</td>
                            <td className={tdR}>{percentText(r.change_percent)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-border-strong bg-surface-subtle font-semibold" data-testid="expense-totals">
                          <td className="px-3 py-2">Total</td>
                          <td className={tdR}>{moneyText(data.total_current)}</td>
                          <td className={tdR}>{moneyText(data.total_previous)}</td>
                          <td className={tdR}>{moneyText(data.change)}</td>
                          <td className={tdR}>{percentText(data.change_percent)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>

                <section className="rounded-xl border border-border bg-surface-raised" aria-label="By expense class">
                  <h2 className="border-b border-border-subtle px-3 py-2 text-sm font-semibold text-text-primary">By expense class</h2>
                  {data.by_class.length === 0 ? (
                    <p className="p-3 text-sm text-text-muted">Nothing to show.</p>
                  ) : (
                    <table className="min-w-full text-sm">
                      <thead className="bg-surface-subtle">
                        <tr>
                          <th className={th}>Class</th>
                          <th className={thR}>Current</th>
                          <th className={thR}>Previous</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.by_class.map((c) => (
                          <tr key={c.statement_class} className="border-t border-border-subtle">
                            <td className="px-3 py-2">{classLabel(c.statement_class)}</td>
                            <td className={tdR}>{moneyText(c.current)}</td>
                            <td className={tdR}>{moneyText(c.previous)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>
              </div>
              <NotesList notes={data.notes} />
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
