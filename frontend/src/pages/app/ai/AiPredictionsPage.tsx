import { useCallback, useState } from "react";
import { api } from "@/api/client";
import { logApiError } from "@/utils/logApiError";
import { AiForecastRequestPanel } from "@/pages/app/ai/components/AiForecastRequestPanel";
import { HubHeader } from "@/pages/app/ai/predictions/components/HubHeader";
import { QuickForecastActions } from "@/pages/app/ai/predictions/components/QuickForecastActions";
import { AiForecastRunsList } from "@/pages/app/ai/predictions/components/AiForecastRunsList";
import { PredictionsKpiStrip } from "@/pages/app/ai/predictions/components/PredictionsKpiStrip";
import { ForecastFilters } from "@/pages/app/ai/predictions/components/filters/ForecastFilters";
import { AnomaliesStrip } from "@/pages/app/ai/predictions/components/AnomaliesStrip";
import { PredictionsCrossLinks } from "@/pages/app/ai/predictions/components/PredictionsCrossLinks";
import { ForecastRunDrawer } from "@/pages/app/ai/predictions/components/ForecastRunDrawer";
import { useForecastRuns, type ForecastRunFilters } from "@/pages/app/ai/predictions/hooks/useForecastRuns";
import { useForecastTemplates } from "@/pages/app/ai/predictions/hooks/useForecastTemplates";
import { useForecastSummary } from "@/pages/app/ai/predictions/hooks/useForecastSummary";
import { usePollWhilePending } from "@/pages/app/ai/predictions/hooks/usePollingRun";
import type { AiForecastRunResponse } from "@/api/client";
import type { ForecastTemplateInfo } from "@/pages/app/ai/predictions/utils/templatesStatic";
import { RefreshCw, TrendingUp } from "lucide-react";

const ACTIVE = new Set(["PENDING", "RUNNING"]);

export function AiPredictionsPage() {
  const [filters, setFilters] = useState<ForecastRunFilters>({});
  const { templates } = useForecastTemplates();
  const { summary, loading: summaryLoading, refresh: refreshSummary } = useForecastSummary();
  const {
    runs,
    loading: runsLoading,
    generating,
    error: runsError,
    refresh,
    generate,
    setError: setRunsError,
    removeRunLocal,
    setRuns,
  } = useForecastRuns(30, filters);
  const [profitNarrative, setProfitNarrative] = useState<string | null>(null);
  const [profitLoading, setProfitLoading] = useState(false);
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const [drawerId, setDrawerId] = useState<number | null>(null);
  const [polledRun, setPolledRun] = useState<AiForecastRunResponse | null>(null);

  usePollWhilePending(polledRun, (r) => {
    setPolledRun(r);
    setRuns((prev) => prev.map((x) => (x.id === r.id ? r : x)));
  });

  const refreshProfitability = useCallback(() => {
    setProfitLoading(true);
    api
      .getDashboardAiProfitability()
      .then((r) => setProfitNarrative(r.narrative))
      .catch((e) => logApiError("AiPredictions.profitability", e))
      .finally(() => setProfitLoading(false));
  }, []);

  const refreshAll = useCallback(() => {
    void refresh();
    void refreshSummary();
    refreshProfitability();
  }, [refresh, refreshSummary, refreshProfitability]);

  const onGenerateCustom = async (input: { prompt: string; horizonDays: number; fromDate?: string; toDate?: string }) => {
    try {
      const created = await generate(input);
      if (created && ACTIVE.has(String(created.status).toUpperCase())) {
        setPolledRun(created);
      }
    } catch {
      /* handled in hook */
    }
  };

  const onRunQuick = async (t: ForecastTemplateInfo) => {
    setRunningKey(t.forecast_code);
    try {
      const created = await generate({ prompt: t.example_prompt, horizonDays: t.default_horizon_days });
      if (created && ACTIVE.has(String(created.status).toUpperCase())) {
        setPolledRun(created);
      }
    } catch {
      /* handled */
    } finally {
      setRunningKey(null);
    }
  };

  return (
    <div className="space-y-6">
      <HubHeader onRefreshAll={refreshAll} refreshing={runsLoading || profitLoading || summaryLoading} />
      {runsError ? (
        <div className="rounded-lg border border-status-danger-subtle bg-status-danger-subtle p-3 text-xs text-status-danger-foreground">
          {runsError}
          <button type="button" className="ml-2 underline" onClick={() => setRunsError(null)}>
            dismiss
          </button>
        </div>
      ) : null}
      <PredictionsKpiStrip summary={summary} loading={summaryLoading} />
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <AiForecastRequestPanel disabled={generating} onGenerate={onGenerateCustom} />
          <QuickForecastActions templates={templates} disabled={generating} runningKey={runningKey} onRun={onRunQuick} />
          <ForecastFilters templates={templates} value={filters} onChange={setFilters} />
          <AiForecastRunsList
            runs={runs}
            loading={runsLoading}
            onOpen={(id) => {
              setDrawerId(id);
            }}
          />
        </div>
        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-surface-raised p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-status-success-foreground" />
                <h2 className="text-sm font-semibold text-text-primary">Profitability (Gemini)</h2>
              </div>
              <button
                type="button"
                onClick={refreshProfitability}
                disabled={profitLoading}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${profitLoading ? "animate-spin" : ""}`} /> Refresh
              </button>
            </div>
            {profitNarrative ? (
              <p className="whitespace-pre-wrap text-sm text-text-secondary">{profitNarrative}</p>
            ) : (
              <p className="text-xs text-text-muted">Click Refresh to analyze quotation and trade margin signals.</p>
            )}
          </div>
          <AnomaliesStrip />
        </aside>
      </section>
      <PredictionsCrossLinks />
      <ForecastRunDrawer
        runId={drawerId}
        onClose={() => setDrawerId(null)}
        onDeleted={(id) => {
          removeRunLocal(id);
          setDrawerId(null);
        }}
        onUpdated={(r) => {
          setRuns((prev) => prev.map((x) => (x.id === r.id ? r : x)));
        }}
      />
    </div>
  );
}
