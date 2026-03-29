import { useCallback, useRef, useState } from "react";
import {
  api,
  ApiError,
  type OrderAiDedupeResponse,
  type OrderAiEnrichResponse,
  type OrderAiAtpCtpSummaryResponse,
  type OrderAiCapacityBottleneckScanResponse,
  type OrderAiExecutionPlanningSummaryResponse,
  type OrderExtractionResponse,
  type OrderAiNextActionsResponse,
  type OrderAiPlanningRiskCheckResponse,
  type OrderAiPromiseSensitivityCheckResponse,
  type OrderAiSummaryResponse,
  type OrderAiValidateExecutionResponse,
  type OrderAiValidateResponse,
  type OrderAiWhatIfSimulationResponse,
} from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export type OrderAiJobStatus = "idle" | "processing" | "success" | "partial" | "failed";

function friendlyAiError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.status === 429) {
      return "Too many AI requests in a short window. Please wait a moment and try again.";
    }
    if (e.status === 504) {
      return "The AI service took too long to respond. Try again with a smaller document or simpler request.";
    }
    if (e.status === 403 && e.code === "AI_CAPABILITY_DENIED") {
      return e.message;
    }
    return e.message || fallback;
  }
  return e instanceof Error ? e.message : fallback;
}

export function useOrderAi() {
  const [status, setStatus] = useState<OrderAiJobStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<OrderExtractionResponse | null>(null);
  const [enrich, setEnrich] = useState<OrderAiEnrichResponse | null>(null);
  const [validate, setValidate] = useState<OrderAiValidateResponse | null>(null);
  const [validateExecution, setValidateExecution] = useState<OrderAiValidateExecutionResponse | null>(null);
  const [planningRisk, setPlanningRisk] = useState<OrderAiPlanningRiskCheckResponse | null>(null);
  const [atpCtpSummary, setAtpCtpSummary] = useState<OrderAiAtpCtpSummaryResponse | null>(null);
  const [dedupe, setDedupe] = useState<OrderAiDedupeResponse | null>(null);
  const [summary, setSummary] = useState<OrderAiSummaryResponse | null>(null);
  const [nextActions, setNextActions] = useState<OrderAiNextActionsResponse | null>(null);
  const [capacityScan, setCapacityScan] = useState<OrderAiCapacityBottleneckScanResponse | null>(null);
  const [whatIf, setWhatIf] = useState<OrderAiWhatIfSimulationResponse | null>(null);
  const [promiseSensitivity, setPromiseSensitivity] = useState<OrderAiPromiseSensitivityCheckResponse | null>(null);
  const [executionPlanningSummary, setExecutionPlanningSummary] =
    useState<OrderAiExecutionPlanningSummaryResponse | null>(null);
  const [extractionBatchId, setExtractionBatchId] = useState<number | null>(null);
  const [enrichBatchId, setEnrichBatchId] = useState<number | null>(null);
  const [traceBatchIds, setTraceBatchIds] = useState<number[]>([]);
  const [lastApplyConflicts, setLastApplyConflicts] = useState<
    Array<{ field: string; current: string; suggested: string }>
  >([]);

  const inflight = useRef(false);

  const pushTraceId = useCallback((id: number | null | undefined) => {
    if (id == null) return;
    setTraceBatchIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const clear = useCallback(() => {
    setStatus("idle");
    setError(null);
    setExtraction(null);
    setEnrich(null);
    setValidate(null);
    setValidateExecution(null);
    setPlanningRisk(null);
    setAtpCtpSummary(null);
    setDedupe(null);
    setSummary(null);
    setNextActions(null);
    setCapacityScan(null);
    setWhatIf(null);
    setPromiseSensitivity(null);
    setExecutionPlanningSummary(null);
    setExtractionBatchId(null);
    setEnrichBatchId(null);
    setTraceBatchIds([]);
    setLastApplyConflicts([]);
  }, []);

  const discardAiResults = useCallback(async () => {
    const ids = [
      ...new Set(
        [extractionBatchId, enrichBatchId, ...traceBatchIds].filter((x): x is number => x != null),
      ),
    ];
    for (const batch_id of ids) {
      try {
        await api.orderAiDiscardSuggestionBatch({ batch_id });
      } catch (e) {
        logApiError("useOrderAi.discardSuggestionBatch", e);
      }
    }
    setExtraction(null);
    setEnrich(null);
    setValidate(null);
    setValidateExecution(null);
    setPlanningRisk(null);
    setAtpCtpSummary(null);
    setDedupe(null);
    setSummary(null);
    setNextActions(null);
    setCapacityScan(null);
    setWhatIf(null);
    setPromiseSensitivity(null);
    setExecutionPlanningSummary(null);
    setExtractionBatchId(null);
    setEnrichBatchId(null);
    setTraceBatchIds([]);
    setLastApplyConflicts([]);
    setError(null);
    setStatus("idle");
  }, [extractionBatchId, enrichBatchId, traceBatchIds]);

  const withGate = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (inflight.current) return undefined;
    inflight.current = true;
    try {
      return await fn();
    } finally {
      inflight.current = false;
    }
  }, []);

  const runExtract = useCallback(
    async (file: File, orderId?: number) => {
      return withGate(async () => {
        setError(null);
        setStatus("processing");
        try {
          const wrap = await api.orderAiExtract(file, orderId);
          setExtraction(wrap.extraction);
          setExtractionBatchId(wrap.suggestion_batch_id ?? null);
          const partial =
            wrap.extraction.warnings.length > 0 ||
            Object.keys(wrap.extraction.fields).length === 0 ||
            wrap.extraction.unmapped_text.length > 0;
          setStatus(wrap.extraction.success ? (partial ? "partial" : "success") : "failed");
          if (!wrap.extraction.success) setError("No data could be extracted from this file.");
        } catch (e) {
          logApiError("useOrderAi.extract", e);
          setStatus("failed");
          setError(friendlyAiError(e, "Extraction failed"));
          setExtractionBatchId(null);
        }
      });
    },
    [withGate],
  );

  const runEnrich = useCallback(
    async (body: Parameters<typeof api.orderAiEnrich>[0]) => {
      return withGate(async () => {
        setError(null);
        setStatus("processing");
        try {
          const res = await api.orderAiEnrich(body);
          setEnrich(res);
          setEnrichBatchId(res.suggestion_batch_id ?? null);
          setStatus(res.warnings.length > 0 ? "partial" : "success");
        } catch (e) {
          logApiError("useOrderAi.enrich", e);
          setStatus("failed");
          setError(friendlyAiError(e, "Enrich failed"));
          setEnrichBatchId(null);
        }
      });
    },
    [withGate],
  );

  const runValidate = useCallback(
    async (fields: Record<string, unknown>, orderId?: number | null) => {
      return withGate(async () => {
        setError(null);
        setStatus("processing");
        try {
          const res = await api.orderAiValidate({
            fields,
            order_id: orderId ?? undefined,
          });
          setValidate(res);
          pushTraceId(res.suggestion_batch_id);
          setStatus(res.issues.some((i) => i.severity === "error") ? "partial" : "success");
        } catch (e) {
          logApiError("useOrderAi.validate", e);
          setStatus("failed");
          setError(friendlyAiError(e, "Validate failed"));
        }
      });
    },
    [withGate, pushTraceId],
  );

  const runDedupe = useCallback(
    async (fields: Record<string, unknown>, excludeOrderId?: number | null) => {
      return withGate(async () => {
        setError(null);
        setStatus("processing");
        try {
          const res = await api.orderAiDedupe({
            fields,
            exclude_order_id: excludeOrderId ?? undefined,
          });
          setDedupe(res);
          pushTraceId(res.suggestion_batch_id);
          setStatus("success");
        } catch (e) {
          logApiError("useOrderAi.dedupe", e);
          setStatus("failed");
          setError(friendlyAiError(e, "Dedupe failed"));
        }
      });
    },
    [withGate, pushTraceId],
  );

  const runValidateExecution = useCallback(
    async (fields: Record<string, unknown>, orderId?: number | null) => {
      return withGate(async () => {
        setError(null);
        setStatus("processing");
        try {
          const res = await api.orderAiValidateExecution({
            fields,
            order_id: orderId ?? undefined,
            include_promise_snapshot: true,
          });
          setValidateExecution(res);
          pushTraceId(res.suggestion_batch_id);
          setStatus(res.issues.some((i) => i.severity === "error") ? "partial" : "success");
        } catch (e) {
          logApiError("useOrderAi.validateExecution", e);
          setStatus("failed");
          setError(friendlyAiError(e, "Execution validation failed"));
        }
      });
    },
    [withGate, pushTraceId],
  );

  const runPlanningRiskCheck = useCallback(
    async (orderId: number) => {
      return withGate(async () => {
        setError(null);
        setStatus("processing");
        try {
          const res = await api.orderAiPlanningRiskCheck({ order_id: orderId });
          setPlanningRisk(res);
          pushTraceId(res.suggestion_batch_id);
          setStatus(res.risk_band === "high" ? "partial" : "success");
        } catch (e) {
          logApiError("useOrderAi.planningRisk", e);
          setStatus("failed");
          setError(friendlyAiError(e, "Planning risk check failed"));
        }
      });
    },
    [withGate, pushTraceId],
  );

  const runAtpCtpSummary = useCallback(
    async (orderId: number) => {
      return withGate(async () => {
        setError(null);
        setStatus("processing");
        try {
          const res = await api.orderAiAtpCtpSummary({ order_id: orderId });
          setAtpCtpSummary(res);
          pushTraceId(res.suggestion_batch_id);
          setStatus(res.atp_ok && res.ctp_ok ? "success" : "partial");
        } catch (e) {
          logApiError("useOrderAi.atpCtpSummary", e);
          setStatus("failed");
          setError(friendlyAiError(e, "ATP/CTP summary failed"));
        }
      });
    },
    [withGate, pushTraceId],
  );

  const runSummary = useCallback(
    async (orderId: number) => {
      return withGate(async () => {
        setError(null);
        setStatus("processing");
        try {
          const res = await api.orderAiSummary(orderId);
          setSummary(res);
          pushTraceId(res.suggestion_batch_id);
          setStatus("success");
        } catch (e) {
          logApiError("useOrderAi.summary", e);
          setStatus("failed");
          setError(friendlyAiError(e, "Summary failed"));
        }
      });
    },
    [withGate, pushTraceId],
  );

  const runNextActions = useCallback(
    async (orderId: number, includePlanningContext = false) => {
      return withGate(async () => {
        setError(null);
        setStatus("processing");
        try {
          const res = await api.orderAiNextActions(orderId, includePlanningContext);
          setNextActions(res);
          pushTraceId(res.suggestion_batch_id);
          setStatus("success");
        } catch (e) {
          logApiError("useOrderAi.nextActions", e);
          setStatus("failed");
          setError(friendlyAiError(e, "Next actions failed"));
        }
      });
    },
    [withGate, pushTraceId],
  );

  const runCapacityBottleneckScan = useCallback(
    async (orderId: number) => {
      return withGate(async () => {
        setError(null);
        setStatus("processing");
        try {
          const res = await api.orderAiCapacityBottleneckScan({ order_id: orderId });
          setCapacityScan(res);
          pushTraceId(res.suggestion_batch_id);
          setStatus(res.severity_score >= 50 ? "partial" : "success");
        } catch (e) {
          logApiError("useOrderAi.capacityBottleneckScan", e);
          setStatus("failed");
          setError(friendlyAiError(e, "Capacity scan failed"));
        }
      });
    },
    [withGate, pushTraceId],
  );

  const runWhatIfSimulation = useCallback(
    async (
      orderId: number,
      opts?: {
        delivery_date_shift_days?: number;
        quantity_scale_pct?: number | null;
        capacity_load_pct?: number | null;
        material_assumption?: "as_is" | "strict" | "relaxed";
      },
    ) => {
      return withGate(async () => {
        setError(null);
        setStatus("processing");
        try {
          const res = await api.orderAiWhatIfSimulation({
            order_id: orderId,
            delivery_date_shift_days: opts?.delivery_date_shift_days ?? 0,
            quantity_scale_pct: opts?.quantity_scale_pct,
            capacity_load_pct: opts?.capacity_load_pct,
            material_assumption: opts?.material_assumption ?? "as_is",
          });
          setWhatIf(res);
          pushTraceId(res.suggestion_batch_id);
          setStatus(res.scenario_readiness_score >= 55 ? "success" : "partial");
        } catch (e) {
          logApiError("useOrderAi.whatIfSimulation", e);
          setStatus("failed");
          setError(friendlyAiError(e, "What-if simulation failed"));
        }
      });
    },
    [withGate, pushTraceId],
  );

  const runPromiseSensitivityCheck = useCallback(
    async (orderId: number) => {
      return withGate(async () => {
        setError(null);
        setStatus("processing");
        try {
          const res = await api.orderAiPromiseSensitivityCheck({ order_id: orderId });
          setPromiseSensitivity(res);
          pushTraceId(res.suggestion_batch_id);
          setStatus(res.sensitivity_score >= 45 ? "partial" : "success");
        } catch (e) {
          logApiError("useOrderAi.promiseSensitivity", e);
          setStatus("failed");
          setError(friendlyAiError(e, "Promise sensitivity check failed"));
        }
      });
    },
    [withGate, pushTraceId],
  );

  const runExecutionPlanningSummary = useCallback(
    async (orderId: number) => {
      return withGate(async () => {
        setError(null);
        setStatus("processing");
        try {
          const res = await api.orderAiExecutionPlanningSummary({ order_id: orderId });
          setExecutionPlanningSummary(res);
          pushTraceId(res.suggestion_batch_id);
          setStatus("success");
        } catch (e) {
          logApiError("useOrderAi.executionPlanningSummary", e);
          setStatus("failed");
          setError(friendlyAiError(e, "Planning summary failed"));
        }
      });
    },
    [withGate, pushTraceId],
  );

  const markSuggestionDecisions = useCallback(
    async (
      batchId: number,
      decisions: Array<{ field_key: string; decision: "apply" | "reject" | "skip" }>,
    ) => {
      if (decisions.length === 0) return;
      await api.orderAiMarkSuggestionDecisions({ batch_id: batchId, decisions });
    },
    [],
  );

  const applySuggestionsToOrder = useCallback(
    async (
      orderId: number,
      batchId: number,
      items: Array<{ field_key: string; decision: "apply" | "reject" | "skip" }>,
      conflictMode: "overwrite" | "skip_if_different" = "skip_if_different",
    ) => {
      const res = await api.orderAiApplySuggestions({
        batch_id: batchId,
        order_id: orderId,
        items,
        conflict_mode: conflictMode,
      });
      setLastApplyConflicts(res.conflicts ?? []);
      return res;
    },
    [],
  );

  const finalizeSuggestionBatchAfterCreate = useCallback(async (orderId: number, batchId: number) => {
    return api.orderAiFinalizeSuggestionBatchAfterCreate({
      batch_id: batchId,
      order_id: orderId,
    });
  }, []);

  return {
    status,
    error,
    extraction,
    enrich,
    validate,
    validateExecution,
    planningRisk,
    atpCtpSummary,
    dedupe,
    summary,
    nextActions,
    capacityScan,
    whatIf,
    promiseSensitivity,
    executionPlanningSummary,
    extractionBatchId,
    enrichBatchId,
    traceBatchIds,
    lastApplyConflicts,
    clear,
    discardAiResults,
    markSuggestionDecisions,
    applySuggestionsToOrder,
    finalizeSuggestionBatchAfterCreate,
    runExtract,
    runEnrich,
    runValidate,
    runValidateExecution,
    runPlanningRiskCheck,
    runAtpCtpSummary,
    runDedupe,
    runSummary,
    runNextActions,
    runCapacityBottleneckScan,
    runWhatIfSimulation,
    runPromiseSensitivityCheck,
    runExecutionPlanningSummary,
  };
}
