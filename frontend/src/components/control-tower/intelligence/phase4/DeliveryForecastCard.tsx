import type { ControlTowerOrderRow } from "@/api/models";
import type { DeliveryForecastResponse } from "@/api/mfgPredictive";
import { useMfgDeliveryForecast } from "@/hooks/useMfgPredictive";

import { formatDate, formatDecimal, formatPercent } from "../formatDecimal";
import { Chip, PanelCard, ReasonChips, Stat } from "../IntelligenceUi";
import { bandTone } from "../panelLogic";
import { EmptyState, NoticeBox } from "../phase2/Phase2Ui";
import { OrderPicker } from "../ReadinessPanel";
import { BAND_LABEL } from "../reasonLabels";
import { ExplainButton } from "./ExplainButton";
import {
  confidenceLabel,
  confidenceTone,
  DRIVER_LABEL,
  EFFICIENCY_SOURCE_HELP,
  efficiencySourceLabel,
  efficiencySourceTone,
  ETA_SOURCE_LABEL,
  isFixedBands,
  latenessSourceLabel,
  loadErrorText,
  MATERIAL_STATUS_LABEL,
  materialStatusTone,
  NOT_ENOUGH_HISTORY,
  probabilityText,
} from "./phase4Logic";

type Props = {
  orderOptions: ControlTowerOrderRow[];
  orderId: number | null;
  onOrderChange: (id: number | null) => void;
  /** mfg_predictive_ai_text_v1: show "Explain" for the forecast. */
  aiText?: boolean;
};

/** Delivery forecast for one order: likely / P80 / P90 finish dates and the on-time probability. */
export function DeliveryForecastCard({ orderOptions, orderId, onOrderChange, aiText = false }: Props) {
  const res = useMfgDeliveryForecast(orderId);
  const f = res.data;
  return (
    <PanelCard
      testId="mfg-delivery-forecast"
      title="Delivery forecast"
      subtitle="When the order will most likely finish, a safe date (8 in 10 orders finish by it) and a worst-case date (9 in 10), from your own line and supplier history."
      loading={res.loading}
      error={res.error ? loadErrorText(res.errorStatus, res.error, "Delivery forecast") : ""}
    >
      <OrderPicker orders={orderOptions} orderId={orderId} onChange={onOrderChange} />
      {orderId == null ? <EmptyState>Pick an order to see its delivery forecast.</EmptyState> : null}
      {f && orderId != null ? <ForecastBody f={f} /> : null}
      {f && orderId != null && aiText ? <ExplainButton key={f.order_id} subject="order" recordId={f.order_id} /> : null}
    </PanelCard>
  );
}

function ForecastBody({ f }: { f: DeliveryForecastResponse }) {
  const fixed = isFixedBands(f);
  const prob = probabilityText(f);
  const poHidden = f.reason_codes.includes("PO_DETAIL_HIDDEN_NO_INVENTORY_ACCESS");
  const m = f.material;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-sm font-semibold text-text-primary">{f.order_code}</span>
        <Chip tone={bandTone(f.band)}>{BAND_LABEL[f.band] ?? f.band}</Chip>
        {!f.calibrated ? (
          <Chip tone="warn" title="Fewer than 30 finished orders have been compared with their forecasts yet, so the probabilities are not proven.">
            {f.calibration_label ? f.calibration_label.charAt(0).toUpperCase() + f.calibration_label.slice(1) : "Uncalibrated"}
          </Chip>
        ) : (
          <Chip tone="good">Calibrated</Chip>
        )}
        <Chip tone={confidenceTone(f.confidence)}>{confidenceLabel(f.confidence)}</Chip>
        {f.efficiency_source ? (
          <Chip tone={efficiencySourceTone(f.efficiency_source)} title={EFFICIENCY_SOURCE_HELP[f.efficiency_source.toUpperCase()]}>
            Efficiency: {efficiencySourceLabel(f.efficiency_source)}
          </Chip>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5" data-testid="mfg-forecast-dates">
        <Stat label="Ex-factory target" value={formatDate(f.target_date)} />
        <Stat label="Likely finish (P50)" value={formatDate(f.p50_date)} />
        <Stat label="Safe date (P80)" value={formatDate(f.p80_date)} hint="8 in 10 similar orders finish by this date." />
        <Stat label="Worst case (P90)" value={formatDate(f.p90_date)} hint="9 in 10 similar orders finish by this date." />
        <Stat
          label="On-time probability"
          value={prob ?? <span className="text-sm font-normal text-amber-900">{NOT_ENOUGH_HISTORY}</span>}
          hint="Chance of finishing by the ex-factory target."
        />
      </div>

      {fixed ? (
        <NoticeBox tone="warn">
          <strong>{NOT_ENOUGH_HISTORY}.</strong> The line has fewer production days than needed, so the dates use fixed safety bands instead of your
          history and no on-time probability is given.
        </NoticeBox>
      ) : null}
      {f.delay_days != null && f.delay_days > 0 ? (
        <p className="text-xs text-red-800">Likely {f.delay_days} day(s) after the ex-factory target.</p>
      ) : null}
      {f.early_days != null && f.early_days > 0 ? <p className="text-xs text-green-800">Likely {f.early_days} day(s) before the target.</p> : null}

      <div className="text-[11px] text-text-muted">
        Remaining {formatDecimal(f.remaining_qty)} of {formatDecimal(f.order_qty)} pcs · start {formatDate(f.start_date)}
        {f.working_days_needed != null ? ` · ${f.working_days_needed} working day(s)` : ""}
        {f.daily_rate_likely ? ` · likely ${formatDecimal(f.daily_rate_likely)} pcs/day` : ""}
      </div>

      {f.drivers.length ? (
        <section>
          <h4 className="text-xs font-semibold text-text-primary">What moves the date</h4>
          <ul className="mt-1 space-y-0.5 text-xs text-text-secondary">
            {f.drivers.map((d) => (
              <li key={`${d.driver}-${d.detail}`}>
                <strong>{DRIVER_LABEL[d.driver] ?? d.driver}</strong>
                {d.impact_days ? ` (+${d.impact_days} day(s))` : ""}: {d.detail}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {m ? (
        <section className="space-y-1" data-testid="mfg-forecast-material">
          <h4 className="text-xs font-semibold text-text-primary">Material readiness</h4>
          <div className="flex flex-wrap items-center gap-1 text-xs">
            <Chip tone={materialStatusTone(m.status)}>{MATERIAL_STATUS_LABEL[m.status] ?? m.status}</Chip>
            <span className="text-text-muted">Supplier delay from: {latenessSourceLabel(m.lateness_source)}</span>
          </div>
          {m.ready_p50 || m.ready_p80 || m.ready_p90 ? (
            <p className="text-xs text-text-secondary">
              Material ready: likely {formatDate(m.ready_p50)} · safe {formatDate(m.ready_p80)} · worst case {formatDate(m.ready_p90)}
            </p>
          ) : null}
          {m.shared_supply ? (
            <NoticeBox tone="warn">Purchase orders are shared with other orders and not allocated, so this date is less certain.</NoticeBox>
          ) : null}
          <ReasonChips codes={m.reason_codes} />
          {poHidden ? (
            <p className="text-[11px] text-text-muted">Purchase order details are hidden because your role has no inventory read access.</p>
          ) : null}
          {m.po_lines.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs" aria-label="Purchase order lines used">
                <thead>
                  <tr className="border-b border-border text-left text-text-muted">
                    <th className="px-2 py-1 font-medium">PO</th>
                    <th className="px-2 py-1 font-medium">Expected</th>
                    <th className="px-2 py-1 font-medium">Likely receipt</th>
                    <th className="px-2 py-1 font-medium">Safe</th>
                    <th className="px-2 py-1 font-medium">Worst case</th>
                  </tr>
                </thead>
                <tbody>
                  {m.po_lines.map((p) => (
                    <tr key={p.po_line_id} className="border-b border-border/60">
                      <td className="px-2 py-1">
                        {p.po_code}
                        {p.own_order_supply ? null : <span className="ml-1 text-[11px] text-text-muted">(shared)</span>}
                      </td>
                      <td className="px-2 py-1">
                        {formatDate(p.eta_date)} <span className="text-[11px] text-text-muted">{ETA_SOURCE_LABEL[p.eta_source] ?? p.eta_source}</span>
                      </td>
                      <td className="px-2 py-1">{formatDate(p.receipt_p50)}</td>
                      <td className="px-2 py-1">{formatDate(p.receipt_p80)}</td>
                      <td className="px-2 py-1">{formatDate(p.receipt_p90)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      {f.lines.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs" aria-label="Sewing lines in the forecast">
            <thead>
              <tr className="border-b border-border text-left text-text-muted">
                <th className="px-2 py-1 font-medium">Line</th>
                <th className="px-2 py-1 font-medium">Efficiency used</th>
                <th className="px-2 py-1 text-right font-medium">Planned</th>
                <th className="px-2 py-1 text-right font-medium">Used</th>
                <th className="px-2 py-1 text-right font-medium">History days</th>
                <th className="px-2 py-1 text-right font-medium">Likely pcs/day</th>
              </tr>
            </thead>
            <tbody>
              {f.lines.map((l) => (
                <tr key={l.plan_row_id} className="border-b border-border/60 align-top">
                  <td className="px-2 py-1">{l.line_code ?? `#${l.line_id}`}</td>
                  <td className="px-2 py-1">
                    {l.efficiency ? (
                      <span className="inline-flex flex-wrap gap-1">
                        <Chip tone={efficiencySourceTone(l.efficiency.source)}>{efficiencySourceLabel(l.efficiency.source)}</Chip>
                        <Chip tone={confidenceTone(l.efficiency.confidence)}>{confidenceLabel(l.efficiency.confidence)}</Chip>
                      </span>
                    ) : (
                      "—"
                    )}
                    <ReasonChips codes={l.missing_inputs} tone="warn" />
                  </td>
                  <td className="px-2 py-1 text-right">{formatPercent(l.efficiency?.planned_pct)}</td>
                  <td className="px-2 py-1 text-right">{formatPercent(l.efficiency?.blended_pct)}</td>
                  <td className="px-2 py-1 text-right">{l.history_days}</td>
                  <td className="px-2 py-1 text-right">{formatDecimal(l.rate_likely_units)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <ReasonChips codes={f.reason_codes.filter((c) => c !== "PO_DETAIL_HIDDEN_NO_INVENTORY_ACCESS")} />
      <ReasonChips codes={f.missing_inputs} tone="warn" />
      {f.assumptions.length ? (
        <details className="text-[11px] text-text-muted">
          <summary className="cursor-pointer">Assumptions ({f.assumptions.length})</summary>
          <ul className="mt-1 list-disc pl-5">
            {f.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </details>
      ) : null}
      <p className="text-[11px] text-text-muted">
        Model {f.model_version} · as of {formatDate(f.as_of)}
      </p>
    </div>
  );
}
