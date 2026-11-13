import { ApiError } from "@/api/core";
import {
  mfgAdvancedPlanningApi as map,
  type CompareResponse,
  type FinanceConstrainedResponse,
  type ForecastDemandResponse,
  type ForwardPlanQuery,
  type ForwardPlanResponse,
  type ForwardScenario,
  type SchedulerParams,
  type SchedulerPreviewResponse,
} from "@/api/mfgAdvancedPlanning";
import { advancedErrorText } from "@/components/control-tower/intelligence/phase5/phase5Logic";

import { useMfgResource } from "./useManufacturingIntelligence";

/** Manufacturing Intelligence Phase 5 (forward plan) loaders. `null` keeps a hook idle. */

/** Replaces the server text with a plain message (codes such as TOO_MANY_LINES); keeps status and code. */
function friendly<T>(what: string, load: () => Promise<T>): () => Promise<T> {
  return () =>
    load().catch((e: unknown) => {
      const status = e instanceof ApiError ? e.status : 0;
      const code = e instanceof ApiError ? e.code : null;
      const requestId = e instanceof ApiError ? e.requestId : null;
      throw new ApiError(advancedErrorText(e, what), status, requestId, code);
    });
}

export function useMfgForwardPlan(q: ForwardPlanQuery | null) {
  return useMfgResource<ForwardPlanResponse>(
    "useMfgForwardPlan",
    q ? JSON.stringify(q) : "",
    q ? friendly("Forward plan", () => map.getForwardPlan(q)) : null,
  );
}

export function useMfgScenarioCompare(q: (Omit<ForwardPlanQuery, "scenario"> & { scenarios: ForwardScenario[] }) | null) {
  return useMfgResource<CompareResponse>(
    "useMfgScenarioCompare",
    q ? JSON.stringify(q) : "",
    q && q.scenarios.length ? friendly("Scenario compare", () => map.compareScenarios(q)) : null,
  );
}

export function useMfgForecastDemand(horizonDays: number, enabled: boolean) {
  return useMfgResource<ForecastDemandResponse>(
    "useMfgForecastDemand",
    String(horizonDays),
    enabled ? friendly("Demand forecast", () => map.getForecastDemand(horizonDays)) : null,
  );
}

export function useMfgFinanceConstrained(q: { horizon_days: number; factory_unit?: string } | null) {
  return useMfgResource<FinanceConstrainedResponse>(
    "useMfgFinanceConstrained",
    q ? JSON.stringify(q) : "",
    q ? friendly("Finance view", () => map.getFinanceConstrained(q)) : null,
  );
}

export function useMfgSchedulerPreview(p: SchedulerParams | null) {
  return useMfgResource<SchedulerPreviewResponse>(
    "useMfgSchedulerPreview",
    p ? JSON.stringify(p) : "",
    p ? friendly("Scheduler preview", () => map.getSchedulerPreview(p)) : null,
  );
}
