import { useCallback, useRef, useState } from "react";
import {
  api,
  ApiError,
  type InquiryAiDedupeResponse,
  type InquiryAiEnrichResponse,
  type InquiryAiNextActionsResponse,
  type InquiryAiSummaryResponse,
  type InquiryAiValidateResponse,
} from "@/api/client";
import type { InquiryExtractionResponse } from "@/types/extraction";
import { logApiError } from "@/utils/logApiError";

export type InquiryAiJobStatus = "idle" | "processing" | "success" | "partial" | "failed";
const MAX_INQUIRY_AI_UPLOAD_BYTES = 10 * 1024 * 1024;

function friendlyAiError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.status === 413) {
      return "Document is too large. Please use a file up to 10 MB.";
    }
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

export function useInquiryAi() {
  const [status, setStatus] = useState<InquiryAiJobStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<InquiryExtractionResponse | null>(null);
  const [enrich, setEnrich] = useState<InquiryAiEnrichResponse | null>(null);
  const [validate, setValidate] = useState<InquiryAiValidateResponse | null>(null);
  const [dedupe, setDedupe] = useState<InquiryAiDedupeResponse | null>(null);
  const [summary, setSummary] = useState<InquiryAiSummaryResponse | null>(null);
  const [nextActions, setNextActions] = useState<InquiryAiNextActionsResponse | null>(null);
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
        await api.inquiryAiDiscardSuggestionBatch({ batch_id });
      } catch (e) {
        logApiError("useInquiryAi.discardSuggestionBatch", e);
      }
    }
    setExtraction(null);
    setEnrich(null);
    setValidate(null);
    setDedupe(null);
    setSummary(null);
    setNextActions(null);
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
    async (file: File, inquiryId?: number) => {
      return withGate(async () => {
        setError(null);
        setStatus("processing");
        if (file.size > MAX_INQUIRY_AI_UPLOAD_BYTES) {
          setStatus("failed");
          setError("Document is too large. Please use a file up to 10 MB.");
          setExtractionBatchId(null);
          return;
        }
        try {
          const wrap = await api.inquiryAiExtract(file, inquiryId);
          setExtraction(wrap.extraction);
          setExtractionBatchId(wrap.suggestion_batch_id ?? null);
          const partial =
            wrap.extraction.warnings.length > 0 ||
            Object.keys(wrap.extraction.fields).length === 0 ||
            wrap.extraction.unmapped_text.length > 0;
          setStatus(wrap.extraction.success ? (partial ? "partial" : "success") : "failed");
          if (!wrap.extraction.success) setError("No data could be extracted from this file.");
        } catch (e) {
          logApiError("useInquiryAi.extract", e);
          setStatus("failed");
          setError(friendlyAiError(e, "Extraction failed"));
          setExtractionBatchId(null);
        }
      });
    },
    [withGate],
  );

  const runEnrich = useCallback(
    async (body: Parameters<typeof api.inquiryAiEnrich>[0]) => {
      return withGate(async () => {
        setError(null);
        setStatus("processing");
        try {
          const res = await api.inquiryAiEnrich(body);
          setEnrich(res);
          setEnrichBatchId(res.suggestion_batch_id ?? null);
          setStatus(res.warnings.length > 0 ? "partial" : "success");
        } catch (e) {
          logApiError("useInquiryAi.enrich", e);
          setStatus("failed");
          setError(friendlyAiError(e, "Enrich failed"));
          setEnrichBatchId(null);
        }
      });
    },
    [withGate],
  );

  const runValidate = useCallback(
    async (fields: Record<string, unknown>, inquiryId?: number | null) => {
      return withGate(async () => {
        setError(null);
        setStatus("processing");
        try {
          const res = await api.inquiryAiValidate({
            fields,
            inquiry_id: inquiryId ?? undefined,
          });
          setValidate(res);
          pushTraceId(res.suggestion_batch_id);
          setStatus(res.issues.some((i) => i.severity === "error") ? "partial" : "success");
        } catch (e) {
          logApiError("useInquiryAi.validate", e);
          setStatus("failed");
          setError(friendlyAiError(e, "Validate failed"));
        }
      });
    },
    [withGate, pushTraceId],
  );

  const runDedupe = useCallback(
    async (fields: Record<string, unknown>, excludeInquiryId?: number | null) => {
      return withGate(async () => {
        setError(null);
        setStatus("processing");
        try {
          const res = await api.inquiryAiDedupe({
            fields,
            exclude_inquiry_id: excludeInquiryId ?? undefined,
          });
          setDedupe(res);
          pushTraceId(res.suggestion_batch_id);
          setStatus("success");
        } catch (e) {
          logApiError("useInquiryAi.dedupe", e);
          setStatus("failed");
          setError(friendlyAiError(e, "Dedupe failed"));
        }
      });
    },
    [withGate, pushTraceId],
  );

  const runSummary = useCallback(
    async (inquiryId: number) => {
      return withGate(async () => {
        setError(null);
        setStatus("processing");
        try {
          const res = await api.inquiryAiSummary(inquiryId);
          setSummary(res);
          pushTraceId(res.suggestion_batch_id);
          setStatus("success");
        } catch (e) {
          logApiError("useInquiryAi.summary", e);
          setStatus("failed");
          setError(friendlyAiError(e, "Summary failed"));
        }
      });
    },
    [withGate, pushTraceId],
  );

  const runNextActions = useCallback(
    async (inquiryId: number) => {
      return withGate(async () => {
        setError(null);
        setStatus("processing");
        try {
          const res = await api.inquiryAiNextActions(inquiryId);
          setNextActions(res);
          pushTraceId(res.suggestion_batch_id);
          setStatus("success");
        } catch (e) {
          logApiError("useInquiryAi.nextActions", e);
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
      await api.inquiryAiMarkSuggestionDecisions({ batch_id: batchId, decisions });
    },
    [],
  );

  const applySuggestionsToInquiry = useCallback(
    async (
      inquiryId: number,
      batchId: number,
      items: Array<{ field_key: string; decision: "apply" | "reject" | "skip" }>,
      conflictMode: "overwrite" | "skip_if_different" = "skip_if_different",
    ) => {
      const res = await api.inquiryAiApplySuggestions({
        batch_id: batchId,
        inquiry_id: inquiryId,
        items,
        conflict_mode: conflictMode,
      });
      setLastApplyConflicts(res.conflicts ?? []);
      return res;
    },
    [],
  );

  const finalizeSuggestionBatchAfterCreate = useCallback(async (inquiryId: number, batchId: number) => {
    return api.inquiryAiFinalizeSuggestionBatchAfterCreate({
      batch_id: batchId,
      inquiry_id: inquiryId,
    });
  }, []);

  return {
    status,
    error,
    extraction,
    enrich,
    validate,
    dedupe,
    summary,
    nextActions,
    extractionBatchId,
    enrichBatchId,
    traceBatchIds,
    lastApplyConflicts,
    clear,
    discardAiResults,
    markSuggestionDecisions,
    applySuggestionsToInquiry,
    finalizeSuggestionBatchAfterCreate,
    runExtract,
    runEnrich,
    runValidate,
    runDedupe,
    runSummary,
    runNextActions,
  };
}
