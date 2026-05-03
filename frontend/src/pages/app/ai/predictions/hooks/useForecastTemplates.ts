import { useCallback, useEffect, useState } from "react";
import { api, type AiForecastTemplateInfo } from "@/api/client";
import { STATIC_FORECAST_TEMPLATES, type ForecastTemplateInfo } from "@/pages/app/ai/predictions/utils/templatesStatic";
import { formatAiError } from "@/pages/app/ai/predictions/utils/formatAiError";

export function useForecastTemplates() {
  const [templates, setTemplates] = useState<ForecastTemplateInfo[]>(STATIC_FORECAST_TEMPLATES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await api.aiListForecastTemplates();
      const mapped: ForecastTemplateInfo[] = rows.map((t: AiForecastTemplateInfo) => ({
        forecast_code: t.forecast_code,
        forecast_name: t.forecast_name,
        source_modules: t.source_modules,
        required_permission_keys: t.required_permission_keys,
        example_prompt: t.example_prompt,
        default_horizon_days: t.default_horizon_days,
      }));
      setTemplates(mapped.length ? mapped : STATIC_FORECAST_TEMPLATES);
    } catch (e) {
      setError(formatAiError(e, "Using offline template list"));
      setTemplates(STATIC_FORECAST_TEMPLATES);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { templates, loading, error, reload: load };
}
