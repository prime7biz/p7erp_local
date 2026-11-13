import type { DeliveryPredictionResponse, MfgSummaryResponse } from "@/api/manufacturingIntelligence";

import { formatDate, formatDecimal } from "./formatDecimal";
import { Chip, PanelCard, ReasonChips, Stat } from "./IntelligenceUi";
import { bandTone } from "./panelLogic";
import { BAND_LABEL } from "./reasonLabels";

const BANDS = ["ON_TRACK", "AT_RISK", "LATE", "COMPLETE", "UNKNOWN"] as const;

type Props = {
  summary: MfgSummaryResponse | null;
  prediction: DeliveryPredictionResponse | null;
  hasOrder: boolean;
  summaryLoading?: boolean;
  summaryError?: string;
  predictionLoading?: boolean;
  predictionError?: string;
};

/** Panel E: delivery-risk band counts plus the selected order's prediction. */
export function DeliveryRiskPanel({
  summary,
  prediction,
  hasOrder,
  summaryLoading,
  summaryError,
  predictionLoading,
  predictionError,
}: Props) {
  const risk = summary?.orders.delivery_risk ?? {};
  return (
    <PanelCard
      testId="mfg-delivery-panel"
      title="Delivery risk"
      subtitle="Estimated finish against the ex-factory target. UNKNOWN means a needed input is missing, not that the order is fine."
      loading={summaryLoading || predictionLoading}
      error={summaryError}
    >
      {summary ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" data-testid="mfg-delivery-bands">
            {BANDS.map((b) => (
              <Stat key={b} label={BAND_LABEL[b] ?? b} value={risk[b] ?? 0} />
            ))}
          </div>
          <p className="text-[11px] text-text-muted">
            {summary.orders.evaluated} of {summary.orders.confirmed_total} confirmed orders evaluated
            {summary.orders.truncated ? " (list cut at the server limit)" : ""}.
          </p>
        </>
      ) : null}

      <div className="border-t border-border pt-3 space-y-2">
        <h4 className="text-xs font-semibold text-text-primary">Selected order</h4>
        {!hasOrder ? <p className="text-xs text-text-muted">Pick an order to see its delivery prediction.</p> : null}
        {predictionError ? (
          <div role="alert" className="rounded border border-status-danger/20 bg-status-danger-subtle p-2 text-xs text-status-danger-foreground">
            {predictionError}
          </div>
        ) : null}
        {prediction ? (
          <div className="space-y-2" data-testid="mfg-delivery-detail">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-text-primary">{prediction.order_code}</span>
              <Chip tone={bandTone(prediction.band)}>{BAND_LABEL[prediction.band] ?? prediction.band}</Chip>
              {prediction.delay_days != null && prediction.delay_days > 0 ? <Chip tone="bad">{prediction.delay_days} days late</Chip> : null}
              {prediction.early_days != null && prediction.early_days > 0 ? <Chip tone="good">{prediction.early_days} days early</Chip> : null}
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Stat label="Ex-factory target" value={formatDate(prediction.target_date)} />
              <Stat label="Optimistic finish" value={formatDate(prediction.optimistic_complete_date)} />
              <Stat label="Likely finish" value={formatDate(prediction.likely_complete_date)} />
              <Stat label="Pessimistic finish" value={formatDate(prediction.pessimistic_complete_date)} />
            </div>
            <p className="text-[11px] text-text-muted">
              Remaining {formatDecimal(prediction.remaining_qty)} of {formatDecimal(prediction.order_qty)} pcs
              {prediction.working_days_needed != null ? `; about ${prediction.working_days_needed} working days needed` : ""}.
            </p>
            {prediction.material?.expected_material_date || (prediction.external_lead_time_days ?? 0) > 0 ? (
              <ul className="space-y-0.5 text-[11px] text-text-secondary" data-testid="mfg-delivery-extras">
                {prediction.material?.expected_material_date ? (
                  <li>Material expected by {formatDate(prediction.material.expected_material_date)} (from linked purchase orders).</li>
                ) : null}
                {(prediction.external_lead_time_days ?? 0) > 0 ? (
                  <li>{prediction.external_lead_time_days} calendar days of outside processes (wash, print…) added after sewing.</li>
                ) : null}
              </ul>
            ) : null}
            {prediction.reason_codes.length > 0 || prediction.missing_inputs.length > 0 ? (
              <div>
                <div className="text-[11px] font-medium text-text-secondary">Reasons</div>
                <ReasonChips codes={[...prediction.reason_codes, ...prediction.missing_inputs]} tone="warn" />
              </div>
            ) : null}
            {prediction.assumptions.length > 0 ? (
              <div>
                <div className="text-[11px] font-medium text-text-secondary">Assumptions</div>
                <ReasonChips codes={prediction.assumptions} tone="info" />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </PanelCard>
  );
}
