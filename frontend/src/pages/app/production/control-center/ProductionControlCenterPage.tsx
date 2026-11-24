/**
 * Production Control Center — 5 tabs (flag prod_control_center_v1).
 * Beginner-friendly hub that deep-links into specialist screens.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import {
  fetchControlCenterSummary,
  fetchCuttingVariance,
  fetchFinishingFunnel,
  fetchFloorBoard,
  fetchMachineMatch,
  type ControlCenterSummary,
  type FloorBoard,
} from "@/api/productionControlCenter";
import { logApiError } from "@/utils/logApiError";

type TabId = "readiness" | "planning" | "cutting" | "floor" | "finishing";

const TABS: { id: TabId; label: string }[] = [
  { id: "readiness", label: "Order readiness & TNA" },
  { id: "planning", label: "Planning & machine match" },
  { id: "cutting", label: "Cutting & process loss" },
  { id: "floor", label: "Live floor & quality" },
  { id: "finishing", label: "Finishing & packing" },
];

function healthClass(h: string): string {
  if (h === "critical") return "text-red-700 bg-red-50";
  if (h === "warning") return "text-amber-800 bg-amber-50";
  return "text-emerald-800 bg-emerald-50";
}

export function ProductionControlCenterPage() {
  const [tab, setTab] = useState<TabId>("readiness");
  const [tvMode, setTvMode] = useState(false);
  const [summary, setSummary] = useState<ControlCenterSummary | null>(null);
  const [floor, setFloor] = useState<FloorBoard | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [cutting, setCutting] = useState<Record<string, unknown> | null>(null);
  const [finishing, setFinishing] = useState<Record<string, unknown> | null>(null);
  const [machineMatch, setMachineMatch] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await fetchControlCenterSummary();
      setSummary(s);
      if (!selectedOrderId && s.orders[0]) setSelectedOrderId(s.orders[0].order_id);
    } catch (e) {
      logApiError("control-center.summary", e);
      setError("Could not load the control center. Check that the feature flag is on.");
    } finally {
      setLoading(false);
    }
  }, [selectedOrderId]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (tab !== "floor") return;
    void (async () => {
      try {
        setFloor(await fetchFloorBoard());
      } catch (e) {
        logApiError("control-center.floor", e);
      }
    })();
  }, [tab]);

  useEffect(() => {
    if (!selectedOrderId) return;
    if (tab === "cutting") {
      void (async () => {
        try {
          setCutting(await fetchCuttingVariance(selectedOrderId));
        } catch (e) {
          logApiError("control-center.cutting", e);
          setCutting({ enabled: false });
        }
      })();
    }
    if (tab === "finishing") {
      void (async () => {
        try {
          setFinishing(await fetchFinishingFunnel(selectedOrderId));
        } catch (e) {
          logApiError("control-center.finishing", e);
          setFinishing({ enabled: false });
        }
      })();
    }
    if (tab === "planning") {
      void (async () => {
        try {
          setMachineMatch(await fetchMachineMatch(selectedOrderId));
        } catch (e) {
          logApiError("control-center.machine-match", e);
          setMachineMatch({ items: [] });
        }
      })();
    }
  }, [tab, selectedOrderId]);

  const orderOptions = useMemo(() => summary?.orders ?? [], [summary]);

  return (
    <div className={tvMode ? "fixed inset-0 z-50 overflow-auto bg-white p-4" : "space-y-4"}>
      {!tvMode && (
        <AppPageHeader
          title="Production Control Center"
          description="Order TNA, machine match, cutting loss, live hourly floor, and finishing funnel — one place."
          actions={
            <div className="flex flex-wrap gap-2">
              <Link
                to="/app/production/line-plan"
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-subtle"
              >
                Line plan
              </Link>
              <Link
                to="/app/production/hourly/sewing"
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-subtle"
              >
                Hourly sewing
              </Link>
              <button
                type="button"
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-subtle"
                onClick={() => setTvMode(true)}
              >
                Factory TV mode
              </button>
            </div>
          }
        />
      )}

      {tvMode && (
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-text-primary">Live floor board</h1>
          <button
            type="button"
            className="rounded-lg border border-border px-3 py-1.5 text-sm"
            onClick={() => setTvMode(false)}
          >
            Exit TV mode
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}

      {!tvMode && (
        <div className="flex flex-wrap gap-2 border-b border-border pb-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                tab === t.id ? "bg-primary text-white" : "bg-surface-subtle text-text-secondary hover:bg-border"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {loading && <p className="text-sm text-text-muted">Loading…</p>}

      {(tab === "readiness" || tab === "planning" || tab === "cutting" || tab === "finishing") && !tvMode && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="text-text-muted">Order</label>
          <select
            className="rounded-lg border border-border px-2 py-1 text-sm"
            value={selectedOrderId ?? ""}
            onChange={(e) => setSelectedOrderId(Number(e.target.value) || null)}
          >
            {orderOptions.map((o) => (
              <option key={o.order_id} value={o.order_id}>
                {o.order_code} {o.delivery_date ? `(${o.delivery_date})` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {(tab === "readiness" || tvMode === false) && tab === "readiness" && summary && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-surface-subtle text-xs text-text-muted">
              <tr>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Delivery</th>
                <th className="px-3 py-2">Qty</th>
                <th className="px-3 py-2">TNA health</th>
                <th className="px-3 py-2">Slip days</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {summary.orders.map((o) => (
                <tr key={o.order_id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{o.order_code}</td>
                  <td className="px-3 py-2">{o.delivery_date ?? "—"}</td>
                  <td className="px-3 py-2">{o.quantity}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${healthClass(o.tna_health)}`}>{o.tna_health}</span>
                  </td>
                  <td className="px-3 py-2">{o.tna_slip_days}</td>
                  <td className="px-3 py-2">
                    <div className="relative inline-block">
                      <details>
                        <summary className="cursor-pointer rounded-lg border border-border px-2.5 py-1 text-xs">
                          Actions
                        </summary>
                        <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-border bg-white p-1 shadow-lg">
                          <Link
                            to={`/app/orders/${o.order_id}`}
                            className="block rounded-md px-2 py-1.5 text-left text-xs hover:bg-surface-subtle"
                          >
                            Open order
                          </Link>
                          <button
                            type="button"
                            className="block w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-surface-subtle"
                            onClick={() => {
                              setSelectedOrderId(o.order_id);
                              setTab("planning");
                            }}
                          >
                            Machine match
                          </button>
                        </div>
                      </details>
                    </div>
                  </td>
                </tr>
              ))}
              {summary.orders.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-text-muted">
                    No open orders.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {summary.feeding?.enabled && (
            <div className="border-t border-border bg-surface-subtle px-3 py-2 text-xs text-text-muted">
              Feeding gate rows: {(summary.feeding.items || []).length} upcoming line runs
            </div>
          )}
        </div>
      )}

      {tab === "planning" && !tvMode && (
        <div className="space-y-3">
          <p className="text-sm text-text-muted">
            Lines ranked by machine-content similarity for the selected order (needs{" "}
            <code className="text-xs">mfg_machine_match_v1</code>).
          </p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-surface-subtle text-xs text-text-muted">
                <tr>
                  <th className="px-3 py-2">Line</th>
                  <th className="px-3 py-2">Match %</th>
                  <th className="px-3 py-2">Swap count</th>
                  <th className="px-3 py-2">Pool OK</th>
                </tr>
              </thead>
              <tbody>
                {((machineMatch?.items as Array<Record<string, unknown>>) || []).map((row) => (
                  <tr key={String(row.line_id)} className="border-t border-border">
                    <td className="px-3 py-2">
                      {String(row.line_code)} — {String(row.line_name)}
                    </td>
                    <td className="px-3 py-2">{String(row.match_pct)}</td>
                    <td className="px-3 py-2">{String(row.swap_count)}</td>
                    <td className="px-3 py-2">{row.pool_can_cover ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Link to="/app/production/line-plan" className="text-sm text-primary underline">
            Open line plan board
          </Link>
        </div>
      )}

      {tab === "cutting" && !tvMode && (
        <div className="space-y-3 text-sm">
          {cutting?.enabled === false ? (
            <p className="text-text-muted">Turn on cutting_loss_control_v1 to see BOM vs CAD vs actual variance.</p>
          ) : (
            <>
              <pre className="overflow-auto rounded-lg border border-border bg-surface-subtle p-3 text-xs">
                {JSON.stringify(cutting, null, 2)}
              </pre>
              <Link to="/app/production/cutting" className="text-primary underline">
                Open cutting page
              </Link>
            </>
          )}
        </div>
      )}

      {(tab === "floor" || tvMode) && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(floor?.lines || []).map((line) => (
            <div key={line.line_id} className="rounded-xl border border-border p-3 shadow-sm">
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold text-text-primary">
                  {line.line_code} <span className="text-xs font-normal text-text-muted">{line.line_name}</span>
                </h3>
                <span className="text-lg font-bold text-primary">{line.efficiency_pct}%</span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-text-muted">Target</div>
                  <div className="font-medium">{line.target_qty}</div>
                </div>
                <div>
                  <div className="text-text-muted">Good</div>
                  <div className="font-medium">{line.good_qty}</div>
                </div>
                <div>
                  <div className="text-text-muted">DHU</div>
                  <div className="font-medium">{line.dhu_pct}%</div>
                </div>
                <div>
                  <div className="text-text-muted">RFT</div>
                  <div className="font-medium">{line.rft_pct}%</div>
                </div>
                <div>
                  <div className="text-text-muted">Manpower</div>
                  <div className="font-medium">
                    {line.present_operators}/{line.planned_operators}
                  </div>
                </div>
                <div>
                  <div className="text-text-muted">Downtime</div>
                  <div className="font-medium">{line.downtime_minutes}m</div>
                </div>
              </div>
              <div className="mt-2 flex gap-1 overflow-x-auto">
                {line.hours.map((h) => (
                  <div key={h.hour_slot} className="min-w-[2.5rem] rounded bg-surface-subtle px-1 py-1 text-center text-[10px]">
                    <div className="text-text-muted">H{h.hour_slot}</div>
                    <div className="font-medium">{h.good_qty ?? "—"}</div>
                  </div>
                ))}
              </div>
              {line.top_defects.length > 0 && (
                <p className="mt-2 text-[11px] text-text-muted">
                  Top defects: {line.top_defects.map((d) => `${d.code}(${d.qty})`).join(", ")}
                </p>
              )}
            </div>
          ))}
          {floor && !floor.enabled && (
            <p className="text-sm text-text-muted">Turn on floor_live_monitor_v1 for the live board.</p>
          )}
          {floor?.enabled && floor.lines.length === 0 && (
            <p className="text-sm text-text-muted">No sewing lines or no hourly data today.</p>
          )}
        </div>
      )}

      {tab === "finishing" && !tvMode && (
        <div className="space-y-3 text-sm">
          {finishing?.enabled === false ? (
            <p className="text-text-muted">Turn on finishing_stage_wip_v1 for the packing funnel.</p>
          ) : (
            <>
              <pre className="overflow-auto rounded-lg border border-border bg-surface-subtle p-3 text-xs">
                {JSON.stringify(finishing, null, 2)}
              </pre>
              <Link to="/app/production/finishing-packing" className="text-primary underline">
                Open finishing page
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
