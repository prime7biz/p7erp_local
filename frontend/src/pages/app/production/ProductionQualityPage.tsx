import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function ProductionQualityPage() {
  const [date, setDate] = useState(todayISO());
  const [shiftId, setShiftId] = useState<number | null>(null);
  const [lineId, setLineId] = useState<number | null>(null);
  const [hourSlot, setHourSlot] = useState(8);
  const [passQty, setPassQty] = useState(0);
  const [failQty, setFailQty] = useState(0);
  const [totalChecked, setTotalChecked] = useState(0);
  const [checks, setChecks] = useState<Awaited<ReturnType<typeof api.listProductionQcChecks>>>([]);
  const [filters, setFilters] = useState<Awaited<ReturnType<typeof api.getCrewDailyFilters>> | null>(null);
  const [msg, setMsg] = useState("");

  const pareto = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of checks) {
      const arr = (c.defect_codes as Array<{ code?: string; count?: number }> | null | undefined) ?? [];
      for (const d of arr) {
        const k = d.code ?? "?";
        map.set(k, (map.get(k) ?? 0) + (d.count ?? 1));
      }
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [checks]);

  const loadFilters = useCallback(async () => {
    try {
      const f = await api.getCrewDailyFilters();
      setFilters(f);
      if (!shiftId && f.shifts[0]) setShiftId(f.shifts[0].id);
      if (!lineId && f.lines[0]) setLineId(f.lines[0].id);
    } catch (e) {
      logApiError(e, "ProductionQualityPage.loadFilters");
    }
  }, [lineId, shiftId]);

  const loadChecks = useCallback(async () => {
    try {
      setMsg("");
      const rows = await api.listProductionQcChecks({
        production_date: date,
        shift_id: shiftId ?? undefined,
        line_id: lineId ?? undefined,
      });
      setChecks(rows);
    } catch (e) {
      logApiError(e, "ProductionQualityPage.loadChecks");
      setMsg("Could not load QC checks.");
    }
  }, [date, lineId, shiftId]);

  useEffect(() => {
    void loadFilters();
  }, [loadFilters]);

  useEffect(() => {
    void loadChecks();
  }, [loadChecks]);

  const save = async () => {
    if (!shiftId || !lineId) {
      setMsg("Select shift and line.");
      return;
    }
    try {
      await api.upsertProductionQcCheck({
        sewing_line_id: lineId,
        shift_id: shiftId,
        production_date: date,
        hour_slot: hourSlot,
        check_type: "inline",
        total_checked: totalChecked,
        pass_qty: passQty,
        fail_qty: failQty,
        defect_codes: failQty > 0 ? [{ code: "MISC", count: failQty }] : [],
      });
      setMsg("Saved QC entry.");
      await loadChecks();
    } catch (e) {
      logApiError(e, "ProductionQualityPage.save");
      setMsg("Could not save.");
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Shop-floor QC</h1>
        <p className="text-sm text-text-secondary">Hourly inline checks; defect Pareto from recorded checks.</p>
      </div>

      <section className="rounded-lg border border-border-subtle bg-surface-elevated p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs text-text-secondary">
            Date
            <input
              type="date"
              className="mt-1 w-full rounded-md border border-border-subtle px-2 py-1.5 text-sm"
              value={date}
              onChange={(e) => setDate(e.target.value)}
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
                  {s.code} — {s.name}
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
                  {l.line_code} — {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-text-secondary">
            Hour slot
            <input
              type="number"
              min={0}
              max={23}
              className="mt-1 w-full rounded-md border border-border-subtle px-2 py-1.5 text-sm"
              value={hourSlot}
              onChange={(e) => setHourSlot(Number(e.target.value) || 0)}
            />
          </label>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-xs text-text-secondary">
            Total checked
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded-md border border-border-subtle px-2 py-1.5 text-sm"
              value={totalChecked}
              onChange={(e) => setTotalChecked(Number(e.target.value) || 0)}
            />
          </label>
          <label className="text-xs text-text-secondary">
            Pass qty
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded-md border border-border-subtle px-2 py-1.5 text-sm"
              value={passQty}
              onChange={(e) => setPassQty(Number(e.target.value) || 0)}
            />
          </label>
          <label className="text-xs text-text-secondary">
            Fail qty
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded-md border border-border-subtle px-2 py-1.5 text-sm"
              value={failQty}
              onChange={(e) => setFailQty(Number(e.target.value) || 0)}
            />
          </label>
        </div>
        <button
          type="button"
          className="mt-3 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white"
          onClick={() => void save()}
        >
          Save check
        </button>
        {msg ? <p className="mt-2 text-sm text-text-secondary">{msg}</p> : null}
      </section>

      <section className="rounded-lg border border-border-subtle bg-surface-elevated p-4">
        <h2 className="text-sm font-medium text-text-primary">Defect Pareto (from loaded checks)</h2>
        {pareto.length === 0 ? (
          <p className="mt-2 text-sm text-text-secondary">No defect codes recorded for this filter.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {pareto.map(([code, n]) => (
              <li key={code}>
                <strong>{code}</strong>: {n}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-border-subtle bg-surface-elevated p-4">
        <h2 className="text-sm font-medium text-text-primary">Recent checks</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b text-text-secondary">
                <th className="px-2 py-2">Line</th>
                <th className="px-2 py-2">Hour</th>
                <th className="px-2 py-2">Pass</th>
                <th className="px-2 py-2">Fail</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.id} className="border-b border-border-subtle/60">
                  <td className="px-2 py-2">{c.sewing_line_id}</td>
                  <td className="px-2 py-2">{c.hour_slot}</td>
                  <td className="px-2 py-2">{c.pass_qty}</td>
                  <td className="px-2 py-2">{c.fail_qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
