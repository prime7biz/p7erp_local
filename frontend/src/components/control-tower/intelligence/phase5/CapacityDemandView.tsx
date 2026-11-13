import { useState } from "react";

import type { ForwardBucketRow, ForwardPlanQuery, ForwardPlanResponse } from "@/api/mfgAdvancedPlanning";
import { useMfgForwardPlan } from "@/hooks/useMfgAdvancedPlanning";

import { formatDate, formatDecimal, formatPercent } from "../formatDecimal";
import { Chip, PanelCard, ReasonChips, Stat } from "../IntelligenceUi";
import { EmptyState } from "../phase2/Phase2Ui";
import {
  BASIS_LABEL,
  EFFICIENCY_MODE_LABEL,
  LAYER_COLOR,
  bucketLabel,
  bucketLoad,
  displayLayers,
  formatMinutes,
  layerLabel,
  noticeText,
  scenarioLabel,
  scenarioTentativeView,
  shareOf,
  subtractDecimals,
  sumDecimals,
  type TentativeView,
} from "./phase5Logic";

/** Stacked demand layers per week / month against the capacity of the chosen scenario. Read-only. */
export function CapacityDemandView({ query }: { query: ForwardPlanQuery }) {
  const plan = useMfgForwardPlan(query);
  return (
    <PanelCard
      testId="mfg-forward-capacity"
      title="Capacity vs demand"
      subtitle="Sewing minutes available per period against the work that needs them. Read-only: nothing here changes a plan."
      loading={plan.loading}
      error={plan.error}
    >
      {plan.data ? <CapacityDemandBody key={`${plan.data.scenario}|${plan.data.layers_included.join(",")}`} data={plan.data} /> : null}
      {!plan.loading && !plan.error && !plan.data ? <EmptyState>No forward plan loaded yet.</EmptyState> : null}
    </PanelCard>
  );
}

export function CapacityDemandBody({ data }: { data: ForwardPlanResponse }) {
  const finite = data.constrained != null;
  const own = scenarioTentativeView(data.layers_included);
  const [view, setView] = useState<TentativeView | null>(own);
  const shown = displayLayers(data.layers_included, view, finite);
  const changedView = !finite && own != null && view != null && view !== own;
  const rows = data.buckets.map((b) => {
    const load = changedView ? bucketLoad(b.layers, shown) : b.load_minutes;
    const gap = changedView ? subtractDecimals(b.capacity_minutes, load) : b.gap_minutes;
    return { b, load, gap };
  });
  const max = Math.max(1, ...rows.map((r) => Math.max(Number(r.b.capacity_minutes ?? 0), Number(r.load ?? 0))));
  const partialCount = data.buckets.filter((b) => b.capacity_status === "PARTIAL").length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Chip tone="info">{scenarioLabel(data.scenario)}</Chip>
        <Chip>{BASIS_LABEL[data.efficiency.basis] ?? data.efficiency.basis}</Chip>
        <Chip tone={data.efficiency.mode === "FIXED_BANDS" || data.efficiency.mode === "MIXED" ? "warn" : "neutral"}>
          {EFFICIENCY_MODE_LABEL[data.efficiency.mode] ?? data.efficiency.mode}
        </Chip>
        {finite ? <Chip tone="info">Finite: extra work moves to later weeks</Chip> : null}
        {data.virtual_lines > 0 ? <Chip tone="warn">{`${data.virtual_lines} virtual line(s) added`}</Chip> : null}
        <span className="text-text-muted">
          {formatDate(data.date_from)} – {formatDate(data.date_to)} · {data.lines} line(s){data.factory_unit ? ` · unit ${data.factory_unit}` : ""} · frozen
          zone until {formatDate(data.frozen_end)}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Stat label="Capacity" value={formatMinutes(data.totals.capacity_minutes)} hint="Known sewing minutes in the horizon" />
        <Stat
          label="Demand (load)"
          value={formatMinutes(changedView ? bucketLoadTotal(rows) : data.totals.load_minutes)}
          hint="Minutes of the shown layers"
        />
        <Stat
          label="Free (+) / short (-)"
          value={formatMinutes(changedView ? subtractDecimals(data.totals.capacity_minutes ?? null, bucketLoadTotal(rows)) : data.totals.gap_minutes)}
        />
      </div>

      {own && !finite ? (
        <fieldset className="flex flex-wrap items-center gap-3 rounded border border-border p-2 text-xs" data-testid="mfg-tentative-view">
          <legend className="px-1 font-semibold text-text-primary">Tentative bookings</legend>
          {(["TENTATIVE_WEIGHTED", "TENTATIVE_FULL"] as const).map((v) => (
            <label key={v} className="inline-flex items-center gap-1">
              <input type="radio" name="mfg-tentative-view" value={v} checked={view === v} onChange={() => setView(v)} />
              {v === "TENTATIVE_WEIGHTED" ? "Weighted by confidence" : "Full quantity"}
            </label>
          ))}
          <span className="text-text-muted">Two views of the same bookings - never added together.</span>
          {changedView ? <Chip tone="info">Not the scenario's own view</Chip> : null}
        </fieldset>
      ) : null}

      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-secondary" aria-label="Legend" data-testid="mfg-forward-legend">
        {shown.map((l) => (
          <li key={l} className="inline-flex items-center gap-1">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm ${LAYER_COLOR[l] ?? "bg-slate-400"}`} aria-hidden />
            {layerLabel(l)}
          </li>
        ))}
        <li className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-0.5 bg-text-primary" aria-hidden />
          Capacity
        </li>
      </ul>

      {partialCount ? (
        <p className="text-[11px] text-amber-900">
          {partialCount} period(s) marked <strong>Partial</strong>: some line-days have unknown capacity (no shift, operators or efficiency), so
          the capacity there is too low and no use % is shown.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState>No periods in this horizon.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs" data-testid="mfg-forward-buckets">
            <thead>
              <tr className="border-b border-border text-left text-text-muted">
                <th className="py-1 pr-2 font-medium">Period</th>
                <th className="py-1 pr-2 font-medium min-w-[12rem]">Demand by layer</th>
                <th className="py-1 pr-2 text-right font-medium">Capacity</th>
                <th className="py-1 pr-2 text-right font-medium">Demand</th>
                <th className="py-1 pr-2 text-right font-medium">Free / short</th>
                <th className="py-1 pr-2 text-right font-medium">Use %</th>
                <th className="py-1 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ b, load, gap }) => (
                <tr key={b.index} className="border-b border-border/60 align-top" data-testid={`mfg-forward-bucket-${b.index}`}>
                  <td className="py-1 pr-2 whitespace-nowrap">
                    {bucketLabel(b.start, b.end)}
                    <div className="text-[10px] text-text-muted">{b.working_days} working day(s)</div>
                  </td>
                  <td className="py-1 pr-2">
                    <StackedBar bucket={b} shown={shown} max={max} />
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">{formatDecimal(b.capacity_minutes)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums" data-testid={`mfg-forward-load-${b.index}`}>
                    {formatDecimal(load)}
                  </td>
                  <td className={`py-1 pr-2 text-right tabular-nums ${Number(gap ?? 0) < 0 ? "text-red-700" : ""}`}>{formatDecimal(gap)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{changedView ? displayUse(b, load) : formatPercent(b.utilization_pct)}</td>
                  <td className="py-1">
                    <span className="inline-flex flex-wrap gap-1">
                      {b.capacity_status === "PARTIAL" ? (
                        <Chip tone="warn" title={`${b.unknown_line_days} line-day(s) with unknown capacity`}>
                          Partial
                        </Chip>
                      ) : null}
                      {b.partial_month ? <Chip>Part month</Chip> : null}
                      {Number(gap ?? 0) < 0 && b.capacity_status !== "PARTIAL" ? <Chip tone="bad">Overloaded</Chip> : null}
                      {b.reason_codes.includes("BOOKED_OVERLOAD") ? <Chip tone="bad">Booked work alone overloads</Chip> : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ForwardFootnotes data={data} />
    </div>
  );
}

function bucketLoadTotal(rows: { load: string | null }[]): string | null {
  return sumDecimals(rows.map((r) => r.load));
}

function displayUse(b: ForwardBucketRow, load: string | null): string {
  const cap = Number(b.capacity_minutes ?? 0);
  if (b.capacity_status === "PARTIAL" || cap <= 0 || load == null) return "—";
  return formatPercent(String((Number(load) / cap) * 100));
}

function StackedBar({ bucket, shown, max }: { bucket: ForwardBucketRow; shown: string[]; max: number }) {
  const capPct = shareOf(bucket.capacity_minutes, max);
  const parts = shown
    .map((l) => ({ l, v: bucket.layers[l], w: shareOf(bucket.layers[l], max) }))
    .filter((p) => p.w > 0);
  const title = shown.map((l) => `${layerLabel(l)}: ${formatMinutes(bucket.layers[l])}`).join("\n");
  return (
    <div className="relative h-4 w-full min-w-[10rem] rounded bg-surface-subtle" title={title} role="img" aria-label={title.replace(/\n/g, "; ")}>
      <div className="absolute inset-y-0 left-0 flex overflow-hidden rounded">
        {parts.map((p) => (
          <div key={p.l} className={`${LAYER_COLOR[p.l] ?? "bg-slate-400"} h-full`} style={{ width: `${p.w}%` }} />
        ))}
      </div>
      <div className="absolute inset-y-[-2px] w-0.5 bg-text-primary" style={{ left: `calc(${capPct}% - 1px)` }} aria-hidden />
    </div>
  );
}

function ForwardFootnotes({ data }: { data: ForwardPlanResponse }) {
  const beyond = Object.entries(data.beyond_horizon_minutes ?? {}).filter(([, v]) => v != null && Number(v) > 0);
  const deferred = Object.entries(data.constrained?.deferred_beyond_horizon_minutes ?? {}).filter(([, v]) => v != null && Number(v) > 0);
  const forecastOn = data.forecast?.availability === "AVAILABLE";
  return (
    <div className="space-y-2 text-[11px] text-text-muted">
      <ReasonChips codes={data.reason_codes} />
      <p>
        Demand forecast: {forecastOn ? `available for ${data.forecast.families_available?.length ?? 0} style family(ies)` : "not available (not enough order history yet)"}
        .
      </p>
      {deferred.length ? (
        <p className="text-amber-900">
          Carried beyond the horizon (no capacity left): {deferred.map(([k, v]) => `${layerLabel(k)} ${formatMinutes(v)}`).join(", ")}.
        </p>
      ) : null}
      {beyond.length ? <p>Due after the horizon (not shown): {beyond.map(([k, v]) => `${layerLabel(k)} ${formatMinutes(v)}`).join(", ")}.</p> : null}
      {data.notices.length ? (
        <ul className="list-disc pl-5" data-testid="mfg-forward-notices">
          {data.notices.map((n) => (
            <li key={n}>{noticeText(n)}</li>
          ))}
        </ul>
      ) : null}
      {data.assumptions.length ? (
        <details>
          <summary className="cursor-pointer text-text-secondary">Assumptions ({data.assumptions.length})</summary>
          <ul className="mt-1 list-disc pl-5">
            {data.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
