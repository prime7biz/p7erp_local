import { useCallback, useEffect, useRef, useState } from "react";

import {
  financeStatementsApi as api,
  type BalanceSheetStatement,
  type CashFlowStatement,
  type DrillCashFlowResult,
  type DrillGroupResult,
  type DrillLedgerResult,
  type FundsFlowStatement,
  type ProfitLossStatement,
  type RatioAnalysisStatement,
  type StatementQuery,
  type StockGlStatement,
  type TrialBalanceStatement,
} from "@/api/financeStatements";
import { isFinanceStatementsV2Enabled } from "@/components/finance/hubs/financeHubs";
import { useAuth } from "@/context/AuthContext";
import { logApiError } from "@/utils/logApiError";

export interface StatementResource<T> {
  data: T | null;
  loading: boolean;
  error: string;
  /** HTTP status of the failed request (403 = not allowed, 404 = switch is off), 0 when unknown. */
  errorStatus: number;
  reload: () => void;
}

/** True when this company has switched the new statements on (Settings -> Configuration). */
export function useStatementsEnabled(): boolean {
  return isFinanceStatementsV2Enabled(useAuth().me?.feature_flags);
}

/**
 * Small load-on-change hook (same idea as the Manufacturing Intelligence hooks): a newer request
 * always wins. `key` must change when the inputs change; `load` null keeps the hook idle.
 */
export function useStatementResource<T>(scope: string, key: string, load: (() => Promise<T>) | null): StatementResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorStatus, setErrorStatus] = useState(0);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const fn = loadRef.current;
    const id = ++seq.current;
    if (!fn) {
      setData(null);
      setLoading(false);
      setError("");
      setErrorStatus(0);
      return;
    }
    setLoading(true);
    setError("");
    setErrorStatus(0);
    fn()
      .then((res) => {
        if (id === seq.current) setData(res);
      })
      .catch((e: unknown) => {
        logApiError(scope, e);
        if (id !== seq.current) return;
        setData(null);
        setError(e instanceof Error ? e.message : "Failed to load");
        setErrorStatus(typeof (e as { status?: unknown }).status === "number" ? (e as { status: number }).status : 0);
      })
      .finally(() => {
        if (id === seq.current) setLoading(false);
      });
    return () => {
      if (seq.current === id) seq.current += 1;
    };
  }, [scope, key, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, errorStatus, reload };
}

const qkey = (q: StatementQuery) =>
  `${q.fiscal_year ?? ""}|${q.from_date ?? ""}|${q.to_date ?? ""}|${q.as_of_date ?? ""}|${q.include_zero ? 1 : 0}`;

export function useTrialBalanceStatement(q: StatementQuery, enabled: boolean) {
  return useStatementResource<TrialBalanceStatement>("useTrialBalanceStatement", qkey(q), enabled ? () => api.getTrialBalance(q) : null);
}

export function useBalanceSheetStatement(q: StatementQuery, enabled: boolean) {
  return useStatementResource<BalanceSheetStatement>("useBalanceSheetStatement", qkey(q), enabled ? () => api.getBalanceSheet(q) : null);
}

export function useProfitLossStatement(q: StatementQuery, enabled: boolean) {
  return useStatementResource<ProfitLossStatement>("useProfitLossStatement", qkey(q), enabled ? () => api.getProfitLoss(q) : null);
}

export function useCashFlowStatement(fiscalYear: number | undefined, enabled: boolean) {
  return useStatementResource<CashFlowStatement>(
    "useCashFlowStatement",
    String(fiscalYear ?? ""),
    enabled ? () => api.getCashFlowMonthly({ fiscal_year: fiscalYear }) : null,
  );
}

export function useFundsFlowStatement(fiscalYear: number | undefined, enabled: boolean) {
  return useStatementResource<FundsFlowStatement>(
    "useFundsFlowStatement",
    String(fiscalYear ?? ""),
    enabled ? () => api.getFundsFlowMonthly({ fiscal_year: fiscalYear }) : null,
  );
}

export function useRatioAnalysisStatement(q: StatementQuery, enabled: boolean) {
  return useStatementResource<RatioAnalysisStatement>("useRatioAnalysisStatement", qkey(q), enabled ? () => api.getRatioAnalysis(q) : null);
}

export function useStockGlStatement(asOfDate: string, enabled: boolean) {
  return useStatementResource<StockGlStatement>(
    "useStockGlStatement",
    asOfDate,
    enabled ? () => api.getStockGlReconciliation({ as_of_date: asOfDate || undefined }) : null,
  );
}

// ---- drill-down levels (each one is loaded only while its panel is open) -------------------------------
export function useDrillGroup(groupId: number | null, from: string, to: string) {
  return useStatementResource<DrillGroupResult>(
    "useDrillGroup",
    `${groupId ?? ""}|${from}|${to}`,
    groupId != null ? () => api.drillGroup(groupId, { from_date: from || undefined, to_date: to || undefined }) : null,
  );
}

export function useDrillLedger(accountId: number | null, from: string, to: string, offset: number, limit: number) {
  return useStatementResource<DrillLedgerResult>(
    "useDrillLedger",
    `${accountId ?? ""}|${from}|${to}|${offset}|${limit}`,
    accountId != null
      ? () => api.drillLedger(accountId, { from_date: from || undefined, to_date: to || undefined, offset, limit })
      : null,
  );
}

export function useDrillCashFlow(month: string | null, fiscalYear: number | undefined) {
  return useStatementResource<DrillCashFlowResult>(
    "useDrillCashFlow",
    `${month ?? ""}|${fiscalYear ?? ""}`,
    month != null ? () => api.drillCashFlow(month, fiscalYear) : null,
  );
}
