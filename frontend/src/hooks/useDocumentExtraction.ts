import { useCallback, useState } from "react";
import { api, ApiError } from "@/api/client";
import type {
  CustomerExtractionResponse,
  ExtractionStatus,
  InquiryExtractionResponse,
} from "@/types/extraction";
import { logApiError } from "@/utils/logApiError";

type Kind = "customer" | "inquiry";

export function useDocumentExtraction(kind: Kind) {
  const [status, setStatus] = useState<ExtractionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [customerResponse, setCustomerResponse] = useState<CustomerExtractionResponse | null>(null);
  const [inquiryResponse, setInquiryResponse] = useState<InquiryExtractionResponse | null>(null);

  const clear = useCallback(() => {
    setStatus("idle");
    setError(null);
    setCustomerResponse(null);
    setInquiryResponse(null);
  }, []);

  const extract = useCallback(
    async (file: File) => {
      setError(null);
      setStatus("uploading");
      try {
        if (kind === "customer") {
          const res = await api.extractCustomerForm(file);
          setCustomerResponse(res);
          const partial =
            res.warnings.length > 0 ||
            Object.keys(res.fields).length === 0 ||
            res.unmapped_text.length > 0;
          setStatus(res.success ? (partial ? "partial" : "extracted") : "failed");
          if (!res.success) setError("No data could be extracted from this file.");
        } else {
          const res = await api.extractInquiryForm(file);
          setInquiryResponse(res);
          const partial =
            res.warnings.length > 0 ||
            (Object.keys(res.fields).length === 0 && res.items.length === 0) ||
            res.unmapped_text.length > 0;
          setStatus(res.success ? (partial ? "partial" : "extracted") : "failed");
          if (!res.success) setError("No data could be extracted from this file.");
        }
      } catch (e) {
        logApiError("ai-extract", e);
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

  return {
    status,
    error,
    customerResponse,
    inquiryResponse,
    extract,
    clear,
  };
}
