import { useCallback, useState } from "react";
import { api } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function useAIPlanningInsights() {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.aiAnalyzePipeline();
      setSummary(r.summary);
    } catch (e) {
      logApiError(e, "useAIPlanningInsights.refresh");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return { summary, loading, refresh };
}
