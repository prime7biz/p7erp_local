import { useCallback, useRef, useState } from "react";
import {
  api,
  ApiError,
  type QuotationAiDedupeResponse,
  type QuotationAiEnrichResponse,
  type QuotationAiNextActionsResponse,
  type QuotationAiSummaryResponse,
  type QuotationAiValidateResponse,
} from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export type QuotationAiJobStatus = "idle" | "processing" | "success" | "partial" | "failed";

function friendlyAiError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.status === 429) {
      return "Too many AI requests in a short window. Please wait a moment and try again.";
    }
    if (e.status === 504) {
      return "The AI service took too long to respond. Try again with a smaller request.";
    }
    if (e.status === 403 && e.code === "AI_CAPABILITY_DENIED") {
      return e.message;
    }
    return e.message || fallback;
  }
  return e instanceof Error ? e.message : fallback;
}

export function useQuotationAi() {
  const [status, setStatus] = useState<QuotationAiJobStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [enrich, setEnrich] = useState<QuotationAiEnrichResponse | null>(null);
  const [validate, setValidate] = useState<QuotationAiValidateResponse | null>(null);
  const [dedupe, setDedupe] = useState<QuotationAiDedupeResponse | null>(null);
  const [summary, setSummary] = useState<QuotationAiSummaryResponse | null>(null);
  const [nextActions, setNextActions] = useState<QuotationAiNextActionsResponse | null>(null);
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
    setEnrich(null);
    setValidate(null);
    setDedupe(null);
    setSummary(null);
    setNextActions(null);
    setEnrichBatchId(null);
    setTraceBatchIds([]);
    setLastApplyConflicts([]);
  }, []);

  const discardAiResults = useCallback(async () => {
    const ids = [
      ...new Set(
        [enrichBatchId, ...traceBatchIds].filter((x): x is number => x != null),
      ),
    ];
    for (const batch_id of ids) {
      try {
        await api.quotationAiDiscardSuggestionBatch({ batch_id });
      } catch (e) {
        logApiError("useQuotationAi.discardSuggestionBatch", e);
      }
    }
    setEnrich(null);
    setValidate(null);
    setDedupe(null);
    setSummary(null);
    setNextActions(null);
    setEnrichBatchId(null);
    setTraceBatchIds([]);
    setLastApplyConflicts([]);
    setError(null);
    setStatus("idle");
  }, [enrichBatchId, traceBatchIds]);

  const withGate = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (inflight.current) return undefined;
    inflight.current = true;
    try {
      return await fn();
    } finally {
      inflight.current = false;
    }
  }, []);

  const runEnrich = useCallback(
    async (body: Parameters<typeof api.quotationAiEnrich>[0]) => {
      return withGate(async () => {
        setError(null);
        setStatus("processing");
        try {
          const res = await api.quotationAiEnrich(body);
          setEnrich(res);
          setEnrichBatchId(res.suggestion_batch_id ?? null);
          setStatus(res.warnings.length > 0 ? "partial" : "success");
        } catch (e) {
          logApiError("useQuotationAi.enrich", e);
          setStatus("failed");
          setError(friendlyAiError(e, "Enrich failed"));
          setEnrichBatchId(null);
        }
      });
    },
    [withGate],
  );

  const runValidate = useCallback(
    async (fields: Record<string, unknown>, quotationId?: number | null) => {
      return withGate(async () => {
        setError(null);
        setStatus("processing");
        try {
          const res = await api.quotationAiValidate({
            fields,
            quotation_id: quotationId ?? undefined,
          });
          setValidate(res);
          pushTraceId(res.suggestion_batch_id);
          setStatus(res.issues.some((i) => i.severity === "error") ? "partial" : "success");
        } catch (e) {
          logApiError("useQuotationAi.validate", e);
          setStatus("failed");
          setError(friendlyAiError(e, "Validate failed"));
        }
      });
    },
    [withGate, pushTraceId],
  );

  const runDedupe = useCallback(
    async (fields: Record<string, unknown>, excludeQuotationId?: number | null) => {
      return withGate(async () => {
        setError(null);
        setStatus("processing");
        try {
          const res = await api.quotationAiDedupe({
            fields,
            exclude_quotation_id: excludeQuotationId ?? undefined,
          });
          setDedupe(res);
          pushTraceId(res.suggestion_batch_id);
          setStatus("success");
        } catch (e) {
          logApiError("useQuotationAi.dedupe", e);
          setStatus("failed");
          setError(friendlyAiError(e, "Dedupe failed"));
        }
      });
    },
    [withGate, pushTraceId],
  );

  const runSummary = useCallback(
    async (quotationId: number) => {
      return withGate(async () => {
        setError(null);
        setStatus("processing");
        try {
          const res = await api.quotationAiSummary(quotationId);
          setSummary(res);
          pushTraceId(res.suggestion_batch_id);
          setStatus("success");
        } catch (e) {
          logApiError("useQuotationAi.summary", e);
          setStatus("failed");
          setError(friendlyAiError(e, "Summary failed"));
        }
      });
    },
    [withGate, pushTraceId],
  );

  const runNextActions = useCallback(
    async (quotationId: number) => {
      return withGate(async () => {
        setError(null);
        setStatus("processing");
        try {
          const res = await api.quotationAiNextActions(quotationId);
          setNextActions(res);
          pushTraceId(res.suggestion_batch_id);
          setStatus("success");
        } catch (e) {
          logApiError("useQuotationAi.nextActions", e);
          setStatus("failed");
          setError(friendlyAiError(e, "Next actions failed"));
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
      await api.quotationAiMarkSuggestionDecisions({ batch_id: batchId, decisions });
    },
    [],
  );

  const applySuggestionsToQuotation = useCallback(
    async (
      quotationId: number,
      batchId: number,
      items: Array<{ field_key: string; decision: "apply" | "reject" | "skip" }>,
      conflictMode: "overwrite" | "skip_if_different" = "skip_if_different",
    ) => {
      const res = await api.quotationAiApplySuggestions({
        batch_id: batchId,
        quotation_id: quotationId,
        items,
        conflict_mode: conflictMode,
      });
      setLastApplyConflicts(res.conflicts ?? []);
      return res;
    },
    [],
  );

  const finalizeSuggestionBatchAfterCreate = useCallback(async (quotationId: number, batchId: number) => {
    return api.quotationAiFinalizeSuggestionBatchAfterCreate({
      batch_id: batchId,
      quotation_id: quotationId,
    });
  }, []);

  return {
    status,
    error,
    enrich,
    validate,
    dedupe,
    summary,
    nextActions,
    enrichBatchId,
    traceBatchIds,
    lastApplyConflicts,
    clear,
    discardAiResults,
    markSuggestionDecisions,
    applySuggestionsToQuotation,
    finalizeSuggestionBatchAfterCreate,
    runEnrich,
    runValidate,
    runDedupe,
    runSummary,
    runNextActions,
  };
}
