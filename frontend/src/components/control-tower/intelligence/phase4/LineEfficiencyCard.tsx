import { Fragment, useState } from "react";

import type { EfficiencyEstimate } from "@/api/mfgPredictive";
import { useMfgLineEfficiency } from "@/hooks/useMfgPredictive";
import { todayLocalISO } from "@/lib/dates";

import { formatDate, formatPercent } from "../formatDecimal";
import { Chip, PanelCard, ReasonChips } from "../IntelligenceUi";
import { EmptyState, ErrorBox, inputCls, labelCls, secondaryBtn } from "../phase2/Phase2Ui";
import { humanizeCode, warningLabel } from "../reasonLabels";
import {
  confidenceLabel,
  confidenceTone,
  EFFICIENCY_SOURCE_HELP,
  efficiencySourceLabel,
  efficiencySourceTone,
  loadErrorText,
} from "./phase4Logic";

function EstimateCells({ e }: { e: EfficiencyEstimate }) {
  return (
    <>
      <td className="px-2 py-1 text-right">{formatPercent(e.planned_pct)}</td>
      <td className="px-2 py-1 text-right">{formatPercent(e.empirical_pct)}</td>
      <td className="px-2 py-1 text-right font-medium">{formatPercent(e.blended_pct)}</td>
      <td className="px-2 py-1">
        <span className="inline-flex flex-wrap gap-1">
          <Chip tone={efficiencySourceTone(e.source)} title={EFFICIENCY_SOURCE_HELP[e.source.toUpperCase()]}>
            {efficiencySourceLabel(e.source)}
          </Chip>
          <Chip tone={confidenceTone(e.confidence)}>{confidenceLabel(e.confidence)}</Chip>
        </span>
        <ReasonChips codes={e.reason_codes} />
      </td>
      <td className="px-2 py-1 text-right" title="Production days used for this estimate">
        {e.n}
      </td>
    </>
  );
}

/** Empirical (recorded) efficiency per sewing line next to the planned efficiency. */
export function LineEfficiencyCard({ factoryUnit }: { factoryUnit?: string }) {
  const [dateTo, setDateTo] = useState("");
  const [showFamilies, setShowFamilies] = useState(false);
  const future = dateTo !== "" && dateTo > todayLocalISO();
  const res = useMfgLineEfficiency({ date_to: dateTo || undefined, factory_unit: factoryUnit }, !future);
  const data = res.data;

  return (
    <PanelCard
      testId="mfg-line-efficiency"
      title="Line efficiency: history vs plan"
      subtitle={data?.metric_label ? `${data.metric_label}. ` + "Used for the forecasts; the plan itself is never changed." : "Recorded efficiency per sewing line beside the planned efficiency."}
      loading={res.loading}
      error={res.error ? loadErrorText(res.errorStatus, res.error, "Line efficiency") : ""}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="mfg-eff-to" className={labelCls}>
            History up to (empty = yesterday)
          </label>
          <input id="mfg-eff-to" type="date" className={inputCls} value={dateTo} max={todayLocalISO()} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          <input type="checkbox" checked={showFamilies} onChange={(e) => setShowFamilies(e.target.checked)} />
          Show style families
        </label>
        <button type="button" className={secondaryBtn} onClick={res.reload} disabled={future}>
          Reload
        </button>
      </div>
      <ErrorBox message={future ? "The history date cannot be in the future." : ""} />
      {data ? (
        <p className="text-[11px] text-text-muted">
          Window {formatDate(data.date_from)} – {formatDate(data.date_to)} ({data.window_days} days, at most {data.max_production_days} production days per line).
          Fewer than 10 production days = planned efficiency only.
        </p>
      ) : null}
      {data?.notices.length ? (
        <ul className="list-disc pl-5 text-[11px] text-text-muted">
          {data.notices.map((n) => (
            <li key={n}>{warningLabel(n)}</li>
          ))}
        </ul>
      ) : null}
      {data && data.lines.length === 0 ? <EmptyState>No sewing lines with plans or output in this window.</EmptyState> : null}
      {data && data.lines.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs" aria-label="Line efficiency">
            <thead>
              <tr className="border-b border-border text-left text-text-muted">
                <th className="px-2 py-1 font-medium">Line</th>
                <th className="px-2 py-1 text-right font-medium">Production days</th>
                <th className="px-2 py-1 text-right font-medium">Planned</th>
                <th className="px-2 py-1 text-right font-medium">From history</th>
                <th className="px-2 py-1 text-right font-medium">Used</th>
                <th className="px-2 py-1 font-medium">Source</th>
                <th className="px-2 py-1 text-right font-medium">Sample (days)</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((l) => {
                const excluded = Object.entries(l.excluded_reasons)
                  .map(([k, v]) => `${humanizeCode(k)}: ${v}`)
                  .join(", ");
                return (
                  <Fragment key={l.line_id}>
                    <tr className="border-b border-border/60 align-top">
                      <td className="px-2 py-1">
                        <div className="font-medium text-text-primary">{l.line_code}</div>
                        <div className="text-[11px] text-text-muted">
                          {l.name}
                          {l.factory_unit ? ` · ${l.factory_unit}` : ""}
                          {l.last_production_date ? ` · last ${formatDate(l.last_production_date)}` : ""}
                        </div>
                      </td>
                      <td className="px-2 py-1 text-right" title={excluded ? `Days left out: ${excluded}` : undefined}>
                        {l.production_days}
                        {l.excluded_days ? <div className="text-[11px] text-amber-900">{l.excluded_days} left out</div> : null}
                      </td>
                      <EstimateCells e={l.overall} />
                    </tr>
                    {showFamilies
                      ? l.families.map((fam) => (
                          <tr key={`${l.line_id}-${fam.family}`} className="border-b border-border/40 bg-surface-subtle/50 align-top">
                            <td className="px-2 py-1 pl-6 text-text-secondary">
                              {humanizeCode(fam.family)}
                              {fam.group_used !== fam.family ? <div className="text-[11px] text-text-muted">uses all families of the line</div> : null}
                            </td>
                            <td className="px-2 py-1" />
                            <EstimateCells e={fam} />
                          </tr>
                        ))
                      : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {data?.assumptions.length ? (
        <details className="text-[11px] text-text-muted">
          <summary className="cursor-pointer">Assumptions ({data.assumptions.length})</summary>
          <ul className="mt-1 list-disc pl-5">
            {data.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </PanelCard>
  );
}
