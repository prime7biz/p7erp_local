import { useCallback, useEffect, useMemo, useState } from "react";
import { Users } from "lucide-react";
import { api, type FactoryCalendarOverrideRow, type CountryHolidayPreviewItem } from "@/api/client";
import { logApiError } from "@/utils/logApiError";
import { useAiChat } from "@/pages/app/ai/hooks/useAiChat";

const WEEKDAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

function weekdayIndex(d: Date): number {
  const js = d.getDay();
  return js === 0 ? 6 : js - 1;
}

function dateKeyLocal(d: Date): string {
  const p = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function isWeekendDay(d: Date, weekendDays: string[]): boolean {
  if (!weekendDays.length) return d.getDay() === 0 || d.getDay() === 6;
  const name = WEEKDAY_NAMES[weekdayIndex(d)];
  return weekendDays.some((x) => x.toLowerCase() === name);
}

type CellKind =
  | "working"
  | "weekend"
  | "holiday_gov"
  | "holiday_rel"
  | "holiday_co"
  | "holiday_opt"
  | "working_override";

function cellKindForDate(
  d: Date,
  weekendDays: string[],
  byDate: Map<string, FactoryCalendarOverrideRow>,
): CellKind {
  const k = dateKeyLocal(d);
  const row = byDate.get(k);
  if (row) {
    if (row.override_type === "working_day") return "working_override";
    if (row.override_type === "holiday") {
      const c = (row.category || "").toLowerCase();
      if (c === "religious") return "holiday_rel";
      if (c === "company") return "holiday_co";
      if (c === "optional") return "holiday_opt";
      return "holiday_gov";
    }
  }
  if (isWeekendDay(d, weekendDays)) return "weekend";
  return "working";
}

const CELL_CLASS: Record<CellKind, string> = {
  working: "bg-emerald-100/80 border-emerald-300 text-emerald-900",
  weekend: "bg-orange-100/80 border-orange-300 text-orange-900",
  holiday_gov: "bg-red-100/80 border-red-300 text-red-900",
  holiday_rel: "bg-rose-100/80 border-rose-300 text-rose-900",
  holiday_co: "bg-purple-100/80 border-purple-300 text-purple-900",
  holiday_opt: "bg-violet-100/80 border-violet-300 text-violet-900",
  working_override: "bg-sky-100/80 border-sky-400 text-sky-900",
};

const LEGEND: Array<{ kind: CellKind; label: string }> = [
  { kind: "working", label: "Working" },
  { kind: "weekend", label: "Weekend" },
  { kind: "holiday_gov", label: "Gov. holiday" },
  { kind: "holiday_rel", label: "Religious" },
  { kind: "holiday_co", label: "Company" },
  { kind: "holiday_opt", label: "Optional" },
  { kind: "working_override", label: "Working override" },
];

function monthStats(
  year: number,
  month0: number,
  weekendDays: string[],
  byDate: Map<string, FactoryCalendarOverrideRow>,
  today: Date,
) {
  const start = new Date(year, month0, 1);
  const end = new Date(year, month0 + 1, 0);
  let working = 0;
  let hol = 0;
  let gov = 0;
  let co = 0;
  let opt = 0;
  let rel = 0;
  let remaining = 0;
  const tKey = dateKeyLocal(today);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dd = new Date(d);
    const k = dateKeyLocal(dd);
    const kind = cellKindForDate(dd, weekendDays, byDate);
    if (kind === "working" || kind === "working_override") {
      working += 1;
      if (k >= tKey) remaining += 1;
    }
    if (kind.startsWith("holiday")) {
      hol += 1;
      if (kind === "holiday_gov") gov += 1;
      if (kind === "holiday_co") co += 1;
      if (kind === "holiday_opt") opt += 1;
      if (kind === "holiday_rel") rel += 1;
    }
  }
  let nextUp: { date: string; name: string } | null = null;
  const allHol = [...byDate.entries()]
    .filter(([, row]) => row.override_type === "holiday")
    .map(([dk, row]) => ({ date: dk, name: row.name || "Holiday" }));
  allHol.sort((a, b) => a.date.localeCompare(b.date));
  for (const h of allHol) {
    if (h.date >= tKey) {
      nextUp = h;
      break;
    }
  }
  return {
    workingDays: working,
    holidayCount: hol,
    breakdown: { gov, rel, co, opt },
    nextHoliday: nextUp,
    workingRemaining: remaining,
  };
}

export function ProductionFactoryCalendarPage() {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [yearMode, setYearMode] = useState(false);

  const [weekendDays, setWeekendDays] = useState<string[]>(["friday", "saturday"]);
  const [rows, setRows] = useState<FactoryCalendarOverrideRow[]>([]);
  const [countryCode, setCountryCode] = useState<string | null>(null);

  const [hiddenLegend, setHiddenLegend] = useState<Set<CellKind>>(new Set());

  const [importOpen, setImportOpen] = useState(false);
  const [importYear, setImportYear] = useState(now.getFullYear());
  const [preview, setPreview] = useState<CountryHolidayPreviewItem[]>([]);
  const [selectedImport, setSelectedImport] = useState<Set<string>>(new Set());
  const [importLoading, setImportLoading] = useState(false);

  const [aiOpen, setAiOpen] = useState(false);
  const [aiSessionId, setAiSessionId] = useState<number | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const { messages, sending, sendMessage, error: aiErr, loadMessages } = useAiChat(aiSessionId);

  const rangeFrom = `${viewYear}-01-01`;
  const rangeTo = `${viewYear}-12-31`;

  const load = useCallback(async () => {
    try {
      const [list, settings, cfg] = await Promise.all([
        api.listFactoryCalendar(rangeFrom, rangeTo),
        api.getProductionSettings(),
        api.getSettingsConfig(),
      ]);
      setRows(list);
      setWeekendDays(settings.weekend_days?.length ? settings.weekend_days : ["friday", "saturday"]);
      setCountryCode(cfg.country_code ?? null);
    } catch (e) {
      logApiError(e, "ProductionFactoryCalendarPage.load");
    }
  }, [rangeFrom, rangeTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const byDate = useMemo(() => {
    const m = new Map<string, FactoryCalendarOverrideRow>();
    rows.forEach((r) => m.set(r.override_date, r));
    return m;
  }, [rows]);

  const stats = useMemo(
    () => monthStats(viewYear, viewMonth, weekendDays, byDate, new Date()),
    [viewYear, viewMonth, weekendDays, byDate],
  );

  const openImport = async () => {
    setImportOpen(true);
    setImportYear(viewYear);
    setImportLoading(true);
    try {
      const res = await api.getCountryHolidaysPreview(viewYear);
      setPreview(res.items);
      setSelectedImport(new Set(res.items.map((x) => x.date)));
    } catch (e) {
      logApiError(e, "ProductionFactoryCalendarPage.previewHolidays");
      setPreview([]);
    } finally {
      setImportLoading(false);
    }
  };

  const runImport = async () => {
    setImportLoading(true);
    try {
      const dates = Array.from(selectedImport);
      await api.importCountryHolidays({ year: importYear, selected_dates: dates });
      setImportOpen(false);
      await load();
    } catch (e) {
      logApiError(e, "ProductionFactoryCalendarPage.importHolidays");
    } finally {
      setImportLoading(false);
    }
  };

  const ensureAiSession = useCallback(async () => {
    if (aiSessionId) return;
    try {
      const s = await api.aiCreateSession({ title: "Factory calendar" });
      setAiSessionId(s.id);
    } catch (e) {
      logApiError(e, "ProductionFactoryCalendarPage.aiSession");
    }
  }, [aiSessionId]);

  useEffect(() => {
    if (aiOpen && !aiSessionId) void ensureAiSession();
  }, [aiOpen, aiSessionId, ensureAiSession]);

  const toggleAi = () => {
    setAiOpen((o) => !o);
  };

  useEffect(() => {
    if (aiOpen && aiSessionId) void loadMessages();
  }, [aiOpen, aiSessionId, loadMessages]);

  const onSendAi = async () => {
    if (!aiPrompt.trim() || !aiSessionId) return;
    const ok = await sendMessage(aiPrompt.trim());
    if (ok) setAiPrompt("");
  };

  const [editOpen, setEditOpen] = useState(false);
  const [editDate, setEditDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editType, setEditType] = useState<"holiday" | "working_day">("holiday");
  const [editName, setEditName] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editCategory, setEditCategory] = useState("government");
  const [editPaid, setEditPaid] = useState(true);
  const [editHr, setEditHr] = useState(false);

  const openCell = (dk: string) => {
    const existing = byDate.get(dk);
    setEditDate(dk);
    setEditEndDate(dk);
    setEditType((existing?.override_type as "holiday" | "working_day") || "holiday");
    setEditName(existing?.name || "");
    setEditNotes(existing?.notes || "");
    setEditCategory(existing?.category || "government");
    setEditPaid(existing?.is_paid ?? true);
    setEditHr(existing?.affects_hr ?? false);
    setEditOpen(true);
  };

  const saveEdit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const start = new Date(editDate + "T12:00:00");
    const end = new Date((editEndDate || editDate) + "T12:00:00");
    if (end < start) {
      alert("End date must be on or after start date.");
      return;
    }
    try {
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dk = dateKeyLocal(new Date(d));
        await api.upsertFactoryCalendar({
          override_date: dk,
          override_type: editType,
          name: editName || undefined,
          notes: editNotes || undefined,
          category: editType === "holiday" ? editCategory : undefined,
          source: "manual",
          is_paid: editPaid,
          affects_hr: editHr,
        });
      }
      setEditOpen(false);
      await load();
    } catch (e) {
      logApiError(e, "ProductionFactoryCalendarPage.save");
    }
  };

  const toggleLegend = (kind: CellKind) => {
    setHiddenLegend((prev) => {
      const n = new Set(prev);
      if (n.has(kind)) n.delete(kind);
      else n.add(kind);
      return n;
    });
  };

  const renderMonthGrid = (year: number, month0: number, mini: boolean) => {
    const fd = new Date(year, month0, 1).getDay();
    const dim = new Date(year, month0 + 1, 0).getDate();
    const cells = Math.ceil((fd + dim) / 7) * 7;
    const dayCells: React.ReactNode[] = [];
    for (let i = 0; i < cells; i++) {
      if (i < fd || i >= fd + dim) {
        dayCells.push(
          <div key={`e-${year}-${month0}-${i}`} className={mini ? "min-h-5" : "min-h-[4.5rem]"} />,
        );
        continue;
      }
      const dayNum = i - fd + 1;
      const d = new Date(year, month0, dayNum);
      const dk = dateKeyLocal(d);
      const kind = cellKindForDate(d, weekendDays, byDate);
      const hidden = hiddenLegend.has(kind);
      const row = byDate.get(dk);
      dayCells.push(
        <button
          key={dk}
          type="button"
          title={row?.name || kind}
          onClick={() => openCell(dk)}
          className={`rounded border text-left p-1 ${mini ? "min-h-5 text-[9px]" : "min-h-[4.5rem] text-xs"} ${
            hidden ? "opacity-25" : ""
          } ${CELL_CLASS[kind]}`}
        >
          <div className="font-semibold flex justify-between gap-1">
            <span>{dayNum}</span>
            {row?.affects_hr ? <Users className="h-3 w-3 shrink-0 text-blue-700" aria-label="HR sync" /> : null}
          </div>
          {!mini && row?.name ? <div className="truncate mt-0.5 opacity-90">{row.name}</div> : null}
        </button>,
      );
    }
    return (
      <div className={mini ? "grid grid-cols-7 gap-0.5" : "grid grid-cols-7 gap-1"}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => (
          <div key={w} className={`text-center text-text-muted ${mini ? "text-[9px]" : "text-xs"}`}>
            {mini ? w.slice(0, 1) : w}
          </div>
        ))}
        {dayCells}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Factory calendar</h1>
        <p className="text-sm text-text-secondary">
          Visual plan for production working days and holidays (separate from HR attendance unless synced).
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border-subtle bg-surface-elevated p-3">
          <div className="text-xs text-text-muted">Working days (month)</div>
          <div className="text-lg font-semibold">{stats.workingDays}</div>
        </div>
        <div className="rounded-lg border border-border-subtle bg-surface-elevated p-3">
          <div className="text-xs text-text-muted">Holidays (month)</div>
          <div className="text-lg font-semibold">{stats.holidayCount}</div>
          <div className="text-[10px] text-text-muted">
            Gov {stats.breakdown.gov} · Rel {stats.breakdown.rel} · Co {stats.breakdown.co} · Opt {stats.breakdown.opt}
          </div>
        </div>
        <div className="rounded-lg border border-border-subtle bg-surface-elevated p-3">
          <div className="text-xs text-text-muted">Next holiday</div>
          <div className="text-sm font-medium">
            {stats.nextHoliday ? `${stats.nextHoliday.date} — ${stats.nextHoliday.name}` : "—"}
          </div>
        </div>
        <div className="rounded-lg border border-border-subtle bg-surface-elevated p-3">
          <div className="text-xs text-text-muted">Working days left (month)</div>
          <div className="text-lg font-semibold">{stats.workingRemaining}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            className="rounded-lg border px-3 py-1.5 text-sm"
            onClick={() => {
              const d = new Date(viewYear, viewMonth - 1, 1);
              setViewYear(d.getFullYear());
              setViewMonth(d.getMonth());
            }}
          >
            Prev
          </button>
          <span className="text-sm font-medium">
            {new Date(viewYear, viewMonth).toLocaleString(undefined, { month: "long", year: "numeric" })}
          </span>
          <button
            type="button"
            className="rounded-lg border px-3 py-1.5 text-sm"
            onClick={() => {
              const d = new Date(viewYear, viewMonth + 1, 1);
              setViewYear(d.getFullYear());
              setViewMonth(d.getMonth());
            }}
          >
            Next
          </button>
          <button
            type="button"
            className={`rounded-lg border px-3 py-1.5 text-sm ${yearMode ? "bg-brand-primary text-white" : ""}`}
            onClick={() => setYearMode(!yearMode)}
          >
            Year overview
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {countryCode ? (
            <button type="button" className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm text-white" onClick={() => void openImport()}>
              Import {countryCode} holidays ({viewYear})
            </button>
          ) : (
            <p className="text-xs text-amber-700">Set country code in Tenant Settings to import public holidays.</p>
          )}
          <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => void toggleAi()}>
            {aiOpen ? "Hide AI assistant" : "AI assistant"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {LEGEND.map((L) => (
          <button
            key={L.kind}
            type="button"
            onClick={() => toggleLegend(L.kind)}
            className={`rounded-full border px-2 py-0.5 ${hiddenLegend.has(L.kind) ? "opacity-40 line-through" : ""}`}
          >
            <span className={`inline-block w-2 h-2 rounded-full mr-1 align-middle ${CELL_CLASS[L.kind].split(" ")[0]}`} />
            {L.label}
          </button>
        ))}
      </div>

      {!yearMode ? (
        renderMonthGrid(viewYear, viewMonth, false)
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 12 }, (_, m) => (
            <div key={m} className="rounded-lg border border-border-subtle p-2">
              <div className="text-xs font-medium mb-1">
                {new Date(viewYear, m).toLocaleString(undefined, { month: "short" })}
              </div>
              {renderMonthGrid(viewYear, m, true)}
              <div className="text-[10px] text-text-muted mt-1">
                {monthStats(viewYear, m, weekendDays, byDate, new Date()).workingDays} wd /{" "}
                {monthStats(viewYear, m, weekendDays, byDate, new Date()).holidayCount} hol
              </div>
            </div>
          ))}
        </div>
      )}

      {aiOpen && (
        <div className="rounded-lg border border-border-subtle bg-surface-elevated p-4 space-y-2">
          <h2 className="text-sm font-medium">AI assistant (factory calendar)</h2>
          <p className="text-xs text-text-muted">
            Uses the same AI Tool as the main assistant. Ask about working days, impact, or proposed holiday ranges.
          </p>
          <div className="flex flex-wrap gap-1">
            {["Working days this month?", "Next holiday?", "What happens if we add a holiday?"].map((p) => (
              <button
                key={p}
                type="button"
                className="rounded border px-2 py-0.5 text-xs"
                onClick={() => setAiPrompt(p)}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="max-h-40 overflow-y-auto text-xs space-y-1 border rounded p-2 bg-surface-raised">
            {messages.map((m) => (
              <div key={m.id} className={m.role === "user" ? "text-blue-800" : "text-text-primary"}>
                <strong>{m.role}:</strong> {m.content}
              </div>
            ))}
          </div>
          {aiErr ? <p className="text-xs text-red-600">{aiErr}</p> : null}
          <div className="flex gap-2">
            <input
              className="flex-1 rounded border px-2 py-1 text-sm"
              placeholder="Ask about your calendar…"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onSendAi();
              }}
            />
            <button
              type="button"
              className="rounded-lg bg-brand-primary px-3 py-1 text-sm text-white disabled:opacity-50"
              disabled={sending || !aiSessionId}
              onClick={() => void onSendAi()}
            >
              Send
            </button>
          </div>
        </div>
      )}

      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-lg w-full rounded-xl border border-border-subtle bg-surface-elevated p-4 shadow-xl space-y-3 max-h-[90vh] overflow-y-auto text-text-primary">
            <h2 className="text-lg font-semibold">Import public holidays</h2>
            <label className="text-sm flex gap-2 items-center">
              Year
              <input
                type="number"
                className="border rounded px-2 w-28"
                value={importYear}
                onChange={(e) => setImportYear(Number(e.target.value))}
              />
              <button
                type="button"
                className="text-xs border rounded px-2"
                onClick={async () => {
                  setImportLoading(true);
                  try {
                    const res = await api.getCountryHolidaysPreview(importYear);
                    setPreview(res.items);
                    setSelectedImport(new Set(res.items.map((x) => x.date)));
                  } catch (e) {
                    logApiError(e, "ProductionFactoryCalendarPage.reloadPreview");
                  } finally {
                    setImportLoading(false);
                  }
                }}
              >
                Load
              </button>
            </label>
            {importLoading ? <p className="text-sm">Loading…</p> : null}
            <ul className="text-sm space-y-1">
              {preview.map((item) => {
                const exists = Boolean(byDate.get(item.date));
                const rec = item.garment_recommendation;
                return (
                  <li key={item.date} className="flex gap-2 items-start border-b border-border-subtle py-1">
                    <input
                      type="checkbox"
                      checked={selectedImport.has(item.date)}
                      disabled={exists}
                      onChange={(e) => {
                        setSelectedImport((prev) => {
                          const n = new Set(prev);
                          if (e.target.checked) n.add(item.date);
                          else n.delete(item.date);
                          return n;
                        });
                      }}
                    />
                    <div className="flex-1">
                      <div>
                        {item.date} — {item.name}
                        {exists ? (
                          <span className="ml-2 text-xs text-amber-700">Already exists</span>
                        ) : null}
                      </div>
                      {rec === "must_close" ? (
                        <span className="text-[10px] text-emerald-800">Recommended: factories typically close</span>
                      ) : rec === "optional" ? (
                        <span className="text-[10px] text-text-muted">Optional: some factories work</span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex justify-end gap-2">
              <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => setImportOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-brand-primary px-3 py-1 text-sm text-white"
                disabled={importLoading}
                onClick={() => void runImport()}
              >
                Import selected
              </button>
            </div>
          </div>
        </div>
      )}

      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={saveEdit} className="max-w-md w-full rounded-xl border border-border-subtle bg-surface-elevated p-4 shadow-xl space-y-3 text-text-primary">
            <h2 className="text-lg font-semibold">{byDate.get(editDate) ? "Edit override" : "Add override"}</h2>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">
                Start
                <input type="date" className="block w-full border rounded px-2 py-1" value={editDate} onChange={(e) => setEditDate(e.target.value)} required />
              </label>
              <label className="text-sm">
                End (range)
                <input type="date" className="block w-full border rounded px-2 py-1" value={editEndDate} onChange={(e) => setEditEndDate(e.target.value)} required />
              </label>
            </div>
            <label className="text-sm block">
              Type
              <select className="block w-full border rounded px-2 py-1" value={editType} onChange={(e) => setEditType(e.target.value as "holiday" | "working_day")}>
                <option value="holiday">Holiday</option>
                <option value="working_day">Working day override</option>
              </select>
            </label>
            {editType === "holiday" ? (
              <label className="text-sm block">
                Category
                <select className="block w-full border rounded px-2 py-1" value={editCategory} onChange={(e) => setEditCategory(e.target.value)}>
                  <option value="government">Government</option>
                  <option value="religious">Religious</option>
                  <option value="company">Company</option>
                  <option value="optional">Optional</option>
                </select>
              </label>
            ) : null}
            <label className="text-sm block">
              Name
              <input className="block w-full border rounded px-2 py-1" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </label>
            <label className="text-sm block">
              Notes
              <textarea className="block w-full border rounded px-2 py-1" rows={2} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editPaid} onChange={(e) => setEditPaid(e.target.checked)} />
              Paid holiday
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editHr} onChange={(e) => setEditHr(e.target.checked)} />
              Sync to HR attendance holidays
            </label>
            <div className="flex justify-between gap-2">
              {byDate.get(editDate) ? (
                <button
                  type="button"
                  className="text-sm text-red-600"
                  onClick={() => {
                    const id = byDate.get(editDate)?.id;
                    if (!id) return;
                    void api
                      .deleteFactoryCalendarOverride(id)
                      .then(() => {
                        setEditOpen(false);
                        void load();
                      })
                      .catch((e) => logApiError(e, "ProductionFactoryCalendarPage.delete"));
                  }}
                >
                  Delete
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => setEditOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="rounded bg-brand-primary px-3 py-1 text-sm text-white">
                  Save
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
