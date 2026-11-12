import {
  financeControlApi as api,
  type ControlTowerResponse,
  type ExceptionListResponse,
  type OrderProfitListResponse,
  type ProfitEntityKind,
  type ProfitabilityResponse,
  type SeverityFilter,
} from "@/api/financeControl";
import { isFinanceControlTowerV2Enabled } from "@/components/finance/hubs/financeHubs";
import { useAuth } from "@/context/AuthContext";
import { useStatementResource } from "@/hooks/useFinanceStatements";

/** True when this company has switched the Finance Control Tower on (Settings -> Configuration). */
export function useControlTowerEnabled(): boolean {
  return isFinanceControlTowerV2Enabled(useAuth().me?.feature_flags);
}

export const EXCEPTION_PAGE_SIZE = 25;
export const ORDER_PROFIT_PAGE_SIZE = 25;

export function useControlTower(asOf: string, severity: SeverityFilter, enabled: boolean) {
  return useStatementResource<ControlTowerResponse>(
    "useControlTower",
    `${asOf}|${severity}`,
    enabled ? () => api.getControlTower({ as_of_date: asOf || undefined, severity }) : null,
  );
}

/** The rows behind one card. `code` null keeps it idle (panel closed). */
export function useExceptionList(code: string | null, asOf: string, offset: number) {
  return useStatementResource<ExceptionListResponse>(
    "useExceptionList",
    `${code ?? ""}|${asOf}|${offset}`,
    code
      ? () => api.getExceptions(code, { as_of_date: asOf || undefined, limit: EXCEPTION_PAGE_SIZE, offset })
      : null,
  );
}

export function useOrderProfitList(
  from: string,
  to: string,
  sort: string,
  offset: number,
  enabled: boolean,
) {
  return useStatementResource<OrderProfitListResponse>(
    "useOrderProfitList",
    `${from}|${to}|${sort}|${offset}`,
    enabled
      ? () =>
          api.listOrderProfit({
            from_date: from || undefined,
            to_date: to || undefined,
            sort,
            limit: ORDER_PROFIT_PAGE_SIZE,
            offset,
          })
      : null,
  );
}

/** One order / style / contract / buyer. `id` null keeps it idle. */
export function useProfitability(kind: ProfitEntityKind, id: number | null, from: string, to: string, enabled: boolean) {
  return useStatementResource<ProfitabilityResponse>(
    "useProfitability",
    `${kind}|${id ?? ""}|${from}|${to}`,
    enabled && id != null ? () => api.getProfitability(kind, id, { from_date: from || undefined, to_date: to || undefined }) : null,
  );
}
