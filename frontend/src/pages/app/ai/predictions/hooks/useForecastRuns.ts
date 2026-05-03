import { useCallback, useEffect, useState } from "react";
import { api, type AiForecastRunResponse } from "@/api/client";
import { formatAiError } from "@/pages/app/ai/predictions/utils/formatAiError";

export interface GenerateForecastInput {
  prompt: string;
  horizonDays: number;
  fromDate?: string;
  toDate?: string;
}

export interface ForecastRunFilters {
  forecast_code?: string;
  status?: string[];
  since?: string;
  until?: string;
  min_confidence?: number;
  offset?: number;
}

export function useForecastRuns(limit = 30, filters: ForecastRunFilters = {}) {
  const [runs, setRuns] = useState<AiForecastRunResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.aiListForecastRuns({
        limit,
        forecast_code: filters.forecast_code || undefined,
        status: filters.status?.length ? filters.status : undefined,
        since: filters.since,
        until: filters.until,
        min_confidence: filters.min_confidence,
        offset: filters.offset,
      });
      setRuns(rows);
    } catch (err) {
      setError(formatAiError(err, "Failed to load forecast runs"));
    } finally {
      setLoading(false);
    }
  }, [
    limit,
    filters.forecast_code,
    filters.status,
    filters.since,
    filters.until,
    filters.min_confidence,
    filters.offset,
  ]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const generate = useCallback(
    async (input: GenerateForecastInput) => {
      setGenerating(true);
      setError(null);
      try {
        const created = await api.aiGenerateForecast({
          prompt: input.prompt,
          horizon_days: input.horizonDays,
          from_date: input.fromDate ?? null,
          to_date: input.toDate ?? null,
        });
        setRuns((prev) => [created, ...prev.filter((r) => r.id !== created.id)]);
        return created;
      } catch (err) {
        setError(formatAiError(err, "Failed to generate forecast"));
        throw err;
      } finally {
        setGenerating(false);
      }
    },
    [],
  );

  const removeRunLocal = useCallback((id: number) => {
    setRuns((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return { runs, loading, generating, error, refresh, generate, setError, removeRunLocal, setRuns };
}
