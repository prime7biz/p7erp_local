import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type HrDepartmentResponse,
  type HrDesignationResponse,
  type HrEmployeeCreate,
  type HrEmployeeResponse,
  type HrEmployeeUpdate,
  type UserWithRoleResponse,
} from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function HrEmployeesPage() {
  const [departments, setDepartments] = useState<HrDepartmentResponse[]>([]);
  const [designations, setDesignations] = useState<HrDesignationResponse[]>([]);
  const [employees, setEmployees] = useState<HrEmployeeResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HrEmployeeResponse | null>(null);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [tenantUsers, setTenantUsers] = useState<UserWithRoleResponse[]>([]);
  const [form, setForm] = useState<HrEmployeeCreate>({
    employee_code: "",
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    department_id: null,
    designation_id: null,
    joining_date: "",
    user_id: null,
  });

  const departmentMap = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);
  const designationMap = useMemo(() => new Map(designations.map((d) => [d.id, d.title])), [designations]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [depRows, desRows, empRows] = await Promise.all([
        api.listHrDepartments({ active_only: false }),
        api.listHrDesignations({ active_only: false }),
        api.listHrEmployees({ active_only: showInactive ? false : true, search: search || undefined }),
      ]);
      setDepartments(depRows);
      setDesignations(desRows);
      setEmployees(empRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load employees");
    } finally {
      setLoading(false);
    }
  }, [showInactive, search]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api
      .listUsers()
      .then(setTenantUsers)
      .catch((e) => logApiError("HrEmployeesPage.listUsers", e));
  }, []);

  useEffect(() => {
    const close = () => setOpenActionsId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({
      employee_code: "",
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      department_id: null,
      designation_id: null,
      joining_date: "",
      user_id: null,
    });
    setModalOpen(true);
  };

  const openEdit = (row: HrEmployeeResponse) => {
    setEditing(row);
    setForm({
      employee_code: row.employee_code,
      first_name: row.first_name,
      last_name: row.last_name ?? "",
      email: row.email ?? "",
      phone: row.phone ?? "",
      department_id: row.department_id,
      designation_id: row.designation_id,
      joining_date: row.joining_date ?? "",
      user_id: row.user_id ?? null,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.employee_code?.trim() || !form.first_name?.trim()) return;
    setError("");
    try {
      if (editing) {
        const payload: HrEmployeeUpdate = {
          employee_code: form.employee_code,
          first_name: form.first_name,
          last_name: form.last_name || null,
          email: form.email || null,
          phone: form.phone || null,
          department_id: form.department_id ?? null,
          designation_id: form.designation_id ?? null,
          joining_date: form.joining_date || null,
          user_id: form.user_id ?? null,
        };
        await api.updateHrEmployee(editing.id, payload);
      } else {
        await api.createHrEmployee({
          employee_code: form.employee_code,
          first_name: form.first_name,
          last_name: form.last_name || null,
          email: form.email || null,
          phone: form.phone || null,
          department_id: form.department_id ?? null,
          designation_id: form.designation_id ?? null,
          joining_date: form.joining_date || null,
          user_id: form.user_id ?? null,
        });
      }
      closeModal();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">HR Employees</h1>
          <p className="text-sm text-text-muted">Manage employee records for HR master data.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            className="rounded border border-border-strong px-3 py-2 text-sm"
            placeholder="Search by code/name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show inactive
          </label>
          <button
            type="button"
            onClick={async () => {
              setInfo("");
              try {
                const blob = await api.exportHrEmployees();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "employees.xlsx";
                a.click();
                URL.revokeObjectURL(url);
                setInfo("Export started.");
              } catch (e) {
                setError(e instanceof Error ? e.message : "Export failed");
              }
            }}
            className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-text-secondary"
          >
            Export Excel
          </button>
          <label className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-text-secondary cursor-pointer">
            Import Excel
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setError("");
                try {
                  const r = await api.importHrEmployees(file);
                  setError(`Imported: ${r.created} created, ${r.updated} updated.`);
                  await load();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Import failed");
                }
                e.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white"
          >
            Add employee
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-2 text-sm text-status-danger-foreground">{error}</div>}
      {info && <div className="rounded-lg border border-status-success/30 bg-status-success-subtle px-4 py-2 text-sm text-status-success-foreground">{info}</div>}

      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-text-muted">Loading employees...</div>
        ) : employees.length === 0 ? (
          <div className="p-10 text-center text-sm text-text-muted">No employees found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-surface-subtle">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Department</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Designation</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-text-muted">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-surface-raised">
                {employees.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">{row.employee_code}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{[row.first_name, row.last_name].filter(Boolean).join(" ")}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">
                      {row.department_id ? departmentMap.get(row.department_id) ?? "Unknown" : "Unassigned"}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">
                      {row.designation_id ? designationMap.get(row.designation_id) ?? "Unknown" : "Unassigned"}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{row.is_active ? "Active" : "Inactive"}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setOpenActionsId(openActionsId === row.id ? null : row.id)}
                          className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                        >
                          Actions
                        </button>
                        {openActionsId === row.id && (
                          <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
                            <Link
                              to={`/app/hr/employees/${row.id}`}
                              className="block rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                              onClick={() => setOpenActionsId(null)}
                            >
                              View
                            </Link>
                            <button
                              type="button"
                              onClick={() => {
                                openEdit(row);
                                setOpenActionsId(null);
                              }}
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                            >
                              Edit
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={closeModal}>
          <div className="w-full max-w-lg rounded-xl bg-surface-raised p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold text-text-primary">{editing ? "Edit employee" : "Add employee"}</h2>
            <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                className="rounded border border-border-strong px-3 py-2 text-sm"
                placeholder="Employee code"
                value={form.employee_code}
                onChange={(e) => setForm((prev) => ({ ...prev, employee_code: e.target.value }))}
                required
              />
              <input
                className="rounded border border-border-strong px-3 py-2 text-sm"
                placeholder="First name"
                value={form.first_name}
                onChange={(e) => setForm((prev) => ({ ...prev, first_name: e.target.value }))}
                required
              />
              <input
                className="rounded border border-border-strong px-3 py-2 text-sm"
                placeholder="Last name"
                value={form.last_name ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, last_name: e.target.value }))}
              />
              <input
                className="rounded border border-border-strong px-3 py-2 text-sm"
                placeholder="Email"
                value={form.email ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              />
              <input
                className="rounded border border-border-strong px-3 py-2 text-sm"
                placeholder="Phone"
                value={form.phone ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              />
              <select
                className="rounded border border-border-strong px-3 py-2 text-sm"
                value={form.department_id ?? ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, department_id: e.target.value ? Number(e.target.value) : null }))
                }
              >
                <option value="">No department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} - {d.name}
                  </option>
                ))}
              </select>
              <select
                className="rounded border border-border-strong px-3 py-2 text-sm"
                value={form.designation_id ?? ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, designation_id: e.target.value ? Number(e.target.value) : null }))
                }
              >
                <option value="">No designation</option>
                {designations.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} - {d.title}
                  </option>
                ))}
              </select>
              <label className="sm:col-span-2 flex flex-col gap-1 text-xs text-text-muted">
                Linked app user (ESS / login)
                <select
                  className="rounded border border-border-strong px-3 py-2 text-sm text-text-primary"
                  value={form.user_id ?? ""}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, user_id: e.target.value ? Number(e.target.value) : null }))
                  }
                >
                  <option value="">None</option>
                  {tenantUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.username} {u.email ? `(${u.email})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <input
                type="date"
                className="rounded border border-border-strong px-3 py-2 text-sm sm:col-span-2"
                value={form.joining_date ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, joining_date: e.target.value }))}
              />
              <div className="sm:col-span-2 flex justify-end gap-2 pt-1">
                <button type="button" onClick={closeModal} className="rounded border border-border-strong px-3 py-1.5 text-sm text-text-secondary">
                  Cancel
                </button>
                <button type="submit" className="rounded bg-brand-primary px-4 py-1.5 text-sm font-semibold text-white">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
