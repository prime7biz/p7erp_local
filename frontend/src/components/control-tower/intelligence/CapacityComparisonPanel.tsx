import type { CapacityResponse, MfgSummaryResponse } from "@/api/manufacturingIntelligence";

import { formatDecimal, formatPercent, formatSigned } from "./formatDecimal";
import { Chip, PanelCard, ReasonChips, Stat } from "./IntelligenceUi";

type Props = {
  capacity: CapacityResponse | null;
  summary: MfgSummaryResponse | null;
  loading?: boolean;
  error?: string;
};

function Corrected({ value, complete }: { value: string | null; complete: boolean | null }) {
  if (value == null) return <Chip tone="warn">UNKNOWN</Chip>;
  return (
    <span>
      {formatDecimal(value)}
      {complete === false ? (
        <span className="ml-1">
          <Chip tone="warn" title="Some days or inputs are unknown, so this total is partial">
            partial
          </Chip>
        </span>
      ) : null}
    </span>
  );
}

/** Panel A: legacy (current formula) capacity next to the corrected preview. */
export function CapacityComparisonPanel({ capacity, summary, loading, error }: Props) {
  const cap = summary?.capacity;
  const mathOff = capacity != null && !capacity.planning_math_v2;
  return (
    <PanelCard
      testId="mfg-capacity-panel"
      title="Capacity: legacy vs corrected preview"
      subtitle="SMV-minutes for the chosen window. Legacy is the current formula; the corrected preview uses shift operator-minutes x efficiency."
      loading={loading}
      error={error}
    >
      {mathOff ? (
        <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-950" role="note">
          <strong>Corrected maths is off.</strong> Only the legacy values are shown; corrected values stay UNKNOWN. Turn on
          “Corrected planning maths preview” in Settings → Configuration to compare.
        </div>
      ) : null}

      {cap ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <Stat label="Practical (corrected)" value={cap.practical_smv_minutes != null ? formatDecimal(cap.practical_smv_minutes) : "UNKNOWN"} />
          <Stat label="Firm booked" value={formatDecimal(cap.firm_smv_minutes)} hint="Firm-booked and in-progress plans" />
          <Stat label="Soft booked" value={formatDecimal(cap.soft_smv_minutes)} hint="Soft-booked plans (not yet firm)" />
          <Stat label="Firm available" value={cap.firm_available_smv_minutes != null ? formatDecimal(cap.firm_available_smv_minutes) : "UNKNOWN"} />
          <Stat label="Utilization (firm)" value={cap.utilization_pct != null ? formatPercent(cap.utilization_pct) : "UNKNOWN"} />
        </div>
      ) : null}

      {capacity ? (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-text-muted">
                  <th className="px-2 py-1 font-medium">Line</th>
                  <th className="px-2 py-1 font-medium text-right">Legacy (current formula)</th>
                  <th className="px-2 py-1 font-medium text-right">Corrected preview</th>
                  <th className="px-2 py-1 font-medium text-right">Difference</th>
                  <th className="px-2 py-1 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {capacity.lines.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-2 py-3 text-text-muted">
                      No sewing lines found for this filter.
                    </td>
                  </tr>
                ) : (
                  capacity.lines.map((l) => (
                    <tr key={l.line_id} className="border-b border-border/60 align-top">
                      <td className="px-2 py-1 font-medium text-text-primary">
                        {l.line_code}
                        <div className="text-[11px] font-normal text-text-muted">{l.name}</div>
                      </td>
                      <td className="px-2 py-1 text-right">{formatDecimal(l.legacy_value)}</td>
                      <td className="px-2 py-1 text-right">
                        <Corrected value={l.corrected_value} complete={l.corrected_complete} />
                      </td>
                      <td className="px-2 py-1 text-right">{formatSigned(l.difference)}</td>
                      <td className="px-2 py-1">
                        <ReasonChips codes={[...l.reason_codes, ...l.missing_inputs]} tone="warn" />
                        {l.notice ? <div className="mt-1 text-[11px] text-text-muted">{l.notice}</div> : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="font-semibold text-text-primary">
                  <td className="px-2 py-1">All lines</td>
                  <td className="px-2 py-1 text-right">{formatDecimal(capacity.totals.legacy_value)}</td>
                  <td className="px-2 py-1 text-right">
                    <Corrected value={capacity.totals.corrected_value} complete={capacity.totals.corrected_complete} />
                  </td>
                  <td className="px-2 py-1 text-right">{formatSigned(capacity.totals.difference)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-[11px] text-text-muted">
            Legacy basis: {capacity.legacy_basis} ({capacity.legacy_working_days} working days x{" "}
            {formatDecimal(capacity.legacy_average_shift_minutes)} avg shift minutes). Formula {capacity.formula_version}.
          </p>
          {capacity.notices.length > 0 ? (
            <ul className="list-disc pl-5 text-[11px] text-text-muted">
              {capacity.notices.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}
          {capacity.assumptions.length > 0 ? (
            <div className="flex flex-wrap gap-1" aria-label="Assumptions">
              <ReasonChips codes={capacity.assumptions} tone="info" />
            </div>
          ) : null}
        </>
      ) : null}
    </PanelCard>
  );
}
