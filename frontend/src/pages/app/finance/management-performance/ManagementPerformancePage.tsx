/**
 * Finance > Management Performance (tenant flag `mgmt_performance_v1`, default OFF).
 * Income vs expense for the month / quarter / year: posted profit, the expected contribution of finished goods,
 * the expense forecast against the budget with warnings and an answer flow, break-even targets and weekly cash.
 * Inner views use `?view=` (the finance hub owns `?tab=`). Nothing here writes a voucher.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { mgmtPerformanceApi, type MpAccess } from "@/api/mgmtPerformance";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { listPageRootClass } from "@/components/app/listPageLayout";
import { LoadingBlock, ReportError } from "@/components/finance/budget/BudgetPageParts";
import { useFiscalStartMonth } from "@/components/finance/statements/StatementPeriodPicker";
import { useAuth } from "@/context/AuthContext";
import {
  CONFIDENTIAL_REPORTS_DENIED,
  useCanViewConfidentialReports,
} from "@/hooks/useCanViewConfidentialReports";
import { useStatementResource } from "@/hooks/useFinanceStatements";
import { todayLocalISO } from "@/lib/dates";
import { BudgetForecastView } from "./BudgetForecastView";
import { CashView } from "./CashView";
import { ExceptionsView } from "./ExceptionsView";
import { FinishedGoodsView } from "./FinishedGoodsView";
import { fieldClass } from "./MpParts";
import { OverviewView } from "./OverviewView";
import { RevisionsView } from "./RevisionsView";
import { SetupView } from "./SetupView";
import { TargetsView } from "./TargetsView";
import { isMgmtPerformanceEnabled, parseView, periodOptions, visibleViews, type MpView } from "./mgmtPerformanceLogic";

function SwitchedOff() {
  return (
    <div role="status" className="rounded-xl border border-border bg-surface-raised p-6 text-sm text-text-secondary">
      <p className="font-semibold text-text-primary">Management performance is switched off</p>
      <p className="mt-1">
        An admin can switch on <b>Management performance</b> in Settings → Configuration → Finance (More features).
      </p>
    </div>
  );
}

export function ManagementPerformancePage() {
  const enabled = isMgmtPerformanceEnabled(useAuth().me?.feature_flags);
  const canViewConfidential = useCanViewConfidentialReports();
  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Management Performance"
        description="What we are earning against what we are spending: posted profit, the expected contribution of finished goods, the expense forecast against the budget, break-even targets and cash."
      />
      {!canViewConfidential ? (
        <div role="alert" className="rounded-xl border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
          {CONFIDENTIAL_REPORTS_DENIED}
        </div>
      ) : enabled ? (
        <Body />
      ) : (
        <SwitchedOff />
      )}
    </div>
  );
}

function Body() {
  const startMonth = useFiscalStartMonth();
  const [params, setParams] = useSearchParams();
  const options = useMemo(() => periodOptions(todayLocalISO(), startMonth), [startMonth]);
  const [period, setPeriod] = useState(options[0]?.value ?? "");
  const accessRes = useStatementResource<MpAccess>("mp.access", "x", () => mgmtPerformanceApi.getAccess());
  const access = accessRes.data;
  const view = parseView(params.get("view"), access);

  function go(next: MpView) {
    const p = new URLSearchParams(params);
    p.set("view", next);
    setParams(p, { replace: true });
  }

  if (accessRes.error) return <ReportError error={accessRes.error} status={accessRes.errorStatus} onRetry={accessRes.reload} />;
  if (!access) return <LoadingBlock label="Loading" />;
  if (!access.allowed || !view) {
    return (
      <p role="alert" className="rounded-xl border border-border bg-surface-raised p-6 text-sm text-text-secondary">
        You do not have access. Ask an admin for the “View company profit…” permission, or to make you the owner of a cost centre.
      </p>
    );
  }
  const showPeriod = view !== "cash" && view !== "setup" && view !== "exceptions" && view !== "revisions";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <nav className="flex flex-wrap gap-1" role="tablist" aria-label="Management performance views">
          {visibleViews(access).map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                view === v.id ? "bg-brand-primary text-white" : "text-text-secondary hover:bg-surface-subtle"
              }`}
              onClick={() => go(v.id)}
            >
              {v.label}
            </button>
          ))}
        </nav>
        {showPeriod ? (
          <label className="text-xs font-medium text-text-muted">
            Period
            <select className={`${fieldClass} ml-2`} value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Period">
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {view === "overview" ? <OverviewView period={period} /> : null}
      {view === "budget" ? <BudgetForecastView period={period} access={access} onShowExceptions={() => go("exceptions")} /> : null}
      {view === "exceptions" ? <ExceptionsView access={access} /> : null}
      {view === "revisions" ? <RevisionsView /> : null}
      {view === "finished-goods" ? <FinishedGoodsView period={period} /> : null}
      {view === "targets" ? <TargetsView period={period} /> : null}
      {view === "cash" ? <CashView /> : null}
      {view === "setup" ? <SetupView canSetup={access.can_setup === true} /> : null}
    </div>
  );
}
