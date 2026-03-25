import { useCallback, useEffect, useState } from "react";
import { api, type AiForecastRunResponse } from "@/api/client";
import { logApiError } from "@/utils/logApiError";
import { AiForecastRunsPanel } from "./components/AiForecastRunsPanel";
import { RefreshCw, TrendingUp } from "lucide-react";

export function AiPredictionsPage() {
  const [profitNarrative, setProfitNarrative] = useState<string | null>(null);
  const [profitLoading, setProfitLoading] = useState(false);
  const [forecastRuns, setForecastRuns] = useState<AiForecastRunResponse[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [genLoading, setGenLoading] = useState<string | null>(null);

  const loadRuns = useCallback(() => {
    setRunsLoading(true);
    api
      .aiListForecastRuns({ limit: 20 })
      .then(setForecastRuns)
      .catch((e) => logApiError("AiPredictions.forecastRuns", e))
      .finally(() => setRunsLoading(false));
  }, []);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  const refreshProfitability = () => {
    setProfitLoading(true);
    api
      .getDashboardAiProfitability()
      .then((r) => setProfitNarrative(r.narrative))
      .catch((e) => logApiError("AiPredictions.profitability", e))
      .finally(() => setProfitLoading(false));
  };

  const runForecast = async (prompt: string, key: string) => {
    setGenLoading(key);
    try {
      await api.aiGenerateForecast({ prompt, horizon_days: 30 });
      await loadRuns();
    } catch (e) {
      logApiError("AiPredictions.generateForecast", e);
    } finally {
      setGenLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">AI Predictions</h1>
        <p className="text-sm text-text-muted">
          Profitability narrative (Gemini), cash flow / inventory / production forecasts, and recent forecast runs.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-status-success-foreground" />
            <h2 className="text-sm font-semibold text-text-primary">Profitability analysis (Gemini)</h2>
          </div>
          <button
            type="button"
            onClick={() => void refreshProfitability()}
            disabled={profitLoading}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${profitLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
        {profitNarrative ? (
          <p className="text-sm text-text-secondary whitespace-pre-wrap">{profitNarrative}</p>
        ) : (
          <p className="text-xs text-text-muted">Click Refresh to analyze quotation and trade margin signals.</p>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <h2 className="text-sm font-semibold text-text-primary mb-3">Quick forecasts</h2>
        <p className="text-xs text-text-muted mb-3">
          Each run uses your tenant data and stores a row below (rule-based projection + narrative).
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            { key: "cash", label: "Cash flow projection", prompt: "Generate cash flow projection" },
            { key: "inv", label: "Inventory shortage", prompt: "Generate inventory shortage forecast" },
            { key: "prod", label: "Production output", prompt: "Generate production output forecast" },
            { key: "ship", label: "Shipment delay risk", prompt: "Generate shipment delay risk projection" },
          ].map((x) => (
            <button
              key={x.key}
              type="button"
              disabled={genLoading !== null}
              onClick={() => void runForecast(x.prompt, x.key)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-primary hover:bg-surface-subtle disabled:opacity-50"
            >
              {genLoading === x.key ? "Running…" : x.label}
            </button>
          ))}
        </div>
      </div>

      <AiForecastRunsPanel runs={forecastRuns} loading={runsLoading} />
    </div>
  );
}
