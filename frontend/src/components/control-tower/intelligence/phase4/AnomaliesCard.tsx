import { useState } from "react";

import { useMfgAnomalies } from "@/hooks/useMfgPredictive";
import { todayLocalISO } from "@/lib/dates";

import { formatDate, formatDecimal } from "../formatDecimal";
import { Chip, PanelCard } from "../IntelligenceUi";
import { EmptyState, ErrorBox, secondaryBtn, TextField } from "../phase2/Phase2Ui";
import { addDaysISO } from "../phase2/phase2Logic";
import { humanizeCode, warningLabel } from "../reasonLabels";
import { ANOMALY_MAX_DAYS, anomalyDirectionLabel, anomalyValue, anomalyWindowError, loadErrorText, metricLabel } from "./phase4Logic";

/** Unusual line-days / hours (output, efficiency, rejections) compared with the line's own last 30 production days. */
export function AnomaliesCard({ factoryUnit }: { factoryUnit?: string }) {
  const [from, setFrom] = useState(() => addDaysISO(todayLocalISO(), -6));
  const [to, setTo] = useState(() => todayLocalISO());
  const windowError = anomalyWindowError(from, to);
  const res = useMfgAnomalies({ date_from: from, date_to: to, factory_unit: factoryUnit }, !windowError);
  const data = res.data;

  return (
    <PanelCard
      testId="mfg-anomalies"
      title="Unusual production (anomalies)"
      subtitle="Days or hours that are far from the line's usual result. Check them on the shop floor; nothing is changed automatically."
      loading={res.loading}
      error={res.error ? loadErrorText(res.errorStatus, res.error, "Anomalies") : ""}
    >
      <div className="flex flex-wrap items-end gap-3">
        <TextField id="mfg-anom-from" label="From" type="date" value={from} onChange={setFrom} />
        <TextField id="mfg-anom-to" label="To" type="date" value={to} onChange={setTo} />
        <button type="button" className={secondaryBtn} onClick={res.reload} disabled={Boolean(windowError)}>
          Reload
        </button>
        <p className="text-[11px] text-text-muted">Max {ANOMALY_MAX_DAYS} days.</p>
      </div>
      <ErrorBox message={windowError} testId="mfg-anom-window-error" />
      {data && !windowError ? (
        <>
          <p className="text-[11px] text-text-muted">
            {data.lines_checked} line(s) checked · flagged when the robust score is at least {formatDecimal(data.threshold, 1)} · needs at least{" "}
            {data.min_baseline_points} earlier points.
            {Object.keys(data.series_skipped).length
              ? ` Not checked: ${Object.entries(data.series_skipped)
                  .map(([k, v]) => `${humanizeCode(k).toLowerCase()} ${v}`)
                  .join(", ")}.`
              : ""}
          </p>
          {data.notices.map((n) => (
            <p key={n} className="text-[11px] text-text-muted">
              {warningLabel(n)}
            </p>
          ))}
          {data.truncated ? <p className="text-[11px] text-amber-900">Only the strongest anomalies are listed.</p> : null}
          {data.anomalies.length === 0 ? <EmptyState>No unusual results in this window.</EmptyState> : null}
          {data.anomalies.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs" aria-label="Anomalies">
                <thead>
                  <tr className="border-b border-border text-left text-text-muted">
                    <th className="px-2 py-1 font-medium">Date</th>
                    <th className="px-2 py-1 font-medium">Line</th>
                    <th className="px-2 py-1 font-medium">What</th>
                    <th className="px-2 py-1 text-right font-medium">Value</th>
                    <th className="px-2 py-1 text-right font-medium">Usual</th>
                    <th className="px-2 py-1 text-right font-medium" title="Robust z-score: how far from usual (3.5 or more is flagged)">
                      Score
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.anomalies.map((a) => (
                    <tr key={`${a.line_id}-${a.date}-${a.hour_slot ?? "d"}-${a.metric}`} className="border-b border-border/60 align-top">
                      <td className="px-2 py-1 whitespace-nowrap">
                        {formatDate(a.date)}
                        {a.hour_slot != null ? <span className="text-[11px] text-text-muted"> · hour {a.hour_slot}</span> : null}
                      </td>
                      <td className="px-2 py-1">{a.line_code ?? `#${a.line_id}`}</td>
                      <td className="px-2 py-1">
                        {metricLabel(a.metric)}{" "}
                        <Chip tone={a.metric === "REJECTION_RATE" ? "bad" : "warn"}>{anomalyDirectionLabel(a.metric, a.direction)}</Chip>
                      </td>
                      <td className="px-2 py-1 text-right">{anomalyValue(a.metric, a.value)}</td>
                      <td className="px-2 py-1 text-right" title={`Median of ${a.baseline_n} earlier points`}>
                        {anomalyValue(a.metric, a.baseline_median)}
                      </td>
                      <td className="px-2 py-1 text-right">{formatDecimal(a.robust_z, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : null}
    </PanelCard>
  );
}
