import { useRef, useState } from "react";

import type { ControlTowerOrderRow } from "@/api/models";

import { inputCls, labelCls, NoticeBox } from "../phase2/Phase2Ui";
import type { MfgTabId } from "../phase2/phase2Logic";
import { AnomaliesCard } from "./AnomaliesCard";
import { CalibrationCard } from "./CalibrationCard";
import { DeliveryForecastCard } from "./DeliveryForecastCard";
import { LineEfficiencyCard } from "./LineEfficiencyCard";
import type { MfgPhase4Flags } from "./phase4Logic";
import { STATISTICS_NOTICE } from "./phase4Logic";
import { RecommendationsCard } from "./RecommendationsCard";
import { SupplierLatenessCard } from "./SupplierLatenessCard";

type Props = {
  flags: MfgPhase4Flags;
  orderOptions: ControlTowerOrderRow[];
  orderId: number | null;
  onOrderChange: (id: number | null) => void;
  integratedOn?: boolean;
  focusFindingId?: number | null;
  onOpenTab?: (tab: MfgTabId) => void;
};

/**
 * "Predictions" tab (Manufacturing Intelligence Phase 4, tenant flag mfg_predictive_intelligence_v1).
 * Read-only statistics from the company's own history. Recording a decision on a recommendation is the only write,
 * and it never changes plans, purchase orders or stock.
 */
export function PredictionsTab({ flags, orderOptions, orderId, onOrderChange, integratedOn = false, focusFindingId = null, onOpenTab }: Props) {
  const [factoryUnit, setFactoryUnit] = useState("");
  const forecastRef = useRef<HTMLDivElement>(null);
  const unit = factoryUnit.trim() || undefined;

  const showForecast = (id: number) => {
    onOrderChange(id);
    forecastRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-3" data-testid="mfg-predictions-tab">
      <NoticeBox>
        <strong>{STATISTICS_NOTICE}</strong> Dates and percentages are worked out from your recorded output, line plans and supplier receipts. Use
        them to decide what to look at first; act on the normal screens.
        {flags.aiText ? " Explain sends an anonymised summary (no buyer, employee or supplier names) to your company's approved AI provider." : ""}
      </NoticeBox>

      <RecommendationsCard
        aiText={flags.aiText}
        integratedOn={integratedOn}
        focusFindingId={focusFindingId}
        onShowForecast={showForecast}
        onOpenTab={onOpenTab}
      />

      <div ref={forecastRef}>
        <DeliveryForecastCard orderOptions={orderOptions} orderId={orderId} onOrderChange={onOrderChange} aiText={flags.aiText} />
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface-raised p-3">
        <div>
          <label htmlFor="mfg-pred-factory" className={labelCls}>
            Factory unit for line efficiency and anomalies (optional)
          </label>
          <input id="mfg-pred-factory" type="text" className={`${inputCls} sm:w-48`} value={factoryUnit} onChange={(e) => setFactoryUnit(e.target.value)} />
        </div>
      </div>
      <LineEfficiencyCard factoryUnit={unit} />
      <SupplierLatenessCard />
      <AnomaliesCard factoryUnit={unit} />
      <CalibrationCard />
    </div>
  );
}
