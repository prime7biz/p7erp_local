import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

const OPTIONAL_UNITS = ["knitting", "dyeing", "printing", "aop", "embroidery", "elastic", "washing"];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function crewEmpOptionKey(designationId: number | null | undefined, designationFilter: string | null | undefined) {
  if (designationId != null && designationId > 0) return `id:${designationId}`;
  return designationFilter?.trim() || "";
}

type CrewRow = Awaited<ReturnType<typeof api.getCrewDaily>>[number];

export function DailyCrewSheetPage() {
  const [date, setDate] = useState(todayISO());
  const [mode, setMode] = useState<"line" | "unit">("line");
  const [shiftId, setShiftId] = useState<number | null>(null);
  const [lineId, setLineId] = useState<number | null>(null);
  const [unitDept, setUnitDept] = useState("knitting");
  const [machineId, setMachineId] = useState<number | null>(null);
  const [filters, setFilters] = useState<Awaited<ReturnType<typeof api.getCrewDailyFilters>> | null>(null);
  const [rows, setRows] = useState<CrewRow[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [employeeOptions, setEmployeeOptions] = useState<Record<string, Array<{ id: number; label: string }>>>({});
  const [sheetStatus, setSheetStatus] = useState<string | null>(null);
  const [gaps, setGaps] = useState<Awaited<ReturnType<typeof api.getCrewSubstituteSuggestions>>["gaps"]>([]);

  const loadFilters = useCallback(async () => {
    try {
      const data = await api.getCrewDailyFilters();
      setFilters(data);
      const firstShift = data.shifts[0];
      const firstLine = data.lines[0];
      if (!shiftId && firstShift) setShiftId(firstShift.id);
      if (!lineId && firstLine) setLineId(firstLine.id);
    } catch (e) {
      logApiError(e, "DailyCrewSheetPage.loadFilters");
    }
  }, [lineId, shiftId]);

  const loadRows = useCallback(async () => {
    if (!shiftId) return;
    try {
      setMsg("");
      const data = await api.getCrewDaily({
        production_date: date,
        shift_id: shiftId,
        line_id: mode === "line" ? lineId : undefined,
        department_type: mode === "unit" ? unitDept : undefined,
        machine_id: mode === "unit" ? machineId : undefined,
      });
      setRows(data);
    } catch (e) {
      logApiError(e, "DailyCrewSheetPage.loadRows");
      setMsg("Could not load crew sheet.");
    }
  }, [date, lineId, machineId, mode, shiftId, unitDept]);

  const loadEmployeeOptions = useCallback(async () => {
    const keys = new Set<string>();
    for (const r of rows) {
      if (!r.is_named) continue;
      const k = crewEmpOptionKey(r.designation_id, r.designation_filter);
      if (k) keys.add(k);
    }
    for (const k of keys) {
      if (employeeOptions[k]) continue;
      try {
        const res = k.startsWith("id:")
          ? await api.listHrEmployeesForCrew({ designation_id: Number(k.slice(3)) })
          : await api.listHrEmployeesForCrew({ designation_filter: k });
        setEmployeeOptions((prev) => ({
          ...prev,
          [k]: (res.items ?? []).map((x) => ({
            id: x.id,
            label: `${x.employee_code} - ${x.name}`,
          })),
        }));
      } catch {
        setEmployeeOptions((prev) => ({ ...prev, [k]: [] }));
      }
    }
  }, [employeeOptions, rows]);

  const loadLineSheetStatus = useCallback(async () => {
    if (mode !== "line" || !shiftId || !lineId) {
      setSheetStatus(null);
      return;
    }
    try {
      const s = await api.getLineCrewSheetStatus({ production_date: date, shift_id: shiftId, line_id: lineId });
      setSheetStatus(s.status);
    } catch {
      setSheetStatus(null);
    }
  }, [date, lineId, mode, shiftId]);

  useEffect(() => {
    void loadFilters();
  }, [loadFilters]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    void loadEmployeeOptions();
  }, [loadEmployeeOptions]);

  useEffect(() => {
    void loadLineSheetStatus();
  }, [loadLineSheetStatus]);

  const loadSubstitutes = async () => {
    if (!shiftId || !lineId || mode !== "line") return;
    try {
      const res = await api.getCrewSubstituteSuggestions({
        production_date: date,
        shift_id: shiftId,
        line_id: lineId,
      });
      setGaps(res.gaps);
      setMsg(res.gaps.length ? `Found ${res.gaps.length} leave gap(s).` : "No leave gaps for named roles.");
    } catch (e) {
      logApiError(e, "DailyCrewSheetPage.loadSubstitutes");
    }
  };

  const totalPlanned = useMemo(() => rows.reduce((sum, x) => sum + (x.planned_count || 0), 0), [rows]);
  const totalPresent = useMemo(() => rows.reduce((sum, x) => sum + (x.actual_present || 0), 0), [rows]);

  const prefill = async () => {
    if (!shiftId) return;
    try {
      setBusy(true);
      await api.initCrewDailyFromTemplate({
        production_date: date,
        shift_id: shiftId,
        line_id: mode === "line" ? lineId : undefined,
        department_type: mode === "unit" ? unitDept : undefined,
        machine_id: mode === "unit" ? machineId : undefined,
      });
      await loadRows();
      setMsg("Pre-filled from template.");
    } catch (e) {
      logApiError(e, "DailyCrewSheetPage.prefill");
      setMsg("Could not pre-fill from template.");
    } finally {
      setBusy(false);
    }
  };

  const syncAttendance = async () => {
    try {
      setBusy(true);
      await api.syncCrewAttendance(date);
      await loadRows();
      setMsg("Attendance synced.");
    } catch (e) {
      logApiError(e, "DailyCrewSheetPage.syncAttendance");
      setMsg("Could not sync attendance.");
    } finally {
      setBusy(false);
    }
  };

  const save = async (override = false) => {
    if (!shiftId) return;
    try {
      setBusy(true);
      setMsg("");
      await api.putCrewDaily({
        production_date: date,
        shift_id: shiftId,
        line_id: mode === "line" ? lineId : undefined,
        department_type: mode === "unit" ? unitDept : undefined,
        machine_id: mode === "unit" ? machineId : undefined,
        rows: rows.map((r) => ({
          crew_role_id: r.crew_role_id,
          planned_count: Number(r.planned_count) || 0,
          employee_id: r.employee_id ?? null,
          notes: r.notes ?? null,
        })),
        override_validation: override,
      });
      await loadRows();
      setMsg("Crew sheet saved.");
    } catch (e) {
      logApiError(e, "DailyCrewSheetPage.save");
      const raw = e instanceof Error ? e.message : String(e);
      if (raw.includes("override_validation")) {
        const ok = window.confirm("There are over-allocation warnings. Save anyway?");
        if (ok) await save(true);
      } else {
        setMsg("Could not save crew sheet.");
      }
    } finally {
      setBusy(false);
    }
  };

  const updateSheetStatus = async (action: string) => {
    if (mode !== "line" || !shiftId || !lineId) return;
    try {
      await api.updateLineCrewSheetStatus(
        { production_date: date, shift_id: shiftId, line_id: lineId },
        { action },
      );
      await loadLineSheetStatus();
      setMsg(`Sheet status: ${action}`);
    } catch (e) {
      logApiError(e, "DailyCrewSheetPage.updateSheetStatus");
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Daily Crew Sheet</h1>
        <p className="text-sm text-text-secondary">Plan and validate daily/shift manpower by line or optional unit.</p>
      </div>

      <section className="rounded-lg border border-border-subtle bg-surface-elevated p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="text-xs text-text-secondary">
            Date
            <input type="date" className="mt-1 w-full rounded-md border border-border-subtle px-2 py-1.5 text-sm" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="text-xs text-text-secondary">
            Shift
            <select className="mt-1 w-full rounded-md border border-border-subtle px-2 py-1.5 text-sm" value={shiftId ?? ""} onChange={(e) => setShiftId(e.target.value ? Number(e.target.value) : null)}>
              {(filters?.shifts ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} - {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-text-secondary">
            Mode
            <select className="mt-1 w-full rounded-md border border-border-subtle px-2 py-1.5 text-sm" value={mode} onChange={(e) => setMode(e.target.value as "line" | "unit")}>
              <option value="line">Sewing line</option>
              <option value="unit">Optional unit</option>
            </select>
          </label>
          {mode === "line" ? (
            <label className="text-xs text-text-secondary">
              Line
              <select className="mt-1 w-full rounded-md border border-border-subtle px-2 py-1.5 text-sm" value={lineId ?? ""} onChange={(e) => setLineId(e.target.value ? Number(e.target.value) : null)}>
                {(filters?.lines ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.line_code} - {l.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label className="text-xs text-text-secondary">
                Unit
                <select className="mt-1 w-full rounded-md border border-border-subtle px-2 py-1.5 text-sm" value={unitDept} onChange={(e) => setUnitDept(e.target.value)}>
                  {OPTIONAL_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-text-secondary">
                Machine ID (optional)
                <input type="number" min={1} className="mt-1 w-full rounded-md border border-border-subtle px-2 py-1.5 text-sm" value={machineId ?? ""} onChange={(e) => setMachineId(e.target.value ? Number(e.target.value) : null)} />
              </label>
            </>
          )}
        </div>
        {mode === "line" && sheetStatus ? (
          <p className="mt-2 text-xs text-text-secondary">
            Crew sheet status: <strong>{sheetStatus}</strong>
            {sheetStatus === "approved" || sheetStatus === "locked" ? " — editing is blocked." : null}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="rounded-lg border border-border-subtle px-3 py-1.5 text-sm" onClick={() => void loadRows()}>
            Refresh
          </button>
          <button type="button" className="rounded-lg border border-border-subtle px-3 py-1.5 text-sm" onClick={() => void prefill()} disabled={busy}>
            Pre-fill from template
          </button>
          <button type="button" className="rounded-lg border border-border-subtle px-3 py-1.5 text-sm" onClick={() => void syncAttendance()} disabled={busy}>
            Sync attendance
          </button>
          <button type="button" className="rounded-lg border border-border-subtle px-3 py-1.5 text-sm" onClick={() => void loadSubstitutes()} disabled={busy || mode !== "line"}>
            Check leave &amp; substitutes
          </button>
          <button type="button" className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm text-white" onClick={() => void save()} disabled={busy}>
            Save
          </button>
        </div>
        {mode === "line" ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="rounded-lg border border-border-subtle px-2 py-1 text-xs" onClick={() => void updateSheetStatus("submit")}>
              Submit sheet
            </button>
            <button type="button" className="rounded-lg border border-border-subtle px-2 py-1 text-xs" onClick={() => void updateSheetStatus("approve")}>
              Approve
            </button>
            <button type="button" className="rounded-lg border border-border-subtle px-2 py-1 text-xs" onClick={() => void updateSheetStatus("lock")}>
              Lock
            </button>
            <button type="button" className="rounded-lg border border-border-subtle px-2 py-1 text-xs" onClick={() => void updateSheetStatus("reopen")}>
              Reopen
            </button>
          </div>
        ) : null}
        {msg ? <p className="mt-2 text-sm text-text-secondary">{msg}</p> : null}
      </section>

      {gaps.length > 0 ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="font-medium text-amber-950">Substitute suggestions (on approved leave)</p>
          <ul className="mt-2 space-y-2">
            {gaps.map((g) => (
              <li key={g.crew_role_id}>
                <strong>{g.role_name}</strong> — try:{" "}
                {g.suggested_substitutes.map((s) => s.name).join(", ") || "none available"}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-lg border border-border-subtle bg-surface-elevated p-4">
        <div className="mb-2 text-sm text-text-secondary">
          Planned: <strong>{totalPlanned}</strong> · Actual present: <strong>{totalPresent}</strong>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-text-secondary">
                <th className="px-2 py-2">Role</th>
                <th className="px-2 py-2">Planned</th>
                <th className="px-2 py-2">Actual</th>
                <th className="px-2 py-2">Shortfall</th>
                <th className="px-2 py-2">Employee</th>
                <th className="px-2 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const k = crewEmpOptionKey(r.designation_id, r.designation_filter);
                const opts = employeeOptions[k] ?? [];
                return (
                  <tr key={r.id} className="border-b border-border-subtle/60">
                    <td className="px-2 py-2">
                      {r.role_name}
                      {r.validation_warning ? <span className="ml-2 text-xs text-amber-700">({r.validation_warning})</span> : null}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min={0}
                        className="w-24 rounded border border-border-subtle px-2 py-1"
                        value={r.planned_count}
                        onChange={(e) => setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, planned_count: Number(e.target.value) || 0 } : x)))}
                      />
                    </td>
                    <td className="px-2 py-2">{r.actual_present}</td>
                    <td className={`px-2 py-2 ${r.shortfall > 0 ? "font-semibold text-red-600" : ""}`}>{r.shortfall}</td>
                    <td className="px-2 py-2">
                      {r.is_named ? (
                        <select
                          className="w-full min-w-[220px] rounded border border-border-subtle px-2 py-1 text-sm"
                          value={r.employee_id ?? ""}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((x) =>
                                x.id === r.id ? { ...x, employee_id: e.target.value ? Number(e.target.value) : null } : x,
                              ),
                            )
                          }
                        >
                          <option value="">Select employee</option>
                          {opts.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-text-secondary">Count-only</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className="w-full min-w-[180px] rounded border border-border-subtle px-2 py-1"
                        value={r.notes ?? ""}
                        onChange={(e) => setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, notes: e.target.value } : x)))}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
