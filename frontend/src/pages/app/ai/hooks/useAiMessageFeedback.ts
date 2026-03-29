import { useCallback, useState } from "react";
import { api, type AiMessageResponse } from "@/api/client";
import { readMessageMeta, readProvenance } from "@/pages/app/ai/utils/aiFormatting";

export type AiFeedbackRating = -1 | 0 | 1;

export interface SubmitAiFeedbackOptions {
  correction_text?: string | null;
  feedback_category?: string | null;
  flagged_for_review?: boolean;
}

/**
 * Submit thumbs / corrections for assistant messages (Phase-2 `ai_feedback`).
 * Pulls trace, intent, route, and provenance hints from `message.content_json` when present.
 */
export function useAiMessageFeedback() {
  const [submittingMessageId, setSubmittingMessageId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const submitFeedback = useCallback(
    async (message: AiMessageResponse, rating: AiFeedbackRating, options?: SubmitAiFeedbackOptions) => {
      if (message.role !== "assistant") {
        setError("Only assistant messages can be rated.");
        return null;
      }
      setError("");
      setSubmittingMessageId(message.id);
      try {
        const meta = readMessageMeta(message);
        const prov = readProvenance(message);
        const toolNames =
          Array.isArray(meta.tool_results) && meta.tool_results.length > 0
            ? meta.tool_results.map((t) => t.tool_name)
            : null;

        const body = {
          message_id: message.id,
          trace_id: typeof meta.request_id === "string" ? meta.request_id : null,
          rating,
          correction_text: options?.correction_text ?? null,
          feedback_category: options?.feedback_category ?? null,
          flagged_for_review: options?.flagged_for_review ?? false,
          detected_intent: typeof meta.intent === "string" ? meta.intent : null,
          route_used:
            typeof meta.primary_route === "string"
              ? meta.primary_route
              : typeof prov?.routes_used?.[0] === "string"
                ? prov.routes_used![0]
                : null,
          tools_used: toolNames,
          retrieval_method:
            prov?.grounding === "vector_retrieval" || prov?.grounding === "hybrid"
              ? prov.grounding
              : null,
          model_used: typeof prov?.model_used === "string" ? prov.model_used : null,
          confidence: typeof prov?.confidence === "number" ? prov.confidence : typeof meta.confidence === "number" ? meta.confidence : null,
        };

        const res = await api.aiSubmitFeedback(body);
        return res;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to send feedback");
        return null;
      } finally {
        setSubmittingMessageId(null);
      }
    },
    []
  );

  const clearError = useCallback(() => setError(""), []);

  return {
    submitFeedback,
    submittingMessageId,
    error,
    clearError,
  };
}
