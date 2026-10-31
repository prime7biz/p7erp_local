import { useCallback, useState } from "react";
import { api, ApiError } from "@/api/client";
import type {
  ExtractionStatus,
  LcExtractionResponse,
  ShippingDocExtractionResponse,
} from "@/types/extraction";
import { logApiError } from "@/utils/logApiError";

type Kind = "lc" | "shipping";

/**
 * Thin extraction hook for LC / shipping-doc autofill (Phase 4 MVP).
 * Reuses the same status + review pattern as customer/inquiry extraction.
 */
export function useCommercialDocExtraction(kind: "lc"): {
  status: ExtractionStatus;
  error: string | null;
  response: LcExtractionResponse | null;
  extract: (file: File) => Promise<void>;
  clear: () => void;
};
export function useCommercialDocExtraction(kind: "shipping"): {
  status: ExtractionStatus;
  error: string | null;
  response: ShippingDocExtractionResponse | null;
  extract: (file: File) => Promise<void>;
  clear: () => void;
};
export function useCommercialDocExtraction(kind: Kind) {
  const [status, setStatus] = useState<ExtractionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<LcExtractionResponse | ShippingDocExtractionResponse | null>(null);

  const clear = useCallback(() => {
    setStatus("idle");
    setError(null);
    setResponse(null);
  }, []);

  const extract = useCallback(
    async (file: File) => {
      setError(null);
      setStatus("uploading");
      try {
        const res =
          kind === "lc" ? await api.extractLcDocument(file) : await api.extractShippingDocument(file);
        setResponse(res);
        const partial =
          res.warnings.length > 0 ||
          Object.keys(res.fields).length === 0 ||
          res.unmapped_text.length > 0;
        setStatus(res.success ? (partial ? "partial" : "extracted") : "failed");
        if (!res.success) setError("No data could be extracted from this file.");
      } catch (e) {
        logApiError(`ai-extract-${kind}`, e);
        setStatus("failed");
        if (e instanceof ApiError) {
          const suffix = e.status === 429 ? " Try again in a minute." : "";
          setError(`${e.message}${suffix}`);
        } else {
          setError(e instanceof Error ? e.message : "Extraction request failed.");
        }
      }
    },
    [kind],
  );

  return { status, error, response, extract, clear };
}
