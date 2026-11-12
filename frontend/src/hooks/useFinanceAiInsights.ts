import { useCallback, useRef, useState } from "react";
import { financeAiInsightsApi, type CommentaryRequest, type CommentaryResponse } from "@/api/financeAiInsights";
import { isFinanceAiInsightsV2Enabled } from "@/components/finance/hubs/financeHubs";
import { useAuth } from "@/context/AuthContext";
import { logApiError } from "@/utils/logApiError";

/** True when this company has switched "Explain this report" on (Settings -> Configuration -> Finance). */
export function useFinanceAiInsightsEnabled(): boolean {
  return isFinanceAiInsightsV2Enabled(useAuth().me?.feature_flags);
}

export interface CommentaryState {
  data: CommentaryResponse | null;
  loading: boolean;
  error: string;
  /** HTTP status of the failed request (403 = not allowed, 404 = switched off), 0 when unknown. */
  errorStatus: number;
  run: (body: CommentaryRequest) => void;
  reset: () => void;
}

/** One commentary request at a time; a newer request (or reset) always wins. */
export function useFinanceCommentary(): CommentaryState {
  const [data, setData] = useState<CommentaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorStatus, setErrorStatus] = useState(0);
  const seq = useRef(0);

  const run = useCallback((body: CommentaryRequest) => {
    const id = ++seq.current;
    setLoading(true);
    setError("");
    setErrorStatus(0);
    setData(null);
    financeAiInsightsApi
      .getCommentary(body)
      .then((res) => {
        if (id === seq.current) setData(res);
      })
      .catch((e: unknown) => {
        logApiError("useFinanceCommentary", e);
        if (id !== seq.current) return;
        setError(e instanceof Error ? e.message : "Failed to load");
        setErrorStatus(typeof (e as { status?: unknown }).status === "number" ? (e as { status: number }).status : 0);
      })
      .finally(() => {
        if (id === seq.current) setLoading(false);
      });
  }, []);

  const reset = useCallback(() => {
    seq.current += 1;
    setData(null);
    setLoading(false);
    setError("");
    setErrorStatus(0);
  }, []);

  return { data, loading, error, errorStatus, run, reset };
}
