import { useCallback, useState } from "react";
import { api, ApiError, type HrDocExtractionResponse } from "@/api/client";
import type { ExtractionStatus } from "@/types/extraction";
import { logApiError } from "@/utils/logApiError";

export type HrDocExtractionKind = "cv" | "national-id" | "medical-certificate" | "birth-certificate";

const extractors: Record<HrDocExtractionKind, (file: File) => Promise<HrDocExtractionResponse>> = {
  cv: api.extractHrCv,
  "national-id": api.extractHrNationalId,
  "medical-certificate": api.extractHrMedicalCertificate,
  "birth-certificate": api.extractHrBirthCertificate,
};

/**
 * Thin extraction hook for HR onboarding documents (CV, NID, medical, birth cert).
 */
export function useHrDocExtraction(kind: HrDocExtractionKind) {
  const [status, setStatus] = useState<ExtractionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<HrDocExtractionResponse | null>(null);

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
        const res = await extractors[kind](file);
        setResponse(res);
        const partial =
          res.warnings.length > 0 ||
          Object.keys(res.fields).length === 0 ||
          res.unmapped_text.length > 0;
        setStatus(res.success ? (partial ? "partial" : "extracted") : "failed");
        if (!res.success) setError("No data could be extracted from this file.");
      } catch (e) {
        logApiError(`ai-extract-hr-${kind}`, e);
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
