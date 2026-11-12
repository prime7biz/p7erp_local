import {
  financeBudgetAnalyticsApi as api,
  type BudgetAnalyticsResponse,
  type BudgetDimension,
  type DrilldownQuery,
  type DrilldownResponse,
  type ExpenseAnalysisResponse,
  type ExpenseControlsResponse,
  type ExpenseGroupBy,
} from "@/api/financeBudgetAnalytics";
import { isFinanceBudgetAnalyticsV2Enabled } from "@/components/finance/hubs/financeHubs";
import { useAuth } from "@/context/AuthContext";
import { useStatementResource } from "@/hooks/useFinanceStatements";

/** True when this company has switched budget analytics on (Settings -> Configuration -> Finance). */
export function useBudgetAnalyticsEnabled(): boolean {
  return isFinanceBudgetAnalyticsV2Enabled(useAuth().me?.feature_flags);
}

export const DRILL_PAGE_SIZE = 50;

export function useBudgetAnalytics(
  fiscalYearLabel: string,
  budgetId: number | null,
  dimension: BudgetDimension,
  enabled: boolean,
) {
  return useStatementResource<BudgetAnalyticsResponse>(
    "useBudgetAnalytics",
    `${fiscalYearLabel}|${budgetId ?? ""}|${dimension}`,
    enabled
      ? () => api.getBudgetAnalytics({ fiscal_year: fiscalYearLabel || undefined, budget_id: budgetId ?? undefined, dimension })
      : null,
  );
}

/** Voucher lines behind one table cell. `filter` null keeps it idle (panel closed). */
export function useBudgetDrilldown(filter: DrilldownQuery | null, offset: number) {
  return useStatementResource<DrilldownResponse>(
    "useBudgetDrilldown",
    `${filter ? JSON.stringify(filter) : ""}|${offset}`,
    filter ? () => api.getDrilldown({ ...filter, limit: DRILL_PAGE_SIZE, offset }) : null,
  );
}

export function useExpenseAnalysis(from: string, to: string, groupBy: ExpenseGroupBy, enabled: boolean) {
  return useStatementResource<ExpenseAnalysisResponse>(
    "useExpenseAnalysis",
    `${from}|${to}|${groupBy}`,
    enabled ? () => api.getExpenseAnalysis({ from_date: from || undefined, to_date: to || undefined, group_by: groupBy }) : null,
  );
}

export function useExpenseControls(asOf: string, enabled: boolean) {
  return useStatementResource<ExpenseControlsResponse>(
    "useExpenseControls",
    asOf,
    enabled ? () => api.getExpenseControls({ as_of_date: asOf || undefined }) : null,
  );
}
