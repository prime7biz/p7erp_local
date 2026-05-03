import type { ForecastTemplateInfo } from "@/pages/app/ai/predictions/utils/templatesStatic";

interface Props {
  templates: ForecastTemplateInfo[];
  disabled: boolean;
  runningKey: string | null;
  onRun: (template: ForecastTemplateInfo) => void;
}

export function QuickForecastActions({ templates, disabled, runningKey, onRun }: Props) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4">
      <h2 className="mb-3 text-sm font-semibold text-text-primary">Quick forecasts</h2>
      <div className="flex flex-wrap gap-2">
        {templates.map((t) => (
          <button
            key={t.forecast_code}
            type="button"
            disabled={disabled}
            onClick={() => onRun(t)}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-primary hover:bg-surface-subtle disabled:opacity-50"
            title={t.required_permission_keys.join(", ")}
          >
            {runningKey === t.forecast_code ? "Running…" : t.forecast_name}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-text-muted">Each run uses your tenant data and appears in the list below.</p>
    </div>
  );
}
