import { useMfgCalibration } from "@/hooks/useMfgPredictive";

import { formatDate, formatDecimal, formatPercent } from "../formatDecimal";
import { Chip, PanelCard, Stat } from "../IntelligenceUi";
import { NoticeBox } from "../phase2/Phase2Ui";
import { ratioToPercentText } from "../phase3/phase3Logic";
import { warningLabel } from "../reasonLabels";
import { loadErrorText } from "./phase4Logic";

function share(v: string | null): string {
  const p = ratioToPercentText(v);
  return p == null ? "—" : formatPercent(p, 0);
}

/** How well past forecasts matched what really shipped. Shown only; nothing is recalibrated automatically. */
export function CalibrationCard() {
  const res = useMfgCalibration(true);
  const c = res.data;
  const insufficient = c != null && c.status !== "OK";
  return (
    <PanelCard
      testId="mfg-calibration"
      title="Forecast accuracy (calibration)"
      subtitle="Past forecasts compared with the real ex-factory date of finished orders (28, 14 and 7 days before the target)."
      loading={res.loading}
      error={res.error ? loadErrorText(res.errorStatus, res.error, "Calibration") : ""}
    >
      {c ? (
        <>
          <div className="flex flex-wrap gap-1">
            <Chip tone={c.calibrated ? "good" : "warn"}>{c.calibrated ? "Calibrated" : "Uncalibrated"}</Chip>
            <Chip>Model {c.model_version}</Chip>
          </div>
          {insufficient ? (
            <NoticeBox tone="warn">
              Not enough finished orders yet: <strong>{c.n}</strong> of the <strong>{c.min_outcomes}</strong> needed have been compared. Until then
              every probability is labelled <em>uncalibrated</em>. {c.n_pending} forecast(s) are still waiting for the order to ship.
            </NoticeBox>
          ) : null}
          {!insufficient ? (
            <>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <Stat label="Orders compared" value={c.n} />
                <Stat label="Brier score" value={formatDecimal(c.brier, 3)} hint="0 = perfect, 0.25 = no better than a coin toss. Lower is better." />
                <Stat label="Finished by safe date (P80)" value={share(c.coverage.p80.share)} hint="Should be close to 80 %." />
                <Stat label="Finished by worst case (P90)" value={share(c.coverage.p90.share)} hint="Should be close to 90 %." />
              </div>
              {c.bins.length ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs" aria-label="Calibration bins">
                    <thead>
                      <tr className="border-b border-border text-left text-text-muted">
                        <th className="px-2 py-1 font-medium">Forecast probability</th>
                        <th className="px-2 py-1 text-right font-medium">Orders</th>
                        <th className="px-2 py-1 text-right font-medium">Average forecast</th>
                        <th className="px-2 py-1 text-right font-medium">Really on time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.bins.map((b) => (
                        <tr key={`${b.lower}-${b.upper}`} className="border-b border-border/60">
                          <td className="px-2 py-1">
                            {share(b.lower)} – {share(b.upper)}
                          </td>
                          <td className="px-2 py-1 text-right">{b.n}</td>
                          <td className="px-2 py-1 text-right">{share(b.mean_probability)}</td>
                          <td className="px-2 py-1 text-right">{share(b.hit_rate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {c.lead_buckets.length ? (
                <p className="text-[11px] text-text-muted">
                  By lead time:{" "}
                  {c.lead_buckets.map((l) => `${l.lead_days} days before: ${l.n} order(s), Brier ${formatDecimal(l.brier, 3)}`).join(" · ")}
                </p>
              ) : null}
            </>
          ) : null}
          {c.notices.map((n) => (
            <p key={n} className="text-[11px] text-text-muted">
              {warningLabel(n)}
            </p>
          ))}
          <p className="text-[11px] text-text-muted">
            As of {formatDate(c.as_of)} · {c.n_snapshots_considered} forecast(s) considered, {c.n_excluded} left out. Results are shown only; the model is
            never recalibrated automatically.
          </p>
        </>
      ) : null}
    </PanelCard>
  );
}
