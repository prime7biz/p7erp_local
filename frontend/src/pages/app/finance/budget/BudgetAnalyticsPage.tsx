import { useCallback, useEffect, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import {
  financeBudgetAnalyticsApi,
  type AnalyticsRow,
  type BudgetDimension,
  type BudgetRef,
} from "@/api/financeBudgetAnalytics";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { listPageRootClass } from "@/components/app/listPageLayout";
import { FinanceAiCommentaryPanel } from "@/components/finance/ai/FinanceAiCommentaryPanel";
import { BudgetDrillPanel, type BudgetDrillTarget } from "@/components/finance/budget/BudgetDrillPanel";
import { DIMENSION_OPTIONS, drillFilterFor, moneyText, percentText } from "@/components/finance/budget/budgetLogic";
import {
  buttonClass,
  fieldClass,
  LoadingBlock,
  NotesList,
  ReportError,
  SwitchedOffNotice,
} from "@/components/finance/budget/BudgetPageParts";
import { BudgetStatusChip } from "@/components/finance/budget/BudgetStatusChip";
import { useCanExportStatements } from "@/components/finance/statements/StatementExportBar";
import { initialPeriod } from "@/components/finance/statements/statementPeriod";
import { StatementPeriodPicker, useFiscalStartMonth } from "@/components/finance/statements/StatementPeriodPicker";
import { useBudgetAnalytics, useBudgetAnalyticsEnabled } from "@/hooks/useFinanceBudgetAnalytics";
import { todayLocalISO } from "@/lib/dates";
import { saveBlob } from "@/lib/fileSave";
import { fiscalYearLabel, fiscalYearOf } from "@/lib/fiscalYear";
import { logApiError } from "@/utils/logApiError";

const th = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-muted";
const thR = `${th} text-right`;
const tdR = "px-3 py-2 text-right tabular-nums";

const NO_EXPORT_TEXT = "You do not have permission to export finance reports.";

/**
 * Budget vs Actual (analytics), tenant flag `finance_budget_analytics_v2`.
 * FINAL budgets of a financial year against posted actuals, by cost centre, account, month or department.
 * Click a row to see the voucher lines behind its Actual. Read-only: nothing here changes a budget or a voucher.
 */
export function BudgetAnalyticsPage() {
  const enabled = useBudgetAnalyticsEnabled();
  const startMonth = useFiscalStartMonth();
  const canExport = useCanExportStatements();
  const [period, setPeriod] = useState(() => initialPeriod(startMonth, todayLocalISO()));
  const [budgetId, setBudgetId] = useState<number | null>(null);
  const [dimension, setDimension] = useState<BudgetDimension>("cost_center");
  const [budgetOptions, setBudgetOptions] = useState<BudgetRef[]>([]);
  const [drill, setDrill] = useState<BudgetDrillTarget | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportForbidden, setExportForbidden] = useState(false);
  const [exportMessage, setExportMessage] = useState("");

  const fiscalYear = period.fiscalYear ?? fiscalYearOf(todayLocalISO(), startMonth);
  const fyLabel = fiscalYearLabel(fiscalYear, startMonth);
  const { data, loading, error, errorStatus, reload } = useBudgetAnalytics(fyLabel, budgetId, dimension, enabled);

  // The budget list of the year (only an "all budgets" answer lists every budget, so remember it).
  useEffect(() => {
    if (budgetId == null && data) setBudgetOptions(data.budgets);
  }, [data, budgetId]);

  const query = { fiscal_year: fyLabel, budget_id: budgetId ?? undefined, dimension };
  const dimensionLabel = DIMENSION_OPTIONS.find((o) => o.value === dimension)?.label ?? "Row";
  const currency = data?.base_currency ?? "";
  const exportBlocked = !canExport || exportForbidden;

  async function exportCsv() {
    setExporting(true);
    setExportMessage("");
    try {
      const blob = await financeBudgetAnalyticsApi.exportBudgetAnalytics(query);
      await saveBlob(blob, `budget-analytics-${dimension}-${fyLabel}.csv`);
    } catch (e) {
      logApiError("BudgetAnalyticsPage.exportCsv", e);
      if ((e as { status?: number }).status === 403) setExportForbidden(true);
      else setExportMessage((e as Error).message || "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const closeDrill = useCallback(() => setDrill(null), []);

  function openRow(row: AnalyticsRow | null) {
    const filter = drillFilterFor(dimension, row, { fiscal_year: fyLabel, budget_id: budgetId ?? undefined });
    if (!filter || !data) return;
    setDrill({ label: row ? `${dimensionLabel}: ${row.label}` : "All rows", filter, actual: row ? row.actual : data.totals.actual });
  }

  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Budget vs Actual (analytics)"
        description="FINAL budgets of a financial year against posted actuals. Click a row to see the voucher lines behind its actual. Nothing here changes a budget or a voucher."
      />

      {!enabled ? (
        <SwitchedOffNotice />
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <StatementPeriodPicker
                mode="year"
                value={period}
                onChange={(next) => {
                  setPeriod(next);
                  setBudgetId(null);
                  setBudgetOptions([]);
                }}
              />
              <label className="text-xs font-medium text-text-muted">
                Budget
                <select
                  className={`${fieldClass} mt-1 block`}
                  value={budgetId ?? ""}
                  onChange={(e) => setBudgetId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">All final budgets</option>
                  {budgetOptions.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.budget_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-text-muted">
                Show by
                <select
                  className={`${fieldClass} mt-1 block`}
                  value={dimension}
                  onChange={(e) => setDimension(e.target.value as BudgetDimension)}
                >
                  {DIMENSION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={buttonClass}
                disabled={!data || loading || exporting || exportBlocked}
                title={exportBlocked ? NO_EXPORT_TEXT : "Download this table as CSV"}
                onClick={() => void exportCsv()}
              >
                <FileSpreadsheet className="h-4 w-4" aria-hidden />
                {exporting ? "Preparing…" : "Export CSV"}
              </button>
              {exportMessage ? (
                <span role="alert" className="text-xs text-status-danger-foreground">
                  {exportMessage}
                </span>
              ) : null}
            </div>
          </div>

          <ReportError error={error} status={errorStatus} onRetry={reload} />
          {loading && !data ? <LoadingBlock label="Loading budget analytics" /> : null}

          {data ? (
            <>
              <p className="text-xs text-text-muted">
                Financial year {data.fiscal_year} ({data.fiscal_year_start} to {data.fiscal_year_end}) · amounts in {currency} ·
                budget check on posting: {data.enforcement_mode || "—"} · data as of {new Date(data.data_as_of).toLocaleString()}
                {loading ? " · refreshing…" : ""}
              </p>

              <FinanceAiCommentaryPanel report="budget_analytics" period={{ fiscal_year: fiscalYear }} />

              {data.rows.length === 0 ? (
                <p className="rounded-xl border border-border bg-surface-raised p-6 text-sm text-text-muted">
                  No budget or actual spend in this financial year.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
                  <table className="min-w-full text-sm" aria-label="Budget vs actual">
                    <thead className="bg-surface-subtle">
                      <tr>
                        <th className={th}>{dimensionLabel}</th>
                        <th className={thR}>Budget</th>
                        <th className={thR}>Actual</th>
                        <th className={thR}>Variance</th>
                        <th className={thR}>Used %</th>
                        <th className={th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((row, i) => {
                        const canDrill = drillFilterFor(dimension, row, {}) != null;
                        return (
                          <tr key={`${String(row.id ?? "none")}-${i}`} className="border-t border-border-subtle" data-testid="analytics-row">
                            <td className="px-3 py-2">
                              {canDrill ? (
                                <button
                                  type="button"
                                  className="text-left text-brand-primary hover:underline"
                                  onClick={() => openRow(row)}
                                >
                                  {row.label}
                                </button>
                              ) : (
                                row.label
                              )}
                            </td>
                            <td className={tdR}>{moneyText(row.budget)}</td>
                            <td className={tdR}>{moneyText(row.actual)}</td>
                            <td className={tdR}>{moneyText(row.variance)}</td>
                            <td className={tdR}>{percentText(row.used_percent)}</td>
                            <td className="px-3 py-2">
                              <BudgetStatusChip status={row.status} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border-strong bg-surface-subtle font-semibold" data-testid="analytics-totals">
                        <td className="px-3 py-2">
                          <button type="button" className="text-left text-brand-primary hover:underline" onClick={() => openRow(null)}>
                            Total
                          </button>
                        </td>
                        <td className={tdR}>{moneyText(data.totals.budget)}</td>
                        <td className={tdR}>{moneyText(data.totals.actual)}</td>
                        <td className={tdR}>{moneyText(data.totals.variance)}</td>
                        <td className={tdR}>{percentText(data.totals.used_percent)}</td>
                        <td className="px-3 py-2">
                          <BudgetStatusChip status={data.totals.status} />
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
              <p className="text-xs text-text-muted">
                Variance = budget − actual (a minus figure means over budget). Status: within below 80% used, warning from 80%,
                over from 100%, critical from 110%.
              </p>
              <NotesList notes={data.notes} />
            </>
          ) : null}
        </>
      )}

      <BudgetDrillPanel target={drill} currency={currency} onClose={closeDrill} />
    </div>
  );
}
