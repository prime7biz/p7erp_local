import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "@/api/client";
import { AISuggestionModal } from "@/components/production/planning/AISuggestionModal";
import { logApiError } from "@/utils/logApiError";
import type { OrderReadinessPayload, PipelineOrderRow } from "@/types/productionPlanning";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function enumerateDates(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  const d = new Date(fromIso + "T12:00:00");
  const end = new Date(toIso + "T12:00:00");
  if (Number.isNaN(d.getTime()) || Number.isNaN(end.getTime()) || d > end) return out;
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function dayIndexInRange(dateStr: string, days: string[]): number {
  const d = dateStr.slice(0, 10);
  if (days.length === 0) return 0;
  const first = days[0];
  const last = days[days.length - 1];
  if (first === undefined || last === undefined) return 0;
  if (d <= first) return 0;
  if (d >= last) return days.length - 1;
  const i = days.indexOf(d);
  if (i >= 0) return i;
  const j = days.findIndex((x) => x > d);
  return j <= 0 ? 0 : j - 1;
}

type PlanRow = {
  id: number;
  line_id: number;
  order_id: number | null;
  style_id?: number | null;
  start_date: string;
  planned_end_date: string | null;
  status: string;
  planned_qty?: number;
  completed_qty?: number;
};

type AiStatus = {
  enabled: boolean;
  has_api_key: boolean;
  model: string;
  rate_limited: boolean;
  reason: string;
};

function aiReasonMessage(aiStatus?: AiStatus): string {
  switch (aiStatus?.reason) {
    case "disabled":
      return "AI planning is disabled for this tenant.";
    case "missing_api_key":
      return "Gemini API key is missing on backend configuration.";
    case "rate_limited":
      return "AI requests are rate-limited right now. Please try again shortly.";
    case "no_response":
      return "AI did not return a response. Please try again.";
    case "ok":
      return "AI is enabled and configured.";
    default:
      return "AI status is unavailable.";
  }
}

const STATUS_BLOCK: Record<string, string> = {
  planned: "bg-blue-500/85 text-white border-blue-600",
  active: "bg-emerald-600/90 text-white border-emerald-700",
  completed: "bg-slate-500/85 text-white border-slate-600",
  on_hold: "bg-amber-500/90 text-white border-amber-600",
};

const MAX_RANGE_DAYS = 62;

function overallDotClass(overall?: string): string {
  switch (overall) {
    case "ready":
      return "bg-emerald-500";
    case "warning":
      return "bg-amber-500";
    case "blocked":
      return "bg-red-500";
    default:
      return "bg-slate-400";
  }
}

export function ProductionLinePlanPage() {
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(addDays(todayISO(), 30));
  const [items, setItems] = useState<PlanRow[]>([]);
  const [lines, setLines] = useState<Awaited<ReturnType<typeof api.listSewingLines>>>([]);
  const [suggest, setSuggest] = useState<unknown[]>([]);
  const [error, setError] = useState("");
  const [moveBusy, setMoveBusy] = useState(false);
  const [dragOverLineDay, setDragOverLineDay] = useState<{ lineId: number; dayIdx: number } | null>(null);

  const [pipelineByOrder, setPipelineByOrder] = useState<Map<number, OrderReadinessPayload>>(new Map());
  const [calendarDates, setCalendarDates] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [riskAlerts, setRiskAlerts] = useState<Array<Record<string, unknown>>>([]);
  const [optimizeBusy, setOptimizeBusy] = useState(false);

  const [pendingMove, setPendingMove] = useState<{
    payload: { configId: number; lineId: number; start: string };
    targetLineId: number;
    targetDate: string;
  } | null>(null);
  const [predictText, setPredictText] = useState<string | null>(null);
  const [predictLoading, setPredictLoading] = useState(false);

  const [suggestModalOpen, setSuggestModalOpen] = useState(false);
  const [suggestOrderId, setSuggestOrderId] = useState<number | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<Record<string, unknown> | null>(null);

  const days = useMemo(() => enumerateDates(from, to), [from, to]);
  const rangeTooWide = days.length > MAX_RANGE_DAYS;

  const loadLines = useCallback(async () => {
    try {
      const list = await api.listSewingLines();
      setLines(list.filter((l) => l.is_active));
    } catch (e) {
      logApiError(e, "ProductionLinePlanPage.loadLines");
    }
  }, []);

  const loadBoard = useCallback(async () => {
    setError("");
    try {
      const res = await api.getPlanBoard(from, to);
      setItems((res.items as PlanRow[]) ?? []);
    } catch (e) {
      logApiError(e, "ProductionLinePlanPage.loadBoard");
      setError("Could not load plan board.");
    }
  }, [from, to]);

  const loadPipelineMap = useCallback(async () => {
    try {
      const res = (await api.getProductionPipeline()) as { items?: PipelineOrderRow[] };
      const m = new Map<number, OrderReadinessPayload>();
      for (const row of res.items ?? []) {
        m.set(row.order_id, row.readiness);
      }
      setPipelineByOrder(m);
    } catch (e) {
      logApiError(e, "ProductionLinePlanPage.loadPipelineMap");
    }
  }, []);

  const loadCalendar = useCallback(async () => {
    try {
      const rows = await api.listFactoryCalendar(from, to);
      const holi = new Set<string>();
      for (const r of rows) {
        if (r.override_type === "holiday") holi.add(r.override_date.slice(0, 10));
      }
      setCalendarDates(holi);
    } catch (e) {
      logApiError(e, "ProductionLinePlanPage.loadCalendar");
    }
  }, [from, to]);

  const loadRiskAlerts = useCallback(async () => {
    try {
      const r = await api.aiRiskAlerts();
      setRiskAlerts(r.alerts ?? []);
    } catch (e) {
      logApiError(e, "ProductionLinePlanPage.riskAlerts");
    }
  }, []);

  const loadSuggest = useCallback(async () => {
    try {
      const res = await api.getPlanSuggest(from);
      setSuggest((res.suggestions as unknown[]) ?? []);
    } catch (e) {
      logApiError(e, "ProductionLinePlanPage.loadSuggest");
    }
  }, [from]);

  useEffect(() => {
    void loadLines();
  }, [loadLines]);

  useEffect(() => {
    void loadBoard();
    void loadPipelineMap();
    void loadCalendar();
    void loadRiskAlerts();
  }, [loadBoard, loadPipelineMap, loadCalendar, loadRiskAlerts]);

  const lineName = useCallback(
    (lineId: number) => {
      const l = lines.find((x) => x.id === lineId);
      return l ? `${l.line_code} · ${l.name}` : `Line #${lineId}`;
    },
    [lines],
  );

  const utilizationPct = useMemo(() => {
    if (days.length === 0 || lines.length === 0) return 0;
    const slots = lines.length * days.length;
    let covered = 0;
    for (const it of items) {
      const si = dayIndexInRange(it.start_date, days);
      const ei = dayIndexInRange(it.planned_end_date || it.start_date, days);
      covered += Math.max(1, ei - si + 1);
    }
    return Math.min(100, Math.round((covered / Math.max(1, slots)) * 100));
  }, [items, days, lines.length]);

  const onDragStart = (e: React.DragEvent, item: PlanRow) => {
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({ configId: item.id, lineId: item.line_id, start: item.start_date.slice(0, 10) }),
    );
    e.dataTransfer.effectAllowed = "move";
  };

  const applyMove = async (payload: { configId: number; lineId: number; start: string }, targetLineId: number, targetDate: string) => {
    if (payload.lineId === targetLineId && payload.start === targetDate) return;
    setMoveBusy(true);
    try {
      await api.movePlanBoard(payload.configId, {
        line_id: targetLineId,
        start_date: targetDate,
      });
      await loadBoard();
      void loadRiskAlerts();
      void loadPipelineMap();
    } catch (err) {
      logApiError(err, "ProductionLinePlanPage.move");
      setError("Could not move assignment. Try again.");
    } finally {
      setMoveBusy(false);
    }
  };

  const confirmMoveAfterPredict = async () => {
    if (!pendingMove) return;
    await applyMove(pendingMove.payload, pendingMove.targetLineId, pendingMove.targetDate);
    setPendingMove(null);
    setPredictText(null);
  };

  const dayIdxFromClientX = (e: React.DragEvent, rowEl: HTMLDivElement) => {
    if (days.length === 0) return 0;
    const rect = rowEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const frac = Math.min(1, Math.max(0, x / rect.width));
    return Math.min(days.length - 1, Math.max(0, Math.floor(frac * days.length)));
  };

  const onDropRow = async (e: React.DragEvent, targetLineId: number) => {
    e.preventDefault();
    setDragOverLineDay(null);
    const rowEl = e.currentTarget as HTMLDivElement;
    const raw = e.dataTransfer.getData("application/json");
    if (!raw || days.length === 0) return;
    let payload: { configId: number; lineId: number; start: string };
    try {
      payload = JSON.parse(raw) as { configId: number; lineId: number; start: string };
    } catch {
      return;
    }
    const idx = dayIdxFromClientX(e, rowEl);
    const targetDate = days[idx];
    if (targetDate === undefined) return;

    if (payload.lineId === targetLineId && payload.start === targetDate) return;

    setPredictLoading(true);
    setPredictText(null);
    setPendingMove({ payload, targetLineId, targetDate });
    try {
      const r = await api.aiPredictMove({
        config_id: payload.configId,
        target_line_id: targetLineId,
        target_start_date: targetDate,
      });
      if (r.prediction) {
        setPredictText(r.prediction);
      } else {
        setPredictText(aiReasonMessage(r.ai_status as AiStatus | undefined));
      }
    } catch (err) {
      logApiError(err, "ProductionLinePlanPage.predict");
      setPredictText("Could not load AI prediction. Move anyway?");
    } finally {
      setPredictLoading(false);
    }
  };

  const itemsByLine = useMemo(() => {
    const m = new Map<number, PlanRow[]>();
    for (const it of items) {
      const list = m.get(it.line_id) ?? [];
      list.push(it);
      m.set(it.line_id, list);
    }
    return m;
  }, [items]);

  const displayLines = useMemo(() => {
    const ids = new Set(lines.map((l) => l.id));
    for (const it of items) ids.add(it.line_id);
    return [...lines]
      .filter((l) => ids.has(l.id))
      .sort((a, b) => a.line_code.localeCompare(b.line_code));
  }, [lines, items]);

  const labelForItem = (it: PlanRow) => {
    const oid = it.order_id;
    const pr = oid != null ? pipelineByOrder.get(oid) : undefined;
    const style = pr?.style_code ?? (oid != null ? `#${oid}` : "—");
    const qty = it.planned_qty != null ? `${it.planned_qty}pc` : "";
    return `${style} / ${oid != null ? `#${oid}` : "—"}${qty ? ` / ${qty}` : ""}`;
  };

  const openSuggestDetail = async (orderId: number) => {
    setSuggestOrderId(orderId);
    setSuggestion(null);
    setSuggestModalOpen(true);
    setSuggestLoading(true);
    try {
      const r = await api.aiSuggestAllocation(orderId);
      setSuggestion((r.suggestion as Record<string, unknown>) ?? null);
    } catch (e) {
      logApiError(e, "ProductionLinePlanPage.suggestModal");
      setSuggestion(null);
    } finally {
      setSuggestLoading(false);
    }
  };

  const runOptimize = async () => {
    setOptimizeBusy(true);
    try {
      const r = await api.aiOptimizeBoard();
      const moves = r.moves ?? [];
      const message = moves.length
        ? `AI suggested ${moves.length} move(s). Review JSON in console or apply manually on the board.`
        : aiReasonMessage(r.ai_status as AiStatus | undefined);
      alert(message);
      if (moves.length) console.info("AI optimize moves", moves);
    } catch (e) {
      logApiError(e, "ProductionLinePlanPage.optimize");
    } finally {
      setOptimizeBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 p-4 lg:flex-row">
      <div className="min-w-0 flex-1 space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Line plan board</h1>
          <p className="text-sm text-text-secondary">
            Drag the grip (⋮) to reschedule. Style and readiness show on each block. AI can predict moves before you confirm.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            From
            <input
              type="date"
              className="ml-2 rounded-md border border-border-subtle px-2 py-1"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="text-sm">
            To
            <input
              type="date"
              className="ml-2 rounded-md border border-border-subtle px-2 py-1"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="rounded-lg border border-border-subtle bg-surface-elevated px-3 py-1.5 text-sm"
            onClick={() => void loadBoard()}
            disabled={rangeTooWide}
          >
            Refresh
          </button>
          <button
            type="button"
            className="rounded-lg border border-border-subtle bg-surface-elevated px-3 py-1.5 text-sm"
            onClick={() => void loadSuggest()}
          >
            Suggest plan
          </button>
          <span className="text-xs text-text-muted">Utilization (rough): {utilizationPct}%</span>
          {moveBusy ? <span className="text-xs text-text-muted">Saving move…</span> : null}
        </div>

        {rangeTooWide ? (
          <p className="text-sm text-amber-700">
            Choose a range of at most {MAX_RANGE_DAYS} days for the board view (currently {days.length} days).
          </p>
        ) : null}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {!rangeTooWide && days.length > 0 ? (
          <section className="rounded-lg border border-border-subtle bg-surface-elevated p-3">
            <h2 className="mb-3 text-sm font-medium">Timeline by line</h2>

            <div className="mb-2 flex min-w-[480px] gap-0 overflow-x-auto border-b border-border-subtle pb-1">
              <div className="w-[160px] shrink-0 text-xs font-semibold text-text-muted">Line / date</div>
              <div className="flex min-w-0 flex-1">
                {days.map((d) => {
                  const isHol = calendarDates.has(d);
                  return (
                    <div
                      key={d}
                      className={`min-w-[28px] flex-1 text-center text-[10px] ${isHol ? "bg-amber-100/50 text-amber-900 dark:bg-amber-900/20" : "text-text-muted"}`}
                      title={isHol ? "Holiday" : d}
                    >
                      {d.slice(5)}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 overflow-x-auto">
              {displayLines.map((line) => {
                const rowItems = itemsByLine.get(line.id) ?? [];
                return (
                  <div key={line.id} className="min-w-[480px] overflow-hidden rounded-md border border-border-subtle/80">
                    <div className="bg-surface-subtle px-2 py-1 text-xs font-medium text-text-secondary">{lineName(line.id)}</div>
                    <div
                      className="relative h-14 w-full"
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        const idx = dayIdxFromClientX(e, e.currentTarget as HTMLDivElement);
                        setDragOverLineDay({ lineId: line.id, dayIdx: idx });
                      }}
                      onDragLeave={() => setDragOverLineDay(null)}
                      onDrop={(e) => void onDropRow(e, line.id)}
                    >
                      <div className="absolute inset-0 flex">
                        {days.map((d, di) => {
                          const over = dragOverLineDay?.lineId === line.id && dragOverLineDay?.dayIdx === di;
                          const isHol = calendarDates.has(d);
                          return (
                            <div
                              key={d}
                              className={`flex-1 border-r border-border-subtle/50 ${
                                over ? "bg-brand-primary/20" : isHol ? "bg-amber-50/30 dark:bg-amber-950/20" : "bg-surface-subtle/30"
                              }`}
                            />
                          );
                        })}
                      </div>

                      {rowItems.map((it) => {
                        const si = dayIndexInRange(it.start_date, days);
                        const ei = dayIndexInRange(it.planned_end_date || it.start_date, days);
                        const span = Math.max(1, ei - si + 1);
                        const left = (si / days.length) * 100;
                        const width = (span / days.length) * 100;
                        const st = it.status ?? "planned";
                        const color = STATUS_BLOCK[st] ?? "bg-slate-600/90 text-white border-slate-700";
                        const oid = it.order_id;
                        const pr = oid != null ? pipelineByOrder.get(oid) : undefined;
                        const overall = pr?.overall_status;
                        const matOk = pr?.chain?.material_readiness?.status !== "blocked";
                        const conflict = overall === "blocked" || !matOk;
                        return (
                          <div
                            key={it.id}
                            className="pointer-events-none absolute top-1 flex h-10"
                            style={{ left: `${left}%`, width: `${width}%` }}
                          >
                            <button
                              type="button"
                              draggable
                              onDragStart={(e) => onDragStart(e, it)}
                              className="pointer-events-auto z-[2] w-5 shrink-0 cursor-grab rounded-l border border-white/40 bg-white/90 text-[10px] text-text-primary shadow active:cursor-grabbing"
                              title="Drag to reschedule"
                              aria-label="Drag to move plan"
                            >
                              ⋮
                            </button>
                            <div
                              className={`min-w-0 flex-1 truncate rounded-r border px-1 text-left text-[10px] font-medium leading-tight ${color} ${
                                conflict ? "ring-2 ring-red-500" : ""
                              }`}
                              title={`${labelForItem(it)} · ${st}`}
                            >
                              <span className={`mr-1 inline-block h-2 w-2 rounded-full align-middle ${overallDotClass(overall)}`} />
                              {labelForItem(it)} · {st}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {displayLines.length === 0 ? (
              <p className="py-4 text-sm text-text-secondary">No sewing lines yet. Add lines under Production setup.</p>
            ) : null}
          </section>
        ) : null}

        <section className="rounded-lg border border-border-subtle bg-surface-elevated p-4">
          <h2 className="mb-2 text-sm font-medium">Assignments</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-text-secondary">
                  <th className="py-2 pr-4">Line</th>
                  <th className="py-2 pr-4">Order</th>
                  <th className="py-2 pr-4">Style</th>
                  <th className="py-2 pr-4">Start</th>
                  <th className="py-2 pr-4">End</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Readiness</th>
                  <th className="py-2 pr-4">Progress</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const pr = row.order_id != null ? pipelineByOrder.get(row.order_id) : undefined;
                  const pq = row.planned_qty ?? 0;
                  const cq = row.completed_qty ?? 0;
                  const pct = pq > 0 ? Math.round((cq / pq) * 100) : 0;
                  return (
                    <tr key={row.id} className="border-b border-border-subtle/60">
                      <td className="py-2 pr-4">{lineName(row.line_id)}</td>
                      <td className="py-2 pr-4">{row.order_id != null ? String(row.order_id) : "—"}</td>
                      <td className="py-2 pr-4">{pr?.style_code ?? "—"}</td>
                      <td className="py-2 pr-4">{row.start_date}</td>
                      <td className="py-2 pr-4">{row.planned_end_date ?? "—"}</td>
                      <td className="py-2 pr-4">{row.status}</td>
                      <td className="py-2 pr-4">{pr?.overall_status ?? "—"}</td>
                      <td className="py-2 pr-4">{pct}% ({cq}/{pq})</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {items.length === 0 ? <p className="py-4 text-sm text-text-secondary">No assignments in range.</p> : null}
          </div>
        </section>

        {suggest.length > 0 ? (
          <section className="rounded-lg border border-border-subtle bg-surface-elevated p-4">
            <h2 className="mb-3 text-sm font-medium">Suggestions</h2>
            <div className="space-y-2">
              {suggest.map((s, i) => {
                const row = s as Record<string, unknown>;
                const oid = typeof row.order_id === "number" ? row.order_id : null;
                const skipped = Boolean(row.skipped);
                return (
                  <div
                    key={i}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-subtle p-3 text-xs"
                  >
                    <div>
                      <div className="font-medium text-text-primary">Order {String(row.order_id ?? "?")}</div>
                      <div className="text-text-secondary">{String(row.reason ?? row.message ?? "")}</div>
                      {!skipped ? (
                        <div className="text-text-muted">
                          Line {String(row.line_code ?? "")} · {String(row.suggested_start ?? "")} → {String(row.suggested_end ?? "")}
                        </div>
                      ) : null}
                    </div>
                    {!skipped && oid != null ? (
                      <button
                        type="button"
                        className="rounded-lg border border-brand-primary/40 px-2 py-1 text-xs text-brand-primary"
                        onClick={() => void openSuggestDetail(oid)}
                      >
                        AI detail
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>

      {sidebarOpen ? (
        <aside className="w-full shrink-0 space-y-3 lg:w-72">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">AI &amp; risks</h2>
            <button type="button" className="text-xs text-text-muted hover:underline" onClick={() => setSidebarOpen(false)}>
              Hide
            </button>
          </div>
          <button
            type="button"
            disabled={optimizeBusy}
            className="w-full rounded-lg border border-border px-2 py-1.5 text-xs"
            onClick={() => void runOptimize()}
          >
            {optimizeBusy ? "…" : "AI optimize (preview)"}
          </button>
          <button type="button" className="w-full rounded-lg border border-border px-2 py-1.5 text-xs" onClick={() => void loadRiskAlerts()}>
            Refresh risk alerts
          </button>
          <div className="max-h-96 space-y-2 overflow-y-auto rounded-lg border border-border-subtle p-2">
            {riskAlerts.length === 0 ? (
              <p className="text-xs text-text-muted">No alerts. Gemini may be off or nothing flagged.</p>
            ) : (
              riskAlerts.map((a, i) => (
                <div key={i} className="rounded border border-border-subtle/80 p-2 text-xs">
                  <div className="font-medium text-text-primary">{String(a.title ?? "Alert")}</div>
                  <div className="text-text-secondary">{String(a.detail ?? "")}</div>
                </div>
              ))
            )}
          </div>
        </aside>
      ) : (
        <button
          type="button"
          className="fixed bottom-6 right-6 rounded-full border border-border bg-surface-elevated px-3 py-2 text-xs shadow lg:static lg:shrink-0"
          onClick={() => setSidebarOpen(true)}
        >
          Show AI panel
        </button>
      )}

      {pendingMove ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-w-lg rounded-xl border border-border bg-surface-raised p-4 shadow-xl">
            <h3 className="text-lg font-semibold text-text-primary">Confirm move</h3>
            {predictLoading ? <p className="mt-2 text-sm text-text-muted">Loading AI prediction…</p> : null}
            {predictText ? <p className="mt-2 text-sm text-text-secondary whitespace-pre-wrap">{predictText}</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground"
                disabled={moveBusy}
                onClick={() => void confirmMoveAfterPredict()}
              >
                Apply move
              </button>
              <button
                type="button"
                className="rounded-lg border border-border px-3 py-1.5 text-sm"
                onClick={() => {
                  setPendingMove(null);
                  setPredictText(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <AISuggestionModal
        open={suggestModalOpen}
        orderId={suggestOrderId}
        suggestion={suggestion}
        loading={suggestLoading}
        onClose={() => setSuggestModalOpen(false)}
      />
    </div>
  );
}
