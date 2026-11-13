import { useState } from "react";

import type { CompareResponse, ForwardBucket, ForwardScenario } from "@/api/mfgAdvancedPlanning";
import { useMfgForecastDemand, useMfgScenarioCompare } from "@/hooks/useMfgAdvancedPlanning";

import { formatDecimal, formatPercent } from "../formatDecimal";
import { Chip, PanelCard, ReasonChips } from "../IntelligenceUi";
import { EmptyState, ErrorBox, ErrorList, NoticeBox, SelectField, TextField, labelCls, primaryBtn, secondaryBtn } from "../phase2/Phase2Ui";
import {
  BASES,
  BASIS_LABEL,
  MAX_COMPARE,
  MAX_VIRTUAL_LINES,
  PARAM_LIMITS,
  SCENARIOS,
  SCENARIO_HELP,
  bucketLabel,
  draftToParams,
  effectiveBasis,
  formatMinutes,
  noticeText,
  scenarioDraftErrors,
  scenarioLabel,
  toggleCompare,
  type ScenarioDraft,
} from "./phase5Logic";

type Filter = { horizon_days: number; bucket: ForwardBucket; factory_unit?: string };

/**
 * Scenario parameters (preset + bounded values) and a side-by-side compare of up to 4 presets with the same values.
 * "Use these parameters" applies them to Capacity vs demand; "Save" keeps them in this browser for this user only.
 */
export function ScenarioCompareView({
  filter,
  draft,
  onDraftChange,
  onApply,
  onSave,
  canSave,
}: {
  filter: Filter;
  draft: ScenarioDraft;
  onDraftChange: (d: ScenarioDraft) => void;
  onApply: (d: ScenarioDraft) => void;
  onSave: (d: ScenarioDraft) => boolean;
  canSave: boolean;
}) {
  const [touched, setTouched] = useState(false);
  const [message, setMessage] = useState("");
  const [compareQuery, setCompareQuery] = useState<Parameters<typeof useMfgScenarioCompare>[0]>(null);
  const compare = useMfgScenarioCompare(compareQuery);
  const forecast = useMfgForecastDemand(filter.horizon_days, true);
  const errors = scenarioDraftErrors(draft);
  const set = <K extends keyof ScenarioDraft>(k: K, v: ScenarioDraft[K]) => {
    setMessage("");
    onDraftChange({ ...draft, [k]: v });
  };

  const guard = (): boolean => {
    setTouched(true);
    return errors.length === 0;
  };

  return (
    <div className="space-y-3">
      <PanelCard
        testId="mfg-scenario-params"
        title="Scenario parameters"
        subtitle="Pick a preset, then adjust the values if needed. Nothing is saved on the server; the plan itself never changes."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SelectField
            id="mfg-scn-preset"
            label="Preset"
            value={draft.scenario}
            onChange={(v) => set("scenario", (v || "BASE") as ForwardScenario)}
            options={SCENARIOS.map((s) => ({ value: s, label: scenarioLabel(s) }))}
          />
          <SelectField
            id="mfg-scn-basis"
            label="Efficiency"
            value={draft.efficiency_basis}
            placeholder={`Preset default (${BASIS_LABEL[effectiveBasis({ ...draft, efficiency_basis: "" })]})`}
            onChange={(v) => set("efficiency_basis", v as ScenarioDraft["efficiency_basis"])}
            options={BASES.map((b) => ({ value: b, label: BASIS_LABEL[b] ?? b }))}
          />
          <TextField
            id="mfg-scn-ot"
            label="Overtime %"
            inputMode="decimal"
            value={draft.overtime_pct}
            onChange={(v) => set("overtime_pct", v)}
            hint={`${PARAM_LIMITS.overtime_pct.min}-${PARAM_LIMITS.overtime_pct.max}, extra minutes on working days`}
          />
          <TextField
            id="mfg-scn-abs"
            label="Absence %"
            inputMode="decimal"
            value={draft.absence_pct}
            onChange={(v) => set("absence_pct", v)}
            hint={`${PARAM_LIMITS.absence_pct.min}-${PARAM_LIMITS.absence_pct.max}, only with Planned efficiency`}
          />
          <TextField
            id="mfg-scn-extra"
            label="Extra operators %"
            inputMode="decimal"
            value={draft.extra_operator_pct}
            onChange={(v) => set("extra_operator_pct", v)}
            hint={`${PARAM_LIMITS.extra_operator_pct.min} to ${PARAM_LIMITS.extra_operator_pct.max} (negative = fewer)`}
          />
          <TextField
            id="mfg-scn-vl"
            label="Extra (virtual) lines"
            inputMode="numeric"
            value={draft.virtual_lines}
            onChange={(v) => set("virtual_lines", v)}
            hint={`0-${MAX_VIRTUAL_LINES}, "what if we add a line"`}
          />
        </div>
        <p className="text-[11px] text-text-muted">{SCENARIO_HELP[draft.scenario]}</p>
        {touched ? <ErrorList errors={errors} /> : null}
        {message ? <NoticeBox tone="good">{message}</NoticeBox> : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={primaryBtn}
            onClick={() => {
              if (guard()) onApply(draft);
            }}
          >
            Use in Capacity vs demand
          </button>
          {canSave ? (
            <button
              type="button"
              className={secondaryBtn}
              onClick={() => {
                if (!guard()) return;
                setMessage(onSave(draft) ? "Parameters saved in this browser (only for you)." : "Could not save in this browser.");
              }}
            >
              Save my parameters
            </button>
          ) : null}
        </div>
      </PanelCard>

      <PanelCard
        testId="mfg-scenario-compare"
        title="Compare scenarios"
        subtitle={`Tick up to ${MAX_COMPARE} presets. Each one uses the parameters above.`}
        loading={compare.loading}
      >
        <fieldset className="flex flex-wrap gap-3 text-xs">
          <legend className={labelCls}>Scenarios to compare</legend>
          {SCENARIOS.map((s) => (
            <label key={s} className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={draft.compare.includes(s)}
                disabled={!draft.compare.includes(s) && draft.compare.length >= MAX_COMPARE}
                onChange={() => set("compare", toggleCompare(draft.compare, s))}
              />
              {scenarioLabel(s)}
            </label>
          ))}
        </fieldset>
        <button
          type="button"
          className={secondaryBtn}
          disabled={draft.compare.length === 0}
          onClick={() => {
            if (!guard()) return;
            setCompareQuery({ ...filter, ...draftToParams(draft), scenarios: [...draft.compare] });
          }}
        >
          Compare
        </button>
        <ErrorBox message={compare.error} testId="mfg-compare-error" />
        {compare.data ? <CompareTable data={compare.data} /> : null}
        {!compare.data && !compare.loading && !compare.error ? <EmptyState>Pick scenarios and click Compare.</EmptyState> : null}
      </PanelCard>

      <PanelCard
        testId="mfg-forecast-demand"
        title="Demand forecast (not yet ordered)"
        subtitle="From your own order history per style family, minus orders and tentative bookings that already use it. Used only by the Conservative preset."
        loading={forecast.loading}
        error={forecast.error}
      >
        {forecast.data ? (
          <div className="space-y-2 text-xs">
            <div className="flex flex-wrap gap-2">
              <Chip tone={forecast.data.availability === "AVAILABLE" ? "good" : "warn"}>
                {forecast.data.availability === "AVAILABLE" ? "Forecast available" : "Not enough history yet"}
              </Chip>
              <span className="text-text-muted">
                {forecast.data.tenant_history_months} month(s) of history · coverage {formatPercent(forecast.data.coverage_pct)}
              </span>
            </div>
            {forecast.data.families.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-border text-left text-text-muted">
                      <th className="py-1 pr-2 font-medium">Style family</th>
                      <th className="py-1 pr-2 font-medium">Status</th>
                      <th className="py-1 pr-2 text-right font-medium">Months with orders</th>
                      <th className="py-1 text-right font-medium">Forecast left</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecast.data.families.map((f) => (
                      <tr key={f.family} className="border-b border-border/60">
                        <td className="py-1 pr-2">{f.family}</td>
                        <td className="py-1 pr-2">{f.availability === "AVAILABLE" ? "Available" : "Not enough history"}</td>
                        <td className="py-1 pr-2 text-right tabular-nums">{f.months_with_orders}</td>
                        <td className="py-1 text-right tabular-nums">{formatMinutes(f.residual_total_minutes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState>No style family has order history yet.</EmptyState>
            )}
            {forecast.data.notices.length ? (
              <ul className="list-disc pl-5 text-[11px] text-text-muted">
                {forecast.data.notices.map((n) => (
                  <li key={n}>{noticeText(n)}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </PanelCard>
    </div>
  );
}

function CompareTable({ data }: { data: CompareResponse }) {
  const first = data.scenarios[0];
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs" data-testid="mfg-compare-totals">
          <thead>
            <tr className="border-b border-border text-left text-text-muted">
              <th className="py-1 pr-2 font-medium">Scenario</th>
              <th className="py-1 pr-2 font-medium">Efficiency</th>
              <th className="py-1 pr-2 text-right font-medium">Capacity</th>
              <th className="py-1 pr-2 text-right font-medium">Demand</th>
              <th className="py-1 pr-2 text-right font-medium">Free / short</th>
              <th className="py-1 pr-2 text-right font-medium">Overloaded periods</th>
              <th className="py-1 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {data.scenarios.map((s) => {
              const overloaded = s.buckets.filter((b) => b.reason_codes.includes("OVERLOADED")).length;
              const deferred = Object.values(s.deferred_beyond_horizon_minutes ?? {}).some((v) => v != null && Number(v) > 0);
              return (
                <tr key={s.scenario} className="border-b border-border/60 align-top">
                  <td className="py-1 pr-2 font-medium text-text-primary">{scenarioLabel(s.scenario)}</td>
                  <td className="py-1 pr-2">{BASIS_LABEL[s.efficiency.basis] ?? s.efficiency.basis}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{formatDecimal(s.totals.capacity_minutes)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{formatDecimal(s.totals.load_minutes)}</td>
                  <td className={`py-1 pr-2 text-right tabular-nums ${Number(s.totals.gap_minutes ?? 0) < 0 ? "text-red-700" : ""}`}>
                    {formatDecimal(s.totals.gap_minutes)}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">{overloaded}</td>
                  <td className="py-1">
                    {deferred ? <Chip tone="warn">Some work pushed past the horizon</Chip> : null} <ReasonChips codes={s.reason_codes} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {first ? (
        <details>
          <summary className="cursor-pointer text-xs text-text-secondary">Use % per period</summary>
          <div className="mt-1 overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-text-muted">
                  <th className="py-1 pr-2 font-medium">Period</th>
                  {data.scenarios.map((s) => (
                    <th key={s.scenario} className="py-1 pr-2 text-right font-medium">
                      {scenarioLabel(s.scenario)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {first.buckets.map((b, i) => (
                  <tr key={b.index} className="border-b border-border/60">
                    <td className="py-1 pr-2 whitespace-nowrap">{bucketLabel(b.start, b.end)}</td>
                    {data.scenarios.map((s) => (
                      <td key={s.scenario} className="py-1 pr-2 text-right tabular-nums">
                        {formatPercent(s.buckets[i]?.utilization_pct)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
      {data.notices.length ? (
        <ul className="list-disc pl-5 text-[11px] text-text-muted">
          {data.notices.map((n) => (
            <li key={n}>{noticeText(n)}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
