import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type HrEmployeeResponse,
  type HrPayrollAssignmentResponse,
} from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { HrStatusBadge } from "@/components/hr/HrStatusBadge";
import { HrDataTable, type HrTableColumn } from "@/components/hr/kit/HrDataTable";
import { HrEmployeeCell } from "@/components/hr/kit/HrEmployeeFields";
import { useEmployeeLookup } from "@/components/hr/kit/useEmployeeLookup";
import { useAuth } from "@/context/AuthContext";
import { todayLocalISO } from "@/lib/dates";
import { canExportHrData } from "@/lib/roles";

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
  const { me } = useAuth();
  const [rows, setRows] = useState<HrPayrollAssignmentResponse[]>([]);
  const [employees, setEmployees] = useState<HrEmployeeResponse[]>([]);
  const [structures, setStructures] = useState<PayrollStructureOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
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
  const lookup = useEmployeeLookup(useMemo(() => rows.map((r) => r.employee_id), [rows]));

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
    if (!window.confirm("End this salary structure assignment with today's date as its end date?")) return;
    setMsg("");
    try {
      await api.endHrPayrollAssignment(id, { effective_to: todayLocalISO() });
      setMsg("Assignment ended.");
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

  const employeeText = (id: number) => {
    const found = lookup(id);
    if (found) return `${found.employee_code} ${found.full_name}`;
    const emp = empById.get(id);
    return emp ? `${emp.employee_code} ${emp.first_name} ${emp.last_name}` : `#${id}`;
  };

  const columns: HrTableColumn<HrPayrollAssignmentResponse>[] = [
    {
      key: "employee",
      header: "Employee",
      render: (r) => <HrEmployeeCell id={r.employee_id} lookup={lookup} />,
      value: (r) => employeeText(r.employee_id),
    },
    {
      key: "structure",
      header: "Structure",
      render: (r) => structureLabel(structById.get(r.structure_id), r.structure_id),
      value: (r) => structureLabel(structById.get(r.structure_id), r.structure_id),
    },
    { key: "from", header: "From", render: (r) => r.effective_from, value: (r) => r.effective_from },
    { key: "to", header: "To", render: (r) => r.effective_to ?? "—", value: (r) => r.effective_to, hideOnMobile: true },
    {
      key: "status",
      header: "Status",
      render: (r) => <HrStatusBadge status={assignmentStatus(r)} />,
      value: (r) => assignmentStatus(r),
    },
  ];

  return (
    <div className="space-y-6">
      <HrPageHeader
        title="Payroll structure assignments"
        description="Link employees to salary structures with effective dates. Required before auto-calculate."
        breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Assignments" }]}
      />
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

      <HrDataTable
        rows={rows}
        rowKey={(r) => r.id}
        columns={columns}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        onRefresh={() => void load()}
        emptyTitle="No assignments yet."
        emptyHint="Use Assign structure above to link an employee to a salary structure."
        searchPlaceholder="Search employee or structure…"
        statusOf={(r) => assignmentStatus(r)}
        exportFileName="payroll-structure-assignments"
        canExport={canExportHrData(me?.role_name)}
        rowActions={(r) => [
          {
            key: "end",
            label: "End assignment",
            danger: true,
            disabled: assignmentStatus(r) === "Ended",
            onClick: () => void endAssignment(r.id),
          },
        ]}
      />
    </div>
  );
}
