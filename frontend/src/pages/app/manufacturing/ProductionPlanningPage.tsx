import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";

import { api, type InventoryItemResponse, type MfgProductionPlanCreate, type MfgMrpRunCreate } from "@/api/client";
import { AIInsightsBar } from "@/components/production/planning/AIInsightsBar";
import { AISuggestionModal } from "@/components/production/planning/AISuggestionModal";
import { CapacityHeatmap } from "@/components/production/planning/CapacityHeatmap";
import { ChainStatusPills } from "@/components/production/planning/ChainStatusPills";
import { ReadinessDetailPanel } from "@/components/production/planning/ReadinessDetailPanel";
import { useAIPlanningInsights } from "@/hooks/useAIPlanningInsights";
import { useProductionPipeline, type PipelineViewMode } from "@/hooks/useProductionPipeline";
import type { CustomerApprovalChain, MaterialReadinessChain, PipelineOrderRow } from "@/types/productionPlanning";
import { logApiError } from "@/utils/logApiError";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

type TabKey = "pipeline" | "whatif" | "history";

function matchesFilter(
  row: PipelineOrderRow,
  statusFilter: string,
  q: string,
  from: string | null,
  to: string | null,
): boolean {
  const r = row.readiness;
  const overall = r.overall_status ?? "";
  const chain = r.chain;
  const lineSt = chain?.line_allocated?.status ?? "not_started";

  if (statusFilter === "ready" && overall !== "ready") return false;
  if (statusFilter === "warning" && overall !== "warning") return false;
  if (statusFilter === "blocked" && overall !== "blocked") return false;
  if (statusFilter === "allocated" && lineSt !== "ready") return false;

  if (q.trim()) {
    const hay = `${row.order_code} ${row.style_ref ?? ""} ${r.style_code ?? ""} ${r.style_name ?? ""}`.toLowerCase();
    if (!hay.includes(q.trim().toLowerCase())) return false;
  }

  if (from && row.delivery_date && row.delivery_date < from) return false;
  if (to && row.delivery_date && row.delivery_date > to) return false;

  return true;
}

export function ProductionPlanningPage() {
  const [tab, setTab] = useState<TabKey>("pipeline");
  const [view, setView] = useState<PipelineViewMode>("order");
  const { loading, error, orderRows, styleGroups, reload } = useProductionPipeline(view);
  const { summary, loading: aiLoading, refresh: refreshAi } = useAIPlanningInsights();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQ, setSearchQ] = useState("");
  const [deliveryFrom, setDeliveryFrom] = useState<string | null>(null);
  const [deliveryTo, setDeliveryTo] = useState<string | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null); // null = none expanded
  const [selectedChainKey, setSelectedChainKey] = useState<string | null>(null);

  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestOrderId, setSuggestOrderId] = useState<number | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<Record<string, unknown> | null>(null);

  // What-if / MRP
  const [lines, setLines] = useState<Awaited<ReturnType<typeof api.listSewingLines>>>([]);
  const [capacityRows, setCapacityRows] = useState<Awaited<ReturnType<typeof api.getMfgCapacityLoads>>>([]);
  const [capLoading, setCapLoading] = useState(false);
  const [predictConfigId, setPredictConfigId] = useState<number | null>(null);
  const [predictLineId, setPredictLineId] = useState<number | null>(null);
  const [predictStart, setPredictStart] = useState(todayIso());
  const [prediction, setPrediction] = useState<string | null>(null);
  const [predictLoading, setPredictLoading] = useState(false);

  const [efficiencyText, setEfficiencyText] = useState<string | null>(null);
  const [efficiencyLoading, setEfficiencyLoading] = useState(false);

  const [planId, setPlanId] = useState<number | null>(null);
  const [horizonStart, setHorizonStart] = useState(todayIso());
  const [horizonEnd, setHorizonEnd] = useState(todayIso());
  const [mrpRun, setMrpRun] = useState<Awaited<ReturnType<typeof api.runMfgMrp>> | null>(null);
  const [mrpRecs, setMrpRecs] = useState<Awaited<ReturnType<typeof api.getMfgMrpRecommendations>>>([]);
  const [mrpLoading, setMrpLoading] = useState(false);

  // History tab (MFG plans)
  const [items, setItems] = useState<InventoryItemResponse[]>([]);
  const [plans, setPlans] = useState<Awaited<ReturnType<typeof api.listMfgProductionPlans>>>([]);
  const [histError, setHistError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<MfgProductionPlanCreate>({
    period_start: todayIso(),
    period_end: todayIso(),
    lines: [],
  });
  const [line, setLine] = useState({ item_id: 0, planned_qty: 0, due_date: todayIso(), priority: 5 });

  const loadHistory = useCallback(async () => {
    setHistError("");
    try {
      const [itemRows, planRows] = await Promise.all([api.listInventoryItems(), api.listMfgProductionPlans()]);
      setItems(itemRows);
      setPlans(planRows);
      if (itemRows[0]) {
        const firstItem = itemRows[0];
        setLine((prev) => (!prev.item_id && firstItem ? { ...prev, item_id: firstItem.id } : prev));
      }
    } catch (e) {
      setHistError(e instanceof Error ? e.message : "Failed to load planning data");
    }
  }, []);

  useEffect(() => {
    if (tab === "whatif") {
      void (async () => {
        setCapLoading(true);
        try {
          const [ln, cap] = await Promise.all([api.listSewingLines(), api.getMfgCapacityLoads()]);
          const active = ln.filter((l) => l.is_active);
          setLines(active);
          setCapacityRows(cap);
          setPredictLineId((prev) => (prev != null ? prev : active[0]?.id ?? null));
        } catch (e) {
          logApiError(e, "ProductionPlanningPage.whatifLoad");
        } finally {
          setCapLoading(false);
        }
      })();
    }
  }, [tab]);

  useEffect(() => {
    if (tab === "history") void loadHistory();
  }, [tab, loadHistory]);

  const filteredOrders = useMemo(() => {
    return orderRows.filter((row) => matchesFilter(row, statusFilter, searchQ, deliveryFrom, deliveryTo));
  }, [orderRows, statusFilter, searchQ, deliveryFrom, deliveryTo]);

  const itemName = useMemo(() => new Map(items.map((i) => [i.id, i.name])), [items]);

  const openSuggest = async (orderId: number) => {
    setSuggestOrderId(orderId);
    setSuggestion(null);
    setSuggestOpen(true);
    setSuggestLoading(true);
    try {
      const r = await api.aiSuggestAllocation(orderId);
      setSuggestion((r.suggestion as Record<string, unknown>) ?? null);
    } catch (e) {
      logApiError(e, "ProductionPlanningPage.suggest");
      setSuggestion(null);
    } finally {
      setSuggestLoading(false);
    }
  };

  const runPredict = async () => {
    if (!predictConfigId || predictLineId == null) {
      setPrediction("Set plan config id (from line plan board) and line.");
      return;
    }
    setPredictLoading(true);
    setPrediction(null);
    try {
      const r = await api.aiPredictMove({
        config_id: predictConfigId,
        target_line_id: predictLineId,
        target_start_date: predictStart,
      });
      setPrediction(r.prediction);
    } catch (e) {
      logApiError(e, "ProductionPlanningPage.predict");
      setPrediction(e instanceof Error ? e.message : "Failed");
    } finally {
      setPredictLoading(false);
    }
  };

  const runMrp = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setMrpLoading(true);
    setMrpRun(null);
    setMrpRecs([]);
    try {
      const body: MfgMrpRunCreate = {
        plan_id: planId ?? undefined,
        horizon_start: horizonStart,
        horizon_end: horizonEnd,
      };
      const created = await api.runMfgMrp(body);
      setMrpRun(created);
      const recs = await api.getMfgMrpRecommendations(created.id);
      setMrpRecs(recs);
    } catch (e) {
      logApiError(e, "ProductionPlanningPage.mrp");
    } finally {
      setMrpLoading(false);
    }
  };

  const addLine = () => {
    if (!line.item_id || line.planned_qty <= 0) return;
    setForm((prev) => ({
      ...prev,
      lines: [
        ...prev.lines,
        {
          item_id: line.item_id,
          planned_qty: line.planned_qty,
          due_date: line.due_date,
          priority: line.priority,
        },
      ],
    }));
    setLine((prev) => ({ ...prev, planned_qty: 0 }));
  };

  const createPlan = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.period_start || !form.period_end || form.lines.length === 0) {
      setHistError("Please set period dates and add at least one line.");
      return;
    }
    setSaving(true);
    setHistError("");
    try {
      await api.createMfgProductionPlan(form);
      setForm({ period_start: todayIso(), period_end: todayIso(), lines: [] });
      await loadHistory();
    } catch (e) {
      setHistError(e instanceof Error ? e.message : "Failed to create production plan");
    } finally {
      setSaving(false);
    }
  };

  const generateWorkOrders = async (planIdGen: number) => {
    try {
      await api.generateMfgWorkOrders(planIdGen);
      await loadHistory();
    } catch (e) {
      setHistError(e instanceof Error ? e.message : "Failed to generate work orders");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Production Planning</h1>
        <p className="text-sm text-text-muted">
          Style-first pipeline, Gemini AI insights, MRP, and manufacturing plan history.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {(
          [
            ["pipeline", "Pipeline"],
            ["whatif", "What-if / MRP"],
            ["history", "Plan history"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === k ? "bg-primary text-primary-foreground" : "border border-border bg-surface-raised text-text-secondary hover:bg-surface-subtle"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "pipeline" ? (
        <>
          <AIInsightsBar summary={summary} loading={aiLoading} onRefresh={() => void refreshAi()} />

          <div className="rounded-xl border border-border bg-surface-raised p-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="text-sm font-semibold text-text-primary">AI efficiency forecast (Gemini)</h3>
              <button
                type="button"
                onClick={() => {
                  setEfficiencyLoading(true);
                  api
                    .aiEfficiencyForecast()
                    .then((r) => setEfficiencyText(r.forecast_text))
                    .catch((e) => logApiError("ProductionPlanning.efficiencyForecast", e))
                    .finally(() => setEfficiencyLoading(false));
                }}
                disabled={efficiencyLoading}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${efficiencyLoading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
            {efficiencyText ? (
              <p className="text-sm text-text-secondary whitespace-pre-wrap">{efficiencyText}</p>
            ) : (
              <p className="text-xs text-text-muted">
                Uses last 30 days of hourly production by line. Click Refresh (requires hourly entries + GEMINI_API_KEY).
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex rounded-lg border border-border p-1">
              <button
                type="button"
                className={`rounded px-3 py-1 text-xs ${view === "order" ? "bg-surface-subtle font-medium" : ""}`}
                onClick={() => setView("order")}
              >
                By order
              </button>
              <button
                type="button"
                className={`rounded px-3 py-1 text-xs ${view === "style" ? "bg-surface-subtle font-medium" : ""}`}
                onClick={() => setView("style")}
              >
                By style
              </button>
            </div>
            <label className="text-xs text-text-muted">
              Status
              <select
                className="ml-1 rounded border border-border px-2 py-1 text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All</option>
                <option value="ready">Overall ready</option>
                <option value="warning">Warning</option>
                <option value="blocked">Blocked</option>
                <option value="allocated">Line allocated</option>
              </select>
            </label>
            <input
              className="rounded border border-border px-2 py-1 text-sm"
              placeholder="Search style / order…"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
            />
            <label className="text-xs text-text-muted">
              Delivery from
              <input
                type="date"
                className="ml-1 rounded border border-border px-2 py-1 text-sm"
                value={deliveryFrom ?? ""}
                onChange={(e) => setDeliveryFrom(e.target.value || null)}
              />
            </label>
            <label className="text-xs text-text-muted">
              to
              <input
                type="date"
                className="ml-1 rounded border border-border px-2 py-1 text-sm"
                value={deliveryTo ?? ""}
                onChange={(e) => setDeliveryTo(e.target.value || null)}
              />
            </label>
            <button
              type="button"
              className="rounded-lg border border-border px-2 py-1 text-xs"
              onClick={() => void reload()}
            >
              Reload pipeline
            </button>
          </div>

          {error ? (
            <div className="rounded border border-status-danger/20 bg-status-danger-subtle p-3 text-sm text-status-danger-foreground">
              {error}
            </div>
          ) : null}

          {loading ? <p className="text-sm text-text-muted">Loading pipeline…</p> : null}

          {!loading && view === "order" ? (
            <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-subtle text-left text-text-secondary">
                  <tr>
                    <th className="px-3 py-2">Order</th>
                    <th className="px-3 py-2">Style</th>
                    <th className="px-3 py-2">Qty</th>
                    <th className="px-3 py-2">Delivery</th>
                    <th className="px-3 py-2">Chain</th>
                    <th className="px-3 py-2">Overall</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((row) => {
                    const ex = expandedOrder === row.order_id;
                    const ch = row.readiness.chain;
                    return (
                      <Fragment key={row.order_id}>
                        <tr className="border-t border-border/60">
                          <td className="px-3 py-2 font-medium">{row.order_code}</td>
                          <td className="px-3 py-2">
                            {row.readiness.style_code ?? row.style_ref ?? "—"}
                            <div className="text-xs text-text-muted">{row.readiness.style_name ?? ""}</div>
                          </td>
                          <td className="px-3 py-2">{row.quantity ?? "—"}</td>
                          <td className="px-3 py-2">{row.delivery_date ?? "—"}</td>
                          <td className="px-3 py-2">
                            <ChainStatusPills
                              chain={ch ?? null}
                              selectedKey={ex ? selectedChainKey : null}
                              onSelect={(key) => {
                                setExpandedOrder(row.order_id);
                                setSelectedChainKey((prev) => (prev === key ? null : key));
                              }}
                            />
                          </td>
                          <td className="px-3 py-2">{row.readiness.overall_status ?? "—"}</td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                              onClick={() => {
                                setExpandedOrder(ex ? null : row.order_id);
                                if (!ex) setSelectedChainKey(null);
                              }}
                            >
                              {ex ? "Collapse" : "Details"}
                            </button>
                            <button
                              type="button"
                              className="ml-1 rounded-lg border border-brand-primary/40 px-2.5 py-1 text-xs text-brand-primary hover:bg-brand-primary/5"
                              onClick={() => void openSuggest(row.order_id)}
                            >
                              AI allocate
                            </button>
                          </td>
                        </tr>
                        {ex ? (
                          <tr className="bg-surface-subtle/30">
                            <td colSpan={7} className="px-3 py-3">
                              <ReadinessDetailPanel
                                chainKey={selectedChainKey}
                                customerApproval={ch?.customer_approval as CustomerApprovalChain | undefined}
                                material={ch?.material_readiness as MaterialReadinessChain | undefined}
                              />
                              <p className="mt-2 text-xs text-text-muted">
                                <Link className="text-brand-primary hover:underline" to="/app/production/line-plan">
                                  Open line plan board
                                </Link>{" "}
                                to drag blocks or accept suggestions.
                              </p>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td className="px-3 py-8 text-center text-text-muted" colSpan={7}>
                        No orders in pipeline for this filter.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}

          {!loading && view === "style" ? (
            <div className="space-y-4">
              {styleGroups.map((g) => (
                <div key={String(g.style_id ?? g.style_code)} className="rounded-xl border border-border bg-surface-raised p-4">
                  <h3 className="text-sm font-semibold text-text-primary">
                    {g.style_code ?? "—"} · {g.style_name ?? ""}
                  </h3>
                  <ul className="mt-2 space-y-2">
                    {g.orders.map((row) => (
                      <li key={row.order_id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2 text-sm">
                        <span>
                          {row.order_code} — Qty {row.quantity ?? "—"} — {row.delivery_date ?? "—"}
                        </span>
                        <ChainStatusPills chain={row.readiness.chain ?? null} compact />
                        <button
                          type="button"
                          className="rounded-lg border border-brand-primary/40 px-2 py-0.5 text-xs text-brand-primary"
                          onClick={() => void openSuggest(row.order_id)}
                        >
                          AI allocate
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {styleGroups.length === 0 ? <p className="text-sm text-text-muted">No styles in pipeline.</p> : null}
            </div>
          ) : null}
        </>
      ) : null}

      {tab === "whatif" ? (
        <div className="space-y-8">
          <section>
            <h2 className="mb-2 text-sm font-semibold text-text-secondary">AI move prediction</h2>
            <p className="mb-3 text-xs text-text-muted">
              Use a plan row id from{" "}
              <Link className="text-brand-primary hover:underline" to="/app/production/line-plan">
                Line plan board
              </Link>{" "}
              (assignment id).
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs">
                Config id
                <input
                  type="number"
                  className="ml-1 rounded border border-border px-2 py-1 text-sm"
                  value={predictConfigId ?? ""}
                  onChange={(e) => setPredictConfigId(e.target.value ? Number(e.target.value) : null)}
                />
              </label>
              <label className="text-xs">
                Target line
                <select
                  className="ml-1 rounded border border-border px-2 py-1 text-sm"
                  value={predictLineId ?? ""}
                  onChange={(e) => setPredictLineId(e.target.value ? Number(e.target.value) : null)}
                >
                  {lines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.line_code}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                Start date
                <input
                  type="date"
                  className="ml-1 rounded border border-border px-2 py-1 text-sm"
                  value={predictStart}
                  onChange={(e) => setPredictStart(e.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={predictLoading}
                className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
                onClick={() => void runPredict()}
              >
                {predictLoading ? "…" : "Predict"}
              </button>
            </div>
            {prediction ? (
              <p className="mt-3 rounded border border-border-subtle bg-surface-subtle/50 p-3 text-sm text-text-secondary">{prediction}</p>
            ) : null}
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-text-secondary">Capacity (manufacturing)</h2>
            <CapacityHeatmap rows={capacityRows} loading={capLoading} />
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-text-secondary">MRP run</h2>
            <form className="grid grid-cols-1 gap-3 md:grid-cols-4" onSubmit={runMrp}>
              <input
                className="rounded border px-3 py-2 text-sm"
                type="number"
                min={1}
                placeholder="Optional Plan ID"
                value={planId ?? ""}
                onChange={(e) => setPlanId(e.target.value ? Number(e.target.value) : null)}
              />
              <input
                className="rounded border px-3 py-2 text-sm"
                type="date"
                value={horizonStart}
                onChange={(e) => setHorizonStart(e.target.value)}
              />
              <input
                className="rounded border px-3 py-2 text-sm"
                type="date"
                value={horizonEnd}
                onChange={(e) => setHorizonEnd(e.target.value)}
              />
              <button
                className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-60"
                disabled={mrpLoading}
                type="submit"
              >
                {mrpLoading ? "Running…" : "Run MRP"}
              </button>
            </form>
            {mrpRun ? (
              <div className="mt-3 rounded border border-border p-3 text-sm">
                <div>
                  <span className="text-text-muted">Run:</span> {mrpRun.run_code}
                </div>
                <div>
                  {mrpRun.horizon_start} → {mrpRun.horizon_end} ({mrpRun.status})
                </div>
              </div>
            ) : null}
            <div className="mt-4 overflow-x-auto rounded-xl border border-border">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-subtle text-left text-text-secondary">
                  <tr>
                    <th className="px-4 py-2">Item</th>
                    <th className="px-4 py-2">Type</th>
                    <th className="px-4 py-2">Suggested Qty</th>
                    <th className="px-4 py-2">Due</th>
                    <th className="px-4 py-2">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {mrpRecs.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-4 py-2">{r.item_id}</td>
                      <td className="px-4 py-2">{r.recommendation_type}</td>
                      <td className="px-4 py-2">{r.suggested_qty.toFixed(3)}</td>
                      <td className="px-4 py-2">{r.due_date ?? "—"}</td>
                      <td className="px-4 py-2">{r.reason ?? "—"}</td>
                    </tr>
                  ))}
                  {mrpRecs.length === 0 ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-text-muted" colSpan={5}>
                        No recommendations yet. Run MRP.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {tab === "history" ? (
        <>
          {histError ? (
            <div className="rounded border border-status-danger/20 bg-status-danger-subtle p-3 text-sm text-status-danger-foreground">
              {histError}
            </div>
          ) : null}

          <div className="rounded-xl border border-border bg-surface-raised p-4">
            <h2 className="mb-3 text-sm font-semibold text-text-secondary">Create production plan (items / WOs)</h2>
            <form className="space-y-3" onSubmit={createPlan}>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <input
                  className="rounded border px-3 py-2 text-sm"
                  type="date"
                  value={form.period_start}
                  onChange={(e) => setForm((prev) => ({ ...prev, period_start: e.target.value }))}
                />
                <input
                  className="rounded border px-3 py-2 text-sm"
                  type="date"
                  value={form.period_end}
                  onChange={(e) => setForm((prev) => ({ ...prev, period_end: e.target.value }))}
                />
                <input
                  className="rounded border px-3 py-2 text-sm"
                  placeholder="Optional plan code"
                  value={form.plan_code ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, plan_code: e.target.value }))}
                />
              </div>

              <div className="rounded border border-border p-3">
                <div className="mb-2 text-xs font-medium text-text-secondary">Add line</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
                  <select
                    className="rounded border px-3 py-2 text-sm"
                    value={line.item_id}
                    onChange={(e) => setLine((prev) => ({ ...prev, item_id: Number(e.target.value) }))}
                  >
                    {items.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="rounded border px-3 py-2 text-sm"
                    type="number"
                    min={0}
                    step="0.001"
                    placeholder="Planned qty"
                    value={line.planned_qty || ""}
                    onChange={(e) => setLine((prev) => ({ ...prev, planned_qty: Number(e.target.value) }))}
                  />
                  <input
                    className="rounded border px-3 py-2 text-sm"
                    type="date"
                    value={line.due_date}
                    onChange={(e) => setLine((prev) => ({ ...prev, due_date: e.target.value }))}
                  />
                  <input
                    className="rounded border px-3 py-2 text-sm"
                    type="number"
                    min={1}
                    max={10}
                    value={line.priority}
                    onChange={(e) => setLine((prev) => ({ ...prev, priority: Number(e.target.value) }))}
                  />
                  <button type="button" className="rounded border px-3 py-2 text-sm" onClick={addLine}>
                    Add Line
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded border border-border">
                <table className="min-w-full text-sm">
                  <thead className="bg-surface-subtle text-left text-text-secondary">
                    <tr>
                      <th className="px-3 py-2">Item</th>
                      <th className="px-3 py-2">Planned Qty</th>
                      <th className="px-3 py-2">Due Date</th>
                      <th className="px-3 py-2">Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.lines.map((row, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="px-3 py-2">{itemName.get(row.item_id) ?? `Item #${row.item_id}`}</td>
                        <td className="px-3 py-2">{row.planned_qty}</td>
                        <td className="px-3 py-2">{row.due_date ?? "-"}</td>
                        <td className="px-3 py-2">{row.priority ?? 5}</td>
                      </tr>
                    ))}
                    {form.lines.length === 0 ? (
                      <tr>
                        <td className="px-3 py-6 text-center text-text-muted" colSpan={4}>
                          No lines added yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <button
                className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-60"
                disabled={saving}
                type="submit"
              >
                {saving ? "Saving..." : "Create Plan"}
              </button>
            </form>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle text-left text-text-secondary">
                <tr>
                  <th className="px-4 py-2">Plan Code</th>
                  <th className="px-4 py-2">Period</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Lines</th>
                  <th className="px-4 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-4 py-2 font-medium">{row.plan_code}</td>
                    <td className="px-4 py-2">
                      {row.period_start} to {row.period_end}
                    </td>
                    <td className="px-4 py-2">{row.status}</td>
                    <td className="px-4 py-2">{row.lines.length}</td>
                    <td className="px-4 py-2">
                      <button
                        className="rounded border px-2 py-1 text-xs"
                        onClick={() => void generateWorkOrders(row.id)}
                      >
                        Generate WOs
                      </button>
                    </td>
                  </tr>
                ))}
                {plans.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-text-muted" colSpan={5}>
                      No production plans found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <AISuggestionModal
        open={suggestOpen}
        orderId={suggestOrderId}
        suggestion={suggestion}
        loading={suggestLoading}
        onClose={() => setSuggestOpen(false)}
        onGoToLinePlan={() => {
          setSuggestOpen(false);
          window.location.href = "/app/production/line-plan";
        }}
      />
    </div>
  );
}
