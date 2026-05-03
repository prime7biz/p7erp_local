import type { ForecastTemplateInfo } from "@/pages/app/ai/predictions/utils/templatesStatic";
import type { ForecastRunFilters } from "@/pages/app/ai/predictions/hooks/useForecastRuns";

interface Props {
  templates: ForecastTemplateInfo[];
  value: ForecastRunFilters;
  onChange: (next: ForecastRunFilters) => void;
}

const STATUS_OPTIONS = ["SUCCESS", "FAILED", "PENDING", "RUNNING"];

export function ForecastFilters({ templates, value, onChange }: Props) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4">
      <h2 className="mb-3 text-sm font-semibold text-text-primary">Filters</h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[11px] text-text-muted">
          Template
          <select
            className="rounded-md border border-border bg-surface-subtle px-2 py-1 text-xs text-text-primary"
            value={value.forecast_code ?? ""}
            onChange={(e) => onChange({ ...value, forecast_code: e.target.value || undefined })}
          >
            <option value="">All</option>
            {templates.map((t) => (
              <option key={t.forecast_code} value={t.forecast_code}>
                {t.forecast_name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-text-muted">
          Min confidence
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            className="w-24 rounded-md border border-border bg-surface-subtle px-2 py-1 text-xs"
            value={value.min_confidence ?? ""}
            placeholder="any"
            onChange={(e) => {
              const v = e.target.value;
              onChange({
                ...value,
                min_confidence: v === "" ? undefined : Math.min(1, Math.max(0, Number(v))),
              });
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-text-muted">
          Since
          <input
            type="date"
            className="rounded-md border border-border bg-surface-subtle px-2 py-1 text-xs"
            value={value.since?.slice(0, 10) ?? ""}
            onChange={(e) => onChange({ ...value, since: e.target.value ? `${e.target.value}T00:00:00Z` : undefined })}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-text-muted">
          Until
          <input
            type="date"
            className="rounded-md border border-border bg-surface-subtle px-2 py-1 text-xs"
            value={value.until?.slice(0, 10) ?? ""}
            onChange={(e) => onChange({ ...value, until: e.target.value ? `${e.target.value}T23:59:59Z` : undefined })}
          />
        </label>
        <div className="flex flex-col gap-1 text-[11px] text-text-muted">
          <span>Status</span>
          <div className="flex flex-wrap gap-1">
            {STATUS_OPTIONS.map((s) => {
              const active = value.status?.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    const next = new Set(value.status ?? []);
                    if (next.has(s)) next.delete(s);
                    else next.add(s);
                    const arr = [...next];
                    onChange({ ...value, status: arr.length ? arr : undefined });
                  }}
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${
                    active ? "border-brand-primary bg-brand-primary/10 text-text-primary" : "border-border text-text-muted"
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          className="rounded-md border border-border px-2 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
          onClick={() => onChange({})}
        >
          Clear filters
        </button>
      </div>
    </div>
  );
}
