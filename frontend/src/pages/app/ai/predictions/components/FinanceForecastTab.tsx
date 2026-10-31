import { useCallback, useState } from "react";
import { RefreshCw, Wallet } from "lucide-react";
import { api, type AiFinanceForecastResponse } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

/**
 * Finance cash-flow forecast panel (lazy-loaded from AiPredictionsPage).
 */
export function FinanceForecastTab() {
  const [financeHorizon, setFinanceHorizon] = useState(90);
  const [financeForecast, setFinanceForecast] = useState<AiFinanceForecastResponse | null>(null);
  const [financeLoading, setFinanceLoading] = useState(false);

  const runFinanceForecast = useCallback(() => {
    setFinanceLoading(true);
    api
      .aiFinanceForecast({ horizon_days: financeHorizon })
      .then((r) => setFinanceForecast(r))
      .catch((e: unknown) => logApiError("AiPredictions.financeForecast", e))
      .finally(() => setFinanceLoading(false));
  }, [financeHorizon]);

  const points = financeForecast?.projection?.forecast_points ?? [];

  return (
    <section className="rounded-xl border border-border bg-surface-raised p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-brand-primary" aria-hidden />
          <h2 className="text-sm font-semibold text-text-primary">Finance Forecast</h2>
          <span className="text-[10px] uppercase tracking-wide text-text-muted">cash flow + narrative</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-text-muted">
            Horizon (days)
            <input
              type="number"
              min={7}
              max={365}
              value={financeHorizon}
              onChange={(e) => setFinanceHorizon(Number(e.target.value) || 90)}
              className="ml-2 w-20 rounded border border-border px-2 py-1 text-xs"
              aria-label="Forecast horizon in days"
            />
          </label>
          <button
            type="button"
            onClick={runFinanceForecast}
            disabled={financeLoading}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 disabled:opacity-50"
            aria-label="Run finance forecast"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${financeLoading ? "animate-spin" : ""}`} aria-hidden />
            Run forecast
          </button>
        </div>
      </div>
      {financeForecast ? (
        <div className="space-y-3">
          <p className="text-xs text-text-muted">
            Source: {financeForecast.source} · Narrative: {financeForecast.narrative_source}
            {financeForecast.projection?.confidence_score != null
              ? ` · Confidence: ${Math.round(Number(financeForecast.projection.confidence_score) * 100)}%`
              : ""}
          </p>
          <p className="whitespace-pre-wrap text-sm text-text-secondary">{financeForecast.narrative}</p>
          {financeForecast.forecast ? (
            <ul className="grid gap-1 text-xs text-text-muted sm:grid-cols-3">
              {(["month_1", "month_2", "month_3"] as const).map((key) => {
                const m = financeForecast.forecast?.[key];
                if (!m) return null;
                return (
                  <li key={key} className="rounded border border-border px-2 py-1">
                    {key.replace("_", " ")}: in {m.inflow} / out {m.outflow} / net {m.net_cash}
                  </li>
                );
              })}
            </ul>
          ) : null}
          {financeForecast.risks?.length ? (
            <ul className="space-y-1 text-xs" aria-live="polite">
              {financeForecast.risks.map((r, i) => (
                <li
                  key={i}
                  className="rounded border border-status-warning/30 bg-status-warning-subtle/40 px-2 py-1 text-status-warning-foreground"
                >
                  [{r.severity}] {r.description} — {r.mitigation}
                </li>
              ))}
            </ul>
          ) : null}
          {financeForecast.budget_variance_insights?.[0] ? (
            <p className="text-xs text-text-muted">
              {financeForecast.budget_variance_insights[0].message}{" "}
              {financeForecast.budget_variance_insights[0].recommended_action}
            </p>
          ) : null}
          {points.length > 0 ? (
            <ul className="grid gap-1 text-xs text-text-muted sm:grid-cols-2 lg:grid-cols-3">
              {points.slice(0, 6).map((p, i) => (
                <li key={i} className="rounded border border-border px-2 py-1">
                  Period {String(p.period_index ?? i + 1)}: net {String(p.projected_net_cash ?? "—")}
                </li>
              ))}
            </ul>
          ) : null}
          {financeForecast.limitations?.length ? (
            <p className="text-[11px] text-text-muted">{financeForecast.limitations.join(" ")}</p>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-text-muted">
          Runs the cash-flow projection heuristic and optional LLM narrative. No new secrets required.
        </p>
      )}
    </section>
  );
}
