import { useCallback, useRef, useState } from "react";
import {
  api,
  ApiError,
  type CustomerAiDedupeResponse,
  type CustomerAiEnrichResponse,
  type CustomerAiNextActionsResponse,
  type CustomerAiNlSearchResponse,
  type CustomerAiSummaryResponse,
  type CustomerAiValidateResponse,
} from "@/api/client";
import type { CustomerExtractionResponse } from "@/types/extraction";
import { logApiError } from "@/utils/logApiError";

export type CustomerAiJobStatus = "idle" | "processing" | "success" | "partial" | "failed";

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

export function useCustomerAi() {
  const [status, setStatus] = useState<CustomerAiJobStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<CustomerExtractionResponse | null>(null);
  const [enrich, setEnrich] = useState<CustomerAiEnrichResponse | null>(null);
  const [validate, setValidate] = useState<CustomerAiValidateResponse | null>(null);
  const [dedupe, setDedupe] = useState<CustomerAiDedupeResponse | null>(null);
  const [summary, setSummary] = useState<CustomerAiSummaryResponse | null>(null);
  const [nextActions, setNextActions] = useState<CustomerAiNextActionsResponse | null>(null);
  const [nlSearch, setNlSearch] = useState<CustomerAiNlSearchResponse | null>(null);
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
    setDedupe(null);
    setSummary(null);
    setNextActions(null);
    setNlSearch(null);
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
        await api.customerAiDiscardSuggestionBatch({ batch_id });
      } catch (e) {
        logApiError("useCustomerAi.discardSuggestionBatch", e);
      }
    }
    setExtraction(null);
    setEnrich(null);
    setValidate(null);
    setDedupe(null);
    setSummary(null);
    setNextActions(null);
    setNlSearch(null);
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
    async (file: File, customerId?: number) => {
      return withGate(async () => {
        setError(null);
        setStatus("processing");
        try {
          const wrap = await api.customerAiExtract(file, customerId);
          setExtraction(wrap.extraction);
          setExtractionBatchId(wrap.suggestion_batch_id ?? null);
          const partial =
            wrap.extraction.warnings.length > 0 ||
            Object.keys(wrap.extraction.fields).length === 0 ||
            wrap.extraction.unmapped_text.length > 0;
          setStatus(wrap.extraction.success ? (partial ? "partial" : "success") : "failed");
          if (!wrap.extraction.success) setError("No data could be extracted from this file.");
        } catch (e) {
          logApiError("useCustomerAi.extract", e);
          setStatus("failed");
          setError(friendlyAiError(e, "Extraction failed"));
          setExtractionBatchId(null);
        }
      });
    },
    [withGate],
  );

  const runEnrich = useCallback(
    async (body: Parameters<typeof api.customerAiEnrich>[0]) => {
      return withGate(async () => {
        setError(null);
        setStatus("processing");
        try {
          const res = await api.customerAiEnrich(body);
          setEnrich(res);
          setEnrichBatchId(res.suggestion_batch_id ?? null);
          setStatus(res.warnings.length > 0 ? "partial" : "success");
        } catch (e) {
          logApiError("useCustomerAi.enrich", e);
          setStatus("failed");
          setError(friendlyAiError(e, "Enrich failed"));
          setEnrichBatchId(null);
        }
      });
    },
    [withGate],
  );

  const runValidate = useCallback(
    async (fields: Record<string, unknown>, customerId?: number | null) => {
      return withGate(async () => {
        setError(null);
        setStatus("processing");
        try {
          const res = await api.customerAiValidate({
            fields,
            customer_id: customerId ?? undefined,
          });
          setValidate(res);
          pushTraceId(res.suggestion_batch_id);
          setStatus(res.issues.some((i) => i.severity === "error") ? "partial" : "success");
        } catch (e) {
          logApiError("useCustomerAi.validate", e);
          setStatus("failed");
          setError(friendlyAiError(e, "Validate failed"));
        }
      });
    },
    [withGate, pushTraceId],
  );

  const runDedupe = useCallback(
    async (fields: Record<string, unknown>, excludeCustomerId?: number | null) => {
      return withGate(async () => {
        setError(null);
        setStatus("processing");
        try {
          const res = await api.customerAiDedupe({
            fields,
            exclude_customer_id: excludeCustomerId ?? undefined,
          });
          setDedupe(res);
          pushTraceId(res.suggestion_batch_id);
          setStatus("success");
        } catch (e) {
          logApiError("useCustomerAi.dedupe", e);
          setStatus("failed");
          setError(friendlyAiError(e, "Dedupe failed"));
        }
      });
    },
    [withGate, pushTraceId],
  );

  const runSummary = useCallback(
    async (customerId: number) => {
      return withGate(async () => {
        setError(null);
        setStatus("processing");
        try {
          const res = await api.customerAiSummary(customerId);
          setSummary(res);
          pushTraceId(res.suggestion_batch_id);
          setStatus("success");
        } catch (e) {
          logApiError("useCustomerAi.summary", e);
          setStatus("failed");
          setError(friendlyAiError(e, "Summary failed"));
        }
      });
    },
    [withGate, pushTraceId],
  );

  const runNextActions = useCallback(
    async (customerId: number) => {
      return withGate(async () => {
        setError(null);
        setStatus("processing");
        try {
          const res = await api.customerAiNextActions(customerId);
          setNextActions(res);
          pushTraceId(res.suggestion_batch_id);
          setStatus("success");
        } catch (e) {
          logApiError("useCustomerAi.nextActions", e);
          setStatus("failed");
          setError(friendlyAiError(e, "Next actions failed"));
        }
      });
    },
    [withGate, pushTraceId],
  );

  const runNlSearch = useCallback(
    async (query: string) => {
      const result = await withGate(async () => {
        setError(null);
        setStatus("processing");
        try {
          const res = await api.customerAiNlSearch(query);
          setNlSearch(res);
          setStatus("success");
          return res;
        } catch (e) {
          logApiError("useCustomerAi.nlSearch", e);
          setStatus("failed");
          setError(friendlyAiError(e, "AI search failed"));
          return null;
        }
      });
      return result === undefined ? null : result;
    },
    [withGate],
  );

  const markSuggestionDecisions = useCallback(
    async (
      batchId: number,
      decisions: Array<{ field_key: string; decision: "apply" | "reject" | "skip" }>,
    ) => {
      if (decisions.length === 0) return;
      await api.customerAiMarkSuggestionDecisions({ batch_id: batchId, decisions });
    },
    [],
  );

  const applySuggestionsToCustomer = useCallback(
    async (
      customerId: number,
      batchId: number,
      items: Array<{ field_key: string; decision: "apply" | "reject" | "skip" }>,
      conflictMode: "overwrite" | "skip_if_different" = "skip_if_different",
    ) => {
      const res = await api.customerAiApplySuggestions({
        batch_id: batchId,
        customer_id: customerId,
        items,
        conflict_mode: conflictMode,
      });
      setLastApplyConflicts(res.conflicts ?? []);
      return res;
    },
    [],
  );

  const finalizeSuggestionBatchAfterCreate = useCallback(
    async (customerId: number, batchId: number) => {
      return api.customerAiFinalizeSuggestionBatchAfterCreate({
        batch_id: batchId,
        customer_id: customerId,
      });
    },
    [],
  );

  return {
    status,
    error,
    extraction,
    enrich,
    validate,
    dedupe,
    summary,
    nextActions,
    nlSearch,
    extractionBatchId,
    enrichBatchId,
    traceBatchIds,
    lastApplyConflicts,
    clear,
    discardAiResults,
    markSuggestionDecisions,
    applySuggestionsToCustomer,
    finalizeSuggestionBatchAfterCreate,
    runExtract,
    runEnrich,
    runValidate,
    runDedupe,
    runSummary,
    runNextActions,
    runNlSearch,
  };
}
