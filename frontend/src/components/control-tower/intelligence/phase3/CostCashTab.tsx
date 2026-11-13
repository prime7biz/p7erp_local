import { mfgPlanningApi as mp } from "@/api/mfgPlanning";
import { useMfgResource } from "@/hooks/useManufacturingIntelligence";

import { NoticeBox } from "../phase2/Phase2Ui";
import { PlanningSettingsCard } from "../phase2/TentativeDemandTab";
import { CashRequirementCard } from "./CashRequirementCard";
import { CostAtCompletionCard } from "./CostAtCompletionCard";
import { NotPostedBanner } from "./Phase3Ui";
import type { MfgPhase3Flags } from "./phase3Logic";

/**
 * "Cost & cash" tab (Manufacturing Intelligence Phase 3). Read-only money screens, shown only to users who pass
 * the finance gate. Each card appears only when its own tenant flag is on; nothing here is ever posted.
 * Without integrated planning the Tentative demand tab (which holds the planning settings) is hidden, so the
 * Phase 3 timing settings are offered here instead.
 */
export function CostCashTab({
  flags,
  integratedOn = false,
  canEditSettings = false,
  canViewFinance = false,
}: {
  flags: MfgPhase3Flags;
  integratedOn?: boolean;
  canEditSettings?: boolean;
  canViewFinance?: boolean;
}) {
  const settings = useMfgResource("CostCashTab.settings", "s", integratedOn ? null : () => mp.getPlanningSettings());
  return (
    <div className="space-y-3" data-testid="mfg-costcash-tab">
      <NotPostedBanner />
      <NoticeBox>
        These are <strong>estimates and forecasts</strong> worked out from orders, purchase orders, bills, LCs, loans and payroll. They never create
        vouchers. Each figure is labelled: <strong>Actual</strong> (posted in the accounts), <strong>Committed</strong> (ordered, not billed yet),{" "}
        <strong>Estimate</strong> (calculated) or <strong>Forecast</strong> (expected cash movement).
      </NoticeBox>
      {flags.cost ? <CostAtCompletionCard /> : null}
      {flags.cash ? <CashRequirementCard /> : null}
      {!integratedOn ? (
        <PlanningSettingsCard resource={settings} canEdit={canEditSettings} phase3On canViewFinance={canViewFinance} phase2On={false} />
      ) : null}
    </div>
  );
}
