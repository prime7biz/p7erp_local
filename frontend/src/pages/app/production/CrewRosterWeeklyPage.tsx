import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

function mondayISO(d: Date) {
  const day = d.getDay();
  const diff = (day + 6) % 7;
  const mon = new Date(d);
  mon.setDate(d.getDate() - diff);
  return mon.toISOString().slice(0, 10);
}

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CrewRosterWeeklyPage() {
  const [weekStart, setWeekStart] = useState(() => mondayISO(new Date()));
  const [shiftId, setShiftId] = useState<number | null>(null);
  const [lineId, setLineId] = useState<number | null>(null);
  const [filters, setFilters] = useState<Awaited<ReturnType<typeof api.getCrewDailyFilters>> | null>(null);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.listCrewRosterWeekly>>>([]);
  const [crewRoles, setCrewRoles] = useState<Awaited<ReturnType<typeof api.listCrewRoles>>>([]);
  const [targetDate, setTargetDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [msg, setMsg] = useState("");

  const sewingRoles = useMemo(() => crewRoles.filter((r) => r.department_type === "sewing"), [crewRoles]);

  const load = useCallback(async () => {
    try {
      const f = await api.getCrewDailyFilters();
      setFilters(f);
      if (!shiftId && f.shifts[0]) setShiftId(f.shifts[0].id);
      if (!lineId && f.lines[0]) setLineId(f.lines[0].id);
      setCrewRoles(await api.listCrewRoles("sewing"));
    } catch (e) {
      logApiError(e, "CrewRosterWeeklyPage.load");
    }
  }, [lineId, shiftId]);

  const loadRoster = useCallback(async () => {
    if (!shiftId || !lineId) return;
    try {
      setMsg("");
      const data = await api.listCrewRosterWeekly({
        week_start_date: weekStart,
        sewing_line_id: lineId,
        shift_id: shiftId,
      });
      setRows(data);
    } catch (e) {
      logApiError(e, "CrewRosterWeeklyPage.loadRoster");
      setMsg("Could not load roster.");
    }
  }, [lineId, shiftId, weekStart]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  const upsertCell = async (crew_role_id: number, day_of_week: number, employee_id: number | null) => {
    try {
      await api.upsertCrewRosterCell({
        week_start_date: weekStart,
        sewing_line_id: lineId!,
        shift_id: shiftId!,
        crew_role_id,
        day_of_week,
        employee_id,
        planned_count: 1,
      });
      await loadRoster();
    } catch (e) {
      logApiError(e, "CrewRosterWeeklyPage.upsertCell");
    }
  };

  const generateDaily = async () => {
    if (!shiftId || !lineId) return;
    try {
      await api.generateCrewDailyFromRoster({
        week_start_date: weekStart,
        sewing_line_id: lineId,
        shift_id: shiftId,
        target_date: targetDate,
      });
      setMsg("Generated daily crew from roster.");
    } catch (e) {
      logApiError(e, "CrewRosterWeeklyPage.generateDaily");
      setMsg("Could not generate daily crew.");
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Weekly crew roster</h1>
        <p className="text-sm text-text-secondary">Plan Mon–Sun by line/shift; push to a daily crew sheet.</p>
      </div>

      <section className="rounded-lg border border-border-subtle bg-surface-elevated p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-text-secondary">
            Week start (Monday)
            <input
              type="date"
              className="mt-1 w-full rounded-md border border-border-subtle px-2 py-1.5 text-sm"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
            />
          </label>
          <label className="text-xs text-text-secondary">
            Shift
            <select
              className="mt-1 w-full rounded-md border border-border-subtle px-2 py-1.5 text-sm"
              value={shiftId ?? ""}
              onChange={(e) => setShiftId(e.target.value ? Number(e.target.value) : null)}
            >
              {(filters?.shifts ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-text-secondary">
            Line
            <select
              className="mt-1 w-full rounded-md border border-border-subtle px-2 py-1.5 text-sm"
              value={lineId ?? ""}
              onChange={(e) => setLineId(e.target.value ? Number(e.target.value) : null)}
            >
              {(filters?.lines ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.line_code}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs text-text-secondary">
            Push roster → daily date
            <input
              type="date"
              className="mt-1 rounded-md border border-border-subtle px-2 py-1.5 text-sm"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </label>
          <button type="button" className="rounded-lg bg-brand-primary px-3 py-2 text-sm text-white" onClick={() => void generateDaily()}>
            Generate daily crew
          </button>
        </div>
        {msg ? <p className="mt-2 text-sm text-text-secondary">{msg}</p> : null}
      </section>

      <section className="overflow-x-auto rounded-lg border border-border-subtle bg-surface-elevated p-4">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b text-text-secondary">
              <th className="px-2 py-2">Role</th>
              {DOW.map((d) => (
                <th key={d} className="px-2 py-2">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sewingRoles.map((role) => (
              <tr key={role.id} className="border-b border-border-subtle/60">
                <td className="px-2 py-2 font-medium">{role.role_name}</td>
                {DOW.map((_, dow) => {
                  const cell = rows.find(
                    (r) => r.crew_role_id === role.id && r.day_of_week === dow,
                  );
                  return (
                    <td key={`${role.id}-${dow}`} className="px-2 py-1">
                      {role.is_named ? (
                        <input
                          type="number"
                          className="w-20 rounded border border-border-subtle px-1 py-0.5 text-xs"
                          placeholder="emp #"
                          defaultValue={cell?.employee_id ?? ""}
                          onBlur={(e) => {
                            const v = e.target.value ? Number(e.target.value) : null;
                            void upsertCell(role.id, dow, v);
                          }}
                        />
                      ) : (
                        <input
                          type="number"
                          min={0}
                          className="w-16 rounded border border-border-subtle px-1 py-0.5 text-xs"
                          defaultValue={cell?.planned_count ?? 0}
                          onBlur={(e) => {
                            void api.upsertCrewRosterCell({
                              week_start_date: weekStart,
                              sewing_line_id: lineId!,
                              shift_id: shiftId!,
                              crew_role_id: role.id,
                              day_of_week: dow,
                              planned_count: Number(e.target.value) || 0,
                            });
                            void loadRoster();
                          }}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-text-secondary">
          For named roles, enter employee ID and click outside to save. Use Daily Crew Sheet for full picker UX.
        </p>
      </section>
    </div>
  );
}
