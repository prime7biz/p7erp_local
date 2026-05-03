import { useState } from "react";
import type { AiForecastRunResponse } from "@/api/client";
import { ForecastChart } from "@/pages/app/ai/predictions/charts/renderers/ForecastChart";
import { TemplateContextLink } from "@/pages/app/ai/predictions/utils/templateLinks";

function Pill({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "success" | "warn" | "info" }) {
  const toneClass =
    tone === "success"
      ? "bg-status-success-subtle text-status-success-foreground"
      : tone === "warn"
        ? "bg-status-warning-subtle text-status-warning-foreground"
        : tone === "info"
          ? "bg-status-info-subtle text-status-info-foreground"
          : "bg-surface-raised text-text-secondary";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneClass}`}>{children}</span>;
}

export function ForecastRunCard({
  run,
  onOpen,
}: {
  run: AiForecastRunResponse;
  onOpen?: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const points = Array.isArray((run.result_json as { forecast_points?: unknown }).forecast_points)
    ? ((run.result_json as { forecast_points: unknown[] }).forecast_points as Record<string, unknown>[])
    : [];
  const limitations =
    typeof (run.result_json as { limitations?: unknown }).limitations === "string"
      ? (run.result_json as { limitations: string }).limitations
      : null;
  const confidenceTone =
    run.confidence_score == null
      ? "muted"
      : run.confidence_score >= 0.7
        ? "success"
        : run.confidence_score >= 0.5
          ? "info"
          : "warn";
  const st = String(run.status).toUpperCase();
  const statusTone = st === "SUCCESS" ? "success" : st === "FAILED" ? "warn" : "info";

  return (
    <div className="rounded-lg border border-border bg-surface-subtle p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-semibold text-text-primary">{run.forecast_name}</div>
          <Pill>{run.forecast_code}</Pill>
          <Pill tone={statusTone}>{run.status}</Pill>
          <Pill tone={confidenceTone}>conf {run.confidence_score == null ? "N/A" : run.confidence_score.toFixed(2)}</Pill>
          {(run.source_modules ?? []).map((m) => (
            <Pill key={m}>
              {m}
            </Pill>
          ))}
        </div>
        <div className="text-[11px] text-text-muted">{new Date(run.created_at).toLocaleString()}</div>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-xs text-text-secondary">{run.narrative_explanation || "No explanation."}</p>
      {limitations ? <p className="mt-1 text-[11px] text-status-warning-foreground">Limitations: {limitations}</p> : null}
      <div className="mt-2 max-w-md">
        <ForecastChart run={run} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setExpanded((x) => !x)} className="text-[11px] text-text-secondary underline">
          {expanded ? "Hide" : "Peek"} points ({points.length})
        </button>
        <TemplateContextLink forecastCode={run.forecast_code} />
        {onOpen ? (
          <button type="button" onClick={() => onOpen(run.id)} className="text-[11px] text-brand-primary underline">
            Open details
          </button>
        ) : null}
      </div>
      {expanded && points.length > 0 ? (
        <div className="mt-2 max-h-48 overflow-auto rounded border border-border-subtle bg-surface-raised p-2">
          {points.slice(0, 20).map((p, i) => (
            <div key={i} className="text-[11px] text-text-secondary">
              {Object.entries(p)
                .slice(0, 6)
                .map(([k, v], j, arr) => (
                  <span key={k}>
                    <span className="font-medium">{k}:</span> {String(v ?? "-")}
                    {j < arr.length - 1 ? " | " : ""}
                  </span>
                ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
