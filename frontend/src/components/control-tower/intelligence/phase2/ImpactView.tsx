import type { RevisionImpact } from "@/api/mfgPlanning";

import { formatDate } from "../formatDecimal";
import { Chip, ReasonChips } from "../IntelligenceUi";
import { bandTone } from "../panelLogic";
import { BAND_LABEL, warningLabel } from "../reasonLabels";

/** What a plan change would do: delivery dates, line overload and material warnings. Never shown as committed. */
export function ImpactView({ impact, heading = "Expected impact (estimate, not saved)" }: { impact: RevisionImpact | null | undefined; heading?: string }) {
  if (!impact) return <p className="text-xs text-text-muted">No impact figures.</p>;
  const s = impact.summary;
  return (
    <div className="space-y-3" data-testid="mfg-impact">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-xs font-semibold text-text-primary">{heading}</h4>
        <Chip tone={s.orders_delayed_or_at_risk > 0 ? "bad" : "good"}>{s.orders_delayed_or_at_risk} order(s) later or at risk</Chip>
        <Chip tone={s.lines_with_more_overload > 0 ? "warn" : "good"}>{s.lines_with_more_overload} line(s) more overloaded</Chip>
        <Chip tone={s.material_warnings > 0 ? "warn" : "good"}>{s.material_warnings} material warning(s)</Chip>
      </div>

      {impact.deliveries.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs" aria-label="Delivery impact">
            <thead>
              <tr className="border-b border-border text-left text-text-muted">
                <th className="px-2 py-1 font-medium">Order</th>
                <th className="px-2 py-1 font-medium">Ex-factory</th>
                <th className="px-2 py-1 font-medium">Before</th>
                <th className="px-2 py-1 font-medium">After</th>
                <th className="px-2 py-1 text-right font-medium">Change</th>
              </tr>
            </thead>
            <tbody>
              {impact.deliveries.map((d) => (
                <tr key={d.order_id} className="border-b border-border/60 align-top">
                  <td className="px-2 py-1 font-medium">{d.order_code}</td>
                  <td className="px-2 py-1">{formatDate(d.target_date)}</td>
                  <td className="px-2 py-1">
                    <Chip tone={bandTone(d.before.band ?? "")}>{BAND_LABEL[d.before.band ?? ""] ?? d.before.band ?? "—"}</Chip>{" "}
                    {formatDate(d.before.likely_complete_date)}
                  </td>
                  <td className="px-2 py-1">
                    <Chip tone={bandTone(d.after.band ?? "")}>{BAND_LABEL[d.after.band ?? ""] ?? d.after.band ?? "—"}</Chip>{" "}
                    {formatDate(d.after.likely_complete_date)}
                    {d.after.reason_codes.length > 0 ? (
                      <div className="mt-1">
                        <ReasonChips codes={d.after.reason_codes} />
                      </div>
                    ) : null}
                  </td>
                  <td className={`px-2 py-1 text-right ${(d.likely_delta_days ?? 0) > 0 ? "font-semibold text-red-700" : ""}`}>
                    {d.likely_delta_days == null ? "—" : d.likely_delta_days === 0 ? "same day" : `${d.likely_delta_days > 0 ? "+" : ""}${d.likely_delta_days} days`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {impact.overload.length > 0 ? (
        <ul className="space-y-1 text-xs" aria-label="Line overload impact">
          {impact.overload.map((o) => (
            <li key={o.line_id} className="rounded border border-border bg-surface-subtle p-2">
              <span className="font-medium">{o.line_code}</span>: overloaded days {o.overload_days_before} → {o.overload_days_after}
              {o.newly_overloaded_dates.length > 0 ? (
                <span className="text-red-800"> (new: {o.newly_overloaded_dates.map(formatDate).join(", ")})</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {impact.material_warnings.length > 0 ? (
        <ul className="space-y-1 text-xs" aria-label="Material warnings">
          {impact.material_warnings.map((m) => (
            <li key={m.order_id} className="rounded border border-amber-200 bg-amber-50 p-2 text-amber-950">
              <span className="font-medium">{m.order_code}</span>: {m.warning}
              {m.expected_material_date ? ` Expected material date: ${formatDate(m.expected_material_date)}.` : " No expected material date yet."}
            </li>
          ))}
        </ul>
      ) : null}

      {impact.notices.length > 0 ? (
        <ul className="list-disc pl-5 text-[11px] text-text-muted">
          {impact.notices.map((n) => (
            <li key={n}>{warningLabel(n)}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
