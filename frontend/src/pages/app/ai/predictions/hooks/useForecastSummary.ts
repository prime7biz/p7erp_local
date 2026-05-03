import { useCallback, useEffect, useState } from "react";
import { api, type AiForecastSummaryResponse } from "@/api/client";
import { formatAiError } from "@/pages/app/ai/predictions/utils/formatAiError";

export function useForecastSummary() {
  const [summary, setSummary] = useState<AiForecastSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await api.aiGetForecastSummary();
      setSummary(s);
    } catch (e) {
      setError(formatAiError(e, "Summary unavailable"));
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { summary, loading, error, refresh };
}
