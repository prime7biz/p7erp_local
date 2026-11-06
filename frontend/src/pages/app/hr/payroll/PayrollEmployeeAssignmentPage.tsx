import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type HrEmployeeResponse,
  type HrPayrollAssignmentResponse,
} from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { todayLocalISO } from "@/lib/dates";

const PREFIX = "/app/hr";

type PayrollStructureOption = {
  id: number;
  code?: string;
  name: string;
  is_active?: boolean;
};

function assignmentStatus(row: HrPayrollAssignmentResponse): string {
  const today = todayLocalISO();
  if (row.effective_from > today) return "Future";
  if (row.effective_to && row.effective_to < today) return "Ended";
  return "Active";
}

export function PayrollEmployeeAssignmentPage() {
  const [rows, setRows] = useState<HrPayrollAssignmentResponse[]>([]);
  const [employees, setEmployees] = useState<HrEmployeeResponse[]>([]);
  const [structures, setStructures] = useState<PayrollStructureOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [form, setForm] = useState({
    employee_id: 0,
    structure_id: 0,
    effective_from: todayLocalISO(),
    base_salary: "",
    component_overrides: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const structById = useMemo(() => new Map(structures.map((s) => [s.id, s])), [structures]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [a, e, s] = await Promise.all([
        api.listHrPayrollAssignments(),
        api.listHrEmployees({ active_only: true }),
        api.listHrSalaryStructures({ active_only: true }),
      ]);
      setRows(a);
      setEmployees(e);
      setStructures(s as unknown as PayrollStructureOption[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const c = () => setOpenActionsId(null);
    document.addEventListener("click", c);
    return () => document.removeEventListener("click", c);
  }, []);

  const onSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form.employee_id || !form.structure_id) {
      setMsg("Select employee and structure.");
      return;
    }
    setSubmitting(true);
    setMsg("");
    try {
      let overrides: Record<string, string | { amount: string | number; formula_type?: string }> | null =
        null;
      if (form.component_overrides.trim()) {
        overrides = JSON.parse(form.component_overrides) as Record<
          string,
          string | { amount: string | number; formula_type?: string }
        >;
      }
      await api.createHrPayrollAssignment({
        employee_id: form.employee_id,
        structure_id: form.structure_id,
        effective_from: form.effective_from,
        base_salary: form.base_salary.trim() || null,
        component_overrides: overrides,
      });
      setMsg("Structure assigned.");
      setForm((f) => ({ ...f, base_salary: "", component_overrides: "" }));
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Assign failed");
    } finally {
      setSubmitting(false);
    }
  };

  const endAssignment = async (id: number) => {
    setMsg("");
    try {
      await api.endHrPayrollAssignment(id, { effective_to: todayLocalISO() });
      setMsg("Assignment ended.");
      setOpenActionsId(null);
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "End failed");
    }
  };

  const structureLabel = (s: PayrollStructureOption | undefined, fallbackId: number) => {
    if (!s) return `#${fallbackId}`;
    const code = s.code ? `${s.code} — ` : "";
    return `${code}${s.name}`;
  };

  return (
    <div className="space-y-6">
      <HrPageHeader
        title="Payroll structure assignments"
        description="Link employees to salary structures with effective dates. Required before auto-calculate."
        breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Assignments" }]}
      />
      {error && <div className="text-sm text-status-danger-foreground">{error}</div>}
      {msg && <div className="text-sm text-text-secondary">{msg}</div>}

      <form onSubmit={(e) => void onSubmit(e)} className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
        <h3 className="text-sm font-semibold text-text-primary">Assign structure</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs text-text-secondary">
            Employee
            <select
              className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
              value={form.employee_id || ""}
              onChange={(e) => setForm((f) => ({ ...f, employee_id: Number(e.target.value) }))}
              required
            >
              <option value="">Select…</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.employee_code} — {emp.first_name} {emp.last_name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-text-secondary">
            Structure
            <select
              className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
              value={form.structure_id || ""}
              onChange={(e) => setForm((f) => ({ ...f, structure_id: Number(e.target.value) }))}
              required
            >
              <option value="">Select…</option>
              {structures.map((s) => (
                <option key={s.id} value={s.id}>
                  {structureLabel(s, s.id)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-text-secondary">
            Effective from
            <input
              type="date"
              className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
              value={form.effective_from}
              onChange={(e) => setForm((f) => ({ ...f, effective_from: e.target.value }))}
              required
            />
          </label>
          <label className="text-xs text-text-secondary">
            Base salary override
            <input
              className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
              value={form.base_salary}
              onChange={(e) => setForm((f) => ({ ...f, base_salary: e.target.value }))}
              placeholder="Optional"
            />
          </label>
          <label className="text-xs text-text-secondary sm:col-span-2">
            Component overrides (JSON, optional)
            <input
              className="mt-1 w-full rounded border px-2 py-1.5 text-sm font-mono"
              value={form.component_overrides}
              onChange={(e) => setForm((f) => ({ ...f, component_overrides: e.target.value }))}
              placeholder='{"HRA":{"amount":5000,"formula_type":"FIXED"}}'
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Assign structure"}
        </button>
      </form>

      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        {loading ? (
          <div className="p-8 text-sm text-text-muted">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-sm text-text-muted">No assignments yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-surface-subtle">
                <tr>
                  <th className="px-4 py-2 text-left text-xs uppercase">Employee</th>
                  <th className="px-4 py-2 text-left text-xs uppercase">Structure</th>
                  <th className="px-4 py-2 text-left text-xs uppercase">From</th>
                  <th className="px-4 py-2 text-left text-xs uppercase">To</th>
                  <th className="px-4 py-2 text-left text-xs uppercase">Status</th>
                  <th className="px-4 py-2 text-left text-xs uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const emp = empById.get(row.employee_id);
                  const st = structById.get(row.structure_id);
                  const status = assignmentStatus(row);
                  return (
                    <tr key={row.id} className="border-t border-border-subtle">
                      <td className="px-4 py-2">
                        {emp
                          ? `${emp.employee_code} — ${emp.first_name} ${emp.last_name}`
                          : `#${row.employee_id}`}
                      </td>
                      <td className="px-4 py-2">{structureLabel(st, row.structure_id)}</td>
                      <td className="px-4 py-2">{row.effective_from}</td>
                      <td className="px-4 py-2">{row.effective_to ?? "—"}</td>
                      <td className="px-4 py-2">{status}</td>
                      <td className="px-4 py-2 relative">
                        <button
                          type="button"
                          className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenActionsId(openActionsId === row.id ? null : row.id);
                          }}
                        >
                          Actions
                        </button>
                        {openActionsId === row.id && (
                          <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                            <button
                              type="button"
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                              disabled={status === "Ended"}
                              onClick={() => void endAssignment(row.id)}
                            >
                              End assignment
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
