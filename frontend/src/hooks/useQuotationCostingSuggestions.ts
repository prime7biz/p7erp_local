import { useCallback, useState } from "react";
import { api, type QuotationCostingSuggestionBatchOut, type QuotationCostingSuggestionApplyResponse } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function useQuotationCostingSuggestions() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batch, setBatch] = useState<QuotationCostingSuggestionBatchOut | null>(null);
  const [lastApply, setLastApply] = useState<QuotationCostingSuggestionApplyResponse | null>(null);

  const generate = useCallback(async (quotationId: number) => {
    setBusy(true);
    setError(null);
    setLastApply(null);
    try {
      const b = await api.quotationCostingSuggestionsGenerate({ quotation_id: quotationId });
      setBatch(b);
      return b;
    } catch (e) {
      logApiError("quotationCostingSuggestionsGenerate", e);
      setError(e instanceof Error ? e.message : "Failed to generate suggestions");
      throw e;
    } finally {
      setBusy(false);
    }
  }, []);

  const reloadBatch = useCallback(async (batchId: number) => {
    const b = await api.quotationCostingSuggestionsGet(batchId);
    setBatch(b);
    return b;
  }, []);

  const markDecisions = useCallback(
    async (batchId: number, decisions: Array<{ item_id: number; decision: "apply" | "reject" | "skip" }>) => {
      setBusy(true);
      setError(null);
      try {
        await api.quotationCostingSuggestionsMarkDecisions({ batch_id: batchId, decisions });
        await reloadBatch(batchId);
      } catch (e) {
        logApiError("quotationCostingSuggestionsMarkDecisions", e);
        setError(e instanceof Error ? e.message : "Failed to update decisions");
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [reloadBatch],
  );

  const apply = useCallback(
    async (quotationId: number, batchId: number, items: Array<{ item_id: number; decision: "apply" | "reject" | "skip" }>) => {
      setBusy(true);
      setError(null);
      try {
        const res = await api.quotationCostingSuggestionsApply({ quotation_id: quotationId, batch_id: batchId, items });
        setLastApply(res);
        await reloadBatch(batchId);
        return res;
      } catch (e) {
        logApiError("quotationCostingSuggestionsApply", e);
        setError(e instanceof Error ? e.message : "Failed to apply");
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [reloadBatch],
  );

  const discard = useCallback(async (batchId: number) => {
    setBusy(true);
    setError(null);
    try {
      await api.quotationCostingSuggestionsDiscard({ batch_id: batchId });
      setBatch(null);
    } catch (e) {
      logApiError("quotationCostingSuggestionsDiscard", e);
      setError(e instanceof Error ? e.message : "Failed to discard");
      throw e;
    } finally {
      setBusy(false);
    }
  }, []);

  const clear = useCallback(() => {
    setBatch(null);
    setError(null);
    setLastApply(null);
  }, []);

  return {
    busy,
    error,
    batch,
    lastApply,
    generate,
    reloadBatch,
    markDecisions,
    apply,
    discard,
    clear,
    setBatch,
  };
}
