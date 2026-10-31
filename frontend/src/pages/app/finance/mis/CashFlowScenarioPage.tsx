import { useEffect, useState } from "react";
import {
  api,
  type CashBreakEvenResponse,
  type CashRunwayResponse,
  type CashScenarioAnalysisResponse,
  type CashSensitivityResponse,
} from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";
import { formatMoney, scenarioLabel } from "./misFormat";

export function CashFlowScenarioPage() {
  const [scenarios, setScenarios] = useState<CashScenarioAnalysisResponse | null>(null);
  const [breakEven, setBreakEven] = useState<CashBreakEvenResponse | null>(null);
  const [runway, setRunway] = useState<CashRunwayResponse | null>(null);
  const [salesChange, setSalesChange] = useState(-20);
  const [sensitivity, setSensitivity] = useState<CashSensitivityResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadBase() {
    try {
      setError("");
      setLoading(true);
      const [sc, be, rw] = await Promise.all([
        api.getCashScenarioAnalysis(),
        api.getCashBreakEven(),
        api.getCashRunway(),
      ]);
      setScenarios(sc);
      setBreakEven(be);
      setRunway(rw);
    } catch (e) {
      logApiError("CashFlowScenarioPage.loadBase", e);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function runSensitivity(pct: number) {
    try {
      setSensitivity(
        await api.postCashSensitivity({ variable: "sales", change_percent: pct }),
      );
    } catch (e) {
      logApiError("CashFlowScenarioPage.runSensitivity", e);
    }
  }

  useEffect(() => {
    void loadBase();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void runSensitivity(salesChange), 400);
    return () => window.clearTimeout(timer);
  }, [salesChange]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title="Cash Flow Scenarios"
        description="Best / expected / worst cash scenarios, sensitivity, break-even, and runway from posted vouchers."
        backTo={{ label: "MIS Dashboard", to: "/app/finance/mis" }}
      />

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      {loading && !scenarios ? <p className="text-sm text-gray-500">Loading…</p> : null}

      {scenarios?.narrative ? (
        <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          {scenarios.narrative}
        </p>
      ) : null}

      {scenarios?.scenarios?.length ? (
        <div className="grid gap-3 md:grid-cols-3">
          {scenarios.scenarios.map((s) => (
            <div
              key={s.name}
              className={`rounded-lg border p-4 ${
                s.name === "expected" ? "border-brand-primary bg-brand-subtle" : "border-gray-200 bg-white"
              }`}
            >
              <h3 className="text-sm font-semibold text-gray-800">{scenarioLabel(s.name)}</h3>
              <dl className="mt-2 space-y-1 text-xs text-gray-600">
                <div className="flex justify-between">
                  <dt>Monthly inflow</dt>
                  <dd className="tabular-nums font-medium text-gray-900">{formatMoney(s.monthly_inflow)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Monthly outflow</dt>
                  <dd className="tabular-nums font-medium text-gray-900">{formatMoney(s.monthly_outflow)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Net monthly</dt>
                  <dd className="tabular-nums font-medium text-gray-900">{formatMoney(s.net_monthly)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Cash in 12 mo</dt>
                  <dd className="tabular-nums font-medium text-gray-900">{formatMoney(s.ending_cash_12m)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Runway</dt>
                  <dd className="font-medium text-gray-900">{s.runway_label}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      ) : null}

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-800">Sensitivity — sales change</h2>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <input
            type="range"
            min={-50}
            max={30}
            step={5}
            value={salesChange}
            onChange={(e) => setSalesChange(Number(e.target.value))}
            className="w-full max-w-md"
          />
          <span className="text-sm font-medium tabular-nums text-gray-800">{salesChange > 0 ? "+" : ""}{salesChange}%</span>
        </div>
        {sensitivity?.adjusted ? (
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <span className="text-gray-500">Adjusted net monthly: </span>
              <span className="font-medium tabular-nums">{formatMoney(sensitivity.adjusted.net_monthly)}</span>
            </div>
            <div>
              <span className="text-gray-500">Adjusted runway: </span>
              <span className="font-medium">
                {sensitivity.adjusted.runway_months != null
                  ? `${sensitivity.adjusted.runway_months.toFixed(1)} months`
                  : "Sustainable"}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Ending cash (12 mo): </span>
              <span className="font-medium tabular-nums">{formatMoney(sensitivity.adjusted.ending_cash_12m)}</span>
            </div>
          </dl>
        ) : null}
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        {breakEven ? (
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-800">Break-even</h2>
            <dl className="mt-2 space-y-1 text-sm text-gray-600">
              <div className="flex justify-between">
                <dt>Monthly fixed costs (est.)</dt>
                <dd className="tabular-nums">{formatMoney(breakEven.monthly_fixed_costs_est)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Break-even revenue / month</dt>
                <dd className="tabular-nums font-medium text-gray-900">
                  {breakEven.break_even_monthly_revenue != null
                    ? formatMoney(breakEven.break_even_monthly_revenue)
                    : "n/a"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Current revenue (est.)</dt>
                <dd className="tabular-nums">{formatMoney(breakEven.current_monthly_revenue_est)}</dd>
              </div>
              {breakEven.gap != null ? (
                <div className="flex justify-between">
                  <dt>Gap to break-even</dt>
                  <dd className="tabular-nums">{formatMoney(breakEven.gap)}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        ) : null}

        {runway ? (
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-800">Cash runway</h2>
            <dl className="mt-2 space-y-1 text-sm text-gray-600">
              <div className="flex justify-between">
                <dt>Cash on hand</dt>
                <dd className="tabular-nums font-medium text-gray-900">{formatMoney(runway.current_cash)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Net monthly</dt>
                <dd className="tabular-nums">{formatMoney(runway.net_monthly)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Runway</dt>
                <dd className="font-medium text-gray-900">{runway.runway_label}</dd>
              </div>
            </dl>
            {runway.narrative ? (
              <p className="mt-2 text-xs text-gray-500">{runway.narrative}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
