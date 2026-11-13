import { useMemo, useState, type FormEvent } from "react";

import type { ForwardBucket, ForwardPlanQuery } from "@/api/mfgAdvancedPlanning";
import { mfgPlanningApi } from "@/api/mfgPlanning";
import { useMfgResource } from "@/hooks/useManufacturingIntelligence";

import type { MfgTabId } from "../phase2/phase2Logic";
import { inputCls, labelCls, secondaryBtn } from "../phase2/Phase2Ui";
import { PlanningSettingsCard } from "../phase2/TentativeDemandTab";
import { CapacityDemandView } from "./CapacityDemandView";
import { FinanceConstrainedView } from "./FinanceConstrainedView";
import {
  DEFAULT_HORIZON,
  HORIZONS,
  draftToParams,
  forwardViews,
  loadScenarioDraft,
  saveScenarioDraft,
  type ForwardView,
  type MfgPhase5Flags,
  type ScenarioDraft,
} from "./phase5Logic";
import { ScenarioCompareView } from "./ScenarioCompareView";
import { SchedulerView } from "./SchedulerView";

function browserStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Phase 5 "Forward plan" tab: capacity vs demand for 90-180 days, scenarios, the finance-limited view and the
 * scheduler proposal. Everything here is read-only except "Create plan revision", which only proposes a change.
 */
export function ForwardPlanTab({
  flags,
  canViewFinance,
  canPropose,
  canEditSettings,
  storageKey,
  onOpenTab,
}: {
  flags: MfgPhase5Flags;
  canViewFinance: boolean;
  canPropose: boolean;
  canEditSettings: boolean;
  /** `p7_mfg_scenario:<tenant_id>:<user_id>`; null = parameters are not remembered. */
  storageKey: string | null;
  onOpenTab?: (tab: MfgTabId) => void;
}) {
  const views = forwardViews(flags, canViewFinance);
  const [viewChoice, setViewChoice] = useState<ForwardView>("capacity");
  const view: ForwardView = views.some((v) => v.id === viewChoice) ? viewChoice : "capacity";

  const [horizon, setHorizon] = useState<number>(DEFAULT_HORIZON);
  const [bucket, setBucket] = useState<ForwardBucket>("week");
  const [unitDraft, setUnitDraft] = useState("");
  const [unit, setUnit] = useState("");

  const [draft, setDraft] = useState<ScenarioDraft>(() => loadScenarioDraft(browserStorage(), storageKey));
  const [applied, setApplied] = useState<ScenarioDraft>(draft);

  const filter = useMemo(
    () => ({ horizon_days: horizon, bucket, factory_unit: unit.trim() || undefined }),
    [horizon, bucket, unit],
  );
  const query: ForwardPlanQuery = useMemo(
    () => ({ ...filter, scenario: applied.scenario, ...draftToParams(applied) }),
    [filter, applied],
  );

  const settings = useMfgResource("ForwardPlanTab.settings", "s", () => mfgPlanningApi.getPlanningSettings());

  if (!flags.advanced) return null;

  const applyUnit = (e: FormEvent) => {
    e.preventDefault();
    setUnit(unitDraft);
  };

  return (
    <div className="space-y-3" data-testid="mfg-forward-plan-tab">
      <div className="rounded-xl border border-border bg-surface-raised p-3 space-y-3">
        <p className="text-xs text-text-muted">
          Looks 90-180 days ahead: how much sewing capacity there is, and how much confirmed, booked, tentative and forecast work needs it. These are
          estimates; they never change orders or plans.
        </p>
        <form className="flex flex-wrap items-end gap-3" onSubmit={applyUnit}>
          <div>
            <label htmlFor="mfg-fwd-horizon" className={labelCls}>
              Horizon
            </label>
            <select id="mfg-fwd-horizon" className={inputCls} value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
              {HORIZONS.map((h) => (
                <option key={h} value={h}>
                  {h} days
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="mfg-fwd-bucket" className={labelCls}>
              Group by
            </label>
            <select id="mfg-fwd-bucket" className={inputCls} value={bucket} onChange={(e) => setBucket(e.target.value as ForwardBucket)}>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
          </div>
          <div>
            <label htmlFor="mfg-fwd-unit" className={labelCls}>
              Factory unit (optional)
            </label>
            <input id="mfg-fwd-unit" type="text" className={`${inputCls} w-36`} value={unitDraft} onChange={(e) => setUnitDraft(e.target.value)} />
          </div>
          <button type="submit" className={secondaryBtn}>
            Apply
          </button>
        </form>

        {views.length > 1 ? (
          <div className="flex flex-wrap gap-1" role="group" aria-label="Forward plan views">
            {views.map((v) => (
              <button
                key={v.id}
                type="button"
                aria-pressed={view === v.id}
                data-testid={`mfg-forward-view-${v.id}`}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  view === v.id ? "border-brand-primary bg-brand-primary text-brand-primary-foreground" : "border-border text-text-secondary hover:bg-surface-subtle"
                }`}
                onClick={() => setViewChoice(v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {view === "capacity" ? <CapacityDemandView query={query} /> : null}
      {view === "scenarios" ? (
        <ScenarioCompareView
          filter={filter}
          draft={draft}
          onDraftChange={setDraft}
          onApply={(d) => {
            setApplied(d);
            setViewChoice("capacity");
          }}
          onSave={(d) => saveScenarioDraft(browserStorage(), storageKey, d)}
          canSave={storageKey != null}
        />
      ) : null}
      {view === "finance" ? <FinanceConstrainedView horizonDays={horizon} factoryUnit={filter.factory_unit} /> : null}
      {view === "scheduler" ? <SchedulerView horizonDays={horizon} factoryUnit={filter.factory_unit} canPropose={canPropose} onOpenTab={onOpenTab} /> : null}

      <details className="rounded-xl border border-border bg-surface-raised p-3">
        <summary className="cursor-pointer text-sm font-semibold text-text-primary">Scheduler settings (frozen zone, changeover loss)</summary>
        <div className="mt-2">
          <PlanningSettingsCard resource={settings} canEdit={canEditSettings} phase2On={false} />
        </div>
      </details>
    </div>
  );
}
