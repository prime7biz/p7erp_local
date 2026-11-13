import { useMemo, useState } from "react";

import { mfgPlanningApi } from "@/api/mfgPlanning";
import type { ControlTowerOrderRow } from "@/api/models";
import {
  useMfgCapacity,
  useMfgDeliveryPrediction,
  useMfgLineLoading,
  useMfgReadiness,
  useMfgResource,
  useMfgSummary,
} from "@/hooks/useManufacturingIntelligence";
import { toLocalISODate, todayLocalISO } from "@/lib/dates";

import { CapacityComparisonPanel } from "./CapacityComparisonPanel";
import { DeliveryRiskPanel } from "./DeliveryRiskPanel";
import { Chip } from "./IntelligenceUi";
import { LineLoadingPanel } from "./LineLoadingPanel";
import { windowDays } from "./panelLogic";
import { MaterialsTab } from "./phase2/MaterialsTab";
import { PeopleMachinesTab } from "./phase2/PeopleMachinesTab";
import { NO_PHASE2, visibleTabs, type MfgPhase2Flags, type MfgTabId } from "./phase2/phase2Logic";
import { PlanChangesTab } from "./phase2/PlanChangesTab";
import { RouteStagesCard } from "./phase2/RouteStagesCard";
import { StyleSmvEditor } from "./phase2/StyleSmvEditor";
import { TentativeDemandTab } from "./phase2/TentativeDemandTab";
import { CostCashTab } from "./phase3/CostCashTab";
import { NO_PHASE3, phase3AnyOn, showCostCashTab, type MfgPhase3Flags } from "./phase3/phase3Logic";
import { NO_PHASE4, type MfgPhase4Flags } from "./phase4/phase4Logic";
import { PredictionsTab } from "./phase4/PredictionsTab";
import { ForwardPlanTab } from "./phase5/ForwardPlanTab";
import { NO_PHASE5, type MfgPhase5Flags } from "./phase5/phase5Logic";
import { OrderPicker, ReadinessPanel } from "./ReadinessPanel";

const MAX_DAYS = 180;

function addDays(iso: string, days: number) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return toLocalISODate(d);
}

type Props = {
  /** Tenant flag manufacturing_intelligence_v1. When false nothing is rendered and nothing is fetched. */
  enabled: boolean;
  orderOptions?: ControlTowerOrderRow[];
  focusOrderId?: number | null;
  /** Phase 2 tenant flags (strict true). Each one adds tabs; all are off by default. */
  phase2?: MfgPhase2Flags;
  /** Phase 3 tenant flags (strict true): cost at completion / cash requirement. Off by default. */
  phase3?: MfgPhase3Flags;
  /** Phase 4 tenant flags (strict true): Predictions tab and its optional AI wording. Off by default. */
  phase4?: MfgPhase4Flags;
  /** Phase 5 tenant flags (strict true): Forward plan tab (scenarios, finance-limited view, scheduler). Off by default. */
  phase5?: MfgPhase5Flags;
  /** Browser key for saved scenario parameters (`p7_mfg_scenario:<tenant_id>:<user_id>`); null = not remembered. */
  scenarioStorageKey?: string | null;
  /** Signed-in user's role; only used to hide admin / manager-only material actions (the backend still checks). */
  roleName?: string | null;
  /** Deep link `?tab=`: tab to open first (ignored when that tab is not available). */
  initialTab?: MfgTabId | null;
  /** Deep link `?finding=`: recommendation to open on the Predictions tab. */
  focusFindingId?: number | null;
};

/**
 * "Manufacturing intelligence" section of the Control Tower. Overview is read-only; Phase 2 tabs
 * (Materials, Plan changes, Tentative demand, People & machines) appear only when their tenant flag is on.
 * Money (Phase 3 "Cost & cash" tab) appears only with a Phase 3 flag AND the can_view_finance permission hint.
 * Phase 4 "Predictions" (statistics from the company's own history, no money) appears only with its own flag.
 */
export function ManufacturingIntelligenceSection({
  enabled,
  orderOptions = [],
  focusOrderId = null,
  phase2 = NO_PHASE2,
  phase3 = NO_PHASE3,
  phase4 = NO_PHASE4,
  phase5 = NO_PHASE5,
  scenarioStorageKey = null,
  roleName = null,
  initialTab = null,
  focusFindingId = null,
}: Props) {
  const [from, setFrom] = useState(() => todayLocalISO());
  const [to, setTo] = useState(() => addDays(todayLocalISO(), 89));
  const [factoryUnit, setFactoryUnit] = useState("");
  const [orderId, setOrderId] = useState<number | null>(focusOrderId);
  const [tabChoice, setTabChoice] = useState<MfgTabId>(initialTab ?? "overview");

  const phase2TabCount = visibleTabs(phase2).length;
  // UI hints only (hide buttons the user may not use, hide money without the finance gate); every endpoint still checks.
  const permsRes = useMfgResource(
    "MfgSection.permissions",
    "perms",
    enabled && (phase2TabCount > 1 || phase3AnyOn(phase3) || phase5.advanced) ? () => mfgPlanningApi.getPlanningPermissions() : null,
  );
  const perms = permsRes.data;
  const tabs = visibleTabs(phase2, {
    costCash: showCostCashTab(phase3, perms?.can_view_finance),
    predictions: phase4.predictions,
    forward: phase5.advanced,
  });
  const tab: MfgTabId = tabs.some((t) => t.id === tabChoice) ? tabChoice : "overview";
  const onOverview = tab === "overview";

  const days = windowDays(from, to);
  const windowError =
    Number.isNaN(days) || days < 1
      ? "Choose a valid date range (From must not be after To)."
      : days > MAX_DAYS
        ? `The window can be at most ${MAX_DAYS} days (now ${days}).`
        : "";
  const active = enabled && onOverview && !windowError;
  const w = useMemo(
    () => ({ date_from: from, date_to: to, factory_unit: factoryUnit.trim() || undefined }),
    [from, to, factoryUnit],
  );

  const summary = useMfgSummary(w, active);
  const capacity = useMfgCapacity(w, active);
  const lineLoading = useMfgLineLoading(w, active);
  const readiness = useMfgReadiness(enabled && onOverview ? orderId : null);
  const delivery = useMfgDeliveryPrediction(enabled && onOverview ? orderId : null);

  if (!enabled) return null;

  const flags = summary.data?.flags;
  const refresh = () => {
    summary.reload();
    capacity.reload();
    lineLoading.reload();
    readiness.reload();
    delivery.reload();
  };
  const orderStyleId = orderOptions.find((o) => o.order_id === orderId)?.style_id ?? null;

  return (
    <section className="space-y-3" aria-labelledby="mfg-intel-heading" data-testid="mfg-intelligence-section">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="mfg-intel-heading" className="text-sm font-semibold text-text-primary">
          Manufacturing intelligence
        </h2>
        {onOverview && !phase2.integrated ? <Chip tone="info">Read-only</Chip> : null}
        {flags ? (
          <>
            <Chip tone={flags.planning_math_v2 ? "good" : "warn"}>
              {flags.planning_math_v2 ? "Corrected maths on" : "Corrected maths off"}
            </Chip>
            <Chip tone={flags.mfg_order_bom_readiness_v2 ? "good" : "neutral"}>
              {flags.mfg_order_bom_readiness_v2 ? "Readiness uses order BOM" : "Readiness uses legacy style BOM"}
            </Chip>
          </>
        ) : null}
        {phase2.fourEyes && phase2.integrated ? <Chip tone="info">Four-eyes plan approval on</Chip> : null}
      </div>

      {tabs.length > 1 ? (
        <div className="-mx-1 overflow-x-auto px-1">
          <div role="tablist" aria-label="Manufacturing intelligence" className="flex min-w-max gap-1 border-b border-border">
            {tabs.map((t) => (
              <button
                key={t.id}
                id={`mfg-tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                aria-controls="mfg-tabpanel"
                className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
                  tab === t.id ? "border-brand-primary text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary"
                }`}
                onClick={() => setTabChoice(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div id="mfg-tabpanel" role={tabs.length > 1 ? "tabpanel" : undefined} aria-labelledby={tabs.length > 1 ? `mfg-tab-${tab}` : undefined} className="space-y-3">
        {onOverview ? (
          <>
            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface-raised p-3">
              <div>
                <label htmlFor="mfg-from" className="block text-xs font-medium text-text-secondary">
                  Window from
                </label>
                <input id="mfg-from" type="date" className="mt-1 rounded border border-border px-2 py-1 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div>
                <label htmlFor="mfg-to" className="block text-xs font-medium text-text-secondary">
                  Window to
                </label>
                <input id="mfg-to" type="date" className="mt-1 rounded border border-border px-2 py-1 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <div>
                <label htmlFor="mfg-factory" className="block text-xs font-medium text-text-secondary">
                  Factory unit (optional)
                </label>
                <input
                  id="mfg-factory"
                  type="text"
                  className="mt-1 w-36 rounded border border-border px-2 py-1 text-sm"
                  value={factoryUnit}
                  onChange={(e) => setFactoryUnit(e.target.value)}
                />
              </div>
              <button type="button" className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-primary" onClick={refresh}>
                Reload
              </button>
              <p className="text-[11px] text-text-muted">Max {MAX_DAYS} days.</p>
            </div>
            {windowError ? (
              <div role="alert" className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-950">
                {windowError}
              </div>
            ) : null}

            {summary.data?.notices.length ? (
              <ul className="list-disc pl-5 text-[11px] text-text-muted">
                {summary.data.notices.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : null}

            <CapacityComparisonPanel capacity={capacity.data} summary={summary.data} loading={capacity.loading || summary.loading} error={capacity.error} />
            <LineLoadingPanel capacity={capacity.data} lineLoading={lineLoading.data} loading={lineLoading.loading} error={lineLoading.error} />

            <div className="rounded-xl border border-border bg-surface-raised p-3">
              <OrderPicker orders={orderOptions} orderId={orderId} onChange={setOrderId} />
            </div>
            <div className="grid gap-3 xl:grid-cols-2">
              <ReadinessPanel readiness={readiness.data} hasOrder={orderId != null} loading={readiness.loading} error={readiness.error} />
              <DeliveryRiskPanel
                summary={summary.data}
                prediction={delivery.data}
                hasOrder={orderId != null}
                summaryLoading={summary.loading}
                summaryError={summary.error}
                predictionLoading={delivery.loading}
                predictionError={delivery.error}
              />
            </div>
            {phase2.integrated && orderId != null ? (
              <div className="grid gap-3 xl:grid-cols-2">
                <RouteStagesCard orderId={orderId} />
                {orderStyleId != null ? (
                  <div className="rounded-xl border border-border bg-surface-raised p-4">
                    <StyleSmvEditor key={orderStyleId} styleId={orderStyleId} canEdit={perms?.can_edit_style_smv ?? true} />
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        {tab === "materials" ? (
          <MaterialsTab
            orderOptions={orderOptions}
            orderId={orderId}
            onOrderChange={setOrderId}
            roleName={perms ? (perms.is_admin_or_manager ? "manager" : null) : roleName}
            canAllocate={perms?.can_allocate ?? true}
          />
        ) : null}
        {tab === "plan" ? <PlanChangesTab orderOptions={orderOptions} fourEyes={phase2.fourEyes} canPropose={perms?.can_propose ?? true} /> : null}
        {tab === "tentative" ? (
          <TentativeDemandTab
            canEditSettings={perms?.can_manage_settings ?? true}
            canWrite={perms?.can_manage_tentative ?? true}
            phase3On={phase3AnyOn(phase3)}
            canViewFinance={perms?.can_view_finance === true}
          />
        ) : null}
        {tab === "people" ? (
          <PeopleMachinesTab canWrite={perms?.can_manage_assignments ?? true} canEditSmv={perms?.can_edit_style_smv ?? true} />
        ) : null}
        {tab === "costcash" ? (
          <CostCashTab
            flags={phase3}
            integratedOn={phase2.integrated}
            canEditSettings={perms?.can_manage_settings === true}
            canViewFinance={perms?.can_view_finance === true}
          />
        ) : null}
        {tab === "predictions" ? (
          <PredictionsTab
            flags={phase4}
            orderOptions={orderOptions}
            orderId={orderId}
            onOrderChange={setOrderId}
            integratedOn={phase2.integrated}
            focusFindingId={focusFindingId}
            onOpenTab={setTabChoice}
          />
        ) : null}
        {tab === "forward" ? (
          <ForwardPlanTab
            flags={phase5}
            canViewFinance={perms?.can_view_finance === true}
            canPropose={perms?.can_propose ?? true}
            canEditSettings={perms?.can_manage_settings ?? true}
            storageKey={scenarioStorageKey}
            onOpenTab={setTabChoice}
          />
        ) : null}
      </div>
    </section>
  );
}
