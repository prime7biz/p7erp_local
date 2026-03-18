import { useEffect, useMemo, useState } from "react";

import { api, MfgMasterOperationCreate } from "@/api/client";

type ProcessArea = "cutting" | "sewing" | "finishing" | "general";

const PROCESS_AREAS: ProcessArea[] = ["cutting", "sewing", "finishing", "general"];

export function ProductionIeEfficiencyPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.listMfgMasterOperations>>>([]);
  const [error, setError] = useState("");
  const [savingById, setSavingById] = useState<Record<number, boolean>>({});
  const [areaById, setAreaById] = useState<Record<number, ProcessArea>>({});
  const [activeOnly, setActiveOnly] = useState(true);
  const [newOp, setNewOp] = useState<MfgMasterOperationCreate>({
    code: "",
    name: "",
    process_area: "general",
    is_active: true,
  });

  const load = async () => {
    setError("");
    try {
      const data = await api.listMfgMasterOperations({ active_only: activeOnly });
      setRows(data);
      setAreaById(
        Object.fromEntries(data.map((row) => [row.id, row.process_area])) as Record<number, ProcessArea>,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load operation masters");
    }
  };

  useEffect(() => {
    void load();
  }, [activeOnly]);

  const areaSummary = useMemo(() => {
    const base: Record<ProcessArea, number> = {
      cutting: 0,
      sewing: 0,
      finishing: 0,
      general: 0,
    };
    for (const row of rows) base[row.process_area] += 1;
    return base;
  }, [rows]);

  const saveArea = async (operationId: number) => {
    const processArea = areaById[operationId];
    if (!processArea) return;
    setError("");
    setSavingById((prev) => ({ ...prev, [operationId]: true }));
    try {
      await api.updateMfgMasterOperation(operationId, { process_area: processArea });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update process area");
    } finally {
      setSavingById((prev) => ({ ...prev, [operationId]: false }));
    }
  };

  const createOperation = async () => {
    if (!newOp.code?.trim() || !newOp.name?.trim()) {
      setError("Code and Name are required.");
      return;
    }
    setError("");
    try {
      await api.createMfgMasterOperation({
        ...newOp,
        code: newOp.code.trim(),
        name: newOp.name.trim(),
        process_area: newOp.process_area ?? "general",
      });
      setNewOp({
        code: "",
        name: "",
        process_area: "general",
        is_active: true,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create operation");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">IE & Operation Master</h1>
        <p className="text-sm text-text-muted">
          Maintain operation process areas for strict cutting/sewing/finishing queue control.
        </p>
      </div>

      {error ? <div className="rounded border border-status-danger/20 bg-status-danger-subtle p-3 text-sm text-status-danger-foreground">{error}</div> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface-raised p-3">
          <div className="text-xs text-text-muted">Cutting Ops</div>
          <div className="text-xl font-semibold">{areaSummary.cutting}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-3">
          <div className="text-xs text-text-muted">Sewing Ops</div>
          <div className="text-xl font-semibold">{areaSummary.sewing}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-3">
          <div className="text-xs text-text-muted">Finishing Ops</div>
          <div className="text-xl font-semibold">{areaSummary.finishing}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-3">
          <div className="text-xs text-text-muted">General Ops</div>
          <div className="text-xl font-semibold">{areaSummary.general}</div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <h2 className="mb-3 text-sm font-semibold text-text-secondary">Create Operation</h2>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
          <input
            className="rounded border px-3 py-2 text-sm"
            placeholder="Code (e.g. CUT-10)"
            value={newOp.code}
            onChange={(e) => setNewOp((prev) => ({ ...prev, code: e.target.value }))}
          />
          <input
            className="rounded border px-3 py-2 text-sm"
            placeholder="Name"
            value={newOp.name}
            onChange={(e) => setNewOp((prev) => ({ ...prev, name: e.target.value }))}
          />
          <select
            className="rounded border px-3 py-2 text-sm"
            value={newOp.process_area ?? "general"}
            onChange={(e) => setNewOp((prev) => ({ ...prev, process_area: e.target.value as ProcessArea }))}
          >
            {PROCESS_AREAS.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
          <input
            className="rounded border px-3 py-2 text-sm"
            type="number"
            min={0}
            placeholder="Std Cycle (min)"
            value={newOp.std_cycle_minutes ?? ""}
            onChange={(e) =>
              setNewOp((prev) => ({
                ...prev,
                std_cycle_minutes: e.target.value ? Number(e.target.value) : null,
              }))
            }
          />
          <button className="rounded border px-3 py-2 text-sm" onClick={() => void createOperation()}>
            Create
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-sm font-semibold text-text-secondary">Operation Area Mapping</h2>
          <label className="flex items-center gap-2 text-xs text-text-secondary">
            <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
            Active only
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle text-left text-text-secondary">
              <tr>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Current Area</th>
                <th className="px-3 py-2">Edit Area</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{row.code}</td>
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2">{row.process_area}</td>
                  <td className="px-3 py-2">
                    <select
                      className="rounded border px-2 py-1 text-xs"
                      value={areaById[row.id] ?? row.process_area}
                      onChange={(e) =>
                        setAreaById((prev) => ({ ...prev, [row.id]: e.target.value as ProcessArea }))
                      }
                    >
                      {PROCESS_AREAS.map((area) => (
                        <option key={area} value={area}>
                          {area}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      className="rounded border px-2 py-1 text-xs"
                      disabled={savingById[row.id]}
                      onClick={() => void saveArea(row.id)}
                    >
                      {savingById[row.id] ? "Saving..." : "Save"}
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-text-muted" colSpan={5}>
                    No operation masters found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
