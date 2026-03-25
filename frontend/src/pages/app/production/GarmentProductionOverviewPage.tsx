import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function GarmentProductionOverviewPage() {
  const [date, setDate] = useState(todayISO());
  const [optSettings, setOptSettings] = useState<Awaited<ReturnType<typeof api.getProductionSettings>> | null>(null);
  const [lines, setLines] = useState<Awaited<ReturnType<typeof api.listSewingLines>>>([]);
  const [shifts, setShifts] = useState<Awaited<ReturnType<typeof api.listProductionShifts>>>([]);
  const [kpi, setKpi] = useState<Awaited<ReturnType<typeof api.getProductionDashboard>> | null>(null);
  const [error, setError] = useState("");

  const loadBase = useCallback(async () => {
    try {
      const [s, l, sh] = await Promise.all([
        api.getProductionSettings(),
        api.listSewingLines(),
        api.listProductionShifts(),
      ]);
      setOptSettings(s);
      setLines(l);
      setShifts(sh);
    } catch (e) {
      logApiError(e, "GarmentProductionOverviewPage.loadBase");
      setError("Could not load production settings.");
    }
  }, []);

  const loadKpi = useCallback(async () => {
    try {
      setError("");
      const k = await api.getProductionDashboard(date);
      setKpi(k);
    } catch (e) {
      logApiError(e, "GarmentProductionOverviewPage.loadKpi");
      setError("Could not load dashboard KPIs.");
    }
  }, [date]);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  useEffect(() => {
    void loadKpi();
  }, [loadKpi]);

  const firstRun = useMemo(
    () => lines.length === 0 && shifts.length === 0,
    [lines.length, shifts.length],
  );

  return (
    <div className="space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Production overview</h1>
        <p className="text-sm text-text-muted">Shop-floor KPIs, line status, and quick links.</p>
      </div>

      {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      {firstRun ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-medium">First-time setup</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Add your first shift (e.g. Morning 08:00–17:00).</li>
            <li>Add sewing lines with machine/operator counts.</li>
            <li>Review crew roles and line templates on the setup page.</li>
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link className="rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white" to="/app/production/setup">
              Open production setup
            </Link>
            <Link className="rounded-lg border border-border px-3 py-1.5 text-xs" to="/app/production/calendar">
              Factory calendar
            </Link>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-text-secondary">
          Date
          <input
            type="date"
            className="mt-1 block rounded-md border border-border-subtle px-2 py-1.5 text-sm"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <button type="button" className="rounded-lg border border-border px-3 py-1.5 text-sm" onClick={() => void loadKpi()}>
          Refresh KPIs
        </button>
      </div>

      {kpi ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div className="rounded-xl border border-border bg-surface-raised p-3">
            <div className="text-xs text-text-muted">Output (good qty)</div>
            <div className="text-xl font-semibold">{kpi.total_output_today.toFixed(0)}</div>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised p-3">
            <div className="text-xs text-text-muted">Efficiency</div>
            <div className="text-xl font-semibold">
              {kpi.overall_efficiency_pct != null ? `${kpi.overall_efficiency_pct.toFixed(1)}%` : "—"}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised p-3">
            <div className="text-xs text-text-muted">Crew fill rate</div>
            <div className="text-xl font-semibold">
              {kpi.crew_fill_rate_pct != null ? `${kpi.crew_fill_rate_pct.toFixed(1)}%` : "—"}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised p-3">
            <div className="text-xs text-text-muted">CM alerts</div>
            <div className="text-xl font-semibold">{kpi.cm_alerts_open}</div>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised p-3">
            <div className="text-xs text-text-muted">Cutting bundles</div>
            <div className="text-sm">
              Pending <strong>{kpi.cutting_bundles_pending}</strong> · Issued <strong>{kpi.cutting_bundles_issued}</strong>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
          <div className="border-b px-4 py-3 text-sm font-semibold text-text-secondary">Line status ({date})</div>
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle text-left text-text-secondary">
              <tr>
                <th className="px-4 py-2">Line</th>
                <th className="px-4 py-2">Good qty</th>
                <th className="px-4 py-2">Target</th>
                <th className="px-4 py-2">Eff. %</th>
              </tr>
            </thead>
            <tbody>
              {(kpi?.lines ?? []).map((row) => (
                <tr key={String(row.line_id)} className="border-t">
                  <td className="px-4 py-2 font-medium">
                    {String(row.line_code)} — {String(row.name)}
                  </td>
                  <td className="px-4 py-2">{Number(row.output_good ?? 0).toFixed(0)}</td>
                  <td className="px-4 py-2">{Number(row.target_qty ?? 0).toFixed(0)}</td>
                  <td className="px-4 py-2">
                    {row.efficiency_pct != null ? `${Number(row.efficiency_pct).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))}
              {(kpi?.lines ?? []).length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-text-muted" colSpan={4}>
                    No sewing lines yet — add lines in setup.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <div className="text-sm font-semibold text-text-secondary">Quick actions</div>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link className="text-brand-primary hover:underline" to="/app/production/crew-daily">
                Daily crew sheet
              </Link>
            </li>
            <li>
              <Link className="text-brand-primary hover:underline" to="/app/production/hourly/sewing">
                Hourly production — sewing
              </Link>
            </li>
            <li>
              <Link className="text-brand-primary hover:underline" to="/app/production/line-plan">
                Line plan board
              </Link>
            </li>
            <li>
              <Link className="text-brand-primary hover:underline" to="/app/production/quality">
                Shop-floor QC
              </Link>
            </li>
            <li>
              <Link className="text-brand-primary hover:underline" to="/app/production/crew-roster">
                Weekly crew roster
              </Link>
            </li>
            <li>
              <Link className="text-brand-primary hover:underline" to="/app/production/manufacturing-orders">
                Manufacturing orders (legacy)
              </Link>
            </li>
          </ul>
          {optSettings ? (
            <p className="mt-4 text-xs text-text-muted">
              Optional units enabled: {(optSettings.enabled_optional_units ?? []).join(", ") || "none"}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
