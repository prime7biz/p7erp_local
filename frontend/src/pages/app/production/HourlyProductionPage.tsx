import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const DEPT_LABEL: Record<string, string> = {
  sewing: "Sewing",
  cutting: "Cutting",
  knitting: "Knitting",
  dyeing: "Dyeing",
  printing: "Printing",
  aop: "AOP",
  embroidery: "Embroidery",
  elastic: "Elastic",
  washing: "Washing",
  iron: "Iron",
  finishing: "Finishing",
};

export function HourlyProductionPage() {
  const { dept } = useParams<{ dept: string }>();
  const department_type = dept ?? "sewing";
  const label = DEPT_LABEL[department_type] ?? department_type;

  const [date, setDate] = useState(todayISO());
  const [lineId, setLineId] = useState("");
  const [machineId, setMachineId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [lines, setLines] = useState<Awaited<ReturnType<typeof api.listSewingLines>>>([]);
  const [machines, setMachines] = useState<Awaited<ReturnType<typeof api.listDepartmentMachines>>>([]);
  const [shifts, setShifts] = useState<Awaited<ReturnType<typeof api.listProductionShifts>>>([]);
  const [sheet, setSheet] = useState<Array<{ id: number; hour_slot: number; good_qty: number | null }>>([]);
  const [draft, setDraft] = useState<Record<number, { good: string; reject: string }>>({});
  const [error, setError] = useState("");

  const isSewing = department_type === "sewing";

  const loadRefs = useCallback(async () => {
    try {
      const [l, m, sh] = await Promise.all([
        api.listSewingLines(),
        api.listDepartmentMachines(department_type),
        api.listProductionShifts(),
      ]);
      setLines(l);
      setMachines(m);
      setShifts(sh);
      const firstShift = sh[0];
      setShiftId((prev) => (prev ? prev : firstShift ? String(firstShift.id) : ""));
    } catch (e) {
      logApiError(e, "HourlyProductionPage.loadRefs");
    }
  }, [department_type]);

  const loadSheet = useCallback(async () => {
    setError("");
    try {
      const res = await api.getHourlySheet({
        department_type,
        production_date: date,
        line_id: isSewing && lineId ? Number(lineId) : null,
        machine_id: !isSewing && machineId ? Number(machineId) : null,
      });
      const items = (res.items as Array<{ id: number; hour_slot: number; good_qty: number | null }>) ?? [];
      setSheet(items);
      const d: Record<number, { good: string; reject: string }> = {};
      for (const it of items) {
        d[it.hour_slot] = {
          good: it.good_qty != null ? String(it.good_qty) : "",
          reject: "",
        };
      }
      setDraft(d);
    } catch (e) {
      logApiError(e, "HourlyProductionPage.loadSheet");
      setError("Could not load hourly sheet.");
    }
  }, [date, department_type, isSewing, lineId, machineId]);

  useEffect(() => {
    void loadRefs();
  }, [loadRefs]);

  useEffect(() => {
    void loadSheet();
  }, [loadSheet]);

  const slots = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);

  const saveSlot = async (hour_slot: number) => {
    const row = draft[hour_slot];
    if (!row) return;
    try {
      await api.upsertHourlyEntry({
        department_type,
        production_date: date,
        hour_slot,
        shift_id: shiftId ? Number(shiftId) : null,
        line_id: isSewing && lineId ? Number(lineId) : null,
        machine_id: !isSewing && machineId ? Number(machineId) : null,
        good_qty: row.good === "" ? null : Number(row.good),
        reject_qty: row.reject === "" ? null : Number(row.reject),
      });
      await loadSheet();
    } catch (e) {
      logApiError(e, "HourlyProductionPage.saveSlot");
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Hourly production — {label}</h1>
        <p className="text-sm text-text-secondary">Enter good/reject per hour slot (mobile-friendly).</p>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex flex-wrap gap-3 rounded-lg border border-border-subtle bg-surface-elevated p-4">
        <label className="text-sm">
          Date
          <input type="date" className="ml-2 rounded-md border border-border-subtle px-2 py-1" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="text-sm">
          Shift
          <select
            className="ml-2 rounded-md border border-border-subtle px-2 py-1"
            value={shiftId}
            onChange={(e) => setShiftId(e.target.value)}
          >
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.shift_code} — {s.name}
              </option>
            ))}
          </select>
        </label>
        {isSewing ? (
          <label className="text-sm">
            Sewing line
            <select className="ml-2 rounded-md border border-border-subtle px-2 py-1" value={lineId} onChange={(e) => setLineId(e.target.value)}>
              <option value="">—</option>
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.line_code} {l.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="text-sm">
            Machine
            <select className="ml-2 rounded-md border border-border-subtle px-2 py-1" value={machineId} onChange={(e) => setMachineId(e.target.value)}>
              <option value="">—</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.machine_code} {m.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="button" className="rounded-lg border border-border-subtle px-3 py-1.5 text-sm" onClick={() => void loadSheet()}>
          Refresh
        </button>
      </div>

      <div className="space-y-2">
        {slots.map((h) => (
          <div key={h} className="flex flex-wrap items-center gap-2 rounded-lg border border-border-subtle bg-surface-subtle p-3">
            <span className="w-16 text-sm font-medium text-text-secondary">H{h}</span>
            <input
              inputMode="decimal"
              placeholder="Good"
              className="min-w-[100px] flex-1 rounded-lg border border-border-subtle px-3 py-2 text-base"
              value={draft[h]?.good ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, [h]: { ...d[h], good: e.target.value, reject: d[h]?.reject ?? "" } }))}
            />
            <input
              inputMode="decimal"
              placeholder="Reject"
              className="min-w-[100px] flex-1 rounded-lg border border-border-subtle px-3 py-2 text-base"
              value={draft[h]?.reject ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, [h]: { good: d[h]?.good ?? "", reject: e.target.value } }))}
            />
            <button type="button" className="rounded-lg bg-brand-primary px-3 py-2 text-sm text-white" onClick={() => void saveSlot(h)}>
              Save
            </button>
          </div>
        ))}
      </div>

      {sheet.length > 0 ? (
        <p className="text-xs text-text-muted">Saved rows: {sheet.length}</p>
      ) : null}
    </div>
  );
}
